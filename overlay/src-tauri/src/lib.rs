// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{Manager, PhysicalPosition};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let monitor_size = monitor.size();
                    let monitor_pos = monitor.position();
                    let window_size = window.outer_size().unwrap_or_default();
                    
                    let x = monitor_pos.x + monitor_size.width as i32 - window_size.width as i32;
                    let y = monitor_pos.y;
                    
                    let _ = window.set_position(PhysicalPosition { x, y });
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

