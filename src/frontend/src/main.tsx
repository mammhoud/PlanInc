import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { PlatformProvider } from "./platform/PlatformProvider";
import { detectPlatform, readPlatformEnv } from "./platform/detect";
import { registerOfflineShell, requestPersistentStorage } from "./platform/pwa";

/**
 * Single entry point for every target (PI-014): web browser, installed PWA,
 * Tauri desktop (Windows/macOS/Linux) and Tauri mobile (Android/iOS).
 *
 * `PlatformProvider` resolves the environment once and mirrors it onto <html>
 * as `data-platform` / `data-os` / `data-form-factor` / `data-tier` /
 * `data-pointer` / `data-native-shell`; `styles/platform.css` styles off those
 * attributes. Everything below runs before the first paint.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <PlatformProvider>
    <App />
  </PlatformProvider>
);

/**
 * Offline shell — a web/PWA capability only.
 *
 * The Tauri shells ship their own assets and their own updater, so registering
 * a service worker there would risk serving a stale bundle after an update.
 * `registerOfflineShell` enforces that from the capability table; the
 * `__TAURI__` probe is passed in here so it is applied from the very first boot
 * rather than waiting for the provider's async OS lookup.
 */
const hasTauri = typeof window !== "undefined" && "__TAURI__" in window;
const bootPlatform = detectPlatform(readPlatformEnv(undefined, hasTauri));

if (import.meta.env.PROD) {
  void registerOfflineShell(bootPlatform);
  if (bootPlatform.capabilities.localDatabase) {
    void requestPersistentStorage();
  }
}
