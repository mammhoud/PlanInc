use std::path::PathBuf;
use surrealdb::{Surreal, engine::local::SurrealKv};
use tauri::Manager;

pub struct Db(pub Surreal<SurrealKv>);

pub async fn init_db(app: &tauri::App) -> surrealdb::Result<Surreal<SurrealKv>> {
    let data_dir = app.path().app_data_dir()?.join("planinc.db");
    let db = Surreal::new::<SurrealKv>(data_dir).await?;
    db.use_ns("planinc").use_db("planinc").await?;
    Ok(db)
}
