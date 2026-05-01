# Pipeline Flow

`Upload -> Validate -> Process -> Preview -> Mark AR Ready -> Serve to Menuverse`

## 1. Upload

The operator uploads either:

- a `.glb` or `.gltf` file
- or a source video such as `.mp4` or `.mov`

along with:

- dish name
- optional `menuItemId`
- category
- description

## 2. Validate

The Express API checks:

- file presence
- file type
- file size
- lightweight file signature validation
- request body metadata ranges and string lengths

Then the worker checks:

- file existence on disk
- supported extension
- readable metadata where possible
- readable video frames when the source is a video

## 3. Process

For MVP processing, the server first queues the asset so the upload request can return immediately.

Then the worker:

- reads basic metadata
- inspects geometry with `trimesh` when the source is already a model
- samples frames when the source is a video
- attempts COLMAP photogrammetry for video uploads when the toolchain is available
- creates a thumbnail into `uploads/thumbnails`
- outputs a processed file into `uploads/processed`
- removes temporary video work directories after successful completion unless retention is explicitly enabled

For video uploads, the worker now tries a real photogrammetry reconstruction first. If COLMAP is not installed, or the reconstruction cannot complete from the capture, the worker falls back to a GLB proxy model so the downstream preview and AR flow still remains testable.

## 4. Preview

The dashboard supports:

- 3D preview with React Three Fiber
- AR preview with `<model-viewer>`

## 5. Mark AR Ready

After review, the operator can mark the model as customer-ready.

That sets:

- `isARReady = true`
- `status = AR_READY`

## 6. Serve to Menuverse

Menuverse requests the asset by `menuItemId`:

- `GET /api/models/menu-item/:menuItemId`

If the model does not exist, Menuverse should show:

- `AR preview coming soon.`
