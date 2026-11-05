El proyecto tiene una implementación sustancial, pero el código no respalda las afirmaciones de funcionamiento “100% completado” de la documentación. Los principales riesgos afectan la conservación de proyectos, las referencias a medios y la fidelidad de la exportación.

La auditoría fue exclusivamente de lectura sobre el árbol de trabajo actual, incluidos sus cambios sin confirmar, con HEAD en 4564f63. No modifiqué archivos ni ejecuté pruebas, compilaciones, instalaciones o peticiones a la API.

A. Resumen ejecutivo

La arquitectura real es React/TypeScript + Zustand + servidor HTTP Node + procesos FFmpeg, dentro de una envoltura Tauri. Rust inicia y supervisa parcialmente el servidor; no implementa el motor de edición ni el procesamiento multimedia.

Hay decisiones aprovechables: modelo explícito de proyectos, motor matemático de keyframes separado, compositor visual compartido entre preview y exportación, inspectores divididos por responsabilidad y streaming desde archivos originales.

Sin embargo, encontré defectos verificables por inspección estática:

- Un identificador vacío en el endpoint de eliminación puede resolver al directorio que contiene todos los proyectos.
- La API local carece de autenticación, permite cualquier origen y sirve archivos desde rutas arbitrarias.
- Las respuestas de autoguardado pueden sustituir ediciones más recientes.
- Reimportar un medio puede dejar clips referenciando un asset eliminado.
- La división de clips y la exportación por rango no conservan correctamente ciertas animaciones.
- Hay transiciones del inspector que el compositor no reconoce.
- La exportación tiene problemas en imágenes dentro de Tauri, borradores con video offline, recuperación ante fallos GPU y notificación de errores de audio.

Mi evaluación es una aplicación en desarrollo con funcionalidades amplias, pero con deuda de integridad y recuperación que debe resolverse antes de considerarla fiable para proyectos importantes. No evalué su funcionamiento mediante ejecución.

B. Arquitectura verificada

Los documentos de contexto encontrados fueron README.md (README.md), CONTEXTO_PROYECTO.md (CONTEXTO_PROYECTO.md) y los tres documentos de docs/: fases 11, 12 y 13. No encontré AGENTS.md en las ubicaciones consultadas.

| Subsistema | Implementación verificada |
|---|---|
| Entrada frontend | index.html → src/main.tsx → App.tsx. React monta StrictMode; App consulta estado del sistema y proyectos, y alterna entre inicio y editor. |
| Interfaz | HomeView, EditorWorkspace, TimelinePanel, inspectores, explorador local y modales de exportación/revinculación. |
| Modelo y estado | src/types/project.ts define assets, pistas, clips y keyframes. useProjectStore.ts concentra edición, selección, transporte, historial, importación, revinculación y persistencia. |
| Persistencia | HTTP POST /api/projects guarda JSON en ~/.local/share/video-editor/projects/<id>/project.json. El historial permanece en memoria, con hasta 50 snapshots. |
| Preview visual | CanvasPreviewStage.tsx mantiene elementos multimedia por clip y compone video, imágenes y texto en Canvas 2D. |
| Preview de audio | Pool de HTMLAudioElement, sincronizado con el playhead. Ajusta currentTime y volume. No encontré AudioContext ni GainNode. |
| Edición temporal | El store implementa inserción, magnetismo, movimiento, trim, split, duplicado y portapapeles. timelineDrop.ts combina geometría DOM con consultas al store. |
| Animación | keyframeEngine.ts evalúa cinco interpolaciones y genera expresiones de volumen para FFmpeg. |
| Backend | mediaBackendPlugin.ts implementa exploración, proyectos, medios, caché, streaming y exportación. Se usa como middleware Vite y desde standaloneServer.ts. |
| Integración nativa | main.rs configura variables WebKit/GStreamer. lib.rs localiza Node y el bundle del servidor, inicia el proceso y lo termina al cerrar la ventana. |
| Verificación | Siete scripts TypeScript: seis de keyframes y uno de formas de onda. No encontré una suite E2E de fase 13 ni configuración CI en el inventario inspeccionado. |

┌───────────────────────────────────────┐
│ Tauri / Rust                          │
│                                       ├──inicia proceso────────────────────┐
└───────────────────────────────────────┘                                    │
                                                                             │
                                                                             │
┌───────────────────────────────────────┐                                    │
│ Node HTTP · 127.0.0.1:45173           │                                    │
│                                       ├◄───────────────────────────────────┘
│                                       ├──────────────────────────────────────────┐
└───────────────────────────────────────┘                                          │
                                                                                   │
                                                                                   │
