use std::process::{Command, Stdio};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Start the Python backend
            tauri::async_runtime::spawn(async move {
                start_python_backend(&app_handle).await;
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn start_python_backend(app_handle: &tauri::AppHandle) {
    // In development, use the backend directory relative to the project root
    let backend_dir = if cfg!(debug_assertions) {
        // Development mode: use the actual backend directory
        std::env::current_dir()
            .expect("failed to get current directory")
            .parent()
            .expect("failed to get parent directory")
            .join("backend")
    } else {
        // Production mode: use bundled resources
        let resource_dir = app_handle
            .path()
            .resource_dir()
            .expect("failed to resolve resource directory");
        resource_dir.join("backend")
    };
    
    println!("Starting Python backend from: {:?}", backend_dir);
    
    // Wait a moment for the frontend to start
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    
    // Try to start the backend with uv first, then fallback to python
    let mut success = false;
    
    // Try with uv
    if let Ok(mut child) = Command::new("uv")
        .current_dir(&backend_dir)
        .arg("run")
        .arg("python")
        .arg("-m")
        .arg("websocket_server")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        println!("Started backend with uv");
        success = true;
        
        // Monitor the process
        tokio::task::spawn_blocking(move || {
            let _ = child.wait();
        });
    } else {
        // Fallback to direct python execution
        match Command::new("python")
            .current_dir(&backend_dir)
            .arg("-m")
            .arg("websocket_server")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(mut child) => {
                println!("Started backend with Python directly");
                success = true;
                
                // Monitor the process
                tokio::task::spawn_blocking(move || {
                    let _ = child.wait();
                });
            }
            Err(e) => {
                eprintln!("Failed to start Python backend: {}", e);
            }
        }
    }
    
    if !success {
        eprintln!("Could not start Python backend with any method");
    }
}
