import React from 'react'

/**
 * PlanincWordmark — the typography-only lockup ("PLANINC").
 *
 * Props:
 *  - `size`: 32 | 44 | 56 | 64 — scales the `font-size` of the wordmark.
 */
export type PlanincWordmarkSize = 32 | 44 | 56 | 64

const SIZE: Record<PlanincWordmarkSize, number> = {
  32: 22, 44: 30, 56: 38, 64: 44,
}

export const PlanincWordmark = ({
  size = 64,
  weight = 800,
  letterSpacing = 6,
  className,
}: {
  size?: PlanincWordmarkSize
  weight?: number
  letterSpacing?: number
  className?: string
}) => {
  const fontScale = SIZE[size] / 44
  return (
    <svg
      className={className}
      viewBox="0 0 600 120"
      width={22 * fontScale}
      height={78 * fontScale}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="planinc-wordmark" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--pi-color-primary-300)" />
          <stop offset="70%" stop-color="var(--pi-color-primary-200)" />
          <stop offset="100%" stop-color="var(--pi-color-primary-0)" />
        </linearGradient>
      </defs>
      <text
        x="300"
        y={78 * fontScale}
        fontSize={SIZE[size]}
        fontWeight={weight}
        fill="url(#planinc-wordmark)"
        textAnchor="middle"
        letterSpacing={letterSpacing}
      >
        PLANINC
      </text>
    </svg>
  )
}
