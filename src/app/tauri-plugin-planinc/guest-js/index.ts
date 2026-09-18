import { invoke } from '@tauri-apps/api/core'

export async function setStatusBarColor(hexColor: string): Promise<null> {
  await invoke<{value?: string}>('plugin:planinc|setcolor', {
    payload: {
      hex: hexColor,
    },
  })
  return null
}

export async function openAppSettings(): Promise<void> {
  await invoke('plugin:planinc|open_app_settings')
}