# VOSTOK EDITOR — Editor de Video Profesional para Linux

<p align="center">
  <strong>Editor de video tradicional, rápido, ligero y sin relleno innecesario, diseñado específicamente para Linux.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Plataforma-Linux%20x86__64-orange?style=flat-square" alt="Linux" />
  <img src="https://img.shields.io/badge/Escritorio-Tauri%202.0-24c8db?style=flat-square" alt="Tauri" />
  <img src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript-blue?style=flat-square" alt="React" />
  <img src="https://img.shields.io/badge/Estilos-TailwindCSS%203-38bdf8?style=flat-square" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/Motor_Multimedia-FFmpeg%20%2B%20Canvas%202D-green?style=flat-square" alt="FFmpeg" />
  <img src="https://img.shields.io/badge/Estado-Zustand-purple?style=flat-square" alt="Zustand" />
  <img src="https://img.shields.io/badge/Licencia-Privada-red?style=flat-square" alt="Licencia" />
</p>

---

## 🌟 Características Principales

### 1. Interfaz Minimalista y Moderna
* **Paleta Oscura Carbón y Cian:** Fondo neutro `#141517` con acentos cian `#00d4e5` de alto contraste, minimizando la fatiga visual.
* **Tipografía UI Nativa:** Integración de **`TikTok Sans Variable`** para máxima legibilidad moderna.
* **Diseño Dinámico sin Pistas Vacías:** Los proyectos nuevos inician limpios. Las pistas se crean automáticamente según el tipo de archivo y se autolimpian si quedan vacías.
* **Lanzador Panorámico Glassmorphic:** Vista de inicio en pantalla completa (`100vh`) con accesos directos a relaciones de aspecto (`16:9`, `9:16`, `1:1`) y carrusel horizontal con *fade-out* suave.

### 2. Motor de Composición Visual Único (`<canvas>`)
* **Lienzo Full HD (1920 × 1080):** El elemento `<canvas>` HTML5 actúa como compositor visual unificado tanto para la previsualización interactiva como para la exportación final.
* **Gizmo de Manipulación Directa:** Mover con guías magnéticas de centrado, escalado proporcional desde las esquinas y rotación continua (`↻`).
* **Preservación Matemática de Relación de Aspecto:** Sensor `ResizeObserver` dinámico que previene cualquier distorsión o aplastamiento de imagen al redimensionar paneles.

### 3. Asignación Inteligente de Pistas sin Colisiones (*Collision-Free*)
* **Cero solapamientos involuntarios:** Si el cabezal de reproducción está sobre un clip y agregas otro medio o texto, el editor detecta la colisión temporal y busca una pista libre o **crea automáticamente una nueva pista en la jerarquía correspondiente**:
  * **Texto:** Se apila **hacia arriba** (sobreposición visual en lienzo).
  * **Video / Imagen:** Se apila **hacia arriba** (capas de superposición, Picture-in-Picture / PiP).
  * **Audio:** Se apila **hacia abajo** (mezcla simultánea de pistas de locución, música y efectos sonoros).
* **Pista Principal Magnética (`Magnet`):** Mantiene los clips de la pista base unidos borde a borde sin huecos, preservando la sincronización de audio vinculado.

### 4. Tipografía Variable y Escala Normalizada de Video (5 a 32)
* **Opciones Directas:**
  * **"Título":** Inserta un encabezado centrado con tamaño `16` (peso `800`, TikTok Sans).
  * **"Texto de cuerpo":** Inserta un bloque secundario desplazado verticalmente con tamaño `8` (peso `400`, TikTok Sans).
