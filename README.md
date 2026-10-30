# VOSTOK EDITOR — Editor de Video Profesional para Linux

<p align="center">
  <strong>Editor de video tradicional, rápido, ligero y sin relleno innecesario, diseñado específicamente para Linux.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Plataforma-Linux%20x86__64-orange?style=flat-square" alt="Linux" />
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
| `Ctrl + C` | Copiar clip seleccionado |
| `Ctrl + X` | Cortar clip seleccionado |
| `Ctrl + V` | Pegar clip en el cabezal de reproducción |
| `Ctrl + D` | Duplicar clip seleccionado |
| `Supr` o `Backspace` | Eliminar clip seleccionado |
| `Ctrl + Z` | Deshacer (*Undo*) |
| `Ctrl + Y` o `Ctrl + Shift + Z` | Rehacer (*Redo*) |
| `Ctrl + /` | Abrir / Cerrar cajón lateral izquierdo |
| `Ctrl + .` | Colapsar / Expandir línea de tiempo |
| `Ctrl + Rueda` | Zoom horizontal en la línea de tiempo centrado en el cursor |
| `Esc` | Cerrar modales o salir de pantalla completa |

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

3. **Iniciar el servidor de desarrollo (con HMR y Backend de FFmpeg):**
   ```bash
   npm run dev
   ```
   Abre tu navegador en `http://localhost:5173`.

4. **Compilar para producción:**
   ```bash
   npm run build
   ```

---

## 📂 Estructura del Código

```text
├── CONTEXTO_PROYECTO.md        # Especificación completa y Single Source of Truth
├── README.md                   # Presentación y guía rápida del proyecto
├── package.json                # Dependencias (React, Zustand, Tailwind, Lucide, TikTok Sans)
├── tailwind.config.js          # Configuración de paleta oscura y tipografía
├── vite.config.ts              # Configuración de Vite con plugin backend local
├── server/
│   └── mediaBackendPlugin.ts   # Middleware de streaming local, FFmpeg probe y exportación
└── src/
    ├── App.tsx                 # Enrutador principal de vistas (Home vs. Editor)
    ├── main.tsx                # Entrada de React y carga de tipografía TikTok Sans
    ├── index.css               # Estilos globales y reglas de scrollbar
    ├── types/
    │   └── project.ts          # Definiciones de TypeScript (TimelineClip, Track, TextConfig...)
    ├── store/
    │   └── useProjectStore.ts  # Estado global Zustand, historial Undo/Redo y asignación de pistas
    └── components/
        ├── HomeView.tsx        # Lanzador de bienvenida glassmorphic y lista de proyectos
        ├── EditorWorkspace.tsx # Espacio de trabajo principal, paneles divisores y drawer
        ├── CanvasPreviewStage.tsx # Compositor de video Canvas 2D y Gizmo interactivo
        ├── TimelinePanel.tsx   # Línea de tiempo multipista, clips vinculados y transiciones
        ├── ExportModal.tsx     # Diálogo de exportación circular acelerada por GPU
        ├── LocalFileBrowserModal.tsx # Explorador del sistema de archivos Linux
        └── inspector/          # Arquitectura modular del inspector contextual
            ├── InspectorPanel.tsx    # Contenedor flotante con pestañas contextuales
            ├── TextInspector.tsx     # Inspector avanzado de fuentes variables y estilos
            ├── VideoInspector.tsx    # Inspector de video, audio y transiciones
            ├── AudioInspector.tsx    # Inspector de volumen y fades de audio
            └── TransformSection.tsx  # Controles universales de transformación
```

---

## 📖 Documentación de Arquitectura

Para consultar el documento detallado de arquitectura, decisiones de producto y registro de fases, revisa [CONTEXTO_PROYECTO.md](CONTEXTO_PROYECTO.md).
