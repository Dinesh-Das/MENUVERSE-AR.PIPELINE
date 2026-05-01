import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { modelsApi } from "../api/models";
import { ThreeDPreview } from "../components/preview/ThreeDPreview";
import { LoadingState } from "../components/ui/LoadingState";

const activeProcessingStatuses = new Set(["QUEUED", "PROCESSING", "UPLOADED", "VIDEO_UPLOADED"]);

export function ModelPreviewPage() {
  const { id } = useParams();
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  }, [id, model?.status]);

  if (loading) {
    return <LoadingState label="Loading 3D preview..." />;
  }

  if (error || !model) {
    return (
      <div className="panel px-6 py-12">
        <p className="text-lg font-semibold text-[#ffb3aa]">Could not open 3D preview</p>
        <p className="mt-3 text-sm text-[color:var(--muted)]">{error || "Model unavailable."}</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f5d28a]">3D preview</p>
          <h2 className="mt-2 font-display text-3xl text-[color:var(--cream-strong)]">{model.name}</h2>
          {activeProcessingStatuses.has(model.status) ? (
            <p className="mt-3 text-sm text-[color:var(--muted)]">Processing is still running. This preview updates automatically when the model is ready.</p>
          ) : null}
        </div>
        <Link to={`/models/${model.id}`} className="btn-ghost">
          Back to details
        </Link>
      </div>

      <ThreeDPreview modelUrl={model.processedFileUrl ?? model.originalFileUrl} />
    </section>
  );
}