* **Escala Normalizada (5 a 32):** Valores numéricos intuitivos (`[5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32]`) que se renderizan en el Canvas Full HD mediante un factor multiplicador `9.5×` (~152px para títulos, ~76px para subtítulos).
* **Catálogo 100% Variable:** Fuentes seleccionadas (`TikTok Sans Variable`, `Montserrat`, `Inter`, `Poppins`, `Roboto`, `Oswald`, `Playfair Display`, `Space Grotesk`, `Fira Code`, `Cinzel`) con control continuo de grosor (100–900), espaciado (*kerning* en números enteros con blindaje `whitespace-nowrap`) e interlineado.
* **Portales Flotantes con Previsualización al Vuelo:** Menús de fuentes y tamaños montados en `document.body` con vista previa en tiempo real al pasar el cursor.

### 5. Inspector Contextual Modular
* **Desacoplado y Contextual:** Paneles especializados según el clip seleccionado:
  * **Texto:** Tipografía, formato, estilos (relleno, trazo sin halos, fondo) y transformación.
  * **Video:** Transformación básica, control de audio y transiciones de solapamiento.
  * **Audio:** Nivel de volumen, silenciamiento, *Fade In/Out* y enlace de grupo.
  * **Transformación Reutilizable:** Opacidad, escala, posición $(X, Y)$, rotación y volteo horizontal.

### 6. Streaming Local y Exportación Acelerada por GPU
* **Sin Copias Innecesarias en Disco:** Los archivos se cargan y transmiten desde sus rutas originales en Linux mediante *HTTP Range Requests*.
* **Pipeline de Exportación con FFmpeg:**
  * Aceleración por hardware VAAPI (`h264_vaapi`) con *fallback* a `libx264`.
  * Espacio de color profesional **ITU-R BT.709**, **H.264 High Profile** y audio **AAC 48 kHz / 192 kbps estéreo**.
  * Modal circular de exportación minimalista con progreso en tiempo real y botón de acceso directo para abrir el directorio de salida en el gestor de archivos de Linux.

### 7. Selección Múltiple y Operaciones en Lote (Timeline y Biblioteca)
* **Recuadro de Selección Elástica (*Marquee Box*):**
  * Arrastre con botón izquierdo del ratón en zonas vacías de la línea de tiempo o en el panel de medios.
  * Coordenadas fijadas al contenido con anclaje invariante al scroll (`anchorContentX/Y`).
* **Arrastre y Duplicación Multiclip Sincronizados:**
  * Mover clips en grupo preservando sus desfases temporales relativos sin descalces.
  * Duplicación masiva instantánea (`Ctrl + D`) y borrado en bloque (`Supr` / `Backspace`).
  * Copiar, cortar y pegar selecciones completas (`Ctrl + C`, `Ctrl + X`, `Ctrl + V`).
* **Arrastre en Pila e Inserción Secuencial desde Biblioteca:**
  * Arrastre conjunto con previsualización fantasma apilada en perspectiva mostrando contador de archivos y duración acumulada.
  * Inserción secuencial concatenada (`t0`, `t0 + d1`, `t0 + d1 + d2...`) con resolución de pistas sin colisión mediante arrastre, doble clic o botón `+`.

### 8. App de Escritorio Nativa (Tauri v2) y Rendimiento WebKitGTK
* **Binario Nativo para Linux con Tauri v2:** Empaquetado ligero y eficiente con ventana WebKitGTK y servidor local autónomo en ESM (`dist-server/index.mjs`).
* **Renderizado Cero-Costo GPU:** Eliminación de filtros costosos (`backdrop-filter: blur`, `box-shadow` difuso en recuadros elásticos), actualizaciones directas en el DOM y *throttling* con `requestAnimationFrame` para 60/120 FPS fluidos.

