import React from 'react'

/**
 * PlanincMark — the hexagon / ascending-arrow brand mark at arbitrary size.
 *
 * `width` / `height` are **not** props: the SVG declares no `width`/`height`,
 * so the caller controls the size entirely with CSS (`w-8 h-8`, `w-16`, …).
 * This is how one asset serves 32px favicons and 128px app headers, and it is
 * the "different sizes from one source" rule the brand guidelines require.
 */
export const PlanincMark = ({ className, 'data-testid': testId }: { className?: string, 'data-testid'?: string }) => (
  <svg
    className={className}
    viewBox="0 0 600 420"
    aria-hidden="true"
    data-testid={testId}
  >
    <defs>
    <linearGradient id="planinc-mark-primary" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="var(--pi-color-primary-0)" />
      <stop offset="100%" stop-color="var(--pi-color-primary-300)" />
    </linearGradient>
    <linearGradient id="planinc-mark-accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="var(--pi-color-accent-400)" />
      <stop offset="100%" stop-color="var(--pi-color-accent-500)" />
    </linearGradient>
      <filter id="planinc-mark-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Hexagon outer frame */}
    <polygon
      points="100,10 180,55 180,145 100,190 20,145 20,55"
      fill="none"
      stroke="url(#planinc-mark-primary)"
      strokeWidth={10}
      strokeLinejoin="round"
    />

    {/* Circuit nodes + connections */}
    {[
      { cx: 100, cy: 10, color: 'var(--pi-color-primary-0)' },
      { cx: 180, cy: 55, color: 'var(--pi-color-primary-200)' },
      { cx: 180, cy: 145, color: 'var(--pi-color-primary-200)' },
      { cx: 100, cy: 190, color: 'var(--pi-color-primary-0)' },
      { cx: 20, cy: 145, color: 'var(--pi-color-primary-200)' },
      { cx: 20, cy: 55, color: 'var(--pi-color-primary-0)' },
    ].map((node) => (
      <circle key={`${node.cx}-${node.cy}`} cx={node.cx} cy={node.cy} r={5} fill={node.color} />
    ))}

    <path
      d="M 100,10 L 140,32 M 180,55 L 140,85 M 180,145 L 140,120"
      stroke="var(--pi-color-accent-400)"
      strokeWidth={2}
      opacity={0.6}
      filter="url(#planinc-mark-glow)"
    />
    <path
      d="M 20,55 L 60,40 M 20,145 L 60,110"
      stroke="var(--pi-color-primary-0)"
      strokeWidth={2}
      opacity={0.6}
    />

    {/* Ascending trend arrow / sparkline */}
    <path
      d="M 35,140 L 85,95 L 115,120 L 165,45"
      fill="none"
      stroke="url(#planinc-mark-accent)"
      strokeWidth={12}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polygon points="165,30 185,50 155,55" fill="var(--pi-color-accent-400)" filter="url(#planinc-mark-glow)" />
  </svg>
)
