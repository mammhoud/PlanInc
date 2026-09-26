import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

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
  minDisplayTime = 500,
}: {
  variant?: 'light' | 'dark'
  minDisplayTime?: number
} = {}) => {
  const [show, setShow] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const startTime = Date.now()

    return () => {
      const elapsedTime = Date.now() - startTime
      if (elapsedTime < minDisplayTime) {
        const remainingTime = minDisplayTime - elapsedTime
        setTimeout(() => setShow(false), remainingTime)
      } else {
        setShow(false)
      }
    }
  }, [minDisplayTime])

  // Small duration gate so a fast-first-paint still satisfies the 500ms
  // legibility floor the old GIF had (framer-motion's `exit` would otherwise
  // kill the loader before the first frame lands).
  useEffect(() => {
    if (!loaded) setLoaded(true)
  }, [loaded])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col items-center gap-3">
            <img
              src={`/loading-${variant}.svg`}
              alt=""
              className="w-[70px] h-[70px] md:w-[100px] md:h-[100px] object-contain"
              onLoad={() => setLoaded(true)}
            />
            <span className="text-sm text-foreground/70">Loading…</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
