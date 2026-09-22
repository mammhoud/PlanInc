/**
 * Platform model for the single frontend (PI-014).
 *
 * One source serves every target this product ships to:
 *
 *   web browser · installed PWA · Tauri desktop (Windows/macOS/Linux) ·
 *   Tauri mobile (Android/iOS)
 *
 * Those targets differ in *capabilities*, not in screens: a phone in a browser
 * and a phone in the Android app want the same layout but can do different
 * things (share sheet, safe-area insets, native back button, offline shell).
 * So the app asks this module what the current environment can do and adapts —
 * rather than branching on `isMobile` in every component.
 */

/** Where the frontend is running. */
export type PlatformKind =
  | 'web' // browser tab
  | 'pwa' // installed / standalone web app
  | 'desktop' // Tauri on Windows, macOS or Linux
  | 'android' // Tauri on Android
  | 'ios'; // Tauri on iOS

/** Operating system, including web-only hosts. */
export type OsKind = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

/** Layout class derived from the viewport, not from the device. */
export type FormFactor = 'phone' | 'tablet' | 'desktop';

/** Things a target may or may not be able to do. */
export type Capabilities = {
  /** Native window chrome is ours to draw (desktop only). */
  windowControls: boolean;
  /** System tray / background operation. */
  systemTray: boolean;
  /** OS share sheet available. */
  nativeShare: boolean;
  /** Hardware back button / swipe (Android, iOS). */
  nativeBack: boolean;
  /** Viewport can be covered by a notch or a home indicator. */
  safeAreaInsets: boolean;
  /** Service worker + offline shell available. */
  serviceWorker: boolean;
  /** Offline-first local database is the primary store. */
  localDatabase: boolean;
  /** Filesystem pickers outside the browser sandbox. */
  nativeFileSystem: boolean;
  /** Global (system-wide) keyboard shortcuts. */
  globalShortcuts: boolean;
  /** The OS can be asked to change the app's own theme. */
  nativeTheme: boolean;
};

export type PlatformInfo = {
  platform: PlatformKind;
  os: OsKind;
  formFactor: FormFactor;
  /** True when running inside a Tauri webview (desktop or mobile). */
  isNativeShell: boolean;
  capabilities: Capabilities;
};

/** Everything detection is allowed to look at. Injectable so it can be tested. */
export type PlatformEnv = {
  /** `navigator.userAgent`. */
  userAgent: string;
  /** `navigator.maxTouchPoints` — distinguishes tablets from small laptops. */
  maxTouchPoints?: number;
  /** Viewport width in CSS pixels. */
  viewportWidth: number;
  /** iOS Safari "Add to Home Screen" flag. */
  standalone?: boolean;
  /** `display-mode: standalone` media query result. */
  displayModeStandalone?: boolean;
  /** Tauri's OS plugin result, when running natively. */
  tauriOs?: string;
  /** True when a Tauri global is present. */
  hasTauri?: boolean;
  /** `navigator.serviceWorker` availability. */
  hasServiceWorker?: boolean;
};
