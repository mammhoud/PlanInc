use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: Option<String>,
    pub content: String,
    pub is_share: bool,
    pub created_by: Option<String>,
    pub tags: Vec<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Tag {
    pub id: Option<String>,
    pub name: String,
    pub note_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateNoteRequest {
    pub content: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateNoteRequest {
    pub id: String,
    pub content: Option<String>,
    pub is_share: Option<bool>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchNoteRequest {
    pub query: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListNotesRequest {
    pub filter: Option<String>,
    pub page: Option<u64>,
    pub size: Option<u64>,
}
