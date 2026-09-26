import React from 'react'
import { PlanincMark } from './PlanincMark'
import { PlanincWordmark } from './PlanincWordmark'

/**
 * PlanincLockupH — emblem left, wordmark right.
 *
 * Spacing options match the mark-only hook:
 *  - `tight`: emblem + wordmark are side-by-side at a 16px gutters
 *  - `standard`: 24px gutter (default)
 */
export type PlanincLockupHSpacing = 'tight' | 'standard'

export const PlanincLockupH = ({
  spacing = 'standard',
  wordmarkSize = 64,
  className,
  markClassName,
}: {
  spacing?: PlanincLockupHSpacing
  wordmarkSize?: 32 | 44 | 56 | 64
  className?: string
  markClassName?: string
}) => {
  const gutter = spacing === 'tight' ? 16 : 24
  return (
    <div className={`flex items-center gap-${gutter} ${className ?? ''}`}>
      <PlanincMark className={markClassName} />
      <PlanincWordmark size={wordmarkSize} />
    </div>
  )
}
