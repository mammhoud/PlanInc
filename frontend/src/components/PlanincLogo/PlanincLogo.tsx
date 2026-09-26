import React from 'react'
import { PlanincMark } from './PlanincMark'
import { PlanincWordmark } from './PlanincWordmark'
import { PlanincLockupH } from './PlanincLockupH'
import { PlanincLockupV } from './PlanincLockupV'

/**
 * PlanincLogo — the public adoption surface for the brand assets.
 *
 * Every `planinc-*` asset in the same family (planinc-mark.svg,
 * planinc-wordmark.svg, planinc-lockup-h.svg, planinc-lockup-v.svg,
 * planinc-mark-white.svg) is a 600×420 viewBox SVG; this component presents
 * them as a single, typed API so callers never have to know which file is
 * behind a given slot.
 *
 * `src` (legacy path lifted asset): when a caller passes a plain image path
 * that is not a known `planinc-*` asset, we fall back to
 * `image-fallback.svg` — the documented FallbackImage contract.
 */
export type PlanincLogoKind = 'mark' | 'wordmark' | 'lockup-h' | 'lockup-v' | 'generic'

export const PlanincLogo = ({
  kind = 'mark',
  src,
  className,
  alt = 'PlanInc',
  ...rest
}: {
  kind?: PlanincLogoKind
  src?: string
  className?: string
  alt?: string
} & React.HTMLAttributes<HTMLImageElement>) => {
  const isKnownAsset = !src || /^\/planinc-(mark|wordmark|lockup-h|lockup-v|mark-white)\.svg$/.test(src)

  if (kind === 'mark') return <PlanincMark className={className} {...rest} />
  if (kind === 'wordmark') return <PlanincWordmark size={64} className={className} {...rest} />
  if (kind === 'lockup-h') return <PlanincLockupH className={className} {...rest} />
  if (kind === 'lockup-v') return <PlanincLockupV className={className} {...rest} />

  // `generic` — caller supplies an image; fall back to the known-set or the
  // documented image-fallback.svg.
  if (!src || !isKnownAsset) {
    return <img src="/image-fallback.svg" alt={alt} className={className} {...rest} />
  }

  return <img src={src} alt={alt} className={className} {...rest} />
}
