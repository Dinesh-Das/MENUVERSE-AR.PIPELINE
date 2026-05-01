import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { modelsApi } from "../api/models";
import { ModelCard } from "../components/ModelCard";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingState } from "../components/ui/LoadingState";
import { StatCard } from "../components/ui/StatCard";

const activeProcessingStatuses = new Set(["QUEUED", "PROCESSING", "UPLOADED", "VIDEO_UPLOADED"]);

export function DashboardPage() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadModels() {
      try {
        setLoading((current) => current && models.length === 0);
        const data = await modelsApi.list();

        if (active) {
          setModels(data);
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

    loadModels();

    const interval = window.setInterval(() => {
      void loadModels();
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const stats = useMemo(() => {
    return {
      total: models.length,
      arReady: models.filter((model) => model.isARReady).length,
      processing: models.filter((model) => activeProcessingStatuses.has(model.status)).length,
      failed: models.filter((model) => model.status === "FAILED").length
    };
  }, [models]);

  if (loading) {
    return <LoadingState label="Loading your AR model dashboard..." />;
  }

  if (error) {
    return (
      <div className="panel px-6 py-12">
        <p className="text-lg font-semibold text-[#ffb3aa]">Could not load models</p>
        <p className="mt-3 text-sm text-[color:var(--muted)]">{error}</p>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <EmptyState
        title="Start your AR menu library"
        description="Upload your first GLB or GLTF file to begin building a dish catalog for 3D and AR previews."
        action={
          <Link to="/upload" className="btn-primary">
            Upload first model
          </Link>
        }
      />
    );
  }

  return (
    <section className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Models" value={stats.total} accent="linear-gradient(180deg, #f6dfaa, #d8a541)" />
        <StatCard label="AR Ready" value={stats.arReady} accent="linear-gradient(180deg, #b7f0c4, #4d9e6d)" />
        <StatCard label="Processing" value={stats.processing} accent="linear-gradient(180deg, #d7c4ff, #7e6dd9)" />
        <StatCard label="Failed" value={stats.failed} accent="linear-gradient(180deg, #ffb8aa, #d76262)" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#f5d28a]">Model Library</p>
          <h2 className="mt-2 font-display text-3xl text-[color:var(--cream-strong)]">Uploaded dishes</h2>
        </div>
        <Link to="/upload" className="btn-primary">
          Upload another model
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        {models.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}
      </div>
    </section>
  );
}