┌───────────────────────────────────────┐                                          │
│ React · vistas e inspectores          │                                          │
│                                       ├◄─────────────────────────────────────┐   │
└───────────────────────────────────────┘                                      │   │
                                                                               │   │
                                                                               │   │
┌───────────────────────────────────────┐                                      │   │
│ Zustand · proyecto e historial        │                                      │   │
│                                       ├◄─────────────────────────────────────┘   │
│                                       ├──HTTP JSON─────────────────────────────┐ │
│                                       ├────────────────────────────────────────╪─╪───────┐
│                                       ├────────────────────────────────────────╪─╪───────╪─┐
└───────────────────────────────────────┘                                        │ │       │ │
                                                                                 │ │       │ │
                                                                                 │ │       │ │
┌───────────────────────────────────────┐                                        │ │       │ │
│ API multimedia                        │                                        │ │       │ │
│                                       ├◄───────────────────────────────────────┘ │       │ │
│                                       ├◄─────────────────────────────────────────┘       │ │
│                                       ├◄───────────────────────────────────────────┐     │ │
│                                       ├────────────────────────────────────────────╪─┐   │ │
│                                       ├────────────────────────────────────────────╪─╪─┐ │ │
│                                       ├◄───────────────────────────────────────────╪─╪─╪─╪─╪───┐
└───────────────────────────────────────┘                                            │ │ │ │ │   │
                                                                                     │ │ │ │ │   │
                                                                                     │ │ │ │ │   │
┌───────────────────────────────────────┐                                            │ │ │ │ │   │
│ Vite · modo navegador                 │                                            │ │ │ │ │   │
│                                       ├────────────────────────────────────────────┘ │ │ │ │   │
└───────────────────────────────────────┘                                              │ │ │ │   │
                                                                                       │ │ │ │   │
                                                                                       │ │ │ │   │
┌───────────────────────────────────────┐                                              │ │ │ │   │
│ Proyectos JSON y archivos locales     │                                              │ │ │ │   │
│                                       ├◄─────────────────────────────────────────────┘ │ │ │   │
└───────────────────────────────────────┘                                                │ │ │   │
                                                                                         │ │ │   │
                                                                                         │ │ │   │
┌───────────────────────────────────────┐                                                │ │ │   │
│ Procesos FFmpeg / FFprobe             │                                                │ │ │   │
│                                       ├◄───────────────────────────────────────────────┘ │ │   │
│                                       ├──MJPEG de clips──────────────────────────────────╪─╪─┐ │
│                                       ├──────────────────────────────────────────────────╪─╪─╪─╪─┐
└───────────────────────────────────────┘                                                  │ │ │ │ │
                                                                                           │ │ │ │ │
                                                                                           │ │ │ │ │
┌───────────────────────────────────────┐                                                  │ │ │ │ │
│ Canvas 2D + elementos HTML multimedia │                                                  │ │ │ │ │
│                                       ├◄─────────────────────────────────────────────────┘ │ │ │ │
└───────────────────────────────────────┘                                                    │ │ │ │
                                                                                             │ │ │ │
                                                                                             │ │ │ │
┌───────────────────────────────────────┐                                                    │ │ │ │
│ ExportModal                           │                                                    │ │ │ │
│                                       ├◄───────────────────────────────────────────────────┘ │ │ │
│                                       ├◄─────────────────────────────────────────────────────┘ │ │
│                                       ├──composición Canvas y lotes JPEG───────────────────────┘ │
└───────────────────────────────────────┘                                                          │
                                                                                                   │
                                                                                                   │
┌───────────────────────────────────────┐                                                          │
│ MP4 final                             │                                                          │
│                                       ├◄─────────────────────────────────────────────────────────┘
└───────────────────────────────────────┘

Hay dos rutas de acceso:

- Navegador/Vite: URLs relativas al servidor Vite, que incorpora el middleware.
- Tauri: apiUrl() dirige las peticiones a http://127.0.0.1:45173.

No encontré comandos de aplicación registrados mediante #[tauri::command]/invoke_handler, ni eventos Tauri de dominio. La comunicación de edición es HTTP. El evento nativo WindowEvent::Destroyed se utiliza para terminar el backend.

La exportación activa decodifica clips con FFmpeg a MJPEG, construye ImageBitmap, compone fotogramas mediante un pool de ocho canvases y envía JPEG binario al codificador. Posteriormente mezcla audio. El uso de OffscreenCanvas aquí no demuestra que toda la composición ocurra fuera del hilo principal.

Las versiones registradas en los lockfiles incluyen React 18.3.1, Zustand 5.0.16, Vite 6.4.5, TypeScript 5.6.3, Tauri Rust 2.12.5 y CLI/API JavaScript 2.12.4. Cargo.toml exige Rust 1.90 y edición 2024. Son versiones declaradas/resueltas; no comprobé las instalaciones efectivas ni su compatibilidad ejecutando el proyecto.

