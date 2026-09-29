use surrealdb::{engine::local::{Db as SurrealDb, SurrealKv}, Surreal};
use tauri::Manager;

pub struct Db(pub Surreal<SurrealDb>);

pub async fn init_db(app: &tauri::App) -> crate::Result<Surreal<SurrealDb>> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| crate::Error::Internal(error.to_string()))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|error| crate::Error::Internal(error.to_string()))?;
    let db = Surreal::<SurrealDb>::new::<SurrealKv>(data_dir.join("planinc.db")).await?;
    db.use_ns("planinc").use_db("planinc").await?;
    Ok(db)
}
