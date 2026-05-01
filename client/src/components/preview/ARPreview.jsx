import "@google/model-viewer";
import { resolveAssetUrl } from "../../api/models";

export function ARPreview({ title, modelUrl, posterUrl }) {
  const resolvedModelUrl = resolveAssetUrl(modelUrl);
  const resolvedPosterUrl = resolveAssetUrl(posterUrl);

  if (!resolvedModelUrl) {
    return (
      <div className="panel px-6 py-14 text-center">
        <p className="text-sm text-[color:var(--muted)]">No processed model is available for AR yet.</p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden p-3">
      <model-viewer
        src={resolvedModelUrl}
        poster={resolvedPosterUrl ?? undefined}
        alt={title}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        auto-rotate
        shadow-intensity="1"
        exposure="1"
        environment-image="neutral"
        style={{
          width: "100%",
          height: "72vh",
          borderRadius: "24px",
          background:
            "radial-gradient(circle at top, rgba(242, 207, 127, 0.14), transparent 32%), linear-gradient(180deg, #17110d 0%, #0e0b08 100%)"
        }}
      />
    </div>
  );
}