C. Hallazgos técnicos

“Confirmado” significa que el mecanismo está demostrado por el código inspeccionado, no que haya reproducido el fallo ejecutando la aplicación. “Probable” identifica consecuencias dependientes de carga, hardware o temporización.

| ID / Severidad | Archivo y evidencia concreta | Explicación e impacto potencial | Recomendación | Confianza |
|---|---|---|---|---|
| F01 · Crítica | Backend:498 (server/mediaBackendPlugin.ts:498). El DELETE acepta /api/projects/, sanea el sufijo y ejecuta rmSync(path.join(PROJECTS_DIR, safeId), {recursive:true}). | Con sufijo vacío, safeId === '' y la ruta resultante es PROJECTS_DIR. Puede eliminar todos los proyectos. La confirmación del frontend no protege el endpoint. | Rechazar IDs vacíos o inválidos; verificar que la ruta sea un proyecto concreto y nunca la raíz; considerar papelera recuperable. | Confirmado |
| F02 · Alta | Backend:283 (server/mediaBackendPlugin.ts:283) permite origen, métodos y cabeceras generales. Streaming:1216 (server/mediaBackendPlugin.ts:1216) acepta una ruta y sirve su contenido. | No hay autenticación ni autorización de rutas. Un cliente con acceso al servicio puede leer archivos accesibles al usuario y operar sobre proyectos. Escuchar en loopback limita la exposición de red, pero no identifica al cliente autorizado. | Autenticación por sesión/instancia, validación de origen y host, autorización explícita de archivos y límites de peticiones. Revisar además csp: null. | Confirmado; explotación desde cada navegador no probada |
| F03 · Alta | Store:866 (src/store/useProjectStore.ts:866) y commitProjectUpdate, líneas 884–913: después del await, asignan currentProject: saved sin revisar ID o revisión. Undo/redo repiten el patrón. | Una respuesta anterior puede reemplazar una edición posterior o incluso el proyecto abierto después. Los sliders y campos disparan múltiples guardados. Puede perderse trabajo y desincronizarse el historial. | Serializar persistencia por proyecto, introducir revisiones y aplicar respuestas solo a la revisión correspondiente. Evitar reemplazar el documento editable con una respuesta antigua. | Confirmado |
| F04 · Alta | Importación:619 (server/mediaBackendPlugin.ts:619) guarda medios importados por buffer en TEMP_CACHE_DIR. Limpieza:319 (server/mediaBackendPlugin.ts:319) elimina ese directorio completo. | Los proyectos conservan referencias a archivos que la interfaz permite borrar como “caché”. La limpieza puede eliminar la copia que el proyecto utiliza de un medio importado y también afectar trabajos activos. | Separar medios importados persistentes, muestras y temporales de exportación. Limpiar por propiedad y referencias, protegiendo trabajos activos. | Confirmado |
| F05 · Alta | Store:1044 (src/store/useProjectStore.ts:1044): genera IDs nuevos y elimina assets anteriores por coincidencia de path. Patrón repetido en importación y muestras. | Los clips conservan el assetId anterior. Reimportar el mismo archivo puede dejar referencias huérfanas, aunque el archivo siga existiendo. La comprobación offline recorre assets, por lo que no detecta necesariamente estos clips. | Actualizar metadatos conservando el ID existente; validar integridad de todas las referencias al modificar la biblioteca. | Confirmado |
| F06 · Alta | Split:2031 (src/store/useProjectStore.ts:2031) copia ...clip a ambos fragmentos sin transformar keyframes. Trim tampoco los ajusta. Exportación:515 (src/components/ExportModal.tsx:515) elimina keyframes fuera del rango I/O. | Split reinicia la animación del fragmento derecho y puede dejar puntos fuera de duración. En exportaciones parciales se pierden puntos que determinan la interpolación dentro del rango. Cambian animaciones y volumen. | Definir semántica temporal común para split, trim e I/O; preservar la evaluación de la curva original con el desplazamiento temporal adecuado, incluyendo easing. | Confirmado |
| F07 · Alta | VideoInspector:13 (src/components/inspector/VideoInspector.tsx:13) ofrece dipToBlack, slideLeft, wipe; línea 71 fuerza as any. Compositor:330 (src/components/CanvasPreviewStage.tsx:330) espera otros identificadores. | Esos valores no coinciden con fade-black, slide-left, wipe-left/right. Durante un solapamiento no se ejecuta ninguna rama de dibujo para esa pista. Afecta preview y exportación. | Catálogo único tipado con TransitionType, retirar el cast y añadir manejo explícito de valores inválidos y migración de proyectos afectados. | Confirmado |
| F08 · Alta | Pool multimedia:532 (src/components/CanvasPreviewStage.tsx:532) solo crea elementos cuando no existe clip.id. Revinculación:1258 (src/store/useProjectStore.ts:1258) cambia el asset conservando IDs. | Tras revincular, los elementos existentes siguen apuntando a la URL anterior. Además, backend/store no comparan el tipo anterior con el nuevo ni reconcilian maxDuration de los clips. Puede anunciarse recuperación sin restaurar reproducción o aceptarse un reemplazo incompatible. | Invalidar/recrear recursos cuando cambie su fuente; validar compatibilidad y revisar límites de recorte conservando IDs y edición. | Confirmado |
| F09 · Alta | ExportModal:366 (src/components/ExportModal.tsx:366) asigna img.src = asset.url. El backend genera /api/media/stream?..., mientras el preview utiliza apiUrl(asset.url). | Dentro de Tauri la URL relativa no apunta al servidor Node de 45173. El error de imagen se resuelve silenciosamente y el dibujo fallido se captura. Puede producir una exportación sin imágenes. | Aplicar el mismo resolvedor de URLs que el preview y tratar fallos de carga según una política explícita. | Confirmado para assets con URL relativa |
| F10 · Alta | ExportModal:418 (src/components/ExportModal.tsx:418) intenta decodificar cada video activo sin excluir offline. reader.start() lanza error ante HTTP fallido; backend:710 (server/mediaBackendPlugin.ts:710) devuelve 404 si falta el archivo. | “Exportar de todos modos” con video ausente falla antes de que el compositor dibuje la tarjeta offline. También se decodifican videos de pistas ocultas. | Construir un plan de exportación por visibilidad y disponibilidad; omitir decodificación cuando corresponde dibujar un marcador o excluir una pista. | Confirmado |
| F11 · Alta | Recepción binaria:841 (server/mediaBackendPlugin.ts:841) devuelve {ok:true,written:frameCount} aunque el proceso no exista o pipeFailed sea verdadero. Fallback:1078 (server/mediaBackendPlugin.ts:1078) necesita frame_%06d.jpg. | El frontend activo envía binario y no guarda esos JPEG en disco. Si VAAPI falla, se pueden descartar fotogramas con respuesta de éxito; el fallback no dispone de entradas para recodificar. | Validar el codificador antes del trabajo y devolver errores reales. Diseñar reinicio/reproducción del flujo o almacenamiento temporal recuperable. | Confirmado |
| F12 · Alta | Backend:1055 (server/mediaBackendPlugin.ts:1055) captura el fallo de mezcla y vuelve a generar solo video. Después devuelve éxito. El fallback tradicional también termina intentando sin audio. | Un MP4 sin sonido puede presentarse como exportación correcta, ocultando el fallo original. | No degradar silenciosamente. Informar pistas fallidas y requerir una decisión explícita para una salida sin audio. | Confirmado |
| F13 · Alta | Backend:800 (server/mediaBackendPlugin.ts:800) inicia FFmpeg con pipes por defecto sin consumir stderr. En líneas 863–866 espera únicamente drain. | Al acumular suficiente salida de diagnóstico, el proceso puede bloquearse. Si falla o se cancela mientras se espera drain, esa promesa puede quedar pendiente. | Consumir diagnósticos con almacenamiento acotado; resolver espera mediante drain, error, close, cancelación y timeout. | Probable bajo carga/fallo; omisiones confirmadas |
| F14 · Media | VideoInspector:45 (src/components/inspector/VideoInspector.tsx:45) pasa el clip de video a AudioInspector. Este actualiza su volumen. Preview:613 (src/components/CanvasPreviewStage.tsx:613) y exportación procesan sonido de clips audio. | Los controles de audio del video no modifican su clip de audio vinculado. También hay divergencia: preview limita volumen a 1 y aplica crossfade de solapamiento; la exportación admite mayor ganancia y no reproduce ese factor de cruce. | Resolver explícitamente el clip de audio asociado y compartir una descripción de mezcla entre preview y exportación. | Confirmado |
| F15 · Media | Pegado:2223 (src/store/useProjectStore.ts:2223) crea un único newGroupId y lo asigna a todos los clips pegados. No incorpora los assets del portapapeles. | Une clips originalmente independientes; el magnetismo puede igualar tiempos de integrantes de ese grupo. El portapapeles persiste al cambiar de proyecto y puede introducir referencias a assets inexistentes en el destino. | Remapear cada grupo original por separado; conservar independencia y transferir dependencias o limitar explícitamente el pegado entre proyectos. | Confirmado |
| F16 · Media | Persistencia:469 (server/mediaBackendPlugin.ts:469) solo exige body.id y escribe directamente project.json. El listado ignora JSON corrupto. | No hay esquema versionado, validación estructural ni sustitución atómica. Una escritura interrumpida puede inutilizar el proyecto; datos válidos como JSON pero incompatibles con el modelo llegan al frontend. | Validación de entrada, versión/migraciones, escritura temporal seguida de reemplazo y recuperación de una versión anterior. | Confirmado el diseño; daño por interrupción no reproducido |
| F17 · Media | Finalize:1002 (server/mediaBackendPlugin.ts:1002) elimina el job del mapa antes de terminar. Cancel busca allí el proceso. ExportModal:563 (src/components/ExportModal.tsx:563) limpia lectores, pero no cancela el job al fallar. | Cancelar durante finalización no controla todos los procesos. Un error previo puede dejar codificador y temporales vivos. La respuesta final puede mostrarse como éxito aunque se haya solicitado cancelación. | Mantener un estado de trabajo hasta terminar; registrar todos sus procesos, usar cancelación propagada y limpieza en finally. | Confirmado |
| F18 · Media | Compositor:89 (src/components/CanvasPreviewStage.tsx:89) suma tf.x/y como píxeles; línea 107 calcula texto a escala fija. ExportModal:235 (src/components/ExportModal.tsx:235) reduce dimensiones para 720p. | Al reducir resolución, posiciones y texto no se reducen proporcionalmente, mientras los medios sí se ajustan al canvas. Cambia la composición relativa. | Componer en coordenadas del proyecto y escalar el resultado, o aplicar consistentemente una transformación de resolución a todas las magnitudes espaciales. | Confirmado |
| F19 · Media | Estado offline:1198 (src/store/useProjectStore.ts:1198). Los llamadores encontrados son apertura y reescaneo manual. ExportModal:243 (src/components/ExportModal.tsx:243) confía en esa lista. | Mover un archivo después de abrir no actualiza automáticamente la advertencia. La respuesta de comprobación tampoco verifica que siga abierto el mismo proyecto. | Revalidar antes de exportar, reaccionar a errores multimedia y asociar respuestas a proyecto/revisión. | Confirmado |
| F20 · Media | TransformSection:61 (src/components/inspector/TransformSection.tsx:61) modifica en vivo y persiste sin snapshot. TextInspector:511 (src/components/inspector/TextInspector.tsx:511) persiste al pasar el cursor por una fuente. | El historial es inconsistente: algunas transformaciones no crean un paso deshacible y la previsualización de fuentes sí consume historial y guardados. | Separar preview transitorio de confirmación; crear una transacción de undo por gesto de edición. | Confirmado |
| F21 · Media | Waveform:51 (src/components/AudioWaveformCanvas.tsx:51) asigna canvas para todo el ancho del clip. Store:189 (src/store/useProjectStore.ts:189) clona JSON completo para historial. Los componentes principales se suscriben al store completo. | El coste crece con duración, zoom, assets e historial, no solo con la zona visible. El playhead actualiza estado en cada RAF y propaga renderizados amplios. Riesgo de pausas y límites de canvas en proyectos largos. | Virtualizar/segmentar ondas, usar selectores de estado, sacar blobs de los snapshots y medir con proyectos representativos antes de optimizar más. | Probable en magnitud; mecanismos confirmados |
| F22 · Media | Prueba fase 12:19 (scripts/verify_phase12.ts:19) copia la extracción. Etapa 6:156 (scripts/verify_keyframes_stage6.ts:156) llama setClipKeyframe sin inicializar proyecto y comprueba luego solo el playhead. | Hay verificaciones que pueden pasar sin comprobar la operación anunciada. Otros scripts usan acciones del store con persistencia real sin mock HTTP. No hay comando test en package.json. | Probar funciones de producción, preparar fixtures, aislar almacenamiento/red y comprobar efectos finales. Añadir regresiones para los fallos de este informe. | Confirmado |
| F23 · Media | Rust:20 (src-tauri/src/lib.rs:20) considera backend válido cualquier conexión TCP al puerto. Las rutas de error del arranque continúan hasta Ok(()). | Un puerto ocupado por otro servicio se acepta como backend. No se verifica identidad, versión ni readiness real. Una segunda instancia puede depender del proceso que otra instancia terminará al cerrar. | Handshake de identidad/versión, política explícita de instancia única o propiedad del servidor y errores de arranque visibles con recuperación. | Confirmado el control insuficiente; escenario multiinstancia no ejecutado |
| F24 · Baja | package.json:8 (package.json:8) ejecuta esbuild, pero no lo declara directamente. Aparece en el lockfile como dependencia transitiva. | La herramienta de construcción utilizada depende de la estructura de otra dependencia. No implica que el build actual falle, pero fragiliza su mantenimiento. | Declarar explícitamente la herramienta de build y documentar la cadena de construcción. | Confirmado |

