use tauri::{command, AppHandle, Manager, Runtime};
use crate::models::*;
use crate::db::Db;
use crate::error::Result;

#[command]
pub(crate) async fn create_note<R: Runtime>(
    app: AppHandle<R>,
    payload: CreateNoteRequest,
) -> Result<Note> {
    let db = app.state::<Db>();
    let note: Option<Note> = db.0.create("notes").content(serde_json::to_value(payload)?).await?;
    note.ok_or_else(|| crate::Error::Internal("created note was not returned".to_string()))
}

#[command]
pub(crate) async fn list_notes<R: Runtime>(
    app: AppHandle<R>,
    payload: ListNotesRequest,
) -> Result<Vec<Note>> {
    let db = app.state::<Db>();
    let page = payload.page.unwrap_or(1);
    let size = payload.size.unwrap_or(20);
    let _: (u64, u64) = (page, size);
    let notes: Vec<Note> = db.0.select("notes").await?;
    Ok(notes)
}

#[command]
pub(crate) async fn update_note<R: Runtime>(
    app: AppHandle<R>,
    payload: UpdateNoteRequest,
) -> Result<Note> {
    let db = app.state::<Db>();
    let mut data = serde_json::Map::new();
    if let Some(content) = &payload.content {
        data.insert("content".to_string(), serde_json::to_value(content)?);
    }
    if let Some(is_share) = payload.is_share {
        data.insert("is_share".to_string(), serde_json::to_value(is_share)?);
    }
    if let Some(tags) = &payload.tags {
        data.insert("tags".to_string(), serde_json::to_value(tags)?);
    }
    let note: Vec<Note> = db.0.update(format!("notes:{}", payload.id)).merge(data).await?;
    note.into_iter()
        .next()
        .ok_or_else(|| crate::Error::NotFound(payload.id))
}

#[command]
pub(crate) async fn delete_note<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<bool> {
    let db = app.state::<Db>();
    let _: Vec<Note> = db.0.delete(format!("notes:{}", id)).await?;
    Ok(true)
}

#[command]
pub(crate) async fn search_notes<R: Runtime>(
    app: AppHandle<R>,
    payload: SearchNoteRequest,
) -> Result<Vec<Note>> {
    let db = app.state::<Db>();
    let mut response = db
        .0
        .query("SELECT * FROM notes WHERE content @@ $query")
        .bind(("query", payload.query))
        .await?;
    Ok(response.take(0)?)
}

#[command]
pub(crate) async fn list_tags<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<Tag>> {
    let db = app.state::<Db>();
    Ok(db.0.select("tag").await?)
}

#[command]
pub(crate) async fn ping_db<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    let db = app.state::<Db>();
    db.0.query("RETURN 1").await?;
    Ok(())
}
