use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_data_dir: &PathBuf) -> Result<Self, String> {
        let db_dir = app_data_dir.join("db");
        std::fs::create_dir_all(&db_dir).map_err(|e| format!("Failed to create db dir: {}", e))?;

        let db_path = db_dir.join("app.sqlite");
        let conn =
            Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        let db = Database {
            conn: Mutex::new(conn),
        };

        db.run_migrations()?;

        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        super::migrations::run(&conn)
    }
}
