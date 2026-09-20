# PlanInc graph and branding session plan

**Date:** 2026-09-20  
**Scope:** PlanInc graph redesign, supplied-logo integration, sky-blue branding, and
verification. This document records the final state of the session and is the
source of truth for what remains.

## Overall status

**Partially complete.** The core graph redesign, logo asset preparation, sky-blue
palette, frontend build, and non-destructive deployment checks are complete.
Several hardening, visual-polish, end-to-end testing, and packaging tasks remain.

## Plan and status

| Task | Status | Evidence |
|---|---|---|
| Prepare the supplied PlanInc logo for application use | Complete with limitations | [logo-assets.md](./logo-assets.md) |
| Add a sky-blue brand palette | Complete | `src/app/src/lib/themePalettes.ts` |
| Add Anytype-inspired graph interactions | Partially complete | `src/app/src/components/PlanincGraph/PlanincGraph.tsx` |
| Add Blinko-inspired preview background treatment | Partially complete | `src/app/src/pages/graph.tsx` |
| Verify frontend build and deployment command contracts | Complete | [verification.md](./verification.md) |
| Complete runtime, Docker, accessibility, and visual regression verification | Not complete | [verification.md](./verification.md) |

## Completed work

### Logo and branding

- Copied the supplied image into the PlanInc public assets as a source reference.
- Added cropped/resized light, dark, and square JPEG variants.
- Added the `sky` theme palette:
  - Background: `#0EA5E9`
  - Foreground: `#082F49`
  - Accent: `#38BDF8`
  - Surface: `#F0F9FF`
- Kept the existing theme architecture based on CSS variables, Tailwind semantic
  colors, and HeroUI components.

### Graph interactions

- Added:
  - `d3-force`
  - `d3-force-cluster`
  - `d3-selection`
  - `d3-zoom`
  - `d3-drag`
- Added matching TypeScript definitions.
- Extracted the SVG graph into a reusable `PlanincGraph` component.
- Added force simulation and collision handling.
- Added node dragging.
- Added graph pan and zoom.
- Preserved existing React-owned:
  - Node selection.
  - Keyboard navigation.
  - Relation loading.
  - Node filtering.
  - Related-item preview behavior.

### Preview treatment

- Added a sky-tinted graph canvas.
- Added a blurred PlanInc logo background in the selected-node preview.
- Added a sharp square logo foreground.
- Added a blue/dark readability scrim inspired by Blinko’s preview treatment.

### Verification

Passed:

```bash
cd application/tools/PlanInc/src
bun run --cwd app build:web

cd application/tools/PlanInc
docker compose --env-file .env.example -f docker-compose.yml config -q
make -n deploy
make -n test
git diff --check
```

The frontend build completed successfully. It emitted non-fatal existing warnings
about chunk splitting, dynamic imports, stale browser data, and Browserslist data.

## Incomplete work

### Graph functionality

- `d3-force-cluster` is installed but is not wired into the simulation.
- Graph camera position and zoom are not persisted.
- There is no fit-to-content or reset-camera control yet.
- Node-specific image previews are not implemented.
- The preview currently uses the PlanInc logo for selected nodes.
- Edge labels and connected-path emphasis are still limited.
- Reduced-motion behavior is not implemented.
- Automated graph interaction tests are not present.

### Logo packaging

- The generated assets are JPEG files, not transparent SVG/PNG files.
- Existing `logo.png`, title logos, favicon, and Tauri icon bundles were not
  replaced.
- The dark logo variant is not a true transparent recolor; it currently preserves
  the cropped supplied artwork.

### Verification

- Runtime Playwright tests were not run.
- Docker image build was not run.
- Container startup and HTTP smoke tests were not run.
- Browser-level visual comparison against Anytype and Blinko was not automated.
- Accessibility testing was not completed.
- Contrast checks for all light/dark palette combinations were not completed.

### Repository delivery

- Changes have not been committed.
- The parent workspace still records PlanInc as a modified submodule pointer when
  the submodule revision is updated.

## Next implementation order

1. Add camera persistence, reset, and fit-to-content controls.
2. Wire `d3-force-cluster` with stable type clusters.
3. Add node-specific preview images and deterministic type fallbacks.
4. Add reduced-motion handling and graph interaction tests.
5. Export transparent PNG/SVG logo variants and update favicon/Tauri assets.
6. Run runtime Playwright tests.
7. Build the Docker image and run the container health/smoke checks.
8. Perform browser visual review and accessibility/contrast checks.
9. Review the final diff and commit only after the user requests committing.

## Detailed reports

- [Logo asset report](./logo-assets.md)
- [Graph redesign report](./graph-redesign.md)
- [Verification report](./verification.md)
