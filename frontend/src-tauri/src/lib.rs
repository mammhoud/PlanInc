#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use desktop::*;
mod commands;
mod db;
mod models;
mod error;

pub use models::*;
pub use error::{Error, Result};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_upload::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_planinc::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ));

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
                println!("Second instance detected with args: {:?} and cwd: {:?}", args, cwd);
                let _ = toggle_editor_window(app.clone());
            }))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(create_global_shortcut_handler())
                    .build()
            )
            .invoke_handler(tauri::generate_handler![
                toggle_editor_window,
                register_hotkey,
                unregister_hotkey,
                commands::notes::create_note,
                commands::notes::list_notes,
                commands::notes::update_note,
                commands::notes::delete_note,
                commands::notes::search_notes,
                commands::notes::list_tags,
                commands::notes::ping_db,
            ])
            .setup(|app| {
                setup_app(app)?;
                #[cfg(desktop)]
                {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    let db = rt.block_on(db::init_db(app));
                    match db {
                        Ok(d) => { tauri::Manager::manage(app, d); }
                        Err(e) => { eprintln!("Failed to initialize database: {}", e); }
                    }
                }
                Ok(())
            });
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder
            .invoke_handler(tauri::generate_handler![])
            .setup(|_app| {
                Ok(())
            });
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while running PlanInc application")
        .run(|_app, _event| {});
}
