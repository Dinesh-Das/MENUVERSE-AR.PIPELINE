# Interview case study

Verified upgrade: 2026-11-05. Scope: job-switch and interview readiness.

Applied AI and backend engineering: validated media processing and honest reconstruction state.

## Architecture and engineering decision

A React dashboard and Express/Prisma service manage uploads and processing state. A FastAPI worker inspects meshes, samples video and attempts photogrammetry, with an explicitly separate proxy-model fallback.

Worker source paths must resolve inside the configured upload root. Output model IDs reject traversal. A GLB header alone no longer qualifies as processed: readable, nonempty geometry is required before copying output.

## Five-minute walkthrough

Process a generated box mesh and inspect its 12 faces. Follow with an outside-root source, traversal model ID and invalid GLB header; show each is rejected without an escaped output artifact.

After the repository's documented dependency setup, run these commands from its root. Use an activated Python environment where applicable; Maven offline mode requires cached dependencies.

```text
python -m pytest worker/tests -q -p no:cacheprovider
```

## Recorded evidence

6 worker tests passed using temporary synthetic assets. The local run used bundled Python 3.12 plus the worker's existing .python-packages because its venv launcher was stale.

On 2026-11-07, 10 worker tests passed, including upload-contained secondary buffers/textures and a processed GLB that still loads after its source sidecars are removed. Both queue concurrency regressions passed after reproducing the lost retry at concurrency 2. The queue tests import the real module with only Prisma/worker/environment boundaries mocked (`cd server && npm test` using Node 24's experimental module-mock flag). Model output is a static self-contained GLB; animations and unsupported extensions are not guaranteed. Native mobile AR and photogrammetry quality were not evaluated.

Behavioral regressions were reproduced before their fixes. Passing contract tests demonstrate the named behavior; they are not an AI accuracy rating.

## Defensible resume wording

> Built validation for a media-processing worker covering upload ownership, output identifiers and actual mesh geometry.

Use this wording only after you can reproduce and explain the implementation. Add measured numbers with their dataset and environment; never substitute synthetic results for real-user impact.

## Questions to prepare

What distinguishes reconstructed geometry from a proxy? Where should processing ownership live? How would you handle referenced glTF assets and concurrent retries?

## Remaining evidence

No reconstruction-quality benchmark, mobile AR validation, multi-worker durability or complete glTF asset-tree security guarantee is established. A proxy GLB must never be described as successful photogrammetry. Server/client end-to-end flows were not reverified in this worker slice.
