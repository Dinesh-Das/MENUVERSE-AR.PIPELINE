# Menuverse Integration

This service is intentionally standalone. Menuverse should integrate with it using REST only.

## Primary lookup

Menuverse can request an AR asset for a dish by `menuItemId`:

```js
const response = await fetch(
  `${import.meta.env.VITE_AR_PIPELINE_API_URL}/api/models/menu-item/${menuItemId}`
);
```

If the response is `404`, Menuverse should show:

`AR preview coming soon.`

## Expected response

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

## Suggested Menuverse flow

1. Menuverse renders a food detail page.
2. It checks whether that food item has an AR asset in this service.
3. If found, it renders:
   - a preview card
   - a 3D preview CTA
   - an AR preview CTA
4. If not found, it renders the fallback copy:
   - `AR preview coming soon.`

## Integration notes

- Prefer `processedFileUrl` over `originalFileUrl`.
- Only treat `isARReady` as customer-visible.
- Do not auto-publish every video-generated proxy model to customers. Review and mark it AR-ready first.
- Respect `scale`, `rotation`, and `position` values in your AR presentation layer.
- Keep Menuverse logic decoupled from worker internals. Menuverse only needs the REST response.
