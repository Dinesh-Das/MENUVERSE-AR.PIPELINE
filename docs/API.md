# API

## Base URL

`http://localhost:4000`

## Endpoints

### `POST /api/models/upload`

Multipart form upload for a model file and metadata.

Fields:

- `model`: `.glb` or `.gltf`
- `name`: required
- `menuItemId`: optional
- `category`: optional
- `description`: optional

Response:

- created `FoodModel` record
- status `202 Accepted`
- processing is queued in the server background worker

### `POST /api/models/upload-video`

Multipart form upload for a source capture video and metadata.

Fields:

- `video`: `.mp4`, `.mov`, `.m4v`, or `.webm`
- `name`: required
- `menuItemId`: optional
- `category`: optional
- `description`: optional

Response:

- created `FoodModel` record
- status `202 Accepted`
- processing is queued in the server background worker
- the final record later includes `processedFileUrl`, `thumbnailUrl`, and `processingNotes`

### `GET /api/models`

Returns all active food models ordered by newest first.

### `GET /api/models/:id`

Returns a single `FoodModel`.

### `PUT /api/models/:id`

Updates editable metadata:

- `name`
- `description`
- `category`
- `menuItemId`
- `scale`
- `rotationX`
- `rotationY`
- `rotationZ`
- `positionX`
- `positionY`
- `positionZ`
- `isARReady`

### `DELETE /api/models/:id`

Deletes the database record and attempts to remove original, processed, and thumbnail files.

### `GET /api/models/menu-item/:menuItemId`

Menuverse-facing lookup endpoint.

If a model is found, response looks like:

```json
{
  "id": "model_id",
  "menuItemId": "menuverse_dish_id",
  "name": "Butter Chicken",
  "modelUrl": "http://localhost:4000/uploads/processed/butter-chicken.glb",
  "thumbnailUrl": "http://localhost:4000/uploads/thumbnails/butter-chicken.png",
  "isARReady": true,
  "scale": 1,
  "rotation": {
    "x": 0,
    "y": 0,
    "z": 0
  },
  "position": {
    "x": 0,
    "y": 0,
    "z": 0
  }
}
```

If no model exists:

```json
{
  "message": "AR preview coming soon."
}
```

### `POST /api/models/:id/process`

Queues worker processing for an existing model and returns `202 Accepted`.

### `POST /api/models/:id/mark-ar-ready`

Marks a processed model as AR-ready.

## Validation rules

- only `.glb` and `.gltf`
- only `.mp4`, `.mov`, `.m4v`, and `.webm` for video uploads
- uploaded file contents must match a lightweight signature check for the claimed asset type
- maximum upload size: `50MB`
- maximum video size: `250MB`
- upload routes are rate-limited
- missing model file returns `400`
- missing video file returns `400`
- invalid file type returns `400`
- missing record returns `404`
