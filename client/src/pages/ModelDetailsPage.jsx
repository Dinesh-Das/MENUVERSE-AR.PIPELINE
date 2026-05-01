import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { modelsApi, resolveAssetUrl } from "../api/models";
import { LoadingState } from "../components/ui/LoadingState";
import { StatusBadge } from "../components/ui/StatusBadge";

const activeProcessingStatuses = new Set(["QUEUED", "PROCESSING", "UPLOADED", "VIDEO_UPLOADED"]);

function createFormState(model) {
  return {
    name: model.name || "",
    description: model.description || "",
    category: model.category || "",
    menuItemId: model.menuItemId || "",
    scale: model.scale ?? 1,
    rotationX: model.rotationX ?? 0,
    rotationY: model.rotationY ?? 0,
    rotationZ: model.rotationZ ?? 0,
    positionX: model.positionX ?? 0,
    positionY: model.positionY ?? 0,
    positionZ: model.positionZ ?? 0,
    isARReady: Boolean(model.isARReady)
  };
}

export function ModelDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [model, setModel] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(location.state?.notice || "");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadModel(showLoading = false) {
      try {
        if (showLoading) {
          setLoading(true);
        }
        const data = await modelsApi.get(id);

        if (active) {
          setModel(data);
          if (!isDirty || showLoading) {
            setForm(createFormState(data));
          }
          setError("");
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadModel(true);

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!activeProcessingStatuses.has(model?.status)) {
      return undefined;
    }

    let active = true;

    async function pollModel() {
      try {
        const data = await modelsApi.get(id);

        if (active) {
          setModel(data);
          if (!isDirty) {
            setForm(createFormState(data));
          }
          setError("");
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      }
    }

    const interval = window.setInterval(() => {
      void pollModel();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [id, isDirty, model?.status]);

  const metadata = useMemo(() => {
    if (!model) {
      return [];
    }

    return [
      { label: "Source type", value: model.sourceType === "VIDEO_UPLOAD" ? "Video upload" : "Model upload" },
      {
        label: "Processing result",
        value: model.status === "QUEUED"
          ? "Queued"
          : model.status === "PROCESSING"
            ? "In progress"
            : model.status === "FAILED"
              ? "Failed"
              : model.status === "PROXY_READY"
                ? "Proxy fallback"
                : model.sourceType === "VIDEO_UPLOAD" && model.processedFileUrl
                  ? "Photogrammetry reconstruction"
                  : "Validated upload"
      },
      { label: "Input file", value: model.sourceType === "VIDEO_UPLOAD" ? (model.sourceVideoFileName || "Unavailable") : (model.fileName || "Unavailable") },
      { label: "Generated model size", value: model.fileSize ? `${(model.fileSize / (1024 * 1024)).toFixed(2)} MB` : "Unavailable" },
      { label: "Polygons", value: model.polygonCount ?? "Unavailable" },
      { label: "Textures", value: model.textureCount ?? "Unavailable" },
      { label: "Frames sampled", value: model.frameCount ?? "Unavailable" },
      { label: "Video duration", value: model.sourceVideoDuration ? `${model.sourceVideoDuration.toFixed(2)}s` : "Unavailable" }
    ];
  }, [model]);

  function updateField(event) {
    const { name, value, type, checked } = event.target;
    setIsDirty(true);
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  async function handleSave(event) {
    event.preventDefault();

    try {
      setSaving(true);
      const updated = await modelsApi.update(id, form);
      setModel(updated);
      setForm(createFormState(updated));
      setIsDirty(false);
      setNotice("Model details saved.");
      setError("");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function triggerProcessing() {
    try {
      setSaving(true);
      const updated = await modelsApi.process(id);
      setModel(updated);
      setForm(createFormState(updated));
      setIsDirty(false);
      setNotice("Reprocessing queued. This page will refresh automatically.");
      setError("");
    } catch (processError) {
      if (processError.payload?.model) {
        setModel(processError.payload.model);
        setForm(createFormState(processError.payload.model));
      }

      setError(processError.message);
    } finally {
      setSaving(false);
    }
  }

  async function markReady() {
    try {
      setSaving(true);
      const updated = await modelsApi.markArReady(id);
      setModel(updated);
      setForm(createFormState(updated));
      setIsDirty(false);
      setNotice("Model marked as AR-ready.");
      setError("");
    } catch (markError) {
      setError(markError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm("Delete this model and its local files?");

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      await modelsApi.remove(id);
      navigate("/");
    } catch (deleteError) {
      setError(deleteError.message);
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading model details..." />;
  }

  if (error && !model) {
    return (
      <div className="panel px-6 py-12">
        <p className="text-lg font-semibold text-[#ffb3aa]">Could not load model</p>
        <p className="mt-3 text-sm text-[color:var(--muted)]">{error}</p>
      </div>
    );
  }

  const thumbnailUrl = resolveAssetUrl(model?.thumbnailUrl);
  const previewSource = model?.processedFileUrl ?? model?.originalFileUrl;

  return (
    <section className="space-y-8">
      <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel overflow-hidden">
          <div className="h-72 bg-[#120e0a]">
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt={model.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[color:var(--muted)]">
                Thumbnail will appear after processing.
              </div>
            )}
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f5d28a]">Model details</p>
                <h2 className="mt-2 font-display text-3xl text-[color:var(--cream-strong)]">{model.name}</h2>
              </div>
              <StatusBadge status={model.status} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {metadata.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{item.label}</p>
                  <p className="mt-2 text-sm text-[color:var(--cream-strong)]">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to={`/models/${model.id}/preview`} className="btn-primary">
                Open 3D Preview
              </Link>
              <Link to={`/models/${model.id}/ar`} className="btn-ghost">
                Open AR Preview
              </Link>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-[color:var(--muted)]">
              <p className="font-semibold text-[color:var(--cream-strong)]">Preview source</p>
              <p className="mt-2 break-all">{previewSource || "No processed source yet."}</p>
            </div>

            {model.processingNotes ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-[color:var(--muted)]">
                <p className="font-semibold text-[color:var(--cream-strong)]">Processing notes</p>
                <p className="mt-2 leading-6">{model.processingNotes}</p>
              </div>
            ) : null}

            {model.errorMessage ? (
              <div className="rounded-2xl border border-[#6a2c2c] bg-[#311616] px-4 py-4 text-sm text-[#ffcbc3]">
                <p className="font-semibold text-[#ffd7d1]">Failure reason</p>
                <p className="mt-2 leading-6">{model.errorMessage}</p>
              </div>
            ) : null}

            {model.sourceVideoUrl ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-[color:var(--muted)]">
                <p className="font-semibold text-[color:var(--cream-strong)]">Source video</p>
                <p className="mt-2 break-all">{model.sourceVideoUrl}</p>
              </div>
            ) : null}
          </div>
        </div>

        <form className="cream-panel p-7 sm:p-8" onSubmit={handleSave}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#977226]">Editable metadata</p>
              <h3 className="mt-3 font-display text-4xl">Tune transforms and publish state</h3>
            </div>
            <div className="rounded-full bg-[#fff7ea] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#8a6a22]">
              {model.isARReady ? "Customer ready" : "Internal only"}
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" value={form.name} onChange={updateField} className="field-light" />
            </div>
            <div>
              <label className="label" htmlFor="menuItemId">
                Menu item ID
              </label>
              <input id="menuItemId" name="menuItemId" value={form.menuItemId} onChange={updateField} className="field-light" />
            </div>
            <div>
              <label className="label" htmlFor="category">
                Category
              </label>
              <input id="category" name="category" value={form.category} onChange={updateField} className="field-light" />
            </div>
            <div>
              <label className="label" htmlFor="scale">
                Scale
              </label>
              <input id="scale" name="scale" type="number" step="0.01" value={form.scale} onChange={updateField} className="field-light" />
            </div>
          </div>

          <div className="mt-6">
            <label className="label" htmlFor="description">
              Description
            </label>
            <textarea id="description" name="description" rows={4} value={form.description} onChange={updateField} className="field-light" />
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="space-y-4 rounded-[24px] bg-[#fff8ee] p-5">
              <p className="text-sm font-semibold text-[#3a301f]">Rotation</p>
              {["rotationX", "rotationY", "rotationZ"].map((field) => (
                <div key={field}>
                  <label className="label" htmlFor={field}>
                    {field}
                  </label>
                  <input id={field} name={field} type="number" step="0.01" value={form[field]} onChange={updateField} className="field-light" />
                </div>
              ))}
            </div>

            <div className="space-y-4 rounded-[24px] bg-[#fff8ee] p-5">
              <p className="text-sm font-semibold text-[#3a301f]">Position</p>
              {["positionX", "positionY", "positionZ"].map((field) => (
                <div key={field}>
                  <label className="label" htmlFor={field}>
                    {field}
                  </label>
                  <input id={field} name={field} type="number" step="0.01" value={form[field]} onChange={updateField} className="field-light" />
                </div>
              ))}
            </div>
          </div>

          <label className="mt-6 flex items-center gap-3 rounded-2xl bg-[#fff8ee] px-4 py-4 text-sm text-[#3a301f]">
            <input type="checkbox" name="isARReady" checked={form.isARReady} onChange={updateField} />
            Mark as AR-ready in metadata
          </label>

          {notice ? <p className="mt-6 rounded-2xl bg-[#eef9ef] px-4 py-3 text-sm text-[#34704a]">{notice}</p> : null}
          {error ? <p className="mt-4 rounded-2xl bg-[#fff1ec] px-4 py-3 text-sm text-[#b54831]">{error}</p> : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Save updates"}
            </button>
            <button type="button" className="btn-ghost" onClick={triggerProcessing} disabled={saving}>
              Reprocess model
            </button>
            <button type="button" className="btn-ghost" onClick={markReady} disabled={saving}>
              Mark AR Ready
            </button>
            <button type="button" className="btn-ghost" onClick={handleDelete} disabled={saving}>
              Delete model
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
