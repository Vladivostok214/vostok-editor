# Documento de Contexto del Proyecto: VOSTOK EDITOR para Linux

Este documento reúne la documentación contextual del estado del proyecto, contrastable con el código y la configuración vigente, junto con sus objetivos, decisiones de arquitectura, reglas de negocio y antecedentes de diseño.

---

## Estado verificado — 2026-11-04

Inspección estática del árbol de trabajo con HEAD `4564f63`, incluidos cambios locales. No se ejecutaron pruebas ni compilaciones. “Implementado” indica presencia en el código; los riesgos descritos no se han reproducido en esta revisión. Los resultados y declaraciones de cierre anteriores se conservan como antecedentes, no como validación del estado vigente.

- **Implementado:** React/TypeScript y Zustand gestionan edición y estado; Canvas 2D comparte composición entre preview y exportación; Node ejecuta FFmpeg/FFprobe. Rust inicia el servidor y gestiona parcialmente su ciclo de vida. La edición utiliza HTTP, sin comandos IPC de dominio registrados en el Rust inspeccionado.
- **Implementado con límites arquitectónicos:** `src/config/api.ts` dirige Tauri a `http://127.0.0.1:45173` y el navegador al middleware de Vite. `server/standaloneServer.ts` ofrece `/health`, pero `src-tauri/src/lib.rs` solo comprueba una conexión TCP para considerar activo el backend. Requiere Node instalado; el bundle ESM se distribuye como recurso. No hay handshake de identidad ni supervisión completa de los procesos FFmpeg.
- **Riesgos de persistencia e integridad:** `useProjectStore.ts` mantiene hasta 50 snapshots en memoria, pero algunas transformaciones persisten sin snapshot y respuestas de guardado antiguas pueden reemplazar ediciones posteriores. El backend escribe directamente `project.json` en `~/.local/share/video-editor/projects/<id>/`; no implementa reemplazo atómico ni validación estructural completa. El DELETE con ID saneado vacío puede resolver a la raíz de proyectos. Reimportar por ruta genera IDs nuevos sin remapear los clips existentes. La importación por buffer y los trabajos temporales comparten caché; limpiarla puede retirar medios referenciados.
- **Limitaciones de acceso local:** `mediaBackendPlugin.ts` permite CORS `*`, no autentica las peticiones y sirve rutas suministradas por el cliente; Tauri configura `csp: null`. Escuchar en loopback limita la exposición de red, pero no autentica al cliente. No se ha probado explotación.
- **Funcionalidades parciales:** las curvas no se reajustan correctamente en split/trim y el filtrado de keyframes de volumen por rango I/O puede alterar la interpolación. El inspector ofrece identificadores de transición distintos de los reconocidos por el compositor. El audio del inspector de video no resuelve su clip de audio vinculado; preview y exportación difieren en ganancia y crossfade. El pegado agrupa selecciones independientes y no transfiere sus assets entre proyectos.
- **Exportación parcial y riesgos estáticos:** `ExportModal.tsx` carga imágenes con URL sin el resolvedor de API usado en preview; intenta decodificar videos offline y de pistas ocultas; reducir a 720p no escala uniformemente texto y posiciones. El fallback del pipe binario carece de los JPEG que requiere la ruta tradicional. El backend puede terminar sin audio tras un fallo de mezcla y devolver éxito. Cancelación, limpieza y espera de procesos tienen cobertura incompleta. Estos mecanismos limitan las garantías de fidelidad y recuperación.
- **Pendiente / no revalidado:** detección de medios en caliente, revalidación antes de exportar, compatibilidad de reemplazos e invalidación de fuentes ya cargadas. No se han revalidado latencias, aceleración efectiva, FPS ni los resultados históricos de pruebas. Los scripts existentes no equivalen a una suite E2E completa.

La [auditoría técnica](docs/audits/AUDITORIA_TECNICA_2026-11-04.md) conserva el detalle de los hallazgos. Este resumen no sustituye ese inventario ni constituye un plan de mejoras.

## 1. Visión y Propósito del Proyecto

* **Nombre Oficial e Identidad:** **VOSTOK EDITOR** (Isotipo oficial "V" estilizado con reproductor Play integrado y paleta Carbón/Cian).
* **Objetivo:** Crear una aplicación de edición de video tradicional, rápida, limpia y sin relleno innecesario, diseñada específicamente para **uso personal y personalizado en Linux**.
* **Filosofía de Producto:**
  1. **Simplicidad e Inmediatez:** Interfaz intuitiva inspirada en flujos de trabajo modernos de edición ágil y no lineal (*Sony Vegas/Reaper*), enfocada en las herramientas esenciales de edición rápida.
  2. **Desarrollo Ágil en Vivo (*Hot Reload*):** Arquitectura pensada para visualizar y ajustar la interfaz y herramientas inmediatamente en el navegador durante el desarrollo, y empaquetarse como aplicación de escritorio para Linux.
  3. **Rendimiento Robusto sin Basura en Disco:** Prioriza referencias a originales por ruta y caché efímera. La alternativa de importación por buffer sí copia el archivo a caché; la separación entre medios persistentes y temporales está pendiente.

---

## 2. Arquitectura Tecnológica Implementada

