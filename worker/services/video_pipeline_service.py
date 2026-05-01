from __future__ import annotations

import logging
import math
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from shutil import which

import cv2
import numpy as np
import trimesh
from PIL import Image, ImageFilter
from scipy.spatial import Delaunay
from trimesh.transformations import rotation_matrix

from core.config import settings
from schemas import ProcessVideoRequest
from services.model_service import inspect_model, relative_upload_path
from services.thumbnail_service import save_image_thumbnail


ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm"}
MIN_RECONSTRUCTION_FRAMES = 12
PIPELINE_MODES = {"auto", "photogrammetry", "proxy"}
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SampledFramePaths:
    original_dir: Path
    guided_dir: Path
    saved_frame_count: int
    guided_frame_count: int
    original_edge_density: float
    guided_edge_density: float


def _tail_command_output(text: str, max_lines: int = 20) -> str:
    cleaned = [line for line in text.splitlines() if line.strip()]
    if not cleaned:
        return ""
    return "\n".join(cleaned[-max_lines:])


def _as_colmap_int(value: bool) -> str:
    return "1" if value else "0"


def _resolve_binary(command: str) -> str | None:
    if not command:
        return None

    candidate = Path(command)
    if candidate.exists():
        return str(candidate.resolve())

    return which(command)


@lru_cache(maxsize=16)
def _supported_colmap_options(command: str, subcommand: str) -> set[str]:
    result = subprocess.run(
        [command, subcommand, "-h"],
        capture_output=True,
        text=True,
        check=False,
    )

    output = "\n".join(part for part in [result.stdout, result.stderr] if part)
    supported = set()

    for line in output.splitlines():
        stripped = line.strip()
        if not stripped.startswith("--"):
            continue

        option = stripped.split()[0]
        supported.add(option)

    return supported


def _colmap_flag(command: str, subcommand: str, preferred: str, legacy: str) -> str:
    supported = _supported_colmap_options(command, subcommand)
    if preferred in supported:
        return preferred
    if legacy in supported:
        return legacy
    return preferred


def _normalize_pipeline_mode(raw_mode: str) -> str:
    mode = (raw_mode or "auto").strip().lower()
    return mode if mode in PIPELINE_MODES else "auto"


def get_video_pipeline_health() -> dict:
    requested_mode = _normalize_pipeline_mode(settings.video_pipeline_mode)
    colmap_path = _resolve_binary(settings.colmap_bin)

    if requested_mode == "proxy":
        effective_strategy = "proxy"
    elif colmap_path:
        effective_strategy = "photogrammetry"
    elif requested_mode == "photogrammetry":
        effective_strategy = "unavailable"
    else:
        effective_strategy = "proxy"

    return {
        "requestedMode": requested_mode,
        "effectiveStrategy": effective_strategy,
        "colmapAvailable": bool(colmap_path),
        "colmapCommand": colmap_path or settings.colmap_bin,
        "useGpu": settings.colmap_use_gpu,
        "gpuIndex": settings.colmap_gpu_index,
    }


def validate_video_path(file_path: str) -> dict:
    path = Path(file_path).resolve()
    exists = path.exists()
    extension = path.suffix.lower()

    return {
        "exists": exists,
        "filePath": str(path),
        "fileName": path.name,
        "extension": extension,
        "isSupported": extension in ALLOWED_VIDEO_EXTENSIONS,
        "fileSize": path.stat().st_size if exists else 0,
    }


def _resize_frame_for_processing(frame: np.ndarray) -> tuple[np.ndarray, Image.Image]:
    image = Image.fromarray(frame)
    max_size = max(image.size)

    if max_size <= settings.colmap_max_image_size:
        return np.asarray(image, dtype=np.uint8), image

    scale = settings.colmap_max_image_size / max_size
    resized = image.resize(
        (
            max(1, int(round(image.width * scale))),
            max(1, int(round(image.height * scale))),
        ),
        Image.Resampling.LANCZOS,
    )
    return np.asarray(resized, dtype=np.uint8), resized


def _build_guided_frame(image: Image.Image, rembg_session: object) -> Image.Image:
    import rembg

    no_bg_image = rembg.remove(image, session=rembg_session, post_process_mask=True)
    rgba_image = no_bg_image.convert("RGBA")
    alpha = rgba_image.getchannel("A")

    if alpha.getbbox() is None:
        raise ValueError("Background removal mask was empty.")

    softened_alpha = alpha.filter(ImageFilter.GaussianBlur(radius=6))
    original_rgb = image.convert("RGB")
    blurred_background = original_rgb.filter(ImageFilter.GaussianBlur(radius=10))
    darkened_background = Image.blend(blurred_background, Image.new("RGB", original_rgb.size, (18, 18, 18)), 0.45)
    return Image.composite(original_rgb, darkened_background, softened_alpha)


