import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = __dirname;
const port = process.env.WORKER_PORT ?? "8001";
const localPackageDir = path.join(workerRoot, ".python-packages");
const localWindowsPython = path.join(workerRoot, ".venv", "Scripts", "python.exe");
const localUnixPython = path.join(workerRoot, ".venv", "bin", "python");
const libreOfficePython = "C:\\Program Files\\LibreOffice\\program\\python.exe";
const dependencyProbeCode = "import importlib.util, cv2, fastapi, imageio, trimesh, PIL, scipy, onnxruntime, pydantic_core._pydantic_core; assert importlib.util.find_spec('rembg') is not None; print('worker-runtime-ok')";

function buildEnv() {
  const existingPythonPath = process.env.PYTHONPATH;

  return {
    ...process.env,
    PYTHONPATH: existingPythonPath ? `${localPackageDir};${existingPythonPath}` : localPackageDir
  };
}

const candidates = [
  { command: localWindowsPython, probe: ["-c", dependencyProbeCode], args: ["-m", "uvicorn", "main:app", "--port", port] },
  { command: localUnixPython, probe: ["-c", dependencyProbeCode], args: ["-m", "uvicorn", "main:app", "--port", port] },
  { command: "python", probe: ["-c", dependencyProbeCode], args: ["-m", "uvicorn", "main:app", "--port", port] },
  { command: "python3", probe: ["-c", dependencyProbeCode], args: ["-m", "uvicorn", "main:app", "--port", port] },
  { command: "py", probe: ["-3", "-c", dependencyProbeCode], args: ["-3", "-m", "uvicorn", "main:app", "--port", port] },
  { command: libreOfficePython, probe: ["-c", dependencyProbeCode], args: ["-m", "uvicorn", "main:app", "--port", port] }
];

const runtime = candidates.find((candidate) => {
  const result = spawnSync(candidate.command, candidate.probe, {
    cwd: workerRoot,
    env: buildEnv(),
    stdio: "ignore",
    shell: false
  });

  return result.status === 0;
});

if (!runtime) {
  console.error("No Python runtime was found. Install Python 3.10+ and worker requirements before running the worker.");
  process.exit(1);
}

const child = spawn(runtime.command, runtime.args, {
  cwd: workerRoot,
  env: buildEnv(),
  stdio: "inherit",
  shell: false
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
