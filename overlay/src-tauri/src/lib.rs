use tauri::{Manager, PhysicalPosition};

#[cfg(target_os = "windows")]
fn set_capture_excluded(window: &tauri::WebviewWindow) {
    use raw_window_handle::HasWindowHandle;
    use raw_window_handle::RawWindowHandle;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE,
    };

    match window.window_handle() {
        Ok(handle) => match handle.as_raw() {
            RawWindowHandle::Win32(win32) => {
                let hwnd = HWND(win32.hwnd.get() as *mut core::ffi::c_void);
                unsafe {
                    match SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE) {
                        Ok(_) => {
                            println!(
                                "[freely] capture exclusion set on '{}'",
                                window.label()
                            )
                        }
                        Err(e) => {
                            eprintln!(
                                "[freely] SetWindowDisplayAffinity failed on '{}': {e}",
                                window.label()
                            )
                        }
                    }
                }
            }
            _ => eprintln!(
                "[freely] unexpected window handle type on '{}'",
                window.label()
            ),
        },
        Err(e) => eprintln!(
            "[freely] could not get window handle on '{}': {e}",
            window.label()
        ),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(main_window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = main_window.current_monitor() {
                    let monitor_size = monitor.size();
                    let monitor_pos = monitor.position();
                    let window_size = main_window.outer_size().unwrap_or_default();

                    let x = monitor_pos.x + monitor_size.width as i32
                        - window_size.width as i32;
                    let y = monitor_pos.y;

                    let _ = main_window.set_position(PhysicalPosition { x, y });
                }

                #[cfg(target_os = "windows")]
                set_capture_excluded(&main_window);
            }

            #[cfg(target_os = "windows")]
            if let Some(panel) = app.get_webview_window("panel") {
                set_capture_excluded(&panel);
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

