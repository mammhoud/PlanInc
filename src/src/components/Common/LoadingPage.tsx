import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * LoadingPage — replaces the legacy `/loading.gif` bitmap with the new animated
 * brand loader: the hexagon + ascending trend arrow rises on a 1.6s loop while
 * the gradient backdrop sweeps. `loading.svg` lives in `frontend/public/` so it
 * is available to every platform target (web/PWA *and* Tauri, which serves
 * `dist/public` verbatim — no Vite rewrite of public assets).
 *
 * Dark shell: `LoadingPage` does not guess the theme. The embedder can pass
 * `variant="dark"` and we load `loading-dark.svg` (same artwork, dark
 * background, reverse rise direction); otherwise the light variant is used.
 */
export const LoadingPage = ({
  variant = 'light',
  label = 'Loading…',
}: {
  variant?: 'light' | 'dark'
  label?: string
} = {}) => {
  const [loaded, setLoaded] = useState(false)

  // The loader artwork lives in `src/public/`: `loading.svg` (light) and
  // `loading-dark.svg` (dark). There is no `loading-light.svg`.
  const src = variant === 'dark' ? '/loading-dark.svg' : '/loading.svg'

  useEffect(() => {
    if (!loaded) setLoaded(true)
  }, [loaded])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
      aria-label={label}
      aria-live="polite"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 px-6 text-center">
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="h-[70px] w-[70px] object-contain md:h-[100px] md:w-[100px]"
          onLoad={() => setLoaded(true)}
        />
        <span className="text-sm text-muted-foreground">{label}</span>
        {/* Skeleton shape matching the page shell so the transition from
            loader to content does not jump: title bar + two content lines. */}
        <div className="flex w-full flex-col gap-2" aria-hidden="true">
          <div className="skeleton h-3 w-3/4 self-center" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6 self-center" />
        </div>
      </div>
    </motion.div>
  )
}
