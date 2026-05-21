# Fix Plan: Make MenuVerse AR Pipeline Work End to End

## Current State

This repo is a three-service local app:

- React/Vite client on port `5184`
- Express/Prisma API on port `4000`
- FastAPI Python worker on port `8001`

Smoke checks from this workspace:

- `cmd /c npm --prefix client run build` passes.
- `cmd /c "cd server && npx prisma validate"` passes.
- `worker\.venv\Scripts\python -m pytest worker\tests` fails because `pytest` is not installed in the worker venv.
- Existing worker logs show COLMAP Poisson meshing can crash with exit code `3221225477`; the worker has fallback code, but this path needs explicit testing with real uploaded videos.

The main goal is to make the local studio reliable for upload, processing, preview, and AR-ready marking.

## Fix Priorities

### 1. Repair the Local Runtime Setup

Make setup reproducible before changing feature code.

- Ensure `worker/.venv` has every package in `worker/requirements.txt`, including `pytest`.
- Confirm the worker starts from the same runtime used by `worker/dev-runner.mjs`.
- Add a setup verification command or document one canonical command:
  - `cmd /c npm install`
  - `cmd /c npm --prefix client install`
  - `cmd /c npm --prefix server install`
  - `worker\.venv\Scripts\python -m pip install -r worker\requirements.txt`
  - `cmd /c npm run prisma:migrate`
  - `cmd /c npm --prefix client run build`

Acceptance checks:

- `worker\.venv\Scripts\python -m pytest worker\tests` passes.
- `cmd /c npm --prefix client run build` passes.
- `cmd /c "cd server && npx prisma validate"` passes.

### 2. Make Startup Failures Obvious

The app should never look half-running when one service is down.

- Keep `scripts/dev-studio.ps1` as the canonical startup path.
- Verify it fails fast when ports `5184`, `4000`, or `8001` are occupied.
- Verify it prints useful log file paths for client, server, and worker failures.
- Add a short troubleshooting section to the README for:
  - port conflicts
  - missing worker dependencies
  - missing COLMAP
  - stale client build

Acceptance checks:

- `cmd /c npm run dev:studio` starts all three services.
- `http://localhost:5184` loads the client.
- `http://localhost:4000/health` returns `ok: true`.
- `http://localhost:8001/health` returns `ok: true` and video pipeline details.

### 3. Stabilize Worker Processing

The worker is the highest-risk part because it handles Python dependencies, thumbnails, GLB inspection, video frame extraction, and optional COLMAP reconstruction.

- Add tests for `/process-video` in proxy mode so video uploads work without COLMAP.
- Add tests for failed model and failed video responses to confirm the API returns a structured `FAILED` worker result instead of crashing.
- Make COLMAP mode behavior explicit:
  - `VIDEO_PIPELINE_MODE=proxy` should always skip COLMAP.
  - `VIDEO_PIPELINE_MODE=auto` should use COLMAP only when available and fall back to proxy otherwise.
  - `VIDEO_PIPELINE_MODE=photogrammetry` should report when COLMAP is unavailable and still return a usable proxy result unless strict failure is intentionally required.
- Capture the Poisson meshing crash path in a regression test around `_run_dense_meshing_pass` or a smaller helper, using a mocked `_run_command`.
- Keep frame workspace cleanup predictable:
  - remove temporary frames when `RETAIN_VIDEO_WORKDIRS=false`
  - preserve them when `RETAIN_VIDEO_WORKDIRS=true`

Acceptance checks:

- GLB upload produces `PROCESSED`.
- Video upload without COLMAP produces `PROXY_READY`.
- Video upload with COLMAP available either produces `PROCESSED` or a clear proxy fallback with notes.
- Failed processing writes a clear `errorMessage` and does not leave database rows stuck in `PROCESSING`.

### 4. Verify Server and Queue Behavior

The Express API owns persistence and background processing. It needs strong guarantees around status transitions.

- Test upload endpoints for `.glb`, `.gltf`, `.mp4`, `.mov`, `.m4v`, and `.webm`.
- Test invalid upload types return clear `400` responses.
- Test `POST /api/models/:id/process` does not enqueue duplicate jobs for the same model.
- Test worker unavailability:
  - row transitions to `FAILED`
  - `errorMessage` tells the operator that the worker is unreachable
  - queue snapshot remains accurate
- Confirm public upload URLs resolve correctly from `PUBLIC_BASE_URL` and `/uploads`.

Acceptance checks:

- A model can move through `UPLOADED -> PROCESSING -> PROCESSED`.
- A video can move through `UPLOADED -> PROCESSING -> PROXY_READY` or `PROCESSED`.
- Failed worker calls never leave stale queue state.

### 5. Polish Client Error and Status States

The client already builds, so prioritize workflow clarity over visual rewrites.

- Confirm dashboard polling or refresh behavior shows current processing status.
- Show worker fallback notes for video-generated proxy assets.
- Make upload errors visible near the upload form.
- Make AR preview unavailable states explicit when an asset is not ready.
- Keep the large Vite bundle warning as a later optimization unless load time becomes painful.

Acceptance checks:

- Uploading a model shows progress and lands on a previewable asset.
- Uploading a video shows whether the result is a proxy or photogrammetry mesh.
- Failed jobs are readable from the UI without checking logs.

### 6. Add an End-to-End Smoke Script

Add one repeatable local smoke flow so future fixes can be verified quickly.

The smoke script should:

- start server and worker in test mode or assume they are running
- hit both health endpoints
- upload a tiny generated GLB
- wait for processing to finish
- assert the processed GLB and thumbnail URLs return `200`

Optional second phase:

- upload a tiny generated video
- force `VIDEO_PIPELINE_MODE=proxy`
- assert the result becomes `PROXY_READY`

Acceptance checks:

- One command can prove the backend-worker path works.
- The smoke command exits non-zero with a useful message when any service is broken.

## Suggested Implementation Order

1. Fix worker environment installation and run the existing worker tests.
2. Add worker video/proxy tests and fallback tests.
3. Add API queue/status tests around worker success and failure.
4. Run full local studio and manually test GLB upload.
5. Manually test video upload in `VIDEO_PIPELINE_MODE=proxy`.
6. Manually test video upload in `VIDEO_PIPELINE_MODE=auto` with COLMAP available.
7. Update README troubleshooting with the final verified commands.

## Verification Command Set

Run these before calling the fix complete:

```powershell
cmd /c npm --prefix client run build
cmd /c "cd server && npx prisma validate"
worker\.venv\Scripts\python -m pytest worker\tests
cmd /c npm run dev:studio
```

Then open:

- `http://localhost:5184`
- `http://localhost:4000/health`
- `http://localhost:8001/health`

Final manual checks:

- upload one `.glb`
- upload one short `.mp4` with `VIDEO_PIPELINE_MODE=proxy`
- confirm processed assets render in 3D preview
- confirm AR-ready marking works