El riesgo de bloqueo de F13 concuerda con la documentación de Node: los pipes tienen capacidad limitada y un subproceso puede bloquearse si su salida no se consume. Documentación oficial de procesos hijo.

Tres ejemplos concretos derivados del flujo, sin ejecutarlos:

1. Autoguardado: se envía el estado A; el usuario hace B; llega la respuesta de A y currentProject: saved restablece A.
2. Split: un clip de diez segundos anima X de 0 a 100. Al dividir en el segundo cinco, el fragmento derecho conserva keyframes en 0 y 10; empieza evaluando X=0 en vez de continuar en X=50.
3. Rango de audio: una curva de volumen entre los segundos 0 y 10 exportada solo entre 3 y 7 pierde ambos puntos al filtrarlos. El backend recibe una lista vacía y usa volumen estático.

D. Calidad estructural

La modularidad es desigual. El motor matemático y la separación de inspectores ofrecen límites útiles, pero buena parte de las reglas de negocio y los efectos externos permanecen concentrados:

| Módulo | Tamaño observado | Responsabilidades acumuladas |
|---|---:|---|
| useProjectStore.ts | 2.620 líneas | Estado UI, dominio temporal, historial, red, importación, persistencia y revinculación. |
| TimelinePanel.tsx | 1.666 | Presentación, geometría, interacción, solapamientos y actualización de ondas. |
| EditorWorkspace.tsx | 1.360 | Transporte, atajos, biblioteca, selección, layout y modales. |
| mediaBackendPlugin.ts | 1.301 | Enrutamiento HTTP, disco, procesos, medios, caché y trabajos de exportación. |
| CanvasPreviewStage.tsx | 1.038 | Compositor reutilizado, pool multimedia, sincronización y gizmo. |
| ExportModal.tsx | 959 | Formulario, protocolo MJPEG, recursos, render, cancelación y mezcla. |

