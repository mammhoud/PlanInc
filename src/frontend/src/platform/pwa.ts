/**
 * PWA wiring (PI-014).
 *
 * The offline shell is a **web/PWA** capability. Inside a Tauri shell the assets
 * are already local and a service worker would only fight the updater, so
 * registration is skipped — the native shells must never end up serving a stale
 * cached bundle. `vite-plugin-pwa` generates the manifest and worker; this module
 * decides whether to use them.
 */
import type { PlatformInfo } from './types';

/** Register the service worker when (and only when) the environment can use it. */
export function registerOfflineShell(info: PlatformInfo): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  // Native shells ship their own assets and their own updater.
  if (info.isNativeShell) return Promise.resolve(null);
  if (!info.capabilities.serviceWorker) return Promise.resolve(null);

  return navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((registration) => registration)
    .catch((error) => {
      // Offline support is an enhancement: never let it break a boot.
      console.warn('[pwa] offline shell registration failed', error);
      return null;
    });
}

/**
 * Ask the browser to persist local-first storage.
 *
 * Best-effort: a refusal just means the data can be evicted under storage
 * pressure, which the app already tolerates.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
