use tauri::{AppHandle, command, Runtime};
use crate::models::*;
use crate::db::Db;
use crate::error::{Error, Result};

#[command]
pub(crate) async fn create_note<R: Runtime>(
    app: AppHandle<R>,
    payload: CreateNoteRequest,
) -> Result<Note> {
    let db = app.state::<Db>();
    let note = db.0.create("notes").content(serde_json::to_value(&payload)?).await?;
    Ok(serde_json::from_value(note)?)
}

#[command]
pub(crate) async fn list_notes<R: Runtime>(
    app: AppHandle<R>,
    payload: ListNotesRequest,
) -> Result<Vec<Note>> {
    let db = app.state::<Db>();
    let page = payload.page.unwrap_or(1);
    let size = payload.size.unwrap_or(20);
    let notes = db.0.select("notes").limit(size).offset((page - 1) * size).await?;
    Ok(serde_json::from_value(notes)?)
}

#[command]
pub(crate) async fn update_note<R: Runtime>(
    app: AppHandle<R>,
    payload: UpdateNoteRequest,
) -> Result<Note> {
    let db = app.state::<Db>();
    let mut data = serde_json::Map::new();
    if let Some(content) = &payload.content {
        data.insert("content", serde_json::to_value(content)?);
    }
    if let Some(is_share) = payload.is_share {
        data.insert("is_share", serde_json::to_value(is_share)?);
    }
    if let Some(tags) = &payload.tags {
        data.insert("tags", serde_json::to_value(tags)?);
    }
    let note = db.0.update(format!("notes:{}", payload.id)).merge(data).await?;
    Ok(serde_json::from_value(note)?)
}

#[command]
pub(crate) async fn delete_note<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<bool> {
    let db = app.state::<Db>();
    db.0.delete(format!("notes:{}", id)).await?;
    Ok(true)
}

#[command]
pub(crate) async fn search_notes<R: Runtime>(
    app: AppHandle<R>,
    payload: SearchNoteRequest,
) -> Result<Vec<Note>> {
    let db = app.state::<Db>();
    let notes = db.0.query("SELECT * FROM notes WHERE content @@ $query", vec![("query", payload.query)].into_iter().collect()).await?;
    Ok(serde_json::from_value(notes)?)
}

#[command]
pub(crate) async fn list_tags<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<Tag>> {
    let db = app.state::<Db>();
    let tags = db.0.select("tag").await?;
    Ok(serde_json::from_value(tags)?)
}

#[command]
pub(crate) async fn ping_db<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    let db = app.state::<Db>();
    db.0.query("RETURN 1").await?;
    Ok(())
}