El tamaño no es por sí solo el defecto: estos módulos mezclan operaciones que necesitan garantías diferentes. Una selección visual, una modificación deshacible y una escritura persistente terminan compartiendo mecanismos con pocas barreras.

Hay acoplamientos que dificultan las pruebas:

- El compositor importa computeTrackOverlaps desde el componente TimelinePanel.
- timelineDrop.ts depende del DOM y del store, además de resolver reglas de colocación.
- El backend importa el motor compartido desde src/lib; funciona como reutilización, pero no existe una frontera explícita de dominio compartido.
- Los contratos HTTP emplean numerosos any; TypeScript no valida los JSON recibidos.

La duplicación ya tiene consecuencias visibles: existen catálogos de transiciones divergentes y dos cálculos de solapamiento con diferencias. También se repiten creación de pistas, importación y sustitución de assets. F05 y F07 muestran por qué conviene consolidar estas reglas.

En rendimiento, además de F21, el backend realiza lecturas, escrituras y recorridos síncronos de directorios dentro del servidor HTTP. Los cuerpos JSON y binarios se acumulan sin un límite explícito. La revinculación de hermanos inicia reprobes en paralelo sin limitar concurrencia. No medí latencias ni consumo real.

Respecto a código y dependencias aparentemente sin uso:

