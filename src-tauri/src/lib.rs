use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

pub struct BackendProcess(pub Mutex<Option<Child>>);

impl Drop for BackendProcess {
  fn drop(&mut self) {
    if let Ok(mut lock) = self.0.lock() {
      if let Some(mut child) = lock.take() {
        println!("[Vostok Native] Deteniendo backend multimedia (PID {})...", child.id());
        let _ = child.kill();
      }
    }
  }
}

fn is_backend_alive() -> bool {
  TcpStream::connect("127.0.0.1:45173").is_ok()
}

fn find_node_binary() -> Option<PathBuf> {
  // 1. Ubicaciones estándar del sistema
  let system_paths = [
    "/usr/local/bin/node",
    "/usr/bin/node",
    "/bin/node",
    "/snap/bin/node",
  ];
  for p in &system_paths {
    let pb = PathBuf::from(p);
    if pb.exists() {
      return Some(pb);
    }
  }

  // 2. Ubicaciones del usuario (NVM, FNM, Volta, .local)
  if let Ok(home) = std::env::var("HOME") {
    let home_path = Path::new(&home);

    // Escanear versiones de NVM: ~/.nvm/versions/node/*/bin/node
    let nvm_versions_dir = home_path.join(".nvm").join("versions").join("node");
    if let Ok(entries) = std::fs::read_dir(&nvm_versions_dir) {
      let mut versions: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path().join("bin").join("node"))
        .filter(|p| p.exists())
        .collect();
      versions.sort();
      if let Some(latest) = versions.pop() {
        return Some(latest);
      }
    }

    let user_candidates = [
      home_path.join(".local/bin/node"),
      home_path.join(".volta/bin/node"),
      home_path.join(".fnm/current/bin/node"),
      home_path.join(".asdf/shims/node"),
    ];
    for p in &user_candidates {
      if p.exists() {
        return Some(p.clone());
      }
    }
  }

  // 3. Fallback: "which node"
  if let Ok(output) = Command::new("which").arg("node").output() {
    if output.status.success() {
      let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
      if !p.is_empty() {
        let pb = PathBuf::from(p);
        if pb.exists() {
          return Some(pb);
        }
      }
    }
  }

  None
}

fn find_server_script(app: &tauri::App) -> Option<PathBuf> {
  // 1. Check Tauri resource directory
  if let Ok(resource_dir) = app.path().resource_dir() {
    let direct = [
      resource_dir.join("_up_").join("dist-server").join("index.mjs"),
      resource_dir.join("dist-server").join("index.mjs"),
      resource_dir.join("index.mjs"),
    ];
    for p in &direct {
      if p.exists() {
        return Some(p.clone());
      }
    }
  }

  // 2. Check directory of the running executable
  if let Ok(exe) = std::env::current_exe() {
    if let Some(parent) = exe.parent() {
      let direct = [
        parent.join("_up_").join("dist-server").join("index.mjs"),
        parent.join("dist-server").join("index.mjs"),
        parent.join("index.mjs"),
        parent.join("resources").join("_up_").join("dist-server").join("index.mjs"),
        parent.join("resources").join("dist-server").join("index.mjs"),
        parent.join("../lib/Vostok Editor/_up_/dist-server/index.mjs"),
        parent.join("../lib/vostok-editor/_up_/dist-server/index.mjs"),
      ];
      for p in &direct {
        if p.exists() {
          return Some(p.clone());
        }
      }
    }
  }

  // 3. Check current working directory and parent (development mode)
  if let Ok(cwd) = std::env::current_dir() {
    let direct = [
      cwd.join("dist-server").join("index.mjs"),
      cwd.join("..").join("dist-server").join("index.mjs"),
    ];
    for p in &direct {
      if p.exists() {
        return Some(p.clone());
      }
    }
  }

  None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Iniciar el servidor backend multimedia de Node si no está activo
      if !is_backend_alive() {
        if let Some(script_path) = find_server_script(app) {
          if let Some(node_bin) = find_node_binary() {
            println!("[Vostok Native] Binario Node localizado en {:?}", node_bin);

            let node_dir = node_bin.parent().unwrap_or(Path::new(""));
            let current_path = std::env::var("PATH").unwrap_or_default();
            let full_path = format!("{}:/usr/local/bin:/usr/bin:/bin:{}", node_dir.display(), current_path);

            let spawn_res = Command::new(&node_bin)
              .arg(&script_path)
              .env("VOSTOK_BACKEND_PORT", "45173")
              .env("PATH", full_path)
              .stdin(Stdio::piped())
              .spawn();

            match spawn_res {
              Ok(child) => {
                println!("[Vostok Native] Backend autónomo iniciado con PID {}", child.id());

                // Esperar a que el backend esté listo para responder peticiones (hasta 2s)
                for _ in 0..40 {
                  if is_backend_alive() {
                    println!("[Vostok Native] Backend confirmado y listo en http://127.0.0.1:45173");
                    break;
                  }
                  std::thread::sleep(std::time::Duration::from_millis(50));
                }

                app.manage(BackendProcess(Mutex::new(Some(child))));
              }
              Err(err) => {
                eprintln!("[Vostok Native Error] No se pudo lanzar el backend autónomo: {}", err);
                app.manage(BackendProcess(Mutex::new(None)));
              }
            }
          } else {
            eprintln!("[Vostok Native Error] No se encontró el binario 'node' en las rutas estándar ni en NVM.");
            app.manage(BackendProcess(Mutex::new(None)));
          }
        } else {
          eprintln!("[Vostok Native Warning] No se encontró dist-server/index.mjs");
          app.manage(BackendProcess(Mutex::new(None)));
        }
      } else {
        println!("[Vostok Native] El backend ya está activo en el puerto 45173.");
        app.manage(BackendProcess(Mutex::new(None)));
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::Destroyed = event {
        if let Some(backend) = window.try_state::<BackendProcess>() {
          if let Ok(mut lock) = backend.0.lock() {
            if let Some(mut child) = lock.take() {
              println!("[Vostok Native] Ventana cerrada, finalizando backend (PID {})...", child.id());
              let _ = child.kill();
            }
          }
        }
      }
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
