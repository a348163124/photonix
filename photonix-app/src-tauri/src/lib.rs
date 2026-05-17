mod commands;
mod image_core;
mod storage;

use storage::database::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");

            let db = Database::new(&app_data_dir).expect("Failed to initialize database");
            app.manage(db);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::get_app_data_dir,
            commands::import_folder,
            commands::get_all_images,
            commands::get_images_by_folder,
            commands::get_all_folders,
            commands::generate_thumbnail,
            commands::generate_proxy,
            commands::get_versions,
            commands::save_setting,
            commands::load_setting,
            commands::export_image,
            commands::edit::submit_edit,
            commands::edit::save_mask_to_disk,
            commands::prompt::compile_prompt,
            commands::secrets::save_api_key,
            commands::secrets::load_api_key,
            commands::secrets::has_api_key,
            commands::validate_provider,
            commands::generate::generate_image,
            commands::generate::list_generated_images,
            commands::generate::delete_generated_image,
            commands::library::record_prompt_history,
            commands::library::list_prompt_history,
            commands::library::delete_prompt_history,
            commands::library::upsert_custom_preset,
            commands::library::list_custom_presets,
            commands::library::delete_custom_preset,
            commands::styles::upsert_style_profile,
            commands::styles::list_style_profiles,
            commands::styles::delete_style_profile,
            commands::styles::set_default_style_profile,
            commands::reference_style::analyze_reference_style,
            commands::candidates::record_candidate,
            commands::candidates::list_candidates_for_image,
            commands::candidates::set_candidate_favorite,
            commands::candidates::delete_candidate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
