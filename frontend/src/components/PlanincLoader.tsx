import React from 'react'

/**
 * PlanincLoader — a pure-React wrapper around `frontend/public/loading.svg`.
 *
 * Use it where the embedder already owns a render tree (e.g. a page skeleton,
 * a modal backdrop) instead of the `<img src="/loading.svg">` surface. The
 * loader's CSS-animations run inside the SVG herself, so this component is a
 * size + placement shim — no engine.
 *
 * `dark` toggles the dark background / reverse-rise variant.
 */
export const PlanincLoader = ({
  dark = false,
  className,
  'aria-label': ariaLabel = 'Loading',
}: {
  dark?: boolean
  className?: string
  'aria-label'?: string
} = {}) => (
  <div
    className={`flex items-center justify-center ${className ?? ''}`}
    role="status"
    aria-label={ariaLabel}
    aria-live="polite"
  >
    <object
      data={`/loading${dark ? '-dark' : ''}.svg`}
      className="h-16 w-16 md:h-24 md:w-24"
      aria-hidden="true"
      type="image/svg+xml"
    />
    <span className="sr-only">Loading</span>
  </div>
)