- No encontré importaciones de @tauri-apps/api en el código de aplicación inspeccionado.
- execSync está importado en el backend sin uso encontrado.
- No encontré referencias directas a serde/serde_json en el Rust escrito manualmente.
- /api/system/fonts no tiene un consumidor frontend encontrado; el inspector mantiene su propia lista.
- La variante JSON de /api/export/frames no es la utilizada por ExportModal.

Esto no demuestra que todos esos elementos puedan eliminarse. Un endpoint HTTP puede tener consumidores externos y una dependencia puede intervenir en macros o configuración. Los clasificaría como candidatos a revisión, no como código muerto demostrado.

E. Auditoría documental

| Documento / afirmación | Clasificación | Contraste con implementación y actualización recomendada |
|---|---|---|
| README y contexto: React, Zustand, Tauri, Node, FFmpeg y compositor Canvas compartido. | Confirmada por el código | Entradas, dependencias y llamadas lo respaldan. Conservar, especificando responsabilidades y transporte HTTP. |
| Contexto §2.1: historial de hasta 50 pasos y autoguardado. | Parcialmente correcta | Existen ambos mecanismos, pero F03 y F20 impiden describirlos como garantías uniformes. Documentar operaciones cubiertas y limitaciones actuales. |
| README §9; contexto §11; fase 11, etapa 4: “Web Audio” y volumen por frame. | Desactualizada o técnicamente incorrecta | CanvasPreviewStage:575 (src/components/CanvasPreviewStage.tsx:575) crea new Audio; se escribe aud.volume. Corregir a elementos HTML multimedia sincronizados con el playhead. |
| Fase 11 §5.2 (docs/FASE_11.md:152): arrastrar rombos para ajustar timing y eliminarlos con Supr. | Documentada pero no implementada | Los marcadores detienen propagación y permiten seleccionar/saltar. No implementan ese arrastre ni borrado de nodos por teclado. Conservar como pendiente de la especificación. |
| Fase 11: motor con cinco interpolaciones, búsqueda binaria y controles de keyframes. | Confirmada por el código | keyframeEngine.ts y los componentes correspondientes lo implementan. La corrección matemática básica no garantiza la integración temporal señalada en F06. |
| README §6 y contexto §5: fallback automático VAAPI → libx264. | Parcialmente correcta | Hay selección de encoder y fallback de archivos JPEG, pero el flujo binario activo no preserva las entradas necesarias ante fallo del pipe: F11. Describir alcance real y recuperación pendiente. |
| README/contexto: referencia a originales “sin duplicarlos”. | Parcialmente correcta | Es cierto para importación por rutas. El fallback import-buffer copia a caché. Documentar esta excepción y su ciclo de vida; F04. |
| Fase 12 §1.1 (docs/FASE_12.md:9): el sistema “actual” usa 100 muestras y 60 <div>. | Desactualizada como descripción actual | Ya hay AudioWaveformCanvas y cálculo por duración. Conservar el diagnóstico como antecedente fechado. |
| Fase 12 §2.1 (docs/FASE_12.md:45): máximo 10.000 muestras y extracción en streaming. | Parcialmente correcta | El código usa máximo 15.000 y acumula PCM mediante execFile antes de calcular picos. Los 50 picos/s dejan de mantenerse después de 300 s. Actualizar algoritmo, límites y tratamiento de errores. |
| Fase 13 §3.2 (docs/FASE_13.md:63): comprobación tras 404 y detección en caliente. | Documentada pero no implementada | Los llamadores encontrados son openProject y el reescaneo manual. No hay enlace desde errores de reproducción ni comprobación nueva previa a exportación; F19. |
| Fase 13 §3.1 (docs/FASE_13.md:56): validación de compatibilidad del reemplazo. | Documentada pero no implementada | Se comprueba existencia y se ejecuta probe, pero no se compara el tipo anterior. Tampoco se reconcilian límites de clips; F08. |
| README/contexto/fase 13: revinculación y exportación de borrador completas. | Parcialmente correcta | Existen endpoints, modal, badges y tarjeta Canvas. La actualización del pool y la exportación de video ausente presentan F08/F10. Separar “interfaz implementada” de “flujo validado”. |
| Fase 13:148 (docs/FASE_13.md:148): script E2E aprobado y build con código 0. | No verificable con la evidencia disponible | No encontré ese script ni resultados reproducibles asociados al estado actual. No descarto ejecuciones históricas; deben enlazarse a commit, comando, entorno y resultado. |
| README:151 (README.md:151): desktop:dev y tauri dev como alternativas que compilan el backend. | Parcialmente correcta | Solo desktop:dev antepone build:server; beforeDevCommand ejecuta Vite. El comando directo puede depender de un bundle ausente o antiguo. Corregir instrucciones. |
| Contexto: arranque <15 ms, comprobaciones <10 ms, rendimiento “cero costo” y 60/120 FPS constantes. | No verificable con la evidencia disponible | No hay mediciones reproducibles inspeccionadas que sostengan esas garantías. Hay asignaciones, IO y renderizados reales. Sustituir garantías por objetivos o benchmarks fechados. |
| Arquitectura nativa, seguridad y distribución. | Implementada pero insuficientemente documentada | Faltan detalles claros de puerto fijo, ausencia de IPC de dominio, /health, dependencia del Node del sistema, ausencia de autenticación y política de procesos. Incorporarlos al contexto técnico. |