### 2.1. Capa Frontend (UI, Timeline y Motor de Composición)
* **Framework UI:** **React + TypeScript + Vite** ([`src/App.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/App.tsx)).
* **Tipografía UI Oficial:** **`TikTok Sans Variable`** integrada mediante `@fontsource-variable/tiktok-sans` tanto en el sistema CSS como en Tailwind para máxima legibilidad moderna en tema oscuro.
* **Estilos & Layout Adaptable:** **TailwindCSS** + **Lucide Icons** con **Paneles Redimensionables (Splitters)** verticales y horizontales y escalado matemático dinámico con `ResizeObserver` para preservar siempre la proporción exacta del lienzo.
* **Gestión de Estado e Historial:** **Zustand** ([`src/store/useProjectStore.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts)) con pila de historial `pastProjects` / `futureProjects` (hasta 50 pasos) para soporte nativo de `Ctrl+Z` y `Ctrl+Y` y autoguardado automático en disco, con las limitaciones de cobertura y concurrencia indicadas en el estado verificado.
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
  * Ejecuta `ffmpeg` y `ffprobe` mediante procesos Node, resueltos por el `PATH`.
  * **Explorador del Sistema de Archivos (`/api/fs/browse`):** Permite navegar carpetas locales de Linux (`~/Vídeos`, `~/Música`, `~/Imágenes`, `~/Descargas`, etc.) en [`src/components/LocalFileBrowserModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/LocalFileBrowserModal.tsx).
  * **Streaming sin Copiar Archivos (`/api/media/stream`):** Sirve los archivos multimedia originales mediante *HTTP Range Requests* sin duplicarlos en disco.
  * **Inspección y Ondas (`/api/media/probe`):** Extrae duración, dimensiones, presencia de pista de audio, miniatura en base64 y picos de onda de audio (`waveform`).
  * **Pipeline de Exportación MP4 (`/api/export/start`, `/api/export/frames`, `/api/export/finalize`):** Recibe los fotogramas compuestos del Canvas, mezcla las pistas de audio activas con sus recortes (`atrim`), volúmenes, `afade` y desfases (`adelay`), codifica el `.mp4` (`h264_vaapi` o `libx264`, más `aac` cuando la mezcla de audio finaliza correctamente) en `~/.local/share/video-editor/exports/` y limpia los temporales tras una finalización correcta; la recuperación y limpieza ante errores tienen cobertura incompleta.

### 2.3. Capa de Escritorio Nativa (Tauri v2 + Standalone Node Server + WebKitGTK)
* **Tauri v2 ([`src-tauri/`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src-tauri/)):** Empaqueta la aplicación como binario nativo de escritorio para Linux, utilizando WebKitGTK como motor de visualización con consumo y latencia de arranque no medidos en esta revisión.
* **Servidor Independiente ESM ([`server/standaloneServer.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/standaloneServer.ts) $\rightarrow$ `dist-server/index.mjs`):** Empaquetado con `esbuild` en formato ESM autónomo que levanta los servicios locales de streaming, probe y codificación FFmpeg tanto en modo desarrollo de escritorio (`npm run desktop:dev`) como en producción (`npm run desktop:build`).
* **Arquitectura de Arrastre Universal ([`src/lib/timelineDrop.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/lib/timelineDrop.ts)):** Abstracción matemática desacoplada de la API de Drag & Drop de HTML5 (la cual presenta inconsistencias en WebKitGTK), manejando eventos nativos de ratón con resolución precisa de destinos de pistas y solapamiento.

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
* **Selección Múltiple y Recuadro Elástico (*Marquee Selection*):**
  * Estado global `selectedAssetIds` en Zustand.
  * Recuadro elástico por arrastre de ratón en zonas libres del cajón, con auto-scroll vertical y coordenadas de anclaje fijadas al contenido (`anchorContentY`).
  * Modificadores de teclado: `Ctrl` / `Cmd` para alternar medios individuales y `Shift` para selección aditiva.
  * Insignias visuales en tarjetas seleccionadas: anillo cian de 2px y checkmark `✓` en la esquina superior izquierda.
  * Cabecera contextual con contador `X selecc.` y accesos rápidos de un clic: botón `+` para inserción en lote, papelera para borrado masivo y `✕` para deseleccionar.
* **Arrastre Múltiple en Pila (*Multi-Asset Drag*) y Capa Fantasma ([`src/components/AssetDragLayer.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/AssetDragLayer.tsx)):**
  * Al arrastrar cualquier medio seleccionado, se arrastra todo el conjunto simultáneamente.
  * Previsualización fantasma en perspectiva (efecto baraja apilada) con ícono de capas, insignia `×N archivos` y duración acumulada total calculada en tiempo real.
  * Indicador de destino punteado en la línea de tiempo dimensionado exactamente a la duración combinada de todos los medios arrastrados.
* **Inserción Secuencial en Lote (`addAssetsToTimeline`):**
  * Al soltar el paquete sobre el timeline, hacer doble clic o presionar `+`, los medios se insertan de forma consecutiva (`t0`, `t0 + d1`, `t0 + d1 + d2...`).
  * Genera automáticamente las pistas de video, imagen y audio vinculadas necesarias, seleccionando de inmediato todos los clips recién colocados en la línea de tiempo.
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
* **Selección Múltiple y Recuadro Elástico (*Marquee Box*):**
  * Arrastre con botón izquierdo en zonas vacías de la línea de tiempo para crear un recuadro de selección cian que selecciona todos los clips intersectados.
  * Anclaje de coordenadas absoluto al contenido (`anchorContentX`, `anchorContentY`), manteniéndose invariante durante el auto-scroll horizontal y vertical.
  * Modificadores de teclado: `Shift + Clic` o `Ctrl + Clic` para alternar clips individuales en la selección.
* **Arrastre Sincronizado en Vivo (*Multi-Clip Dragging*):**
  * Al mover cualquier clip del grupo seleccionado, todos los demás clips se desplazan en perfecta sincronía.
  * Base inmutable `initialStarts` que erradica la acumulación exponencial de deltas (*compounding delta bug*).
