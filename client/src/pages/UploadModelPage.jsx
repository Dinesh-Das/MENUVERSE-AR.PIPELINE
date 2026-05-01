import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { modelsApi } from "../api/models";

const initialState = {
  name: "",
  menuItemId: "",
  category: "",
  description: ""
};

export function UploadModelPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [uploadMode, setUploadMode] = useState("model");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!file) {
      setError(uploadMode === "video"
        ? "Choose a .mp4, .mov, .m4v, or .webm file to continue."
        : "Choose a .glb or .gltf file to continue.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const payload = new FormData();
      payload.append("name", form.name);
      payload.append("menuItemId", form.menuItemId);
      payload.append("category", form.category);
      payload.append("description", form.description);
      payload.append(uploadMode === "video" ? "video" : "model", file);

      const result = uploadMode === "video"
        ? await modelsApi.uploadVideo(payload)
        : await modelsApi.upload(payload);

      navigate(`/models/${result.model.id}`, {
        state: {
          notice: uploadMode === "video"
            ? "Video uploaded and queued. This page will refresh while the background worker processes it."
            : "Model uploaded and queued. This page will refresh while the background worker processes it."
        }
      });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="cream-panel p-7 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#977226]">Upload asset</p>
        <h2 className="mt-3 font-display text-4xl">Add a new AR dish asset</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5b4d3b]">
          You can upload either a ready-made 3D model or a source video. The worker now tries a real photogrammetry
          reconstruction for videos when the machine has COLMAP installed, and only falls back to a generated proxy GLB
          when that toolchain is unavailable or the reconstruction cannot complete.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className={uploadMode === "model" ? "btn-primary" : "btn-ghost"}
            onClick={() => {
              setUploadMode("model");
              setFile(null);
              setError("");
            }}
          >
            Upload 3D model
          </button>
          <button
            type="button"
            className={uploadMode === "video" ? "btn-primary" : "btn-ghost"}
            onClick={() => {
              setUploadMode("video");
              setFile(null);
              setError("");
            }}
          >
            Upload video
          </button>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">
                Dish name
              </label>
              <input id="name" name="name" value={form.name} onChange={updateField} className="field-light" required />
            </div>
            <div>
              <label className="label" htmlFor="menuItemId">
                Menu item ID
              </label>
              <input id="menuItemId" name="menuItemId" value={form.menuItemId} onChange={updateField} className="field-light" />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="category">
              Category
            </label>
            <input id="category" name="category" value={form.category} onChange={updateField} className="field-light" />
          </div>

          <div>
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={updateField}
              rows={5}
              className="field-light"
              placeholder="Plating notes, cuisine style, or how this should look on the table."
            />
          </div>

          <div>
            <label className="label" htmlFor="asset-file">
              {uploadMode === "video" ? "Capture video" : "Model file"}
            </label>
            <input
              id="asset-file"
              name="asset-file"
              type="file"
              accept={uploadMode === "video" ? ".mp4,.mov,.m4v,.webm" : ".glb,.gltf"}
              className="field-light cursor-pointer"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <p className="mt-2 text-sm text-[#72624c]">
              {uploadMode === "video"
                ? "Accepted formats: `.mp4`, `.mov`, `.m4v`, `.webm`. The worker samples frames, attempts a real reconstruction, and falls back to a proxy GLB only when needed."
                : "Accepted formats: `.glb`, `.gltf`. Max size: 50MB."}
            </p>
          </div>

          {error ? <p className="rounded-2xl bg-[#fff1ec] px-4 py-3 text-sm text-[#b54831]">{error}</p> : null}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Uploading..." : uploadMode === "video" ? "Upload video and queue processing" : "Upload and queue processing"}
          </button>
        </form>
      </div>

      <div className="panel p-7 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f5d28a]">MVP notes</p>
        <h3 className="mt-3 font-display text-3xl text-[color:var(--cream-strong)]">What happens next</h3>
        <div className="mt-6 space-y-4 text-sm leading-7 text-[color:var(--muted)]">
          <p>The server saves the source asset, creates a model record, and queues the processing job instead of holding your browser open.</p>
          <p>For model uploads, the worker validates the file and copies it into the processed area.</p>
          <p>For video uploads, the worker samples frames, tries COLMAP photogrammetry when available, and otherwise falls back to a proxy GLB so preview and AR flows still work.</p>
          <p>After review, you can fine-tune transform values and mark the model as AR-ready for Menuverse.</p>
        </div>
      </div>
    </section>
  );
}
