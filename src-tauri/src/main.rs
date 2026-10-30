// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  #[cfg(target_os = "linux")]
  {
    // Prevent WebKitWebProcess crashes on Linux Mesa/Wayland/Intel/AMD drivers
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
      // SAFETY: Called single-threaded at process startup before any background threads are spawned
      unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
      }
    }

    // Ensure GStreamer discovers all host plugins (appsink, autoaudiosink, codecs) in AppImage & native
    let host_gst_paths = "/usr/lib/x86_64-linux-gnu/gstreamer-1.0:/usr/lib/gstreamer-1.0:/usr/lib64/gstreamer-1.0";

    let current_sys_path = std::env::var("GST_PLUGIN_SYSTEM_PATH_1_0").unwrap_or_default();
    let new_sys_path = if current_sys_path.is_empty() {
      host_gst_paths.to_string()
    } else {
      format!("{}:{}", current_sys_path, host_gst_paths)
    };
    unsafe {
      std::env::set_var("GST_PLUGIN_SYSTEM_PATH_1_0", new_sys_path);
    }

    let current_plugin_path = std::env::var("GST_PLUGIN_PATH_1_0").unwrap_or_default();
    let new_plugin_path = if current_plugin_path.is_empty() {
      host_gst_paths.to_string()
    } else {
      format!("{}:{}", current_plugin_path, host_gst_paths)
    };
    unsafe {
      std::env::set_var("GST_PLUGIN_PATH_1_0", new_plugin_path);
    }
  }

  app_lib::run();
}
