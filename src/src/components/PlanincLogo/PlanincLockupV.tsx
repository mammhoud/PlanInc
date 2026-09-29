import React from 'react'
import { PlanincMark } from './PlanincMark'
import { PlanincWordmark } from './PlanincWordmark'

/**
 * PlanincLockupV — emblem above wordmark (for doc covers, drawers, sidebars).
 *
 * Spacing options:
 *  - `tight`: 8px gap
 *  - `standard`: 16px gap (default)
 */
export type PlanincLockupVSpacing = 'tight' | 'standard'

export const PlanincLockupV = ({
  spacing = 'standard',
  wordmarkSize = 64,
  className,
  markClassName,
}: {
  spacing?: PlanincLockupVSpacing
  wordmarkSize?: 32 | 44 | 56 | 64
  className?: string
  markClassName?: string
}) => {
  const gap = spacing === 'tight' ? 8 : 16
  return (
    <div className={`flex flex-col items-center gap-${gap} ${className ?? ''}`}>
      <PlanincMark className={markClassName} />
      <PlanincWordmark size={wordmarkSize} />
    </div>
  )
}
