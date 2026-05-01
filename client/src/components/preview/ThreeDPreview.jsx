import React, { Suspense } from "react";
import { Bounds, Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { resolveAssetUrl } from "../../api/models";

class PreviewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Could not load this model."
    };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.state.message);
    }

    return this.props.children;
  }
}

function Model({ url }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene.clone()} />;
}

function Loader() {
  return (
    <Html center>
      <div className="rounded-full border border-white/10 bg-[#18120f] px-4 py-2 text-sm text-[#f5d28a]">
        Loading model...
      </div>
    </Html>
  );
}

export function ThreeDPreview({ modelUrl }) {
  const resolvedModelUrl = resolveAssetUrl(modelUrl);

  if (!resolvedModelUrl) {
    return (
      <div className="panel px-6 py-14 text-center">
        <p className="text-sm text-[color:var(--muted)]">No processed model is available for 3D preview yet.</p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden p-3">
      <PreviewErrorBoundary
        fallback={(message) => (
          <div className="flex h-[72vh] items-center justify-center rounded-[24px] bg-[#100c09] px-6 text-center text-sm text-[#ffb3aa]">
            {message}
          </div>
        )}
      >
        <Canvas camera={{ position: [2.4, 2.1, 2.8], fov: 42 }} style={{ height: "72vh", borderRadius: 24 }}>
          <color attach="background" args={["#120e0a"]} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[5, 5, 5]} intensity={2.2} />
          <directionalLight position={[-3, 4, -2]} intensity={0.7} />
          <Suspense fallback={<Loader />}>
            <Bounds fit clip observe margin={1.25}>
              <Model url={resolvedModelUrl} />
            </Bounds>
          </Suspense>
          <OrbitControls enableDamping makeDefault />
        </Canvas>
      </PreviewErrorBoundary>
    </div>
  );
}
