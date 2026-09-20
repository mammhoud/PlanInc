use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<PlanInc<R>> {
  Ok(PlanInc(app.clone()))
}

/// Access to the planinc APIs.
pub struct PlanInc<R: Runtime>(AppHandle<R>);

impl<R: Runtime> PlanInc<R> {
  pub fn setcolor(&self, payload: SetColorRequest) -> crate::Result<()> {
    Ok(())
  }

  pub fn open_app_settings(&self) -> crate::Result<()> {
    // On desktop, this is a no-op or could open system settings
    // Different platforms would need different implementations
    Ok(())
  }
}
