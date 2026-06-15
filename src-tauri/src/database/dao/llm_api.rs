//! LLM API profile DAO

use crate::database::{lock_conn, Database};
use crate::error::AppError;
use crate::llm_api::LlmApiProfile;
use indexmap::IndexMap;
use rusqlite::params;

impl Database {
    pub fn get_all_llm_api_profiles(&self) -> Result<IndexMap<String, LlmApiProfile>, AppError> {
        let conn = lock_conn!(self.conn);
        let mut stmt = conn
            .prepare(
                "SELECT id, name, vendor, base_url, api_key, notes, created_at, updated_at
                 FROM llm_api_profiles ORDER BY name ASC, id ASC",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(LlmApiProfile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    vendor: row.get(2)?,
                    base_url: row.get(3)?,
                    api_key: row.get(4)?,
                    notes: row.get(5)?,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|e| AppError::Database(e.to_string()))?;

        let mut map = IndexMap::new();
        for row in rows {
            let profile = row.map_err(|e| AppError::Database(e.to_string()))?;
            map.insert(profile.id.clone(), profile);
        }
        Ok(map)
    }

    pub fn get_llm_api_profile(&self, id: &str) -> Result<Option<LlmApiProfile>, AppError> {
        let conn = lock_conn!(self.conn);
        let mut stmt = conn
            .prepare(
                "SELECT id, name, vendor, base_url, api_key, notes, created_at, updated_at
                 FROM llm_api_profiles WHERE id = ?1",
            )
            .map_err(|e| AppError::Database(e.to_string()))?;

        let result = stmt.query_row([id], |row| {
            Ok(LlmApiProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                vendor: row.get(2)?,
                base_url: row.get(3)?,
                api_key: row.get(4)?,
                notes: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        });

        match result {
            Ok(profile) => Ok(Some(profile)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(AppError::Database(e.to_string())),
        }
    }

    pub fn get_llm_api_profiles_by_ids(
        &self,
        ids: &[String],
    ) -> Result<Vec<LlmApiProfile>, AppError> {
        let mut profiles = Vec::new();
        for id in ids {
            if let Some(profile) = self.get_llm_api_profile(id)? {
                profiles.push(profile);
            }
        }
        Ok(profiles)
    }

    pub fn save_llm_api_profile(&self, profile: &LlmApiProfile) -> Result<(), AppError> {
        let conn = lock_conn!(self.conn);
        conn.execute(
            "INSERT OR REPLACE INTO llm_api_profiles
             (id, name, vendor, base_url, api_key, notes, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                profile.id,
                profile.name,
                profile.vendor,
                profile.base_url,
                profile.api_key,
                profile.notes,
                profile.created_at,
                profile.updated_at,
            ],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(())
    }

    pub fn delete_llm_api_profile(&self, id: &str) -> Result<bool, AppError> {
        let conn = lock_conn!(self.conn);
        let affected = conn
            .execute("DELETE FROM llm_api_profiles WHERE id = ?1", params![id])
            .map_err(|e| AppError::Database(e.to_string()))?;
        Ok(affected > 0)
    }
}