def _write_jpeg_frame(output_path: Path, rgb_frame: np.ndarray) -> None:
    # JPEG keeps sampled-frame storage within the 48-frame budget far better than lossless PNG for phone videos.
    bgr_frame = cv2.cvtColor(rgb_frame, cv2.COLOR_RGB2BGR)
    cv2.imwrite(str(output_path.with_suffix(".jpg")), bgr_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])


def _read_frame_with_retry(capture: cv2.VideoCapture) -> tuple[bool, np.ndarray | None]:
    for attempt in range(3):
        success, frame = capture.read()
        if success and frame is not None:
            return True, frame

        # OpenCV can drop the first decode while the codec warms up, so retry briefly before giving up.
        time.sleep(0.05)

    return False, None


def _select_thumbnail_frame(sampled_frames: list[np.ndarray]) -> np.ndarray:
    # Some codecs decode a near-black opener frame, so prefer the first non-black decoded frame for thumbnails.
    for frame in sampled_frames:
        if float(frame.mean()) > 10:
            return frame

    return sampled_frames[1] if len(sampled_frames) > 1 else sampled_frames[0]


def _edge_density(frame: np.ndarray) -> float:
    grayscale = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(grayscale, threshold1=60, threshold2=180)
    return float(np.count_nonzero(edges)) / float(edges.size) if edges.size else 0.0


def _sample_frames(video_path: Path, model_id: str) -> tuple[list[np.ndarray], int, float | None, Path, SampledFramePaths]:
    frames_root = settings.frames_dir / model_id
    original_images_dir = frames_root / "images-original"
    guided_images_dir = frames_root / "images-guided"

    if frames_root.exists():
        shutil.rmtree(frames_root)

    original_images_dir.mkdir(parents=True, exist_ok=True)
    guided_images_dir.mkdir(parents=True, exist_ok=True)

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("The uploaded video could not be opened for frame sampling.")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    # FIX: preserve a real 0.0 duration instead of coercing it to None when the container reports zero-length metadata.
    duration = float(total_frames / fps) if fps > 0 and total_frames >= 0 else None

    # Sampling FPS comes from env, but it must be treated as a number before computing frame intervals.
    target_fps = float(settings.video_frame_sampling_fps) if settings.video_frame_sampling_fps > 0 else 2.0
    sample_interval = max(1, int(round(fps / target_fps))) if fps > 0 else 12

    sampled_frames: list[np.ndarray] = []
    frame_count = 0
    guided_frame_count = 0
    original_edge_density_total = 0.0
    guided_edge_density_total = 0.0

    rembg_session = None
    try:
        import rembg

        rembg_session = rembg.new_session()
    except Exception:
        rembg_session = None

    try:
        while frame_count < settings.video_max_analyzed_frames and len(sampled_frames) < settings.video_max_saved_frames:
            success, frame = _read_frame_with_retry(capture)
            if not success:
                if frame_count == 0:
                    raise ValueError("The uploaded video could not be decoded into frames.")
                break

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            if frame_count % sample_interval != 0:
                frame_count += 1
                continue

            frame_count += 1
            processed_frame, image = _resize_frame_for_processing(rgb_frame)

            frame_file_name = f"frame_{len(sampled_frames) + 1:04d}.jpg"
            sampled_frames.append(processed_frame)
            _write_jpeg_frame(original_images_dir / frame_file_name, processed_frame)
            original_edge_density_total += _edge_density(processed_frame)

            if rembg_session is not None:
                try:
                    guided_frame = _build_guided_frame(image, rembg_session)
                except Exception:
                    continue

                guided_frame_array = np.asarray(guided_frame, dtype=np.uint8)
                _write_jpeg_frame(guided_images_dir / frame_file_name, guided_frame_array)
                guided_frame_count += 1
                guided_edge_density_total += _edge_density(guided_frame_array)
    finally:
        capture.release()

    return sampled_frames, frame_count, duration, frames_root, SampledFramePaths(
        original_dir=original_images_dir,
        guided_dir=guided_images_dir,
        saved_frame_count=len(sampled_frames),
        guided_frame_count=guided_frame_count,
        original_edge_density=(original_edge_density_total / len(sampled_frames)) if sampled_frames else 0.0,
        guided_edge_density=(guided_edge_density_total / guided_frame_count) if guided_frame_count else 0.0,
    )


