use std::path::Path;
use walkdir::WalkDir;

/// Supported image extensions
const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "tiff", "tif", "bmp"];

/// Represents a discovered image file on disk.
#[derive(Debug, Clone)]
pub struct ScannedFile {
    pub path: String,
    pub filename: String,
    pub extension: String,
    pub file_size_bytes: u64,
}

/// Scan a directory for supported image files.
/// If `recursive` is true, descends into subdirectories.
pub fn scan_folder(folder_path: &str, recursive: bool) -> Result<Vec<ScannedFile>, String> {
    let path = Path::new(folder_path);
    if !path.exists() {
        return Err(format!("Folder does not exist: {}", folder_path));
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", folder_path));
    }

    let walker = if recursive {
        WalkDir::new(path)
    } else {
        WalkDir::new(path).max_depth(1)
    };

    let mut results = Vec::new();

    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }

        let file_path = entry.path();
        let extension = file_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !SUPPORTED_EXTENSIONS.contains(&extension.as_str()) {
            continue;
        }

        let filename = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let metadata = std::fs::metadata(file_path).map_err(|e| e.to_string())?;

        results.push(ScannedFile {
            path: file_path.to_string_lossy().to_string(),
            filename,
            extension,
            file_size_bytes: metadata.len(),
        });
    }

    Ok(results)
}