* **Operaciones en Lote y Badges Contadores:**
  * Duplicación en bloque (`Ctrl+D`).
  * Eliminación masiva con tecla `Supr` / `Backspace` (incluyendo clips vinculados y limpieza automática de pistas que queden vacías).
  * Copiar, cortar y pegar múltiples clips (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`) preservando los desfases relativos exactos entre ellos al pegarse en el cabezal.
  * Insignias numéricas en la barra de herramientas: la papelera muestra badge rojo y el botón duplicar muestra badge cian con el conteo de clips seleccionados.
  * Menú contextual dinámico (*"Eliminar (3 clips)"*, *"Duplicar (3 clips)"*).
* **Corrección de Jerarquía de Capas en WebKitGTK (Tauri Linux):**
  * Regla de tiempo sticky superior elevada a `z-[35]` con `isolate` y `transform: translateZ(0)` para asegurar que las pistas y clips nunca queden dibujados por encima de la barra de tiempo al hacer scroll vertical.
* **Asignación Universal de Pistas sin Colisión (*Collision-Free Track Allocation*):**
  * Funciones [`isRangeCollidingWithTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L139) y [`findOrCreateAvailableTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L160) en el store central:
    * Al insertar texto, video, imagen o audio en un instante `startTime` con una duración dada, el editor verifica si la pista objetivo está ocupada en ese intervalo.
    * Si la pista está libre en ese tramo, la aprovecha eficientemente; si está ocupada, busca otra pista libre del mismo tipo o **crea automáticamente una nueva pista en la jerarquía correcta**:
      * **Texto:** Se apila **hacia arriba** (Pista Texto 1, 2, 3...) para sobreponerse en el lienzo visual.
      * **Video / Imagen:** Se apila **hacia arriba** (Pista Video 2, 3...) para crear efectos PiP (Picture-in-Picture) y superposiciones.
      * **Audio:** Se apila **hacia abajo** (Pista Audio 1, 2, 3...) permitiendo mezclas simultáneas de locución, música de fondo y efectos de sonido.
* **Protección de la Pista Principal Magnética ([`getMainVideoTrack`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts#L131)):** Identifica siempre la pista base (`Pista Video 1`) para el empaquetado secuencial magnético sin afectar las pistas superiores de superposición.
* **Vínculo Híbrido Video + Audio (`linkGroupId`):** Al arrastrar un video con sonido se crean las pistas de video y audio agrupadas. Pueden separarse o revincularse en cualquier momento con el botón **Separar/Vincular Audio**, clic derecho o `Ctrl+L`.
* **Fundidos y Transiciones por Solapamiento:** Al arrastrar un Clip B sobre el final de un Clip A en la misma pista se crea automáticamente la zona de cruce `(X)` con selector de transición. El inspector y el compositor usan identificadores incompatibles para algunas opciones (por ejemplo, `dipToBlack` frente a `fade-black`); la funcionalidad está parcialmente implementada.
* **Redimensionamiento Elástico de Medios Estáticos (Imágenes y Textos):** Los clips de imagen se insertan con una duración inicial estándar de 5 segundos pero no poseen límite artificial `maxDuration`. Al arrastrar sus manijas laterales (`|`), pueden estirarse o encogerse libremente en el timeline (hacia la derecha o hacia la izquierda) hasta un mínimo de seguridad de `0.4s` y un máximo de hasta 24 horas, con preservación de `sourceStart = 0` y compatibilidad nativa tanto en previsualización de Canvas como en exportación FFmpeg.
* **Marcadores de Entrada (`I`) y Salida (`O`):**
  * Atajos `I` (Entrada), `O` (Salida) y `Alt+X` (Limpiar rango), además de banderines arrastrables en la regla de tiempo.
  * Acota tanto la reproducción como el rango de tiempo exportado en [`src/components/ExportModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/ExportModal.tsx).

### 3.4. Lienzo Interactivo con Proporción Exacta y Gizmo ([`src/components/CanvasPreviewStage.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx))
* Auto-ajuste matemático del lienzo (`ResizeObserver` + `contain`) para mantener siempre la relación de aspecto exacta mientras se redimensionan los paneles laterales o la línea de tiempo.
* **Gizmo Interactivo:** Mover en $(X, Y)$ con guías magnéticas de centrado, escalar desde las 4 esquinas y rotar desde el tirador superior.

