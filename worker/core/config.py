from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    worker_port: int
    upload_root: Path
    models_dir: Path
    videos_dir: Path
    frames_dir: Path
    processed_dir: Path
    thumbnails_dir: Path
    video_pipeline_mode: str
    colmap_bin: str
    video_frame_sampling_fps: float
    video_max_analyzed_frames: int
    video_max_saved_frames: int
    colmap_max_image_size: int
    colmap_mesh_face_ratio: float
    colmap_use_gpu: bool
    colmap_gpu_index: int
    retain_video_workdirs: bool


def _build_settings() -> Settings:
    upload_root = (BASE_DIR / os.getenv("UPLOAD_ROOT", "../uploads")).resolve()
    return Settings(
        worker_port=int(os.getenv("WORKER_PORT", "8001")),
        upload_root=upload_root,
        models_dir=upload_root / "models",
        videos_dir=upload_root / "videos",
        frames_dir=upload_root / "frames",
        processed_dir=upload_root / "processed",
        thumbnails_dir=upload_root / "thumbnails",
        video_pipeline_mode=os.getenv("VIDEO_PIPELINE_MODE", "auto").strip().lower(),
        colmap_bin=os.getenv("COLMAP_BIN", "colmap").strip(),
        video_frame_sampling_fps=float(os.getenv("VIDEO_FRAME_SAMPLING_FPS", "2")),
        video_max_analyzed_frames=int(os.getenv("VIDEO_MAX_ANALYZED_FRAMES", "720")),
        video_max_saved_frames=int(os.getenv("VIDEO_MAX_SAVED_FRAMES", "48")),
        colmap_max_image_size=int(os.getenv("COLMAP_MAX_IMAGE_SIZE", "1600")),
        colmap_mesh_face_ratio=float(os.getenv("COLMAP_MESH_FACE_RATIO", "0.35")),
        colmap_use_gpu=_env_flag("COLMAP_USE_GPU", True),
        colmap_gpu_index=int(os.getenv("COLMAP_GPU_INDEX", "0")),
        retain_video_workdirs=_env_flag("RETAIN_VIDEO_WORKDIRS", False),
    )


settings = _build_settings()
