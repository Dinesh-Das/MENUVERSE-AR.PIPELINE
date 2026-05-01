# AR Asset Guidelines

## Recommended format

- prefer `.glb` for the MVP
- `.gltf` is supported for upload, but `.glb` is the simplest runtime target
- for video capture input, use slow and stable `.mp4` or `.mov` clips with the full dish visible
- for photogrammetry, orbit the plate in one smooth pass with 360-degree coverage and avoid fast pans
- keep lighting soft and even, and avoid reflective cutlery or moving hands entering the frame
- aim for `15` to `45` seconds of capture so the worker can extract enough overlapping views

## Performance guidance

- keep model size below `20MB` to `30MB` for smooth mobile AR when possible
- keep textures compressed and reasonably sized
- avoid excessive polygon counts that do not improve visual quality

## Placement guidance

- use real-world scale
- center the model origin
- keep the base aligned to the ground or table plane
- avoid large offsets unless the dish truly needs them

## QA guidance

- test on Android with WebXR or Scene Viewer
- test on iPhone with Quick Look when USDZ is available
- verify the dish does not appear too large or too small
- check lighting and shadows in a realistic table environment
- review silhouette quality from seated viewing angles
- if the asset came from video in the MVP, confirm whether it is a proxy model or a true reconstructed mesh before publishing it

## Asset hygiene

- use clear file names
- remove broken meshes or floating fragments
- avoid missing textures
- keep category and menu item links up to date
