# Documento de Contexto del Proyecto: VOSTOK EDITOR para Linux

Este documento sirve como la fuente única de verdad (*Single Source of Truth*) sobre los objetivos, decisiones de arquitectura, reglas de negocio, diseño de interfaz y estado actual del proyecto.

---

## 1. Visión y Propósito del Proyecto

* **Nombre Oficial e Identidad:** **VOSTOK EDITOR** (Isotipo oficial "V" estilizado con reproductor Play integrado y paleta Carbón/Cian).
* **Objetivo:** Crear una aplicación de edición de video tradicional, rápida, limpia y sin relleno innecesario, diseñada específicamente para **uso personal y personalizado en Linux**.
* **Filosofía de Producto:**
  1. **Simplicidad e Inmediatez:** Interfaz intuitiva inspirada en flujos de trabajo modernos de edición ágil y no lineal (*Sony Vegas/Reaper*), enfocada en las herramientas esenciales de edición rápida.
  2. **Desarrollo Ágil en Vivo (*Hot Reload*):** Arquitectura pensada para visualizar y ajustar la interfaz y herramientas inmediatamente en el navegador durante el desarrollo, y empaquetarse como aplicación de escritorio para Linux.
  3. **Rendimiento Robusto sin Basura en Disco:** Referencia los archivos originales en su ruta local sin duplicarlos y utiliza una política estricta de **caché efímera autolimpiable**.

---

## 2. Arquitectura Tecnológica Implementada

### 2.1. Capa Frontend (UI, Timeline y Motor de Composición)
* **Framework UI:** **React + TypeScript + Vite** ([`src/App.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/App.tsx)).
* **Tipografía UI Oficial:** **`TikTok Sans Variable`** integrada mediante `@fontsource-variable/tiktok-sans` tanto en el sistema CSS como en Tailwind para máxima legibilidad moderna en tema oscuro.
* **Estilos & Layout Adaptable:** **TailwindCSS** + **Lucide Icons** con **Paneles Redimensionables (Splitters)** verticales y horizontales y escalado matemático dinámico con `ResizeObserver` para preservar siempre la proporción exacta del lienzo.
* **Gestión de Estado e Historial:** **Zustand** ([`src/store/useProjectStore.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts)) con pila de historial `pastProjects` / `futureProjects` (hasta 50 pasos) para soporte nativo de `Ctrl+Z` y `Ctrl+Y` y autoguardado automático en disco.
* **Arquitectura Modular del Inspector ([`src/components/inspector/`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/)):**
  * Modularización de `EditorWorkspace.tsx` separando responsabilidades en submódulos especializados:
    * [`InspectorPanel.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/InspectorPanel.tsx): Contenedor contextual flotante con pestañas inteligentes según el tipo de clip seleccionado.
    * [`TextInspector.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/TextInspector.tsx): Inspector avanzado de texto con control de fuentes variables, estilos y formato.
    * [`VideoInspector.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/VideoInspector.tsx): Pestañas de video: Transformación básica, Audio y Transiciones de cruce.
    * [`AudioInspector.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/AudioInspector.tsx): Control de volumen, silenciamiento, fades y desvinculación.
    * [`TransformSection.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/TransformSection.tsx): Controles universales y reutilizables de Opacidad, Escala, Posición X/Y, Rotación y Voltear Horizontal.
* **Motor de Renderizado Visual Único (`<canvas>`):**
  * Implementado en [`src/components/CanvasPreviewStage.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx).
  * El `<canvas>` de HTML5 actúa como el **único compositor visual** tanto en vista previa como en exportación (`renderProjectFrameToCanvas`).
  * Dibuja en tiempo real las pistas de video, imágenes, textos con escala nativa Full HD (`9.5×`), el formato del lienzo (`16:9`, `9:16` o `1:1`), las transformaciones espaciales y las transiciones matemáticas en las zonas de solapamiento.
* **Sincronización de Audio:** Pool de elementos de audio sincronizados con la aguja (*playhead*), calculando en tiempo real el volumen por clip, silenciamiento de pista (`Mute`), *Fade In / Out* y curvas de *crossfade* en solapamientos.