El encabezado de CONTEXTO_PROYECTO.md se declara “fuente única de verdad”. Conviene sustituirlo por “descripción contextual del estado verificado, con fecha y revisión”. La implementación y su configuración deben seguir prevaleciendo.

F. Plan de actualización de contexto

Estas son propuestas; no se aplicó ninguna.

| Archivo | Cambios concretos |
|---|---|
| README.md | Precisar arquitectura híbrida y requisitos de ejecución frente a compilación; indicar Rust 1.90 según manifiesto; corregir comandos de desarrollo; explicar importación por rutas frente a copia en caché; retirar garantías absolutas de rendimiento, fallback y completitud. |
| CONTEXTO_PROYECTO.md | Introducir fecha/revisión de referencia y mapa verificado de procesos; documentar persistencia, contratos HTTP y ciclo de recursos; separar estado actual, decisiones históricas y trabajo pendiente; registrar F01–F24 como limitaciones hasta su resolución. |
| docs/FASE_11.md | Mantener el diseño matemático; corregir Web Audio; marcar arrastre/borrado de nodos como pendiente; especificar comportamiento de keyframes en split, trim, rango I/O y diferentes FPS; distinguir pruebas unitarias de integración. |
| docs/FASE_12.md | Trasladar diagnóstico antiguo a antecedentes; corregir máximo de 15.000 picos y extracción acumulada; documentar límites para archivos largos, error de extracción y tamaño del canvas; enlazar pruebas de producción, no copias del algoritmo. |
| docs/FASE_13.md | Sustituir “100% completada” por estado por capacidad; usar el nombre real openProject; corregir el diagrama que menciona existsSync frente a fs.promises.stat; documentar invalidación de fuentes, compatibilidad, detección en caliente y borradores pendientes. Referenciar evidencia de E2E si existe. |

