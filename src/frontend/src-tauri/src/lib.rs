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
        .plugin(tauri_plugin_opener::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
                println!("Second instance detected with args: {:?} and cwd: {:?}", args, cwd);
                if let Some(window) = app.get_webview_window("main") {
                    if let Err(e) = window.show() {
                        eprintln!("Failed to show window: {}", e);
                    }
                    if let Err(e) = window.unminimize() {
                        eprintln!("Failed to unminimize window: {}", e);
                    }
                    if let Err(e) = window.set_focus() {
                        eprintln!("Failed to focus window: {}", e);
                    }
                    println!("Focused existing PlanInc window");
                }
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
                query_hyperlinks,
                get_selected_text,
                open_app_settings,
                setcolor,
                notes::create_note,
                notes::list_notes,
                notes::update_note,
                notes::delete_note,
                notes::search_notes,
                notes::list_tags,
                notes::ping_db,
            ])
            .setup(|app, api| {
                #[cfg(desktop)]
                {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    let db = rt.block_on(db::init_db(app));
                    match db {
                        Ok(d) => { app.manage(d); }
                        Err(e) => { eprintln!("Failed to initialize database: {}", e); }
                    }
                }
                #[cfg(mobile)]
                {
                    let planinc = mobile::init(app, api)?;
                    app.manage(planinc);
                }
                Ok(())
            });
    }

    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder
            .invoke_handler(tauri::generate_handler![])
            .setup(|app, api| {
                let planinc = mobile::init(app, api)?;
                app.manage(planinc);
                Ok(())
            });
    }

    builder.build()
}