### 2.2. Capa Backend Local / Nativa (Linux + FFmpeg)
* **Puente Multimedia Local ([`server/mediaBackendPlugin.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts)):**
  * Conecta el frontend directamente con `/usr/bin/ffmpeg` y `/usr/bin/ffprobe`.
  * **Explorador del Sistema de Archivos (`/api/fs/browse`):** Permite navegar carpetas locales de Linux (`~/Vídeos`, `~/Música`, `~/Imágenes`, `~/Descargas`, etc.) en [`src/components/LocalFileBrowserModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/LocalFileBrowserModal.tsx).
  * **Streaming sin Copiar Archivos (`/api/media/stream`):** Sirve los archivos multimedia originales mediante *HTTP Range Requests* sin duplicarlos en disco.
  * **Inspección y Ondas (`/api/media/probe`):** Extrae duración, dimensiones, presencia de pista de audio, miniatura en base64 y picos de onda de audio (`waveform`).
  * **Pipeline de Exportación MP4 (`/api/export/start`, `/api/export/frames`, `/api/export/finalize`):** Recibe los fotogramas compuestos del Canvas, mezcla las pistas de audio activas con sus recortes (`atrim`), volúmenes, `afade` y desfases (`adelay`), codifica el `.mp4` (`libx264` + `aac`) en `~/.local/share/video-editor/exports/` y autolimpia los fotogramas temporales al terminar.

---

## 3. Funcionalidades y Reglas de UX Implementadas

### 3.1. Gestión de Proyectos y Lanzador Ultra Minimalista Glassmorphism ([`src/components/HomeView.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/HomeView.tsx))
* **Diseño Horizontal Split sin Scroll (100vh exacto):** Distribución panorámica que aprovecha al máximo la pantalla sin necesidad de hacer scroll vertical.
* **Columna Izquierda (Panel de Control Glassmorphic con Relieve y Contraste):**
  * Fondo encapsulado `#14161b/90` con `backdrop-blur-2xl`, bordes translúcidos y sombra profunda para destacarse con elegancia como torre de control.
  * Logotipo oficial centrado en solitario con resplandor cian reactivo (sin lemas redundantes).
  * Botón principal de **Nuevo proyecto** con atajo visual `Ctrl+N`.
  * Trío de accesos directos rápidos con resolución exacta:
    * 🖥️ **16:9 Horizontal** (`1920×1080`)
    * 📱 **9:16 Vertical** (`1080×1920`)
    * ⏹️ **1:1 Cuadrado** (`1080×1080`)
  * Pie de versión de software discreto (`Linux x86_64 v0.1.0 Beta`).
* **Columna Derecha (Cuadrícula 2 Filas en Carrusel Horizontal con Fade-Out y Duración):**
  * Distribución en 2 filas compactas calibradas exactamente a la altura del panel izquierdo (`495px`) para simetría vertical perfecta.
  * **Máscara de desvanecimiento suave (*Fade Out*):** El extremo derecho del carrusel se difumina elegantemente hacia el borde mediante `mask-image: linear-gradient(to right, black 90%, transparent 100%)`.
  * **Niveles de elevación tonal:** Fondo general `#090a0d` (Nivel 0), miniatura del video en `#0c0d10`, base de metadatos elevada en `#191b22/90` con borde superior sutil de 1px.
  * **Metadatos cinematográficos:** Muestra el tiempo relativo a la izquierda (*Hace 1 h*) y la **duración real del video** a la derecha (*00:35* o *00:00* si está vacío), eliminando el contador innecesario de clips.
  * **Navegación con rueda del mouse (`onWheel`):** El scroll vertical con la rueda del ratón o trackpad se traduce instantáneamente en desplazamiento horizontal suave sobre la biblioteca de proyectos.
  * Botón de eliminación protegido con diálogo de confirmación glassmorphic y completamente oculto hasta pasar el cursor (`opacity-0 group-hover:opacity-100`).
* Modal de creación con selector táctil rápido de relación de aspecto (`16:9`, `9:16`, `1:1`) y tasa de fotogramas (`24`, `30`, `60 FPS`).

### 3.2. Biblioteca de Medios y Generador de Textos ([`src/components/EditorWorkspace.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/EditorWorkspace.tsx))
* Importación mediante explorador local de Linux, arrastrar y soltar (*Drag & Drop*) y generador de pack de prueba con FFmpeg.
* **Flujo de Texto Minimalista y Profesional:**
  * **Opciones Directas de Tipografía:**
    * **"Título":** Inserta de inmediato un clip con `"TÍTULO"`, tipografía `TikTok Sans Variable`, tamaño `16` (equivalente a ~152px reales en 1080p), peso `800` (ExtraBold) y centrado en pantalla (`y: 0`).
    * **"Texto de cuerpo":** Inserta un clip con `"Texto de cuerpo"`, tipografía `TikTok Sans Variable`, tamaño `8` (equivalente a ~76px reales en 1080p), peso `400` (Regular) y desplazado verticalmente (`y: +110`) para convivir armoniosamente debajo del título sin taparlo.
  * **Catálogo de Fuentes 100% Variables:**
    * Suite optimizada de fuentes variables (`TikTok Sans Variable`, `Montserrat`, `Inter`, `Poppins`, `Roboto`, `Oswald`, `Playfair Display`, `Space Grotesk`, `Fira Code`, `Cinzel`), garantizando que cada fuente responda al 100% a los ejes de peso continuo.
    * Eliminación de llamadas síncronas bloqueantes a `fc-list` en el sistema operativo Linux para agilizar la respuesta del editor.
  * **Inspector Contextual de Texto ([`src/components/inspector/TextInspector.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/TextInspector.tsx)):**
    * **Portales Flotantes Globales (`createPortal` en `document.body`):** Los menús desplegables de fuente y tamaño flotan por encima de los límites del contenedor sin verse recortados por `overflow-hidden` y cuentan con **previsualización en vivo al pasar el cursor (*Hover Preview*)**.
    * **Escala Tipográfica Normalizada para Video (Rango 5 a 32):** Menú desplegable con pasos proporcionales optimizados para video: `[5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32]`.
    * **Ejes de Tipografía Variable:**
      * **Grosor / Peso Continuo (100 a 900):** Slider dinámico para transicionar fluidamente desde *Thin* hasta *Black*.
      * **Espaciado entre Letras (Tracking / Kerning):** Rango de `-4` a `+24 px` en pasos enteros de 1px con protección CSS `whitespace-nowrap` para evitar desbordes o saltos de línea indeseados.
      * **Interlineado:** Multiplicador de alto de línea (`0.80x` a `2.20x`).
    * **Estilos & Borde:** Color de relleno, trazo exterior ajustable sin halos espurios y fondo configurable con bordes redondeados.
    * **Transformación Integrada:** Opacidad, escala, posición $(X, Y)$, rotación y volteo horizontal dentro del mismo panel sin salir a otras pestañas.

### 3.3. Línea de Tiempo Multipista y Asignación Inteligente de Pistas sin Colisión ([`src/components/TimelinePanel.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/TimelinePanel.tsx))
* **Asignación Universal de Pistas sin Colisión (*Collision-Free Track Allocation*):**
  * Funciones [`isRangeCollidingWithTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L139) y [`findOrCreateAvailableTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L160) en el store central:
    * Al insertar texto, video, imagen o audio en un instante `startTime` con una duración dada, el editor verifica si la pista objetivo está ocupada en ese intervalo.
    * Si la pista está libre en ese tramo, la aprovecha eficientemente; si está ocupada, busca otra pista libre del mismo tipo o **crea automáticamente una nueva pista en la jerarquía correcta**:
      * **Texto:** Se apila **hacia arriba** (Pista Texto 1, 2, 3...) para sobreponerse en el lienzo visual.
      * **Video / Imagen:** Se apila **hacia arriba** (Pista Video 2, 3...) para crear efectos PiP (Picture-in-Picture) y superposiciones.
      * **Audio:** Se apila **hacia abajo** (Pista Audio 1, 2, 3...) permitiendo mezclas simultáneas de locución, música de fondo y efectos de sonido.
* **Protección de la Pista Principal Magnética ([`getMainVideoTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L131)):** Identifica siempre la pista base (`Pista Video 1`) para el empaquetado secuencial magnético sin afectar las pistas superiores de superposición.
* **Vínculo Híbrido Video + Audio (`linkGroupId`):** Al arrastrar un video con sonido se crean las pistas de video y audio agrupadas. Pueden separarse o revincularse en cualquier momento con el botón **Separar/Vincular Audio**, clic derecho o `Ctrl+L`.
* **Fundidos y Transiciones por Solapamiento:** Al arrastrar un Clip B sobre el final de un Clip A en la misma pista se crea automáticamente la zona de cruce `(X)` con selector de transición (*Crossfade*, *Dip to Black*, *Wipe Left/Right*, *Slide*, *Zoom*).
* **Marcadores de Entrada (`I`) y Salida (`O`):**
  * Atajos `I` (Entrada), `O` (Salida) y `Alt+X` (Limpiar rango), además de banderines arrastrables en la regla de tiempo.
  * Acota tanto la reproducción como el rango de tiempo exportado en [`src/components/ExportModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/ExportModal.tsx).

### 3.4. Lienzo Interactivo con Proporción Exacta y Gizmo ([`src/components/CanvasPreviewStage.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx))
* Auto-ajuste matemático del lienzo (`ResizeObserver` + `contain`) para mantener siempre la relación de aspecto exacta mientras se redimensionan los paneles laterales o la línea de tiempo.
* **Gizmo Interactivo:** Mover en $(X, Y)$ con guías magnéticas de centrado, escalar desde las 4 esquinas y rotar desde el tirador superior.

### 3.5. Atajos de Teclado Activos
* `Espacio`: Play / Pausa.
* `I` / `O` / `Alt + X`: Marcar Entrada (In), Marcar Salida (Out) y Limpiar rango I/O.
* `S` o `Ctrl + B`: Dividir (*Split*) clip en la posición de la aguja.
* `Ctrl + L` (o clic derecho en clip): Separar / Vincular audio y video.
* `Ctrl + C` / `Ctrl + X` / `Ctrl + V`: Copiar, Cortar y Pegar en la aguja.
* `Supr` o `Backspace`: Eliminar clip seleccionado.
* `Ctrl + Z` / `Ctrl + Y` (o `Ctrl + Shift + Z`): Deshacer y Rehacer.

---

## 4. Estado de la Hoja de Ruta

- [x] **Fase 1:** Base del Proyecto, Servidor Multimedia Local (FFmpeg) y Gestión de Proyectos. *(Completada)*
- [x] **Fase 2:** Biblioteca de Medios, Explorador de Archivos Linux, Generador de Textos e Historial Undo/Redo. *(Completada)*
- [x] **Fase 3:** Línea de Tiempo Multipista, Clips Vinculados (`linkGroupId`), Split/Trim y Solapamientos (Crossfades). *(Completada)*
- [x] **Fase 4:** Motor de Previsualización Canvas Unificado, Gizmo Interactivo, Paneles Redimensionables, Rango `I/O` y Exportación MP4. *(Completada)*
- [x] **Fase 5:** Rediseño UX/UI Moderno y Minimalista (Estética Carbón/Cian, Pistas Dinámicas sin Pistas por Defecto, Paneles Colapsables y Flotantes, Menú Contextual de Clic Derecho y Modo Pantalla Completa). *(Completada)*
- [x] **Fase 6:** Inspector Modular Contextual, Tipografía Variable Avanzada, Escala de Video (5-32) y Asignación de Pistas sin Colisiones. *(Completada)*

---

## 5. Plan Detallado de Fase 5: Rediseño UX/UI Moderno y Minimalista

### Etapa 1: Estética Base, Paleta de Colores, Tipografía y Diseño de Pistas
* **Paleta de Colores Carbón Neutro:**
  * Sustituir los tonos azulados (`slate-900`/`950`) por grises carbón neutros:
    * Fondo general y barras principales: `#141517` / `#18191c`.
    * Área central del visualizador, paneles y cajones: `#202124` / `#25262b`.
    * Bordes divisores sutiles de 1px: `#2c2d32`.
    * Acento principal **Cian (`#00d4e5` / `#00c2d1`)** para selección de clips, botones activos, toggles y barra de progreso; **Azul (`#3b82f6` / `#2563eb`)** para el botón `Exportar`.
* **Tipografía y Jerarquía Visual:**
  * Tipografía `Inter` / `system-ui` limpia, eliminando textos en mayúsculas con `tracking-widest` innecesario y priorizando pesos medios (`font-medium`) y códigos de tiempo legibles (`00:00:00 | 00:25:00`).
* **Rediseño de Pistas, Clips y Gizmo en el Lienzo:**
  * **Cabeceras de pista minimalistas:** Íconos limpios a la izquierda de cada pista activa (altavoz para silenciar, ícono de enlace `🔗` / edición) sin bloques pesados de texto.
  * **Clips estilo película (Filmstrip) y ondas:** Esquinas redondeadas, tira de miniaturas repetidas en clips de video, etiqueta interna en píldora oscura (`nombre.mp4 00:13:25`), y al seleccionarse, **borde cian grueso con dos manijas blancas verticales (`|`)** en los extremos.
  * **Aguja (Playhead):** Cápsula blanca superior redondeada con línea vertical blanca.
  * **Botón Flotante de Relación de Aspecto (`16:9` / `9:16` / `1:1`):** Ubicado en la esquina superior izquierda del área del visualizador (`Relación`), despejando la barra superior.
  * **Gizmo de Lienzo Limpio:** Marco de selección cian con 4 círculos blancos en las esquinas y **tirador de rotación (`↻`) en la parte inferior** (sin píldora flotante redundante, ya que las acciones contextuales viven en la barra del timeline).
  * **Deselección al Hacer Clic en el Espacio Exterior:** Hacer clic en el área gris alrededor del lienzo deselecciona el clip activo y cierra automáticamente el inspector flotante derecho.

### Etapa 2: Estado Inicial de Proyecto Limpio y Pistas Dinámicas
* **Línea de Tiempo sin Pistas por Defecto (`tracks: []`):**
  * Un proyecto nuevo inicia sin pistas pre-creadas.
  * Mientras no existan clips en la línea de tiempo, se muestra un contenedor redondeado centrado bajo la regla de tiempo: **`🎞️ Arrastra y suelta archivos multimedia aquí`**.
  * Al arrastrar o agregar el primer archivo multimedia o texto, las pistas necesarias se crean automáticamente; si una pista queda sin clips tras eliminar elementos, se limpia automáticamente.
* **Dropzone Central en el Visualizador:**
  * Cuando el proyecto está vacío, el área central del lienzo muestra el botón cuadrado cian **`+`** con el texto **`Haz clic para cargar / O arrastra y suelta el archivo aquí`**, abriendo directamente el explorador local de Linux o recibiendo archivos soltados.
* **Controles Contextuales:** Botones de reproducción, pantalla completa y edición atenuados cuando el proyecto está vacío, y barra de herramientas de línea de tiempo que despliega herramientas adicionales al seleccionar un clip.

### Etapa 3: Paneles Colapsables y Flotantes
* **Riel Izquierdo y Cajón de Materiales de Alto Completo (`100vh`) (`Ctrl + /`):**
  * Riel izquierdo fijo que ocupa el 100% de la altura de la ventana (botón Inicio arriba, herramientas en el medio y `Atajos de teclado` abajo).
  * Cajón lateral de alto completo plegable mediante pestaña `<` / `>` (`Ctrl + /`), mientras que la barra superior, el visualizador y el timeline se acomodan a su derecha.
  * **Cuadrícula 2x2 de Miniaturas:** El primer cuadro es el botón `[☁️ Cargar]`, seguido de tarjetas de miniaturas 16:9 con duración abajo a la izquierda (`00:25`) y badge **`Agregado`** arriba a la izquierda cuando el archivo ya está en la línea de tiempo.
* **Pista Principal Magnética sin Huecos y Zoom con `Ctrl + Rueda`:**
  * Botón de **Pista Principal Magnética (`Magnet`)** en la barra de la línea de tiempo: cuando está activo (en cian), los clips de la pista principal de video (y su audio vinculado) se unen automáticamente borde con borde desde `00:00` sin dejar espacios vacíos al agregar, borrar, recortar o reordenar; al desactivarlo, permite posición libre y solapamientos.
  * Hacer **`Ctrl + Scroll`** con la rueda del mouse sobre las pistas acerca o aleja la línea de tiempo manteniendo fijo el segundo exacto bajo el puntero del mouse.
* **Inspector Derecho en Tarjeta Flotante Real con Pestañas Laterales + Cierre (`×`):**
  * Cerrado por defecto cuando no hay ningún clip seleccionado.
  * Al seleccionar un clip, se abre como una **tarjeta flotante superpuesta (`position: absolute`)** sobre el extremo derecho del escenario central sin empujar ni redimensionar el lienzo de video (`<canvas>`), con botón **`×`** para cerrarla y un **mini riel vertical de pestañas con íconos a la derecha** (`Básico`, `Audio`, `Velocidad`, `Transición`) junto con controles limpios (`slider` + caja numérica con `%`).
* **Exportación Nativa sin `<video>` HTML5 (Decodificación Secuencial FFmpeg + Pipe a GPU `AMD VAAPI` + `ITU-R BT.709` + `H.264 High Profile` + Audio `48 kHz`):**
  * **Eliminación del "Seek Penalty" de HTML5:** Durante la exportación no se usa `<video>.currentTime`. El endpoint `/api/export/decode-clip-frames` decodifica cada clip de forma lineal y secuencial mediante FFmpeg (`image2pipe`), entregando fotogramas continuos como `ImageBitmap` en VRAM (`SequentialVideoFrameReader`) al compositor [`renderProjectFrameToCanvas`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx#L149) (conservando 100% de fidelidad visual en transiciones, capas superpuestas, rotaciones y textos).
  * **Codificación Paralela con Pool de `OffscreenCanvas` y Stream Binario (`application/octet-stream`) al Pipe de GPU (`stdin -> image2pipe -> h264_vaapi`):**
    * En [ExportModal.tsx](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/ExportModal.tsx), un pool de `OffscreenCanvas` comprime lotes de fotogramas a JPEG binario en paralelo (`convertToBlob` asíncrono multi-hilo, sin conversión a texto Base64 ni `JSON.stringify`) y actualiza la UI una sola vez por lote.
    * En [mediaBackendPlugin.ts](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts), `/api/export/frames` recibe el bloque binario crudo y lo inyecta directamente al pipe `stdin` del proceso `ffmpeg` acelerado por GPU (`/dev/dri/renderD128` con *fallback* automático a `libx264`), sin escribir miles de archivos `.jpg` sueltos en disco.
  * **Experiencia Circular Minimalista de Exportación (Estilo WeTransfer):**
    * Al hacer clic en **Exportar**, el formulario en [ExportModal.tsx](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/ExportModal.tsx) se transforma en una tarjeta esbelta y centrada con un anillo circular estático orientado a las 12 en punto (`-rotate-90`) cuyo trazo cian (`#00d4e5`) se completa en sentido horario progresivo y fluido con `transition-[stroke-dashoffset] duration-300`, mostrando el porcentaje numérico grande en el centro (`58%`), el título `Exportando...`, el nombre del archivo y un botón píldora **`Cancelar`** (`/api/export/cancel` detiene inmediatamente el bucle y limpia el proceso FFmpeg).
    * Al finalizar (`100%`), la tarjeta pasa a **`¡Exportado con éxito!`** con un círculo de confirmación y el botón **`Abrir carpeta`** (`/api/fs/open-folder` abre el gestor de archivos nativo de Linux resaltando el video exportado).
  * El archivo `.mp4` resultante se entrega en espacio de color **`ITU-R BT.709` (`tv` range)** con metadatos completos (`colorspace=bt709`, `color_primaries=bt709`, `color_trc=bt709`), **`H.264 High Profile` (`-profile:v high -movflags +faststart`)** y audio **`AAC 192 kbps` a `48000 Hz` estéreo (`2 canales`)**.
* **Modo Ocultar/Mostrar Línea de Tiempo (`Ctrl + .`):**
  * Botón en el extremo inferior derecho de la barra de herramientas que colapsa las pistas multipista y deja solo la barra de transporte con una barra de progreso cian inferior y el cabezal blanco para maximizar el visualizador.

### Etapa 4: Menú Contextual de Clic Derecho sobre Clips
* Al hacer clic derecho sobre cualquier clip en la línea de tiempo, se despliega un menú flotante oscuro con ícono a la izquierda, nombre de la acción y badge de atajo a la derecha:
  * **Dividir** (`Ctrl + B` / `S`)
  * **Copiar** (`Ctrl + C`)
  * **Cortar** (`Ctrl + X`)
  * **Pegar** (`Ctrl + V`) *(atenuado si el portapapeles está vacío)*
  * **Duplicar** (`Ctrl + D`)
  * **Eliminar** (`Retroceso / Supr`)
  * **Audio independiente / Vincular audio** (`Ctrl + L`)

### Etapa 5: Modo Vista en Pantalla Completa
* Botón `[ ]` en la barra de la línea de tiempo que abre la previsualización a pantalla completa sobre fondo oscuro (`#18191c`), con barra inferior minimalista: **línea de progreso cian de ancho completo** con tirador circular blanco para *scrubbing*, botón Play blanco, código de tiempo (`00:11:15 | 00:25:00`) y botón para salir (`Esc`).

---

## 6. Fase 6: Inspector Modular, Tipografía Variable y Asignación sin Colisiones

### 6.1. Modularización del Inspector ([`src/components/inspector/`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/))
* **Desacoplamiento Estructural:** Reducción del componente monolítico `EditorWorkspace.tsx` (de más de 2000 líneas a ~950 líneas), organizando el inspector en componentes independientes y testeables:
  * [`InspectorPanel.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/InspectorPanel.tsx): Detecta dinámicamente si el clip es de tipo `text`, `video` o `audio`. Si es texto, oculta las pestañas irrelevantes de audio/transiciones y muestra exclusivamente los controles tipográficos y la sección de transformación unificada (evitando el bug de conmutación de pestañas al interactuar con la opacidad).
  * [`TransformSection.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/TransformSection.tsx): Control común de Opacidad (0–100%), Escala (10–300%), Posición X/Y, Rotación (-180° a +180°) y botón Voltear Horizontal.
  * [`TextInspector.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/TextInspector.tsx), [`VideoInspector.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/VideoInspector.tsx) y [`AudioInspector.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/AudioInspector.tsx).

### 6.2. Tipografía Variable y Escala Normalizada de Video (Rango 5 a 32)
* **Tipografía UI Oficial:** `@fontsource-variable/tiktok-sans` (`TikTok Sans Variable`) integrada para una experiencia limpia y moderna.
* **Catálogo de Fuentes 100% Variables:** Prioriza exclusivamente fuentes variables (`TikTok Sans Variable`, `Montserrat`, `Inter`, `Poppins`, `Roboto`, `Oswald`, `Playfair Display`, `Space Grotesk`, `Fira Code`, `Cinzel`), eliminando llamadas de backend a `fc-list` que bloqueaban la CPU con fuentes estáticas del sistema incompatibles con sliders de peso continuo.
* **Portales Flotantes en `document.body`:** Los selectores desplegables de fuente y tamaño flotan con coordenadas absolutas (`getBoundingClientRect`), z-index `99999` y soporte de **previsualización al vuelo (*Hover Preview*)**, sin verse atrapados por el `overflow-hidden` de la barra lateral.
* **Escala Normalizada de Video (5 a 32) y Multiplicador para Canvas Full HD (`9.5×`):**
  * La interfaz adopta números de escala intuitivos (`5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32`).
  * En el renderizador Canvas ([`CanvasPreviewStage.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx)), el tamaño se multiplica por `9.5`:
    * Tamaño `16` $\rightarrow$ `152 px` reales en 1080p (Título grande y llamativo).
    * Tamaño `8` $\rightarrow$ `76 px` reales en 1080p (Cuerpo de texto / subtítulos).
* **Controles Tipográficos Variables Avanzados:**
  * **Grosor continuo (100–900):** Slider suave de peso tipográfico.
  * **Espaciado (Tracking/Kerning):** Valores enteros de `-4` a `+24 px` (`step={1}`) con protección `whitespace-nowrap` en la insignia para erradicar saltos de línea del sufijo `px`.
  * **Interlineado:** Multiplicador dinámico de `0.80x` a `2.20x`.
* **Tarjetas Minimalistas en Riel Izquierdo:** Sustitución de presets pesados por dos tarjetas directas:
  * **"Título":** Tamaño `16`, peso `800`, `y: 0`.
  * **"Texto de cuerpo":** Tamaño `8`, peso `400`, `y: +110`.

### 6.3. Asignación Inteligente de Pistas sin Colisión (*Collision-Free Track Allocation*)
* **Detección Matemática ([`isRangeCollidingWithTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L139)):** Evalúa si el tramo `[startTime, startTime + duration]` colisiona con algún clip de la pista (tolerancia de 20 ms para admitir clips continuos contiguos sin falsas colisiones).
* **Asignación Universal ([`findOrCreateAvailableTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L160)):**
  * **Texto:** Al añadir un texto en una posición ocupada, busca una pista de texto libre o **crea automáticamente una nueva pista hacia arriba**, superponiéndose visualmente en el lienzo.
  * **Video / Imagen:** Si la pista de video base está ocupada, **crea una pista de video hacia arriba** para superposición, PiP o B-Roll.
  * **Audio:** Si la pista de audio está ocupada, **crea una pista de audio hacia abajo** para permitir la mezcla simultánea de música de fondo, locución y efectos de sonido.
* **Preservación Magnética Base ([`getMainVideoTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L131)):** Identifica la pista `Pista Video 1` como eje principal de empaquetado magnético sin afectar las capas superiores de superposición.
