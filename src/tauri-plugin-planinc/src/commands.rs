use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::PlanIncExt;

#[command]
pub(crate) async fn setcolor<R: Runtime>(
    app: AppHandle<R>,
    payload: SetColorRequest,
) -> Result<()> {
    app.planinc().setcolor(payload)
}

#[command]
pub(crate) async fn open_app_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<()> {
    app.planinc().open_app_settings()
}
