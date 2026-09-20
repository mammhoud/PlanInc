# Task report: PlanInc logo assets

## Status

Completed with limitations.

## Done

- Preserved the supplied attachment as `src/app/public/planinc-logo-source.jpg`.
- Cropped away the black screenshot margins from the supplied image.
- Added resized light, dark, and square application assets:
  - `src/app/public/planinc-logo-light.jpg`
  - `src/app/public/planinc-logo-dark.jpg`
  - `src/app/public/planinc-logo-square.jpg`
- Documented the new public assets in `src/app/public/README.md`.

## Not done

- The repository does not currently include an image-processing dependency, so the
  enhancement is limited to cropping and resizing with the macOS `sips` tool.
- The dark variant currently preserves the supplied light artwork and is not yet
  a transparent recolor. A later UI task can place it on the sky-blue dark
  preview surface or replace it with a transparent export.
- Existing `logo.png`, title logos, favicon, and Tauri icon bundles have not
  been replaced yet. This avoids silently changing unrelated application icon
  contracts before the graph branding work is complete.

## Verification

- Confirmed all four generated assets are valid JPEG files.
- Confirmed the cropped wordmark is 1200px wide and the compact asset is 512px
  square.
