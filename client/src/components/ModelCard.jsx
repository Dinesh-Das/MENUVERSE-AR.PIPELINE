import { Link } from "react-router-dom";
import { resolveAssetUrl } from "../api/models";
import { StatusBadge } from "./ui/StatusBadge";

export function ModelCard({ model }) {
  const thumbnailUrl = resolveAssetUrl(model.thumbnailUrl);
  const inputLabel = model.sourceType === "VIDEO_UPLOAD"
    ? (model.sourceVideoFileName?.split(".").pop() || "video")
    : (model.fileName?.split(".").pop() || "model");

  return (
    <article className="cream-panel overflow-hidden">
      <div className="relative h-52 bg-[#1a140f]">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={model.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(242,207,127,0.2),_transparent_40%),_#1a140f]">
            <span className="rounded-full border border-[#f4d48f]/20 bg-[#2b2116] px-4 py-2 text-xs uppercase tracking-[0.28em] text-[#f1d389]">
              No thumbnail yet
            </span>
          </div>
        )}

        <div className="absolute left-4 top-4">
          <StatusBadge status={model.status} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold">{model.name}</h3>
              <p className="mt-1 text-sm text-[#665741]">{model.category || "Uncategorized"}</p>
            </div>
            <div className="rounded-full bg-[#fff7ea] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#8a6a22]">
              {inputLabel}
            </div>
          </div>

          <p className="line-clamp-2 text-sm leading-6 text-[#534534]">
            {model.description || "No description yet. Add plating notes or serving context on the details page."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm text-[#3d3123]">
          <div className="rounded-2xl bg-[#fff8ee] px-3 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8f7b67]">Menu Item</p>
            <p className="mt-1 font-medium">{model.menuItemId || "Not linked"}</p>
          </div>
          <div className="rounded-2xl bg-[#fff8ee] px-3 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8f7b67]">Source</p>
            <p className="mt-1 font-medium">{model.sourceType === "VIDEO_UPLOAD" ? "Video" : "3D model"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to={`/models/${model.id}`} className="btn-primary">
            Details
          </Link>
          <Link to={`/models/${model.id}/preview`} className="btn-ghost">
            3D Preview
          </Link>
          <Link to={`/models/${model.id}/ar`} className="btn-ghost">
            AR Preview
          </Link>
        </div>
      </div>
    </article>
  );
}