### 9. Sistema Universal de Keyframes para Video y Audio
* **Motor Matemático Puro e Inmutable:** Evaluación de transformaciones visuales ($X/Y$, escala, rotación, opacidad) y volumen con curvas `linear`, `ease-in-out` (SmoothStep), `ease-in`, `ease-out` y `hold`.
* **Auto-Keyframing Inteligente en Canvas & Gizmo:** Arrastrar, rotar o escalar en el visor con el Gizmo inserta automáticamente fotogramas clave en el instante del cabezal si la propiedad ya está animada.
* **Controles Profesionales en el Inspector (`◇` / `◆`):** Botones romboidales reactivos con navegación temporal (`‹` y `›`) y edición simultánea para pares de coordenadas ($X/Y$).
* **Pipeline de Audio y Exportación FFmpeg Dinámica:** Modulación de volumen por frame en Web Audio y generación de expresiones matemáticas de volumen de FFmpeg (`volume=eval=frame`).
* **Marcadores en Línea de Tiempo y Envolvente *Rubber-Band*:** Rombos interactivos (`◆`) sobre los clips, resaltado con el cabezal, navegación directa al hacer clic y trazado continuo de la envolvente de volumen sobre la forma de onda de audio con creación por doble clic.

### 10. Formas de Onda de Audio de Alta Definición (HiDPI)
* **Visualización en Canvas 2D:** Muestreo de 50 picos/segundo acelerado por hardware sin miles de nodos DOM, con adaptación continua al zoom horizontal y proyección milimétrica de recortes (`sourceStart` y `duration`).

---

## ⌨️ Atajos de Teclado

| Atajo | Acción |
| :--- | :--- |
| `Espacio` | Reproducir / Pausar |
| `I` | Marcar punto de Entrada (*In Point*) |
| `O` | Marcar punto de Salida (*Out Point*) |
| `Alt + X` | Limpiar rango de Entrada/Salida (*I/O*) |
| `S` o `Ctrl + B` | Dividir clip en el cabezal (*Split*) |
| `Ctrl + L` | Separar o Vincular audio y video |
| `Ctrl + C` | Copiar clip o lote de clips seleccionados |
| `Ctrl + X` | Cortar clip o lote de clips seleccionados |
| `Ctrl + V` | Pegar clip o lote de clips en el cabezal de reproducción |
| `Ctrl + D` | Duplicar clip o lote de clips seleccionados |
| `Ctrl + A` | Seleccionar todos los medios de la biblioteca o todos los clips del timeline |
| `Supr` o `Backspace` | Eliminar clips seleccionados (o medios seleccionados de biblioteca) |
| `Shift + Clic` / `Ctrl + Clic` | Selección múltiple aditiva o alternada |
| `Ctrl + Z` | Deshacer (*Undo*) |
| `Ctrl + Y` o `Ctrl + Shift + Z` | Rehacer (*Redo*) |
| `Ctrl + /` | Abrir / Cerrar cajón lateral izquierdo |
| `Ctrl + .` | Colapsar / Expandir línea de tiempo |
| `Ctrl + Rueda` | Zoom horizontal en la línea de tiempo centrado en el cursor |
| `Esc` | Deseleccionar clips/medios, cerrar modales o salir de pantalla completa |

---

## 🛠️ Requisitos del Sistema

* **Sistema Operativo:** Linux (Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux, Manjaro, etc.).
* **Node.js:** v18.0.0 o superior.
* **FFmpeg:** Instalado en el sistema con `ffprobe`:
  ```bash
  # En Debian / Ubuntu / Mint:
  sudo apt install ffmpeg

  # En Fedora / RHEL:
  sudo dnf install ffmpeg

  # En Arch / Manjaro:
  sudo pacman -S ffmpeg
  ```

---

## 🚀 Instalación y Puesta en Marcha

1. **Clonar o abrir el directorio del proyecto:**
   ```bash
   cd "EDITOR DE VIDEO"
   ```

2. **Instalar dependencias de Node:**
   ```bash
   npm install
   ```

3. **Ejecutar en modo Escritorio Nativo Linux (Tauri v2 + Standalone Backend):**
   ```bash
   npm run desktop:dev
   ```
   Compila el servidor backend en `dist-server/index.mjs` y abre la ventana nativa de escritorio con WebKitGTK.

4. **Ejecutar en modo Navegador Web (Vite):**
   ```bash
   npm run dev
   ```
   Abre tu navegador en `http://localhost:5173`.