### 3.5. Sistema de Integridad de Medios y Re-vinculación Inteligente (Media Offline & Relink Engine)
* **Detección Asíncrona No Bloqueante:** Comprobación asíncrona al abrir proyectos y reescaneo manual (`/api/media/check-status`) que actualiza `offlineAssetIds`; detección en caliente pendiente.
* **Apertura Asistida al Cargar Proyecto:** Si al abrir un proyecto se detectan archivos movidos o eliminados, se abre automáticamente el modal de re-vinculación.
* **Renderizado Técnico "MEDIA OFFLINE":** Los clips desconectados dibujan una tarjeta técnica en Canvas 2D preservando posición espacial, rotación y escala.
* **Re-vinculación en Cascada con Explorador Interno:** Utiliza [`LocalFileBrowserModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/LocalFileBrowserModal.tsx) pre-posicionado en el directorio original e intenta revincular otros assets ya marcados offline por coincidencia de `asset.name` en la carpeta elegida.
* **Prevención en Exportación:** Alerta antes de codificar con FFmpeg si existen clips offline en la línea de tiempo, permitiendo solicitar revinculación o borrador; el borrador con video ausente presenta las limitaciones descritas arriba.

### 3.6. Atajos de Teclado Activos
* `Espacio`: Play / Pausa.
* `I` / `O` / `Alt + X`: Marcar Entrada (In), Marcar Salida (Out) y Limpiar rango I/O.
* `S` o `Ctrl + B`: Dividir (*Split*) clip en la posición de la aguja.
* `Ctrl + L` (o clic derecho en clip): Separar / Vincular audio y video.
* `Ctrl + C` / `Ctrl + X` / `Ctrl + V`: Copiar, Cortar y Pegar en la aguja (admite selección múltiple preservando desfases relativos).
* `Ctrl + D`: Duplicar clip o lote de clips seleccionados.
* `Ctrl + A`: Selección contextual (todos los medios si el cajón de biblioteca está activo; todos los clips si la línea de tiempo está activa).
* `Supr` o `Backspace`: Eliminar clips seleccionados (o medios seleccionados de la biblioteca si no hay clips seleccionados).
* `Shift + Clic` / `Ctrl + Clic`: Selección aditiva o alternada múltiple (tanto en timeline como en biblioteca).
* `Esc`: Deseleccionar clips y medios, cerrar modales o salir de pantalla completa.
* `Ctrl + Z` / `Ctrl + Y` (o `Ctrl + Shift + Z`): Deshacer y Rehacer.
* `Ctrl + /`: Abrir / Cerrar cajón lateral izquierdo de medios.
* `Ctrl + .`: Colapsar / Expandir pistas de la línea de tiempo.
* `Ctrl + Rueda`: Zoom horizontal en la línea de tiempo centrado bajo el cursor.

---

## 4. Estado de la Hoja de Ruta

Las marcas siguientes conservan el registro histórico de entregas. No certifican cierre funcional actual: fases 1–4, 6–8, 11 y 13 presentan limitaciones relevantes descritas arriba; fases 10 y 12 incluyen optimizaciones implementadas sin garantías de rendimiento revalidadas.

- [x] **Fase 1:** Base del Proyecto, Servidor Multimedia Local (FFmpeg) y Gestión de Proyectos. *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 2:** Biblioteca de Medios, Explorador de Archivos Linux, Generador de Textos e Historial Undo/Redo. *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 3:** Línea de Tiempo Multipista, Clips Vinculados (`linkGroupId`), Split/Trim y Solapamientos (Crossfades). *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 4:** Motor de Previsualización Canvas Unificado, Gizmo Interactivo, Paneles Redimensionables, Rango `I/O` y Exportación MP4. *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 5:** Rediseño UX/UI Moderno y Minimalista (Estética Carbón/Cian, Pistas Dinámicas sin Pistas por Defecto, Paneles Colapsables y Flotantes, Menú Contextual de Clic Derecho y Modo Pantalla Completa). *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 6:** Inspector Modular Contextual, Tipografía Variable Avanzada, Escala de Video (5-32) y Asignación de Pistas sin Colisiones. *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 7:** Integración Nativa de Escritorio con Tauri v2 y Standalone Node Server para Linux. *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 8:** Selección Múltiple y Operaciones en Lote en la Línea de Tiempo (Marquee Box, Arrastre Sincronizado y Z-Index WebKitGTK). *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 9:** Selección Múltiple, Arrastre en Pila e Inserción Secuencial en la Biblioteca de Medios. *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 10:** Optimización de Rendimiento y Renderizado Cero-Costo para WebKitGTK en Linux (RAF Throttling, Caché de Bounding Rects y Eliminación de Layout Thrashing). *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 11:** Sistema Universal de Keyframes para Video y Audio (Ver especificación detallada en [`docs/FASE_11.md`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/docs/FASE_11.md)). *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 12:** Visualización de Formas de Onda de Audio de Alta Definición en Línea de Tiempo (Ver especificación detallada en [`docs/FASE_12.md`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/docs/FASE_12.md)). *(Entrega registrada históricamente; véase el estado verificado)*
- [x] **Fase 13:** Detección de Media Offline, Advertencia Visual en Canvas/Timeline y Herramienta de Re-vinculación Inteligente (Ver especificación detallada en [`docs/FASE_13.md`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/docs/FASE_13.md)). *(Entrega registrada históricamente; véase el estado verificado)*

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
  * **Eliminación del "Seek Penalty" de HTML5:** Durante la exportación no se usa `<video>.currentTime`. El endpoint `/api/export/decode-clip-frames` decodifica cada clip de forma lineal y secuencial mediante FFmpeg (`image2pipe`), entregando fotogramas continuos como `ImageBitmap` en VRAM (`SequentialVideoFrameReader`) al compositor [`renderProjectFrameToCanvas`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx#L149) (reutilizando el compositor, con las limitaciones de fidelidad descritas en el estado verificado).
  * **Codificación Paralela con Pool de `OffscreenCanvas` y Stream Binario (`application/octet-stream`) al Pipe de GPU (`stdin -> image2pipe -> h264_vaapi`):**
    * En [ExportModal.tsx](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/ExportModal.tsx), un pool de `OffscreenCanvas` comprime lotes de fotogramas a JPEG binario en paralelo (`convertToBlob` asíncrono; sin Worker explícito de composición, sin conversión a texto Base64 ni `JSON.stringify`) y actualiza la UI una sola vez por lote.
    * En [mediaBackendPlugin.ts](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts), `/api/export/frames` recibe el bloque binario crudo y lo inyecta directamente al pipe `stdin` del proceso `ffmpeg` acelerado por GPU (`/dev/dri/renderD128` con selección de `libx264` y recuperación parcial ante fallo del pipe), sin escribir miles de archivos `.jpg` sueltos en disco.
  * **Experiencia Circular Minimalista de Exportación (Estilo WeTransfer):**
    * Al hacer clic en **Exportar**, el formulario en [ExportModal.tsx](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/ExportModal.tsx) se transforma en una tarjeta esbelta y centrada con un anillo circular estático orientado a las 12 en punto (`-rotate-90`) cuyo trazo cian (`#00d4e5`) se completa en sentido horario progresivo y fluido con `transition-[stroke-dashoffset] duration-300`, mostrando el porcentaje numérico grande en el centro (`58%`), el título `Exportando...`, el nombre del archivo y un botón píldora **`Cancelar`** (`/api/export/cancel` solicita detener el trabajo; la cobertura durante finalización y ante errores es incompleta).
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
  * **Re-vincular archivo...** *(destacado con ícono de enlace cuando el clip pertenece a un medio desconectado)*

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

---

## 7. Fase 7: Integración Nativa de Escritorio con Tauri v2 y Standalone Server

* **Arquitectura Híbrida Tauri v2 + Node Standalone:**
  * **Empaquetado Nativo (`src-tauri/`):** Configuración en Rust con Tauri v2 para compilar binarios nativos de escritorio para Linux (`.deb`, `.AppImage` o ejecutable binario).
  * **Backend Independiente ([`server/standaloneServer.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/standaloneServer.ts)):** Servidor Node empacado con `esbuild` en formato ESM (`dist-server/index.mjs`) que se ejecuta de forma autónoma; la cifra histórica de inicio inferior a 15 ms no se ha revalidado.
  * **Comandos de ciclo de vida (`package.json`):**
    * `npm run desktop:dev`: Compila el servidor independiente y levanta la ventana nativa de Tauri en modo desarrollo con Hot Module Replacement (HMR).
    * `npm run desktop:build`: Empaqueta el servidor y construye el instalador nativo de Linux.
* **Motor de Arrastre Universal ([`src/lib/timelineDrop.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/lib/timelineDrop.ts)):**
  * La API HTML5 Drag & Drop nativa presenta inconsistencias graves en WebKitGTK sobre Linux.
  * Se diseñó un sistema desacoplado de arrastre basado en eventos de puntero de bajo nivel (`mousedown`, `mousemove`, `mouseup`), calculando proyecciones geométricas precisas de solapamiento y destinos de pista tanto para clips individuales como para colecciones de archivos.

---

## 8. Fase 8: Selección Múltiple y Operaciones en Lote en la Línea de Tiempo

* **Estado de Selección Múltiple en Store:**
  * Array `selectedClipIds: string[]` junto al id del clip activo `selectedClipId: string | null`.
  * Acciones especializadas: `selectClip(clipId, mode: 'replace' | 'toggle' | 'add')`, `setSelectedClipIds(ids, primaryId)`, `selectAllClips()` y `clearClipSelection()`.
* **Caja de Selección Elástica (*Marquee Box*):**
  * Activación al arrastrar el botón izquierdo del ratón sobre cualquier área vacía del timeline o entre pistas.
  * **Ancla Invariante al Scroll:** Captura de coordenadas absolutas de contenido `anchorContentX` y `anchorContentY` al iniciar el clic, permitiendo que el auto-scroll vertical y horizontal expanda la selección sin desplazar el origen.
  * Pruebas de intersección de cajas alineadas a los ejes (AABB math) para seleccionar instantáneamente los clips tocados.
* **Arrastre en Vivo Determinista sin Compounding Delta:**
  * Mapeo estático inmutable `initialStarts: Record<string, number>` registrado al pulsar el ratón.
  * Durante el movimiento, `clip.startTime = initialStarts[id] + clampedDelta`, preservando las distancias relativas exactas y eliminando aceleraciones parabólicas o descalces.
* **Operaciones en Bloque:**
  * **Duplicar (`Ctrl+D`):** Clona todos los clips seleccionados y los coloca consecutivamente a la derecha.
  * **Borrado (`Supr` / `Backspace`):** Elimina el conjunto completo de clips seleccionados junto con sus audios vinculados y limpia pistas vacías.
  * **Copiar, Cortar y Pegar (`Ctrl+C`, `Ctrl+X`, `Ctrl+V`):** Guarda la matriz de clips con sus desfases relativos y los reproduce idénticamente pegados en la posición de la aguja.
  * **Insignias y Menú Contextual:** Conteo dinámico en botones de la barra superior y etiquetas actualizadas en el menú de clic derecho.
* **Corrección de Jerarquía de Capas en WebKitGTK (Tauri Linux):**
  * La regla de tiempo sticky se elevó a `z-[35]` con `isolate` y `transform: translateZ(0)`, resolviendo el bug visual de WebKitGTK donde las pistas con `z-20` se dibujaban sobre la regla durante el scroll.

---

## 9. Fase 9: Selección Múltiple, Arrastre en Pila e Inserción Secuencial en la Biblioteca de Medios

* **Gestión de Selección en Biblioteca:**
  * Estado `selectedAssetIds: string[]` con soporte para `Ctrl + Clic` (alternar) y `Shift + Clic` (agregar).
  * Marquee selection en la cuadrícula de medios con auto-scroll vertical.
  * Anillo cian y checkmark `✓` en cada elemento seleccionado.
  * Cabecera contextual con botón de inserción en lote `+`, borrado masivo de biblioteca y botón de deselección rápida `✕`.
* **Arrastre Múltiple en Pila (*Multi-Asset Drag*):**
  * Al iniciar el arrastre desde cualquier medio seleccionado, el sistema agrupa automáticamente todos los seleccionados.
  * Capa fantasma apilada en perspectiva ([`src/components/AssetDragLayer.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/AssetDragLayer.tsx)) con ícono de capas, insignia `×N` y duración acumulada total.
  * Cálculo dinámico del rectángulo de destino punteado en el timeline con ancho ajustado a la suma de duraciones (`sum(duration) * zoom`).
* **Inserción Secuencial Concatenada (`addAssetsToTimeline`):**
  * Función que recibe un arreglo de IDs e inserta los medios en serie continua (`t0`, `t0 + d1`, `t0 + d1 + d2...`).
  * Resuelve colisiones en cada tramo temporal creando pistas según corresponda.
  * Crea clips vinculados de audio para videos con sonido y selecciona automáticamente todos los nuevos clips creados en la línea de tiempo.

---

## 10. Fase 10: Optimización de Rendimiento para WebKitGTK / Linux

* **Diagnóstico histórico de Rendimiento en WebKitGTK (no revalidado):**
  * En Linux, WebKitGTK carece de los optimizadores de composición por GPU presentes en Chromium (Skia), por lo que efectos como `backdrop-filter: blur(...)` o `box-shadow` difusos de 15px en elementos que cambian de tamaño provocan caídas drásticas de frames (a ~15-20 FPS) debido a rasterización por CPU.
* **Reducción de Efectos Pesados:**
  * Marquee boxes limpios con borde de 1px y relleno semitransparente (`border-[#00d4e5] bg-[#00d4e5]/20`) sin sombras difusas.
  * Sustitución de `backdrop-blur-xs` en tarjetas por fondo oscuro puro semitransparente `bg-black/85`.
  * Restricción de transiciones a `transition-colors duration-75` para evitar interpolación continua de sombras durante la selección.
* **Actualización Directa en el DOM (Cero Re-renderizados de React):**
  * La caja elástica del cajón se manipula directamente mediante `drawerMarqueeRef.current.style`, evitando que [`EditorWorkspace.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/EditorWorkspace.tsx) se re-renderice en cada píxel de movimiento.
* **Erradicación del *Layout Thrashing*:**
  * Las posiciones de las tarjetas se miden una sola vez al inicio del clic (`mousedown`).
  * Las pruebas de intersección se resuelven exclusivamente mediante comparaciones numéricas en memoria RAM, sin invocar `getBoundingClientRect()` ni `querySelectorAll()` dentro del bucle de movimiento.
* **Sincronización con `requestAnimationFrame` (RAF Throttling):**
  * Los eventos de ratón se procesan como máximo una vez por fotograma de pantalla (60 Hz / 120 Hz).
  * Diff previo de selección: el store de Zustand solo es notificado si el conjunto de IDs seleccionados cambió realmente respecto al fotograma anterior, con el objetivo histórico de fluidez a 60/120 FPS en Tauri, sin medición revalidada.

---

## 11. Fase 11: Sistema Universal de Keyframes para Video y Audio (Implementación con limitaciones)

* **Descripción:**
  Sistema unificado de animación y automatización paramétrica tanto para video (posición $X/Y$, escala, rotación, opacidad) como para audio (volumen). Se apoya en una función matemática pura de evaluación temporal (`keyframeEngine.ts`), coordenadas relativas al clip (`timeOffset`), curvas de interpolación (`linear`, `ease-in`, `ease-out`, `ease-in-out`, `hold`), integración con el inspector mediante rombos interactivos (`◇` / `◆`), renderizado en Canvas 2D con Gizmo interactivo y auto-keyframing, pipeline de audio en vivo mediante elementos HTML de audio sincronizados con el playhead y exportación mediante expresiones dinámicas de FFmpeg (`volume=eval=frame`). En la línea de tiempo, los clips muestran marcadores romboidales interactivos (`◆`) y envolventes de volumen de tipo *rubber-band* directamente sobre la forma de onda de alta resolución.
* **Capacidades presentes en el código (con límites indicados arriba):**
  1. **Motor Matemático Puro e Inmutable (`keyframeEngine.ts`):** Evaluación temporal eficiente con búsqueda binaria $O(\log N)$ para listas extensas de keyframes y deduplicación automática con ventana de tolerancia de 33ms (1 fotograma a 30 FPS).
  2. **Acciones del Store Zustand e Historial Deshacer/Rehacer (`useProjectStore.ts`):** Mutaciones atómicas inmutables con acciones integradas en Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) para inserción, eliminación y limpieza de keyframes.
  3. **Composición Visual Canvas 2D y Auto-Keyframing en Gizmo (`CanvasPreviewStage.tsx`):** Interpolación continua en tiempo real de transformaciones y auto-inserción de keyframes en el cabezal al interactuar con el Gizmo o controles cuando una propiedad ya está animada.
  4. **Pipeline Acústico de Audio en Vivo y Exportación FFmpeg (`mediaBackendPlugin.ts` & `ExportModal.tsx`):** Actualización de `HTMLAudioElement.volume` sincronizada con el playhead y generación de expresiones matemáticas de volumen compatibles con FFmpeg (`volume=eval=frame`), con limitaciones de conservación de la curva al exportar rangos In/Out.
  5. **Controles Profesionales en el Inspector (`KeyframeControlGroup.tsx`):** Navegación temporal precisa (`‹` y `›`), rombo interactivo reactivo (`◇` / `◆`) para Opacidad, Escala, Posición $X/Y$ vinculada y Rotación en `TransformSection`, y para Volumen en `AudioInspector`.
  6. **Marcadores Romboidales y Envolvente Rubber-Band en el Timeline (`ClipKeyframeMarkers.tsx` & `VolumeRubberBand.tsx`):** Visualización de rombos cian (`◆`) en clips, resaltado brillante activo con el cabezal, clic directo para salto temporal, y curva continua de volumen SVG interactiva trazada sobre la forma de onda de audio con creación de keyframes por doble clic.
  7. Especificación detallada y registro de etapas documentados en [`docs/FASE_11.md`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/docs/FASE_11.md).
* **Refinamientos y Mejoras de Usabilidad Post-Implementación:**
  * **Preservación Acústica de la Curva en Doble Clic:** Corrección del orden de argumentos en `evaluatePropertyAtTime` en [`VolumeRubberBand.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/timeline/VolumeRubberBand.tsx) (`defaultVolume` antes de `timeOffset`), erradicando picos de volumen accidentales (como 934% al cliquear en 9.34s) y asegurando que un nuevo punto adopte fielmente el nivel de volumen interpolado en ese instante.
  * **Alineación Milimétrica y Supresión de Desfases:** Eliminación del margen `inset-x-1` (4px) en los contenedores de `VolumeRubberBand` y `AudioWaveformCanvas`, sincronizando la línea del cabezal de reproducción exactamente con el centro del rombo en la envolvente.
  * **Unicidad de Rombos en Clips de Audio (Cero Duplicados):** `ClipKeyframeMarkers` se reserva exclusivamente para propiedades visuales en clips de video, imagen y texto. En clips de audio, el nodo romboidal vive integrado exclusivamente en la curva de volumen que sube y baja, replicando el estándar ergonómico de Premiere Pro y DaVinci Resolve.
  * **Desacople Visual de Audio en Pistas de Video:** Supresión de la franja secundaria de onda de audio de 12px al pie de los clips de video. Las pistas de video preservan la visibilidad limpia de sus miniaturas (*filmstrip*) y marcadores visuales, delegando la representación acústica a la pista de audio vinculada.

---

## 12. Fase 12: Visualización de Formas de Onda de Audio de Alta Definición (Implementada con límites de muestreo y tamaño)

* **Descripción:**
  Reemplazo de la representación preliminar de 60 barras estáticas `<div>` por un sistema profesional de renderizado en `<canvas>` 2D de alta resolución (HiDPI) alimentado por un muestreo de alta densidad en el backend (objetivo de 50 picos/segundo, mínimo 120 y máximo 15.000; PCM acumulado mediante `execFile`). La visualización proyecta la ventana de `sourceStart` y `duration` al ancho del clip según el zoom; su detalle está limitado por los picos disponibles y el tamaño del canvas.
* **Objetivos Principales (criterios de diseño, sin garantía de precisión absoluta o rendimiento ilimitado):**
  1. **Fidelidad y Precisión Temporal al Recortar:** Proyección exacta de la ventana recortada de audio `[sourceStart ... sourceStart + duration]` sobre la forma de onda, permitiendo cortes quirúrgicos al compás de la música o la locución.
  2. **Escalabilidad Dinámica al Zoom:** Adaptación continua del nivel de detalle visual a cualquier factor de zoom sin deformar la onda ni provocar pixelación en pantallas Retina/HiDPI.
  3. **Reducción de nodos DOM en WebKitGTK / Linux:** Supresión de cientos de nodos HTML `<div>` del DOM, reemplazándolos por un Canvas 2D HiDPI por clip, cuyo tamaño crece con duración y zoom; no se garantiza aceleración efectiva ni costo nulo.
  4. **Sinergia con Fase 11 (Keyframes):** Servir como lienzo base idóneo para superponer las líneas de envolvente de volumen (*rubber-bands*) y los nodos romboidales de keyframes en clips de audio.
  5. Especificación técnica y algoritmo de trazado documentados en [`docs/FASE_12.md`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/docs/FASE_12.md).

---

## 13. Fase 13: Detección de Media Offline, Advertencia Visual y Re-vinculación Inteligente (Implementación con limitaciones)

* **Descripción:**
  Sistema integral de detección de integridad de medios y re-vinculación asistida para archivos movidos, renombrados o eliminados localmente del disco. Su objetivo original es evitar ausencias silenciosas; implementa señalización técnica en la línea de tiempo y la biblioteca, una tarjeta de advertencia cinematográfica "MEDIA OFFLINE" renderizada directamente en el motor de Canvas 2D, una herramienta modal de re-vinculación asistida por el explorador interno de la aplicación ([`LocalFileBrowserModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/LocalFileBrowserModal.tsx)) con búsqueda en cascada por coincidencia de nombre entre assets ya marcados offline, y protección preventiva en la exportación de video.
* **Capacidades presentes en el código (con límites indicados arriba):**
  1. **Backend No Bloqueante de Comprobación y Re-vinculación (`server/mediaBackendPlugin.ts`):**
     * Endpoint `/api/media/check-status`: Comprobación masiva y asíncrona mediante `fs.promises.stat`, sin medición revalidada de latencia o saturación.
     * Endpoint `/api/media/relink`: Inspección técnica del nuevo archivo mediante FFprobe para actualizar metadatos (dimensiones, duración, fps, miniatura y forma de onda) preservando intactos los IDs de assets y clips.
  2. **Store Central y Detección Reactiva (`src/store/useProjectStore.ts`):**
     * Estado reactivo `offlineAssetIds: string[]`, `isRelinkModalOpen: boolean` y `relinkTargetAssetId: string | null`.
     * Ejecución automática de `checkProjectMediaStatus(true)` al abrir proyectos (`openProject`), desplegando de inmediato el modal de re-vinculación si se detectan ausencias.
     * Acción atómica `relinkAsset(assetId, newPath, autoScanSiblings)` con auto-escaneo en cascada: al re-vincular un archivo, comprueba rutas candidatas en la carpeta seleccionada usando `asset.name`; los reprobes fallidos pueden quedar sin resolver.
  3. **Señalización Visual Cinematográfica en Interfaz:**
     * **Línea de Tiempo ([`src/components/TimelinePanel.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/TimelinePanel.tsx)):** Clips con medios offline reciben borde de advertencia bermellón (`border-red-500/80`), fondo carbón oscuro técnico (`bg-[#38161c]`), badge `⚠️ Offline` junto al nombre y opción contextual *"Re-vincular archivo..."*.
     * **Biblioteca de Medios ([`src/components/EditorWorkspace.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/EditorWorkspace.tsx)):** Banner superior de advertencia *"⚠️ X archivo(s) no encontrado(s) — [Re-vincular]"*, badge `⚠️ Offline` en miniaturas y botón directo `[🔗]` al pasar el cursor.
  4. **Cartel Técnico "MEDIA OFFLINE" en Canvas 2D ([`src/components/CanvasPreviewStage.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx)):**
     * En lugar de una pantalla negra vacía o fallos de renderizado, `drawSingleClipToContext` dibuja una tarjeta de aviso técnico con estética de monitor de estudio:
       * Contenedor carbón `#141518` con bordes redondeados y contorno bermellón `#ef4444`.
       * Franja superior de peligro `#dc2626`.
       * Título `⚠ MEDIA OFFLINE` en tipografía TikTok Sans negrita.
       * Nombre del archivo y última ruta registrada con truncado inteligente en píxeles.
       * Leyenda de ayuda: *"Clic derecho en el clip para re-vincular"*.
       * Respeta 100% las transformaciones espaciales del clip (posición $X, Y$, escala y rotación en el lienzo).
  5. **Modal de Re-vinculación Integrado ([`src/components/RelinkModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/RelinkModal.tsx) & [`src/components/LocalFileBrowserModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/LocalFileBrowserModal.tsx)):**
     * Componente modal limpio con estética *glassmorphism* que lista los archivos desconectados y permite localizarlos con un clic.
     * Integración directa con el explorador nativo interno de VOSTOK (`LocalFileBrowserModal`) pre-posicionado en la carpeta de origen (`path.dirname(asset.path)`).
     * Casilla activa por defecto: `☑ Buscar automáticamente otros archivos faltantes en la misma carpeta`.
     * Retroalimentación visual instantánea con reporte de cantidad de archivos recuperados en cascada y pantalla de confirmación exitosa cuando no quedan ausencias.
  6. **Protección Preventiva en Exportación ([`src/components/ExportModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/ExportModal.tsx)):**
     * Consulta de los clips dependientes de la lista conocida `offlineAssetIds`, sin revalidación de disco antes de exportar.
     * Banner informativo en la configuración con botón de re-vinculación directa.
     * Al pulsar *"Exportar"*, despliega un diálogo de confirmación preventiva con 3 opciones claras: *"Re-vincular archivos ahora"*, *"Exportar de todos modos (Borrador)"* y *"Volver a la configuración"*.
  7. Especificación técnica completa y registro de etapas documentados en [`docs/FASE_13.md`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/docs/FASE_13.md).

---

## 14. Fase 14: Base de verificación aislada y herramientas explícitas (Implementada y Verificada)

* **Descripción:**
  Establecimiento de una infraestructura reproducible y aislada de pruebas unitarias y de integración para el backend y el store, junto con la declaración directa de las herramientas de compilación. Elimina la ejecución de scripts sobre rutas y datos de usuario y previene regresiones mediante guardas activas.
* **Capacidades implementadas y verificadas:**
  1. **Herramienta de Build Directa (F24 Resuelto):**
     * `esbuild` declarado explícitamente en `devDependencies` de `package.json` y sincronizado en el lockfile (`^0.25.12`).
     * Instalación limpia (`npm ci`) y compilación del servidor (`npm run build:server`) comprobadas de forma reproducible en entorno limpio y aislado.
  2. **Aislamiento Configurable del Backend y Red (F22 Base):**
     * Módulo `server/storageConfig.ts` con redirección vía variables de entorno (`VIDEO_EDITOR_TEST_DATA_DIR`, `VIDEO_EDITOR_TEST_CACHE_DIR`, `VIDEO_EDITOR_TEST_SANDBOX_ROOT`).
     * Modo de prueba estricto (`VIDEO_EDITOR_TEST_MODE='1'`) que aborta el arranque del backend ante configuraciones incompletas o sospechosas, impidiendo cualquier acceso silencioso a `~/.local/share/video-editor`.
     * Guardas de red en `tests/helpers/network.ts`: bloqueo de puertos TCP ajenos (incluido el puerto de producción `45173`) y reescritura de peticiones HTTP del store a puertos efímeros locales.
  3. **Runner y Suite Automatizada:**
     * Runner en `scripts/run-tests.mjs` invocable mediante `npm test` y comprobación estática con `npm run test:types`.
     * Migración completa de los scripts históricos de keyframes y audio (`stage1` a `stage6` y `verify_phase12`) a pruebas estructuradas bajo `tests/` con comprobación de efectos finales en disco y renderizado SSR.
  4. Especificación técnica y registro de la fase documentados en [`docs/FASE_14.md`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/docs/FASE_14.md).

---

## 15. Fase 15: Blindaje Práctico de Persistencia, Fidelidad Visual y Exportación (Implementada y Verificada)

* **Descripción:**
  Conjunto de mejoras quirúrgicas enfocadas en la integridad del trabajo del usuario y la correspondencia exacta entre la previsualización del editor y el video exportado.
* **Capacidades implementadas y verificadas:**
  1. **Persistencia Atómica y Cola Monotónica de Autoguardado (F01, F03, F16):**
     * En [`server/mediaBackendPlugin.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts), `POST /api/projects` valida la estructura base y escribe primero en un archivo temporal (`project.json.<pid>.<ts>.tmp`) antes de ejecutar `fs.renameSync` atómico sobre `project.json`, evitando corrupción por cierres abruptos. `DELETE /api/projects/:id` valida estrictamente el identificador y la contención en `PROJECTS_DIR`.
     * En [`src/store/useProjectStore.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/store/useProjectStore.ts), `enqueueProjectSave` serializa las peticiones de guardado y utiliza un contador de revisión (`latestSaveRevision`) para que una respuesta HTTP anterior nunca sobrescriba ediciones posteriores en memoria ni en disco.
  2. **Catálogo Unificado de Transiciones y Audio Vinculado en Inspector (F07, F08, F14):**
     * En [`src/components/inspector/VideoInspector.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/inspector/VideoInspector.tsx) y [`src/components/CanvasPreviewStage.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx), se unificaron los identificadores de transición con `TransitionType` (`crossfade`, `fade-black`, `slide-left`, `wipe-left`, `wipe-right`, `zoom`) y se añadió `normalizeTransitionType` para compatibilidad con proyectos antiguos (`dipToBlack`, `slideLeft`, `wipe`).
     * La pestaña de audio de `VideoInspector` resuelve automáticamente el clip de audio vinculado (`linkGroupId`), y el pool de elementos multimedia invalida y recrea el recurso si cambia `asset.url` tras re-vincular.
  3. **Fidelidad de Exportación en 720p, Imágenes en Tauri y Errores de Audio (F09, F10, F12, F18):**
     * En [`src/components/CanvasPreviewStage.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/CanvasPreviewStage.tsx), `getCanvasResolutionScale` escala proporcionalmente posiciones $(X, Y)$, tipografías, bordes, espaciado y tarjetas técnicas al renderizar en resoluciones distintas a 1080p (como 720p).
     * En [`src/components/ExportModal.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/ExportModal.tsx), la carga de imágenes usa `apiUrl(asset.url)` para funcionar en Tauri, se omiten pistas ocultas o medios marcados offline del decodificador FFmpeg para permitir exportar borradores con el cartel técnico, y se cancela el trabajo en el backend si ocurre un fallo a mitad del proceso.
     * En [`server/mediaBackendPlugin.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts), `/api/export/finalize` reporta un error HTTP 500 explícito si falla la mezcla de audio con FFmpeg en lugar de entregar silenciosamente un MP4 sin sonido.
     * **Soporte de Transparencia (Canal Alpha) en Exportación de Videos (`.mov` ProRes 4444 / `yuva*` / `rgba`):** `/api/export/decode-clip-frames` detecta automáticamente mediante `ffprobe` si el video posee canal Alpha (`isAlphaPixelFormat` / `ProRes 4444`) y conmuta la decodificación `image2pipe` a `PNG` (`rgba`) anunciando `X-Frame-Mime: image/png` (manteniendo `MJPEG` para videos opacos). `SequentialVideoFrameReader` (`extractNextImageFrameFromBuffer`) delimita los paquetes PNG hasta el bloque `IEND` y construye los `ImageBitmap` con transparencia intacta para el compositor Canvas.
  4. **Suite de Regresión Automatizada:**
     * Verificado mediante [`tests/projects/practical-hardening-phase15.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/projects/practical-hardening-phase15.test.ts) (23 suites, 87 tests en total sin fallos).