Los diagnósticos y planes anteriores tienen valor histórico. Recomiendo conservarlos en secciones de antecedentes con fecha, no eliminarlos ni presentarlos como implementación vigente.

G. Hoja de ruta

| Prioridad | Trabajo | Impacto | Esfuerzo estimado | Riesgo del cambio |
|---|---|---|---|---|
| P0 | Corregir F01 y establecer el límite de confianza de la API, F02. | Evitar borrado masivo y acceso no autorizado. | Bajo para validación; medio para autenticación. | Bajo–medio; compatibilidad entre modos. |
| P0 | Resolver autoguardado concurrente, identidad de assets y separación de medios/caché: F03–F05. | Preservar trabajo y referencias. | Medio. | Medio–alto; requiere regresiones de persistencia. |
| P1 | Unificar catálogo de transiciones y corregir fuentes de imágenes y revinculación: F07–F09. | Recuperar flujos habituales de edición/exportación. | Bajo–medio. | Medio; proyectos existentes con valores inválidos. |
| P1 | Rediseñar estado y recuperación de exportaciones: F10–F13, F17. | Evitar bloqueos, falsos éxitos y procesos abandonados. | Medio–alto. | Alto; intervienen HTTP, recursos y FFmpeg. |
| P1 | Definir invariantes temporales y de mezcla: F06, F14, F15, F18. | Alinear edición, preview y archivo final. | Medio–alto. | Alto; debe preservar proyectos existentes. |
| P2 | Persistencia atómica/versionada, estado offline coherente e historial por gesto: F16, F19, F20. | Recuperabilidad y comportamiento predecible. | Medio. | Medio. |
| P2 | Aislar pruebas y añadir regresiones antes de ejecutar suites: F22. | Detectar fallos sin tocar datos reales. | Medio. | Bajo con almacenamiento temporal aislado. |
| P3 | Extraer dominio puro y gestores de recursos; medir y abordar F21/F23/F24. | Mantenibilidad y escalabilidad. | Medio–alto. | Medio; refactorizar después de fijar comportamiento. |

La futura validación debería incluir respuestas de guardado retrasadas, reimportación de rutas, split de animaciones, exportación I/O entre keyframes, imágenes en Tauri, video offline, fallo VAAPI, fallo de audio, cancelación durante finalización y limpieza de caché con medios referenciados.

H. Limitaciones y alcance

Se inspeccionaron:

- Todo el código Rust de aplicación y configuración Tauri relevante.
- El servidor Node y sus rutas de proyectos, filesystem, medios y exportación.
- Los flujos principales del store, composición, reproducción, edición temporal e inspectores.
- Helpers de keyframes/drop, ondas, marcadores, biblioteca y modales.
- Los siete scripts de verificación, manifiestos, lockfiles y los cinco documentos de contexto.

La revisión del frontend fue focalizada en lógica, efectos y conexiones; no fue una inspección exhaustiva de cada línea de JSX, estilo o interacción visual. Es una auditoría estática amplia por subsistemas, no una certificación integral de funcionamiento.

Se excluyeron node_modules/, src-tauri/target/, src-tauri/release/, target/, dist/, build/, .git/, dist-server/, cachés, binarios y recursos generados. No utilicé salidas compiladas como evidencia de que el fuente actual funciona.

Permanecen sin verificar mediante ejecución: compilación, pruebas, comportamiento WebKitGTK/GStreamer, compatibilidad de formatos, aceleración VAAPI real, fidelidad audiovisual, consumo de memoria, empaquetado y comportamiento multiinstancia. Tampoco se realizó una auditoría de vulnerabilidades de dependencias.

El estado Git consultado al finalizar conserva los cambios preexistentes. No modifiqué ningún archivo. Quedo a la espera de tu autorización antes de aplicar correcciones o actualizar documentación.
