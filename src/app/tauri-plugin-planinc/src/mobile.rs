use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_planinc);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<PlanInc<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.plugin.planinc", "PlanIncPlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_planinc)?;
  Ok(PlanInc(handle))
}

/// Access to the planinc APIs.
pub struct PlanInc<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> PlanInc<R> {
  pub fn setcolor(&self, payload: SetColorRequest) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin("setcolor", payload)
      .map_err(Into::into)
  }

  pub fn open_app_settings(&self) -> crate::Result<()> {
    self
      .0
      .run_mobile_plugin("openAppSettings", ())
      .map_err(Into::into)
  }
}
