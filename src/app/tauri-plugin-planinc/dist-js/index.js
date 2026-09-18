import { invoke } from '@tauri-apps/api/core';

async function setStatusBarColor(hexColor) {
    await invoke('plugin:planinc|setcolor', {
        payload: {
            hex: hexColor,
        },
    });
    return null;
}
async function openAppSettings() {
    await invoke('plugin:planinc|open_app_settings');
}

export { openAppSettings, setStatusBarColor };