5. **Compilar el ejecutable o instalador de escritorio (.deb / binario nativo Linux):**
   ```bash
   npm run desktop:build
   ```

6. **Compilar versión web y servidor:**
   ```bash
   npm run build
   ```

---

## 📂 Estructura del Código

```text
├── CONTEXTO_PROYECTO.md        # Especificación completa y Single Source of Truth
├── README.md                   # Presentación y guía rápida del proyecto
├── package.json                # Dependencias (Tauri, React, Zustand, Tailwind, Lucide, TikTok Sans)
├── tailwind.config.js          # Configuración de paleta oscura y tipografía
├── vite.config.ts              # Configuración de Vite con plugin backend local
├── src-tauri/                  # Configuración y código fuente nativo de Tauri v2 (Rust)
│   ├── Cargo.toml              # Manifiesto de dependencias en Rust
│   ├── tauri.conf.json         # Configuración de ventana, identificador y permisos de Tauri
│   └── src/                    # Punto de entrada nativo de Tauri
├── server/
│   ├── mediaBackendPlugin.ts   # Middleware de streaming local, FFmpeg probe y exportación (Vite)
│   └── standaloneServer.ts     # Servidor Node independiente empaquetado para Tauri
└── src/
    ├── App.tsx                 # Enrutador principal de vistas (Home vs. Editor)
    ├── main.tsx                # Entrada de React y carga de tipografía TikTok Sans
    ├── index.css               # Estilos globales y reglas de scrollbar
    ├── types/
    │   └── project.ts          # Definiciones de TypeScript (TimelineClip, Track, TextConfig...)
    ├── store/
    │   └── useProjectStore.ts  # Estado global Zustand, historial Undo/Redo y asignación de pistas
    ├── lib/
    │   ├── keyframeEngine.ts   # Motor matemático puro de interpolación, búsqueda binaria y curvas
    │   └── timelineDrop.ts     # Motor universal de cálculo de soltado y colisiones
    └── components/
        ├── HomeView.tsx        # Lanzador de bienvenida glassmorphic y lista de proyectos
        ├── EditorWorkspace.tsx # Espacio de trabajo principal, paneles divisores y cajón de medios
        ├── CanvasPreviewStage.tsx # Compositor de video Canvas 2D y Gizmo interactivo
        ├── TimelinePanel.tsx   # Línea de tiempo multipista, clips vinculados y transiciones
        ├── AudioWaveformCanvas.tsx # Renderizador HiDPI de formas de onda en Canvas 2D
        ├── ExportModal.tsx     # Diálogo de exportación circular acelerada por GPU
        ├── LocalFileBrowserModal.tsx # Explorador del sistema de archivos Linux
        ├── AssetDragLayer.tsx  # Capa de previsualización fantasma en arrastres múltiples
        ├── timeline/           # Subcomponentes interactivos de la línea de tiempo
        │   ├── ClipKeyframeMarkers.tsx # Marcadores romboidales ◆ de keyframes en clips
        │   └── VolumeRubberBand.tsx    # Curva continua de envolvente de volumen en SVG
        └── inspector/          # Arquitectura modular del inspector contextual
            ├── InspectorPanel.tsx    # Contenedor flotante con pestañas contextuales
            ├── KeyframeControlGroup.tsx # Controles de keyframe con navegación temporal y rombo
            ├── TextInspector.tsx     # Inspector avanzado de fuentes variables y estilos
            ├── VideoInspector.tsx    # Inspector de video, audio y transiciones
            ├── AudioInspector.tsx    # Inspector de volumen y fades de audio
            └── TransformSection.tsx  # Controles universales de transformación animable
```

---

## 📖 Documentación de Arquitectura

Para consultar el documento detallado de arquitectura, decisiones de producto y registro de fases, revisa [CONTEXTO_PROYECTO.md](CONTEXTO_PROYECTO.md).