def _run_command(command: list[str], cwd: Path, label: str) -> None:
    try:
        # check=True ensures a non-zero COLMAP exit aborts this pass immediately instead of silently producing empty outputs.
        subprocess.run(
            command,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as error:
        details = _tail_command_output(error.stderr or error.stdout or "")
        suffix = f" Details:\n{details}" if details else ""
        raise RuntimeError(f"{label} failed with exit code {error.returncode}.{suffix}") from error


def _find_sparse_component(sparse_root: Path) -> Path:
    if not sparse_root.exists() or not any(sparse_root.rglob("*")):
        logger.warning("COLMAP sparse output was missing or empty at %s; falling back to proxy geometry.", sparse_root)
        raise RuntimeError(
            "COLMAP sparse output was empty, so the reconstruction will fall back to proxy geometry."
        )

    components = sorted(
        path for path in sparse_root.iterdir()
        if path.is_dir() and (path / "images.bin").exists()
    )

    if not components:
        raise RuntimeError(
            "COLMAP did not produce a sparse reconstruction. Capture a slower orbit video with steadier lighting and more overlap."
        )

    return components[0]


def _maybe_simplify_mesh(colmap_path: str, workspace_root: Path, mesh_path: Path) -> Path:
    target_ratio = settings.colmap_mesh_face_ratio
    if not 0 < target_ratio < 1:
        return mesh_path

    simplified_path = mesh_path.with_name(f"{mesh_path.stem}-simplified{mesh_path.suffix}")

    try:
        _run_command(
            [
                colmap_path,
                "mesh_simplifier",
                "--input_path",
                str(mesh_path),
                "--output_path",
                str(simplified_path),
                "--MeshSimplification.target_face_ratio",
                str(target_ratio),
            ],
            cwd=workspace_root,
            label="COLMAP mesh simplification",
        )
    except RuntimeError:
        return mesh_path

    return simplified_path if simplified_path.exists() else mesh_path


def _directory_has_files(directory: Path) -> bool:
    return directory.exists() and any(path.is_file() for path in directory.rglob("*"))


def _loaded_to_scene(loaded: object) -> trimesh.Scene | None:
    if isinstance(loaded, trimesh.Scene):
        return loaded if len(loaded.geometry) > 0 else None

    if isinstance(loaded, trimesh.Trimesh):
        if loaded.vertices is None or len(loaded.vertices) == 0 or loaded.faces is None or len(loaded.faces) == 0:
            return None
        return trimesh.Scene([loaded])

    return None


def _scene_from_mesh_path(mesh_path: Path) -> trimesh.Scene | None:
    if not mesh_path.exists():
        return None

    try:
        loaded = trimesh.load(mesh_path, force="scene")
    except Exception:
        return None

    return _loaded_to_scene(loaded)


def _scene_to_y_up(scene: trimesh.Scene) -> trimesh.Scene:
    rotated = scene.copy()
    # COLMAP meshes tend to arrive Z-up; rotate them into glTF's Y-up convention before export.
    rotated.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    return rotated


def _build_convex_hull_scene_from_point_cloud(point_cloud_path: Path) -> trimesh.Scene:
    loaded = trimesh.load(point_cloud_path)
    if not isinstance(loaded, trimesh.points.PointCloud):
        raise RuntimeError("COLMAP fused point cloud could not be loaded for hull reconstruction.")

    if loaded.vertices is None or len(loaded.vertices) < 4:
        raise RuntimeError("COLMAP fused point cloud does not contain enough vertices to build a hull mesh.")

    hull = loaded.convex_hull
    if hull.vertices is None or len(hull.vertices) == 0 or hull.faces is None or len(hull.faces) == 0:
        raise RuntimeError("Convex hull reconstruction produced an empty mesh.")

    colors = getattr(loaded, "colors", None)
    if colors is not None and len(colors) > 0:
        average_color = np.mean(colors[:, :3], axis=0).astype(np.uint8)
        hull.visual.face_colors = np.tile(np.append(average_color, 255), (len(hull.faces), 1))

    return trimesh.Scene([hull])


def _build_surface_scene_from_point_cloud(point_cloud_path: Path) -> trimesh.Scene:
    loaded = trimesh.load(point_cloud_path)
    if not isinstance(loaded, trimesh.points.PointCloud):
        raise RuntimeError("COLMAP fused point cloud could not be loaded for surface reconstruction.")

    points = np.asarray(loaded.vertices, dtype=np.float64)
    if points.shape[0] < 16:
        raise RuntimeError("COLMAP fused point cloud does not contain enough vertices to build a surface mesh.")

    centered = points - points.mean(axis=0)
    _, _, vh = np.linalg.svd(centered, full_matrices=False)
    principal_basis = vh.T
    pca_points = centered @ principal_basis

    plane_points = pca_points[:, :2]
    height_values = pca_points[:, 2]
    rounded_plane_points = np.round(plane_points, decimals=5)
    unique_plane_points, unique_indices, inverse_indices = np.unique(
        rounded_plane_points,
        axis=0,
        return_index=True,
        return_inverse=True,
    )

    if unique_plane_points.shape[0] < 16:
        raise RuntimeError("Point-cloud surface reconstruction did not retain enough unique projected points.")

    delaunay = Delaunay(unique_plane_points, qhull_options="QJ")
    candidate_faces = unique_indices[delaunay.simplices]

    triangle_plane_points = plane_points[candidate_faces]
    edge_lengths = np.stack(
        [
            np.linalg.norm(triangle_plane_points[:, 0] - triangle_plane_points[:, 1], axis=1),
            np.linalg.norm(triangle_plane_points[:, 1] - triangle_plane_points[:, 2], axis=1),
            np.linalg.norm(triangle_plane_points[:, 2] - triangle_plane_points[:, 0], axis=1),
        ],
        axis=1,
    )
    max_edge_lengths = edge_lengths.max(axis=1)
    height_ranges = np.ptp(height_values[candidate_faces], axis=1)

    edge_threshold = np.percentile(max_edge_lengths, 95) * 2.0
    height_threshold = np.percentile(height_ranges, 95) * 2.0 if np.any(height_ranges) else 0.0
    valid_faces = max_edge_lengths <= edge_threshold
    if height_threshold > 0:
        valid_faces &= height_ranges <= height_threshold

    filtered_faces = candidate_faces[valid_faces]
    if filtered_faces.size == 0:
        filtered_faces = candidate_faces

    mesh = trimesh.Trimesh(vertices=points, faces=filtered_faces, process=False)
    colors = getattr(loaded, "colors", None)
    if colors is not None and len(colors) == len(points):
        mesh.visual.vertex_colors = colors

    mesh.remove_degenerate_faces()
    mesh.remove_duplicate_faces()
    mesh.remove_unreferenced_vertices()
    components = mesh.split(only_watertight=False)
    if components:
        mesh = max(components, key=lambda component: len(component.faces))

    if mesh.vertices is None or len(mesh.vertices) == 0 or mesh.faces is None or len(mesh.faces) == 0:
        raise RuntimeError("Point-cloud surface reconstruction collapsed into an empty mesh.")

    return trimesh.Scene([mesh])


def _build_delaunay_mesh(colmap_path: str, workspace_root: Path, dense_root: Path) -> Path | None:
    delaunay_path = dense_root / "meshed-delaunay.ply"

    try:
        _run_command(
            [
                colmap_path,
                "delaunay_mesher",
                "--input_path",
                str(dense_root),
                "--input_type",
                "dense",
                "--output_path",
                str(delaunay_path),
            ],
            cwd=workspace_root,
            label="COLMAP Delaunay meshing",
        )
    except RuntimeError:
        return None

    if not delaunay_path.exists():
        return None

    return _maybe_simplify_mesh(colmap_path, workspace_root, delaunay_path)


def _run_dense_meshing_pass(
    colmap_path: str,
    workspace_root: Path,
    dense_root: Path,
    *,
    relaxed: bool,
) -> tuple[Path, Path, str | None]:
    fused_path = dense_root / ("fused-relaxed.ply" if relaxed else "fused.ply")
    mesh_path = dense_root / ("meshed-poisson-relaxed.ply" if relaxed else "meshed-poisson.ply")

    patch_match_command = [
        colmap_path,
        "patch_match_stereo",
        "--workspace_path",
        str(dense_root),
        "--workspace_format",
        "COLMAP",
        "--PatchMatchStereo.geom_consistency",
        "true",
        "--PatchMatchStereo.gpu_index",
        str(settings.colmap_gpu_index),
    ]
    stereo_fusion_command = [
        colmap_path,
        "stereo_fusion",
        "--workspace_path",
        str(dense_root),
        "--workspace_format",
        "COLMAP",
        "--input_type",
        "geometric",
        "--output_path",
        str(fused_path),
    ]

    if relaxed:
        patch_match_command.extend(
            [
                "--PatchMatchStereo.window_radius",
                "7",
                "--PatchMatchStereo.num_iterations",
                "7",
                "--PatchMatchStereo.filter_min_num_consistent",
                "1",
                "--PatchMatchStereo.filter_min_triangulation_angle",
                "1",
                "--PatchMatchStereo.filter_geom_consistency_max_cost",
                "2",
                "--PatchMatchStereo.geom_consistency_regularizer",
                "0.2",
            ]
        )
        stereo_fusion_command.extend(
            [
                "--StereoFusion.min_num_pixels",
                "3",
                "--StereoFusion.max_reproj_error",
                "4",
                "--StereoFusion.max_depth_error",
                "0.03",
                "--StereoFusion.max_normal_error",
                "25",
            ]
        )

    _run_command(
        patch_match_command,
        cwd=workspace_root,
        label="COLMAP patch-match stereo (relaxed)" if relaxed else "COLMAP patch-match stereo",
    )

    _run_command(
        stereo_fusion_command,
        cwd=workspace_root,
        label="COLMAP stereo fusion (relaxed)" if relaxed else "COLMAP stereo fusion",
    )

    poisson_note = None

    try:
        _run_command(
            [
                colmap_path,
                "poisson_mesher",
                "--input_path",
                str(fused_path),
                "--output_path",
                str(mesh_path),
            ],
            cwd=workspace_root,
            label="COLMAP poisson meshing (relaxed)" if relaxed else "COLMAP poisson meshing",
        )
    except RuntimeError as error:
        error_text = str(error)
        depth_match = re.search(r"Solver depth should not exceed maximum depth:\s*(\d+)\s*<=\s*(\d+)", error_text)

        if depth_match:
            safe_depth = max(1, int(depth_match.group(2)))

            try:
                _run_command(
                    [
                        colmap_path,
                        "poisson_mesher",
                        "--input_path",
                        str(fused_path),
                        "--output_path",
                        str(mesh_path),
                        "--PoissonMeshing.depth",
                        str(safe_depth),
                    ],
                    cwd=workspace_root,
                    label="COLMAP poisson meshing (adaptive depth)",
                )
                poisson_note = (
                    f"COLMAP's default Poisson depth was too high for this dense cloud, so the worker retried meshing with depth {safe_depth}. "
                )
            except RuntimeError as retry_error:
                logger.warning("COLMAP poisson meshing retry failed for %s", fused_path, exc_info=True)
                poisson_note = (
                    "COLMAP's Poisson mesher crashed even after an adaptive depth retry, so the worker fell back to alternate surface reconstruction from the dense workspace. "
                    f"Failure: {retry_error}"
                )
        else:
            logger.warning("COLMAP poisson meshing failed for %s", fused_path, exc_info=True)
            poisson_note = (
                "COLMAP's Poisson mesher failed, so the worker fell back to alternate surface reconstruction from the dense workspace. "
                f"Failure: {error}"
            )

    return fused_path, mesh_path, poisson_note


def _convert_mesh_to_glb(
    mesh_path: Path,
    fused_path: Path,
    output_path: Path,
    fallback_mesh_path: Path | None = None,
) -> str | None:
    scene = _scene_from_mesh_path(mesh_path)

    if scene is not None:
        output_path.write_bytes(_scene_to_y_up(scene).export(file_type="glb"))
        return None

    fallback_scene = _scene_from_mesh_path(fallback_mesh_path) if fallback_mesh_path else None
    if fallback_scene is not None:
        output_path.write_bytes(_scene_to_y_up(fallback_scene).export(file_type="glb"))
        return (
            "COLMAP's Poisson mesh output was empty, so the worker exported a Delaunay mesh from the dense workspace instead. "
            "This preserves more observed surface detail than the convex-hull salvage path, but you should still review the mesh for background noise or holes."
        )

    try:
        point_surface_scene = _build_surface_scene_from_point_cloud(fused_path)
    except Exception:
        point_surface_scene = None

    if point_surface_scene is not None:
        output_path.write_bytes(_scene_to_y_up(point_surface_scene).export(file_type="glb"))
        return (
            "COLMAP's Poisson mesh output was empty, and Delaunay meshing was unusable, so the worker built a surface mesh directly from the fused point cloud instead. "
            "This keeps the observed dish silhouette and height variation better than the convex-hull fallback, but it can still include holes or rough edges."
        )

    fallback_scene = _build_convex_hull_scene_from_point_cloud(fused_path)
    output_path.write_bytes(_scene_to_y_up(fallback_scene).export(file_type="glb"))
    return (
        "COLMAP's Poisson mesh output was empty, and Delaunay meshing did not produce a usable surface, so the worker built the GLB from the fused point cloud convex hull instead. "
        "This usually means the video had enough overlap for a point cloud but not enough stable surface detail for a clean dense mesh."
    )


def _should_retry_with_original_frames(error: Exception) -> bool:
    text = str(error).lower()
    retry_markers = (
        "no good initial image pair found",
        "discarding reconstruction due to bad initial pair",
        "failed to create any sparse model",
        "did not produce a sparse reconstruction",
        "sparse mapping failed",
    )
    return any(marker in text for marker in retry_markers)


def _should_attempt_guided_pass(sampled_frame_paths: SampledFramePaths) -> bool:
    if sampled_frame_paths.guided_frame_count < MIN_RECONSTRUCTION_FRAMES:
        return False

    if sampled_frame_paths.original_edge_density <= 0:
        return True

    return sampled_frame_paths.guided_edge_density >= sampled_frame_paths.original_edge_density * 0.85


def _run_colmap_photogrammetry(images_dir: Path, processed_path: Path) -> dict:
    colmap_path = _resolve_binary(settings.colmap_bin)
    if not colmap_path:
        raise RuntimeError(
            "COLMAP is not installed. Install COLMAP and set COLMAP_BIN if it is not on PATH."
        )

    workspace_root = images_dir.parent / "colmap"
    sparse_root = workspace_root / "sparse"
    dense_root = workspace_root / "dense"

    if workspace_root.exists():
        shutil.rmtree(workspace_root)

    sparse_root.mkdir(parents=True, exist_ok=True)
    dense_root.mkdir(parents=True, exist_ok=True)

    database_path = workspace_root / "database.db"
    feature_use_gpu_flag = _colmap_flag(
        colmap_path,
        "feature_extractor",
        "--FeatureExtraction.use_gpu",
        "--SiftExtraction.use_gpu",
    )
    matching_use_gpu_flag = _colmap_flag(
        colmap_path,
        "sequential_matcher",
        "--FeatureMatching.use_gpu",
        "--SiftMatching.use_gpu",
    )

    _run_command(
        [
            colmap_path,
            "feature_extractor",
            "--database_path",
            str(database_path),
            "--image_path",
            str(images_dir),
            "--ImageReader.single_camera",
            "1",
            feature_use_gpu_flag,
            _as_colmap_int(settings.colmap_use_gpu),
            "--FeatureExtraction.gpu_index",
            str(settings.colmap_gpu_index),
        ],
        cwd=workspace_root,
        label="COLMAP feature extraction",
    )

    _run_command(
        [
            colmap_path,
            "sequential_matcher",
            "--database_path",
            str(database_path),
            matching_use_gpu_flag,
            _as_colmap_int(settings.colmap_use_gpu),
            "--FeatureMatching.gpu_index",
            str(settings.colmap_gpu_index),
        ],
        cwd=workspace_root,
        label="COLMAP sequential matching",
    )

    _run_command(
        [
            colmap_path,
            "mapper",
            "--database_path",
            str(database_path),
            "--image_path",
            str(images_dir),
            "--output_path",
            str(sparse_root),
            "--Mapper.ba_use_gpu",
            _as_colmap_int(settings.colmap_use_gpu),
            "--Mapper.ba_gpu_index",
            str(settings.colmap_gpu_index),
        ],
        cwd=workspace_root,
        label="COLMAP sparse mapping",
    )

    sparse_component = _find_sparse_component(sparse_root)

    _run_command(
        [
            colmap_path,
            "image_undistorter",
            "--image_path",
            str(images_dir),
            "--input_path",
            str(sparse_component),
            "--output_path",
            str(dense_root),
            "--output_type",
            "COLMAP",
            "--max_image_size",
            str(settings.colmap_max_image_size),
        ],
        cwd=workspace_root,
        label="COLMAP image undistortion",
    )

    if not _directory_has_files(dense_root):
        logger.warning("COLMAP dense workspace was missing or empty at %s; falling back to proxy geometry.", dense_root)
        raise RuntimeError(
            "COLMAP dense workspace was empty, so the reconstruction will fall back to proxy geometry."
        )

    fused_path, mesh_path, poisson_note = _run_dense_meshing_pass(
        colmap_path,
        workspace_root,
        dense_root,
        relaxed=False,
    )

    chosen_mesh = _maybe_simplify_mesh(colmap_path, workspace_root, mesh_path)
    relaxed_dense_note = None

    if _scene_from_mesh_path(chosen_mesh) is None:
        fused_path, mesh_path, relaxed_poisson_note = _run_dense_meshing_pass(
            colmap_path,
            workspace_root,
            dense_root,
            relaxed=True,
        )
        chosen_mesh = _maybe_simplify_mesh(colmap_path, workspace_root, mesh_path)
        relaxed_dense_note = (
            "The default dense stereo pass produced an empty Poisson mesh, so the worker reran dense reconstruction with relaxed stereo and fusion thresholds before export. "
        )
        if relaxed_poisson_note:
            note_prefix = f"{poisson_note} " if poisson_note else ""
            poisson_note = f"{note_prefix}{relaxed_poisson_note}".strip()

    delaunay_mesh = _build_delaunay_mesh(colmap_path, workspace_root, dense_root)
    mesh_conversion_note = _convert_mesh_to_glb(
        chosen_mesh,
        fused_path,
        processed_path,
        fallback_mesh_path=delaunay_mesh,
    )
    if poisson_note:
        note_prefix = f"{poisson_note} " if poisson_note else ""
        mesh_conversion_note = f"{note_prefix}{mesh_conversion_note or ''}".strip()
    if relaxed_dense_note:
        mesh_conversion_note = f"{relaxed_dense_note}{mesh_conversion_note or ''}".strip()
    
    from services.blender_service import normalize_scale
    norm_result = normalize_scale(processed_path)
    if norm_result.get("available"):
        note_prefix = f"{mesh_conversion_note} " if mesh_conversion_note else ""
        mesh_conversion_note = f"{note_prefix}{norm_result['message']}"

    return {
        "processedPath": relative_upload_path(processed_path),
        "notes": (
            "Video reconstruction completed with COLMAP photogrammetry. "
            "Review scale and orientation before marking the asset as AR-ready because reconstructed meshes keep scene-derived units."
            + (f" {mesh_conversion_note}" if mesh_conversion_note else "")
        ),
        "status": "PROCESSED",
        "isOptimized": mesh_conversion_note is None,
    }


def _create_proxy_glb(output_path: Path, sampled_frames: list[np.ndarray]) -> tuple[Path, str]:
    if not sampled_frames:
        raise ValueError("The video did not yield any usable frames.")

    representative_frame = sampled_frames[len(sampled_frames) // 2]
    average_color = np.mean(representative_frame.reshape(-1, 3), axis=0).astype(np.uint8)
    garnish_color = np.clip(average_color.astype(np.int16) + np.array([28, 18, -12]), 0, 255).astype(np.uint8)

    plate = trimesh.creation.cylinder(radius=0.14, height=0.012, sections=64)
    plate.visual.face_colors = np.tile(np.array([244, 236, 222, 255], dtype=np.uint8), (len(plate.faces), 1))

    food = trimesh.creation.icosphere(subdivisions=3, radius=0.075)
    food.vertices *= np.array([1.18, 1.0, 0.62], dtype=np.float64)
    food.apply_translation([0.0, 0.0, 0.055])
    food.visual.face_colors = np.tile(np.append(average_color, 255), (len(food.faces), 1))

    garnish = trimesh.creation.icosphere(subdivisions=2, radius=0.024)
    garnish.vertices *= np.array([1.0, 0.9, 0.45], dtype=np.float64)
    garnish.apply_translation([0.038, -0.01, 0.087])
    garnish.visual.face_colors = np.tile(np.append(garnish_color, 255), (len(garnish.faces), 1))

    tilt = trimesh.creation.box(extents=[0.045, 0.01, 0.01])
    tilt.apply_translation([-0.032, 0.022, 0.066])
    tilt.visual.face_colors = np.tile(np.array([255, 248, 220, 255], dtype=np.uint8), (len(tilt.faces), 1))

    y_up_rotation = rotation_matrix(np.deg2rad(90), [1, 0, 0])
    for mesh in [plate, food, garnish, tilt]:
        mesh.apply_transform(y_up_rotation)

    scene = trimesh.Scene([plate, food, garnish, tilt])
    output_path.write_bytes(scene.export(file_type="glb"))

    notes = (
        "The worker generated a fallback proxy GLB from sampled video frames because a full photogrammetry reconstruction was not available. "
        "Install COLMAP and set VIDEO_PIPELINE_MODE=photogrammetry for a real dish mesh."
    )

    return output_path, notes


def _build_proxy_result(
    processed_path: Path,
    thumbnail_frame: np.ndarray,
    frame_count: int,
    duration: float | None,
    validation: dict,
    notes: str,
) -> dict:
    thumbnail_path = save_image_thumbnail(Path(processed_path).stem, Image.fromarray(thumbnail_frame))
    metadata = inspect_model(processed_path)

    return {
        "status": "PROXY_READY",
        "processedPath": relative_upload_path(processed_path),
        "thumbnailPath": relative_upload_path(thumbnail_path),
        "metadata": metadata,
        "frameCount": frame_count,
        "sourceVideoDuration": round(duration, 2) if duration is not None else None,
        "processingNotes": notes,
        "isOptimized": False,
        "validation": validation,
    }


def _build_glb_result(
    processed_path: Path,
    processed_relative_path: str,
    thumbnail_frame: np.ndarray,
    frame_count: int,
    duration: float | None,
    validation: dict,
    notes: str,
    status: str,
    is_optimized: bool,
) -> dict:
    thumbnail_path = save_image_thumbnail(Path(processed_path).stem, Image.fromarray(thumbnail_frame))
    metadata = inspect_model(processed_path)

    return {
        "status": status,
        "processedPath": processed_relative_path,
        "thumbnailPath": relative_upload_path(thumbnail_path),
        "metadata": metadata,
        "frameCount": frame_count,
        "sourceVideoDuration": round(duration, 2) if duration is not None else None,
        "processingNotes": notes,
        "isOptimized": is_optimized,
        "validation": validation,
    }


def _cleanup_video_workspace(frames_root: Path) -> None:
    if settings.retain_video_workdirs:
        return

    if frames_root.exists():
        shutil.rmtree(frames_root, ignore_errors=True)


def process_video(payload: ProcessVideoRequest) -> dict:
    validation = validate_video_path(payload.sourceVideoPath)

    if not validation["exists"]:
        raise FileNotFoundError("Uploaded video file was not found.")

    if not validation["isSupported"]:
        raise ValueError("Only .mp4, .mov, .m4v, and .webm files are supported.")

    source_path = Path(validation["filePath"])
    settings.processed_dir.mkdir(parents=True, exist_ok=True)
    settings.thumbnails_dir.mkdir(parents=True, exist_ok=True)
    settings.frames_dir.mkdir(parents=True, exist_ok=True)

    sampled_frames, frame_count, duration, frames_root, sampled_frame_paths = _sample_frames(source_path, payload.modelId)
    if not sampled_frames:
        raise ValueError("The uploaded video could not be sampled into usable frames.")

    thumbnail_frame = _select_thumbnail_frame(sampled_frames)
    processed_path = settings.processed_dir / f"{payload.modelId}.glb"
    pipeline_health = get_video_pipeline_health()
    requested_mode = pipeline_health["requestedMode"]
    effective_strategy = pipeline_health["effectiveStrategy"]

    if effective_strategy == "photogrammetry":
        if len(sampled_frames) < MIN_RECONSTRUCTION_FRAMES:
            message = (
                f"At least {MIN_RECONSTRUCTION_FRAMES} extracted frames are recommended for photogrammetry, "
                f"but only {len(sampled_frames)} were saved from this video."
            )

            proxy_path, proxy_notes = _create_proxy_glb(processed_path, sampled_frames)
            result = _build_proxy_result(
                processed_path=proxy_path,
                thumbnail_frame=thumbnail_frame,
                frame_count=frame_count,
                duration=duration,
                validation=validation,
                notes=f"{message} Falling back to the proxy GLB pipeline. {proxy_notes}",
            )
            _cleanup_video_workspace(frames_root)
            return result

        try:
            colmap_result: dict | None = None
            guided_error: Exception | None = None
            guided_skip_note: str | None = None

            if _should_attempt_guided_pass(sampled_frame_paths):
                try:
                    colmap_result = _run_colmap_photogrammetry(
                        images_dir=sampled_frame_paths.guided_dir,
                        processed_path=processed_path,
                    )
                    colmap_result["notes"] = (
                        "The worker used subject-emphasized video frames for the successful COLMAP pass to reduce table and room noise while preserving scene texture for camera matching. "
                        f"{colmap_result['notes']}"
                    )
                except Exception as error:
                    guided_error = error
                    if not _should_retry_with_original_frames(error):
                        raise
            elif sampled_frame_paths.guided_frame_count > 0:
                guided_skip_note = (
                    "The worker skipped the subject-emphasized frame pass because its feature density was too low for reliable COLMAP initialization, so reconstruction started directly from the original sampled frames. "
                )

            if colmap_result is None:
                colmap_result = _run_colmap_photogrammetry(
                    images_dir=sampled_frame_paths.original_dir,
                    processed_path=processed_path,
                )
                if guided_error is not None:
                    colmap_result["notes"] = (
                        "Subject-emphasized frames did not yield a stable COLMAP initialization, so the worker retried with the original sampled frames and completed reconstruction from that pass. "
                        f"Guided attempt summary: {guided_error}. {colmap_result['notes']}"
                    )
                elif guided_skip_note is not None:
                    colmap_result["notes"] = f"{guided_skip_note}{colmap_result['notes']}"
            result = _build_glb_result(
                processed_path=processed_path,
                processed_relative_path=colmap_result["processedPath"],
                thumbnail_frame=thumbnail_frame,
                frame_count=frame_count,
                duration=duration,
                validation=validation,
                notes=colmap_result["notes"],
                status=colmap_result["status"],
                is_optimized=colmap_result["isOptimized"],
            )
            _cleanup_video_workspace(frames_root)
            return result
        except Exception as error:
            proxy_path, proxy_notes = _create_proxy_glb(processed_path, sampled_frames)
            result = _build_proxy_result(
                processed_path=proxy_path,
                thumbnail_frame=thumbnail_frame,
                frame_count=frame_count,
                duration=duration,
                validation=validation,
                notes=(
                    "Photogrammetry reconstruction could not complete, so the worker fell back to a proxy GLB. "
                    f"Reason: {error}. {proxy_notes}"
                ),
            )
            _cleanup_video_workspace(frames_root)
            return result

    proxy_path, proxy_notes = _create_proxy_glb(processed_path, sampled_frames)
    if requested_mode == "proxy":
        notes = (
            "VIDEO_PIPELINE_MODE=proxy is enabled, so the worker intentionally skipped photogrammetry and generated a proxy GLB."
        )
    elif requested_mode == "photogrammetry":
        notes = (
            "VIDEO_PIPELINE_MODE=photogrammetry was requested, but COLMAP was not available, so the worker generated a proxy GLB instead."
        )
    else:
        notes = (
            "COLMAP is not available on this machine, so the worker used the proxy GLB fallback for video uploads."
        )

    result = _build_proxy_result(
        processed_path=proxy_path,
        thumbnail_frame=thumbnail_frame,
        frame_count=frame_count,
        duration=duration,
        validation=validation,
        notes=f"{notes} {proxy_notes}",
    )
    _cleanup_video_workspace(frames_root)
    return result
