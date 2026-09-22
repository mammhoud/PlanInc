use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::PlanInc;
#[cfg(mobile)]
use mobile::PlanInc;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the planinc APIs.
pub trait PlanIncExt<R: Runtime> {
  fn planinc(&self) -> &PlanInc<R>;
}

impl<R: Runtime, T: Manager<R>> crate::PlanIncExt<R> for T {
  fn planinc(&self) -> &PlanInc<R> {
    self.state::<PlanInc<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("planinc")
    .invoke_handler(tauri::generate_handler![
      commands::setcolor,
      commands::open_app_settings
    ])
    .setup(|app, api| {
      #[cfg(mobile)]
      let planinc = mobile::init(app, api)?;
      #[cfg(desktop)]
      let planinc = desktop::init(app, api)?;
      app.manage(planinc);
      Ok(())
    })
    .build()
}
