# MenuVerse AR Pipeline

MenuVerse AR Pipeline is a standalone companion service for managing 3D food assets that can later be consumed by the main Menuverse app over REST. It does not import Menuverse code. Instead, it focuses on a clean upload-to-AR workflow for restaurant and admin teams.

## Project overview

This MVP lets an operator:

- upload `.glb` or `.gltf` food models
- upload food capture videos such as `.mp4` or `.mov`
- store metadata and Menuverse-facing `menuItemId` links
- preview models in 3D
- preview models in AR with `<model-viewer>`
- process models through a Python worker
- generate thumbnails from video frames or placeholders for uploaded models
- mark assets as AR-ready for Menuverse consumption

## Architecture

```text
Restaurant/Admin
      |
      v
React + Vite Dashboard (client, port 5184)
      |
      v
Express API + Prisma + SQLite (server, port 4000)
      |
      +--> in-process background queue (default concurrency: 1)
      +--> /uploads/models
      +--> /uploads/processed
      +--> /uploads/thumbnails
      |
      v
FastAPI Worker (worker, port 8001)
      |
      +--> validate model
      +--> inspect metadata with trimesh
      +--> sample video frames when the source is a capture video
      +--> attempt COLMAP photogrammetry when available
      +--> generate thumbnail with Pillow
      +--> fall back to a proxy GLB only when reconstruction is unavailable
```

## Folder structure

```text
menuverse-ar-pipeline/
|-- client/
|-- server/
|-- worker/
|-- uploads/
|   |-- models/
|   |-- videos/
|   |-- frames/
|   |-- thumbnails/
|   `-- processed/
|-- docs/
|   |-- API.md
|   |-- MENUVERSE_INTEGRATION.md
|   |-- AR_ASSET_GUIDELINES.md
|   `-- PIPELINE_FLOW.md
|-- package.json
`-- README.md
```

## Start here

This project is meant to be a separate local app with its own test UI.

### Windows quick start

If you want the easiest path on Windows, run:

```powershell
cmd /c npm run setup:windows
cmd /c npm --prefix client run build
cmd /c npm run start:windows
```

That setup script:

- copies env files if missing
- installs root, client, and server dependencies
- runs Prisma migration
- tries to set up the Python worker if Python is available

### Manual setup

1. Install Node.js 20+ and Python 3.10+.
2. Install root dependencies:
   - `cmd /c npm install`
3. Install client and server dependencies:
   - `cmd /c npm --prefix client install`
   - `cmd /c npm --prefix server install`
4. Copy env examples:
   - `.env.example` -> `.env`
   - `client/.env.example` -> `client/.env`
   - `server/.env.example` -> `server/.env`
   - `worker/.env.example` -> `worker/.env`
5. Create a Python virtual environment in `worker` and install requirements:
   - `python -m venv worker/.venv`
   - `worker\\.venv\\Scripts\\python -m pip install --upgrade pip`
   - `worker\\.venv\\Scripts\\python -m pip install -r worker/requirements.txt`
6. Run database migration:
   - `cmd /c npm run prisma:migrate`
7. Build the testing UI:
   - `cmd /c npm --prefix client run build`

## Run modes

### Full studio

Use this for normal testing. It starts:

- frontend UI
- API server
- worker

```powershell
cmd /c npm run dev:studio
```

If the Python worker cannot start, this command now stops the whole studio instead of leaving the frontend and server running in a misleading half-working state.

The studio serves the built client bundle from `client/dist`. If you change React code, rebuild it first with:

```powershell
cmd /c npm --prefix client run build
```

### Frontend only

Use this if you only want to verify the separate UI shell.

```powershell
cmd /c npm run dev:frontend
```

### Backend only

Use this if you want the API and worker without the UI.

```powershell
cmd /c npm run dev:backend
```

## Which URL should I open?

- Testing UI: `http://localhost:5184`
- API health: `http://localhost:4000/health`
- Worker health: `http://localhost:8001/health`

If you see your old Menuverse portal instead, you are opening the wrong port or another app is already using the UI port.

## Environment variables

### Root

- `CLIENT_PORT=5184`
- `SERVER_PORT=4000`
- `WORKER_PORT=8001`

### Server

