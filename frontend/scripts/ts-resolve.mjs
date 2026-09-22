/**
 * ts-resolve.mjs — Node resolution hook for the offline checkers (PI-014).
 *
 * Node ≥ 22.6 strips TypeScript types natively, so the checkers import the real
 * `src/**` modules instead of a copy (see `check-platform.mjs`,
 * `check-settings-registry.mjs`). But Node ESM requires a file extension on a
 * relative specifier, while the app's sources are written for a bundler:
 *
 *     import { RESPONSIVE_TIERS } from './responsive'   ← valid for Vite/bun
 *
 * This hook appends the extension that the bundler would have resolved. It is
 * the only reason the checkers can run against the shipping source; nothing in
 * `src/` is aware of it.
 *
 * Registered by the checker, never a global side effect:
 *     import { register } from 'node:module';
 *     register('./ts-resolve.mjs', import.meta.url);
 */
const RESOLVED_EXT = /\.(?:ts|tsx|mts|cts|js|mjs|cjs|json|css)$/;

/** Extensions a bundler would try, in the order it tries them. */
const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !RESOLVED_EXT.test(specifier)) {
    for (const ext of CANDIDATES) {
      try {
        return await next(specifier + ext, context);
      } catch {
        // Try the next candidate; a miss here is expected, not an error.
      }
    }
  }
  return next(specifier, context);
}
