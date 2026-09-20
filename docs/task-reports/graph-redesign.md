# Task report: graph redesign

## Status

Implemented and build-verified.

## Done

- Added D3 graph interaction packages:
  - `d3-force`
  - `d3-force-cluster`
  - `d3-selection`
  - `d3-zoom`
  - `d3-drag`
- Added matching TypeScript packages.
- Extracted the graph canvas into `src/app/src/components/PlanincGraph/PlanincGraph.tsx`.
- Added force simulation, collision handling, zoom/pan, and temporary node dragging.
- Preserved PlanInc's existing React-owned selection, keyboard navigation, relation
  data, and preview modal behavior.
- Added sky-blue graph node colors and sky-tinted light/dark canvas backgrounds.
- Added the supplied PlanInc logo as a blurred preview background with a sharp
  square logo foreground, following the Blinko preview treatment.
- Added a `sky` theme palette to `src/app/src/lib/themePalettes.ts`.
- Added component documentation in `PlanincGraph/README.md`.
- Fixed the existing `setPolicy` state-setter naming collision in
  `PlanincSettings/ShareApprovalSetting.tsx`, which blocked the frontend build.

## Not done

- `d3-force-cluster` is installed for the planned cluster phase but is not yet
  wired into the simulation; current grouping is represented through node colors.
- Camera state is not yet persisted to local storage.
- The preview background currently uses the workspace logo for every selected node;
  resource-specific node images and type-specific fallback textures remain future work.
- Reduced-motion handling and automated graph interaction tests have not yet been added.
- Existing application logo/favicon/Tauri icon bundles remain unchanged.

## Verification

- `bun run --cwd app build:web` passed.
- Build emitted existing chunk-splitting and stale browser-data warnings only.