- `DATABASE_URL=file:./dev.db`
- `CLIENT_URL=http://localhost:5184`
- `WORKER_URL=http://localhost:8001`
- `PUBLIC_BASE_URL=http://localhost:4000`
- `UPLOAD_DIR=../uploads`
- `SERVER_PORT=4000`
- `PROCESSING_CONCURRENCY=1`
- `UPLOAD_RATE_LIMIT_WINDOW_MS=600000`
- `UPLOAD_RATE_LIMIT_MAX=12`

### Client

- `VITE_API_URL=http://localhost:4000`
- `VITE_CLIENT_PORT=5184`

### Worker

- `WORKER_PORT=8001`
- `UPLOAD_ROOT=../uploads`
- `VIDEO_PIPELINE_MODE=auto`
- `COLMAP_BIN=colmap`
- `VIDEO_FRAME_SAMPLING_FPS=2`
- `VIDEO_MAX_ANALYZED_FRAMES=720`
- `VIDEO_MAX_SAVED_FRAMES=48`
- `COLMAP_MAX_IMAGE_SIZE=1600`
- `COLMAP_MESH_FACE_RATIO=0.35`
- `RETAIN_VIDEO_WORKDIRS=false`

## Development commands

- `npm run dev`
- `npm run dev:studio`
- `npm run dev:frontend`
- `npm run dev:backend`
- `npm run dev:client`
- `npm run dev:server`
- `npm run dev:worker`
- `npm run setup:windows`
- `npm run start:windows`
- `npm run prisma:migrate`
- `npm run prisma:studio`

## API list

- `POST /api/models/upload`
- `POST /api/models/upload-video`
- `GET /api/models`
- `GET /api/models/:id`
- `PUT /api/models/:id`
- `DELETE /api/models/:id`
- `GET /api/models/menu-item/:menuItemId`
- `POST /api/models/:id/process`
- `POST /api/models/:id/mark-ar-ready`

See [API.md](D:/MyProjects/menu-verse-arpipeline/docs/API.md) for request and response details.

## Upload rules

- allowed file types: `.glb`, `.gltf`
- allowed video types: `.mp4`, `.mov`, `.m4v`, `.webm`
- uploads are checked by extension and lightweight file signature validation
- max file size: `50MB`
- max video size: `250MB`
- upload routes are rate-limited in the server
- originals saved to `uploads/models`
- source videos saved to `uploads/videos`
- sampled frames saved to `uploads/frames`
- processed assets saved to `uploads/processed`
- thumbnails saved to `uploads/thumbnails`

## Model processing flow

1. Operator uploads either a model file or a capture video plus metadata.
2. Express persists the asset and creates a `FoodModel` record.
3. Express queues the model for background processing and returns immediately to the UI.
4. The server queue sends one job at a time to the FastAPI worker by default.
5. For model uploads, the worker validates the file, inspects it, and copies it to the processed directory.
6. For video uploads, the worker samples frames, tries COLMAP photogrammetry, converts the resulting mesh to `GLB`, and falls back to a proxy `GLB` only when the toolchain is unavailable or the reconstruction fails.
7. The worker updates the record to `PROCESSED`, `PROXY_READY`, or `FAILED`.
8. Operator reviews the result, adjusts transform metadata, and marks it `AR_READY`.

### Real video-to-model mode

For a true reconstructed dish mesh instead of a fallback proxy:

- install [COLMAP](https://colmap.github.io/)
- make sure `colmap` is on `PATH`, or set `COLMAP_BIN` in `worker/.env`
- set `VIDEO_PIPELINE_MODE=photogrammetry` if you want uploads to fail instead of falling back when reconstruction is unavailable

You can verify the active mode at `http://localhost:8001/health`.

## Menuverse integration notes

Menuverse should query:

- `GET /api/models/menu-item/:menuItemId`

If no model exists, show:

- `AR preview coming soon.`

See [MENUVERSE_INTEGRATION.md](D:/MyProjects/menu-verse-arpipeline/docs/MENUVERSE_INTEGRATION.md).

## Future roadmap

- async job queue with Redis/Celery
- Blender-backed mesh cleanup and texture baking
- real thumbnail rendering from Blender
- S3 or object storage instead of local disk
- role-based auth and audit logs
- AI-assisted food asset generation later, behind the worker boundary
