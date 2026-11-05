# Plan maestro de mejoras post-auditoría

Fecha de creación: **2026-11-04**. Estado: **planificación; ninguna corrección iniciada**.

## 1. Propósito, fuentes y alcance

Este documento vivo organiza los 24 hallazgos F01–F24 para futuras sesiones de desarrollo, a partir de la fase 14. No cambia los objetivos funcionales ni declara fases anteriores nuevamente completadas. Su creación no autoriza implementar: cada ejecución futura requiere instrucciones del usuario.

Fuentes:

- [Auditoría técnica del 2026-11-04](audits/AUDITORIA_TECNICA_2026-11-04.md), especialmente **C. Hallazgos técnicos**, con trazabilidad por identificador original; las secciones E–G aportan contexto y propuestas históricas.
- [README](../README.md) y [CONTEXTO_PROYECTO](../CONTEXTO_PROYECTO.md).
- [Fase 11](FASE_11.md), [fase 12](FASE_12.md) y [fase 13](FASE_13.md), en particular sus secciones «Estado verificado — 2026-11-04».

La referencia inicial es el árbol de trabajo con HEAD `4564f63`, **incluidos cambios locales sin confirmar**. El commit por sí solo no identifica todo el estado inspeccionado. Al retomar, registrar HEAD, diferencias locales y archivos relevantes antes de atribuir vigencia a un hallazgo. Las rutas y funciones son orientativas: localizar sus nombres actuales en vez de depender de números de línea antiguos.

La auditoría identifica mecanismos mediante inspección estática. En este plan, **estático confirmado** significa mecanismo observado, nunca fallo reproducido. **Consecuencia probable** requiere reproducción o medición. No se han ejecutado pruebas, compilaciones, instalaciones ni escenarios de explotación para elaborar este plan; no se inventan resultados ni plazos.

Solo se crea este archivo. El informe original se conserva intacto como registro histórico y los cinco documentos de contexto no se modifican en esta tarea.

## 2. Criterios de priorización y dependencias

La **severidad** se conserva exactamente como en la auditoría. La **prioridad** propuesta considera pérdida de trabajo, acceso local, confianza en los resultados, capacidad de verificar y dependencias; no es una copia de la severidad.

| Prioridad | Significado |
|---|---|
| P0 | Contención de pérdida de datos o acceso no autorizado y base mínima que permite verificarla de forma segura. |
| P1 | Corrección de flujos habituales, coherencia de edición y fiabilidad de exportación. |
| P2 | Rendimiento y robustez cuya magnitud requiere medición, tras estabilizar comportamiento. |

Complejidad **baja / media / alta** y riesgo de regresión **bajo / medio / alto** son estimaciones cualitativas de alcance, no mediciones ni compromisos de tiempo. Baja: cambio localizado; media: varias rutas y compatibilidad; alta: contratos compartidos, concurrencia o procesos. El riesgo describe cuánto comportamiento válido podría afectarse, independientemente de la severidad original.

En inventario y seguimiento, **D** es dependencia previa necesaria para el alcance propuesto; **C** es coordinación recomendada, que no impide una corrección aislada con pruebas propias. «F22 base» significa fixtures, almacenamiento temporal, red aislada y aserciones sobre producción para el subsistema intervenido; no obliga a esperar todas las regresiones de todas las fases.

«F20 base» designa el contrato de inicio, confirmación y cancelación de gesto implementado y verificado para los controles que afecte F06; no exige cerrar controles ajenos a esa integración.

Cambios frente al orden sugerido históricamente:

- F22 pasa de P2 a P0 como habilitador de cambios críticos; crear primero el aislamiento mínimo. No ejecutar los scripts existentes sobre datos personales.
- F16 sube a P0 porque la escritura recuperable complementa F03 y protege datos durante futuras modificaciones del modelo.
- F23 se adelanta por su relación con la identidad del backend y la entrega de credenciales de F02. La política de confianza de F02 debe diseñarse desde el inicio.
- F24 tiene complejidad baja y entra temprano para hacer explícita la herramienta de construcción; no es condición para corregir un endpoint destructivo.

**Primero:** preparar el escenario aislado de F01 y su guardia mínima, sin esperar una infraestructura extensa; abordar en paralelo de planificación F02/F23 y la base F22. Después, F03/F16/F04/F05. El orden numérico de fases organiza responsabilidades, no impone que todo P0 espere el cierre completo de una fase anterior. Esta observación no solicita delegación ni ejecución paralela de agentes.

## 3. Inventario trazable

Cada subsección corresponde al mismo ID de la sección C del informe original. Los criterios siguientes son verificaciones futuras; ninguna se ha ejecutado. Todos los estados de trabajo iniciales son **Pendiente**, independientemente del estado de verificación estática.

### F01 — Eliminación de la raíz de proyectos

- **Severidad original:** Crítica. **Verificación:** estático confirmado; borrado masivo no reproducido. **Estado:** Pendiente.
- **Módulos:** `server/mediaBackendPlugin.ts`, ruta DELETE `/api/projects/` y resolución de `PROJECTS_DIR`. **Impacto potencial:** pérdida de todos los proyectos ante ID vacío o saneado a vacío.
- **Solución propuesta:** rechazar identificadores inválidos sin convertirlos silenciosamente; verificar destino concreto contenido en la raíz y distinto de ella. Evaluar recuperación por papelera como decisión separada, sin retrasar la guardia mínima.
- **Dependencias:** D: fixture de filesystem aislado de F22 base; C: F16 y autorización F02.
- **Aceptación:** vacío, espacios, caracteres eliminables y traversal reciben error sin modificar raíz ni proyectos vecinos; un ID válido elimina solo el proyecto esperado; confirmar también destino resuelto y política de enlaces simbólicos, sin usar proyectos reales.

### F02 — Confianza y acceso a la API local

- **Severidad original:** Alta. **Verificación:** ausencia de controles confirmada estáticamente; explotación desde navegadores no probada. **Estado:** Pendiente.
- **Módulos:** `server/mediaBackendPlugin.ts` (CORS, streaming, rutas y cuerpos), `server/standaloneServer.ts`, `src/config/api.ts`, cliente HTTP y `src-tauri/tauri.conf.json`. **Impacto potencial:** lectura de archivos y operaciones no autorizadas por clientes con acceso al servicio.
- **Solución propuesta:** definir autenticación por instancia/sesión, validación de origen y host, autorización explícita de archivos y límites de cuerpos; revisar CSP. Mantener acceso legítimo del explorador mediante concesiones explícitas, sin bloquear indiscriminadamente rutas personales.
- **Dependencias:** D: F22 base y contrato de identidad/propiedad de F23 para bootstrap nativo; C: F01, F04 y todos los endpoints consumidores. La contención de origen/host puede adelantarse sin esperar todo F23.
- **Aceptación:** peticiones sin credencial, con credencial inválida, origen/host no permitido y archivo no autorizado se rechazan sin efectos; rutas autorizadas funcionan en Vite y Tauri, incluyendo Range, importación, revinculación y exportación; cuerpos fuera del límite documentado se rechazan; credenciales no aparecen en URL ni logs. Definir y documentar el caso de clientes sin cabecera Origin.

### F03 — Respuestas de guardado obsoletas

- **Severidad original:** Alta. **Verificación:** asignación posterior al await confirmada estáticamente; pérdida por temporización no reproducida. **Estado:** Pendiente.
- **Módulos:** `src/store/useProjectStore.ts`, `persistCurrentProject`, `commitProjectUpdate`, undo/redo y cliente de persistencia. **Impacto potencial:** sustitución de una edición reciente o de otro proyecto abierto; historial incoherente.
- **Solución propuesta:** ordenar persistencia por proyecto y asociar respuestas a identidad/revisión, evitando reemplazar el documento editable con respuestas antiguas. Cubrir también orden de escrituras en disco, no solo estado visible.
- **Dependencias:** D: F22 base; C: F16 y transacciones F20.
- **Aceptación:** con promesas controladas, editar A→B y resolver respuestas invertidas conserva B en UI y disco; cambiar de proyecto durante un guardado no altera el proyecto nuevo; repetir con undo/redo, error y reintento sin pérdida ni falso indicador de guardado.

### F04 — Medios persistentes mezclados con caché

- **Severidad original:** Alta. **Verificación:** directorio compartido y limpieza recursiva confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** `server/mediaBackendPlugin.ts`, import-buffer, muestras, limpieza y trabajos de exportación; referencias de `MediaAsset`. **Impacto potencial:** retirar la única copia utilizada por un proyecto o entradas de un trabajo activo.
- **Solución propuesta:** separar almacenamiento de medios importados, muestras y temporales por propietario; limpieza por referencias y trabajos activos. Definir tratamiento conservador de proyectos existentes que apuntan a la caché antigua.
- **Dependencias:** D: F22 base; C: F16 para compatibilidad de rutas persistidas y F17 para propiedad de trabajos.
- **Aceptación:** importar por buffer, guardar, limpiar caché y reabrir mantiene medio disponible; la limpieza no toca originales ni recursos activos y sí retira temporales elegibles; proyecto con ruta antigua se migra o recibe una advertencia recuperable sin borrar su archivo.

### F05 — Reimportación rompe referencias a assets

- **Severidad original:** Alta. **Verificación:** regeneración de IDs y sustitución por path confirmadas estáticamente. **Estado:** Pendiente.
- **Módulos:** `src/store/useProjectStore.ts`, importación por rutas/buffer y generación de muestras; `src/types/project.ts`. **Impacto potencial:** clips huérfanos que ni siquiera quedan identificados como offline.
- **Solución propuesta:** conservar identidad del asset al actualizar metadatos y comprobar referencias al modificar biblioteca; definir detección y recuperación de referencias ya huérfanas sin adivinar rutas.
- **Dependencias:** D: F03 y F22 base; C: F04, F16 y F08.
- **Aceptación:** reimportar el mismo medio en cada ruta pertinente conserva IDs referenciados, cortes, vínculos y keyframes; no duplica identidades; guardar/reabrir y undo/redo mantienen integridad; un clip huérfano de fixture produce diagnóstico explícito.

### F06 — Curvas alteradas por split, trim y rango I/O

- **Severidad original:** Alta. **Verificación:** copia y filtrado de puntos confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** store temporal, `src/lib/keyframeEngine.ts`, `src/types/project.ts`, `CanvasPreviewStage.tsx` y `ExportModal.tsx`. **Impacto potencial:** reinicio de animaciones o automatización de volumen distinta del tramo original.
- **Solución propuesta:** establecer invariantes temporales para corte/recorte y exportación parcial; conservar la evaluación de la curva original, incluidos segmentos easing. Elegir representación de desplazamiento o segmentación exacta; añadir solo extremos interpolados no basta para todo easing.
- **Dependencias:** D: F03, base de gestos F20 y F22 base; C: F14 y compatibilidad F16 si cambia el modelo.
- **Aceptación:** evaluar antes/después de split/trim y dentro de rangos I/O conserva valores con tolerancia numérica justificada para las cinco interpolaciones, puntos fuera del rango, límites y clips vinculados; cubrir 24/30/60 FPS; exportar un tramo entre dos puntos externos mantiene la curva. Undo/redo restaura edición y animación.

### F07 — Identificadores incompatibles de transiciones

- **Severidad original:** Alta. **Verificación:** catálogos divergentes confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** `inspector/VideoInspector.tsx`, `src/types/project.ts`, compositor y carga de proyectos. **Impacto potencial:** solapamiento sin rama de dibujo en preview/exportación.
- **Solución propuesta:** catálogo tipado único, retirar casts que ocultan divergencias y normalizar valores históricos con fallback explícito para desconocidos.
- **Dependencias:** D: F22 base; C: F16 para normalización compatible y F18 para referencia visual.
- **Aceptación:** cada opción visible alcanza su rama de composición en preview y exportación; fixtures con `dipToBlack`, `slideLeft`, `wipe` y un valor desconocido cargan con política documentada; no se pierde la pista completa por un identificador no reconocido.

### F08 — Revinculación sin refresco de fuentes ni compatibilidad

- **Severidad original:** Alta. **Verificación:** pool por clip e insuficiencia de validación confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** `CanvasPreviewStage.tsx`, store `relinkAsset`, endpoint `/api/media/relink` y `RelinkModal.tsx`. **Impacto potencial:** informar recuperación manteniendo la fuente antigua o aceptar reemplazo que invalida clips.
- **Solución propuesta:** invalidar recursos al cambiar fuente y liberar anteriores; validar tipo y revisar duración/límites con política explícita para reemplazos más cortos, sin recortar silenciosamente.
- **Dependencias:** D: F05 y F22 base; C: F03, F16, F19 y permisos F02.
- **Aceptación:** revincular video/audio/imagen ya cargados cambia URL y contenido efectivo sin reiniciar proyecto; se conservan IDs y edición compatible; reemplazo incompatible se rechaza y uno más corto requiere decisión documentada; búsqueda de hermanos informa resultados parciales y no deja recursos antiguos activos.

### F09 — Imágenes exportadas con URL relativa en Tauri

- **Severidad original:** Alta. **Verificación:** confirmado estáticamente para assets con URL relativa; exportación no ejecutada. **Estado:** Pendiente.
- **Módulos:** `ExportModal.tsx`, `src/config/api.ts` y `/api/media/stream`. **Impacto potencial:** imagen omitida sin error útil en el MP4.
- **Solución propuesta:** utilizar el mismo resolvedor de URL que el preview y propagar errores de carga según política explícita.
- **Dependencias:** D: F22 base; C: F02 y F10 para política offline.
- **Aceptación:** fixture con imagen local referenciada por `/api/...` aparece en preview y fotogramas exportados tanto en Vite como Tauri; una carga rechazada no termina como éxito visual silencioso; no se duplican prefijos en URLs absolutas.

### F10 — Borrador offline y pistas ocultas se decodifican

- **Severidad original:** Alta. **Verificación:** recorrido de lectores y error por ruta ausente confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** `ExportModal.tsx`, `SequentialVideoFrameReader`, `/api/export/decode-clip-frames` y compositor. **Impacto potencial:** abortar borrador antes de dibujar tarjeta offline; trabajo innecesario sobre pistas ocultas.
- **Solución propuesta:** preparar un plan por visibilidad, rango y disponibilidad; no crear lector para marcador offline ni pista excluida. Definir comportamiento si el archivo desaparece después de la comprobación inicial.
- **Dependencias:** D: F19, F17 y F22 base; C: F08 y F09.
- **Aceptación:** borrador con video ausente produce marcador y duración esperados sin petición de decodificación de ese archivo; pista oculta no crea lector; audio ausente se informa según política; pérdida durante exportación termina limpiamente o continúa de forma explícita, nunca como éxito silencioso incompleto.

### F11 — Fallback del pipe sin entradas recuperables

- **Severidad original:** Alta. **Verificación:** éxito HTTP y ausencia de JPEG recuperables confirmados estáticamente; fallo VAAPI no inducido. **Estado:** Pendiente.
- **Módulos:** backend export start/frames/finalize y envío de lotes en `ExportModal.tsx`. **Impacto potencial:** descartar frames, devolver éxito de recepción y no poder recodificar.
- **Solución propuesta:** validar disponibilidad del encoder, confirmar recepción real y elegir recuperación por reproducción del flujo o almacenamiento temporal acotado; evitar prometer fallback basado en archivos inexistentes.
- **Dependencias:** D: F13, F17, F04 y F22 base; C: F12.
- **Aceptación:** inducir fallo del encoder al iniciar y tras recibir frames; jamás confirmar frames descartados; recuperación CPU usa entradas completas y produce duración/conteo esperados, o devuelve error explícito si no es recuperable; cancelar durante recuperación libera todos los recursos. VAAPI real requiere hardware disponible y evidencia separada del doble de proceso.

### F12 — Mezcla fallida se presenta como exportación correcta

- **Severidad original:** Alta. **Verificación:** captura y salida solo video confirmadas estáticamente. **Estado:** Pendiente.
- **Módulos:** backend finalize/mux y `ExportModal.tsx`. **Impacto potencial:** pérdida de sonido sin informar la causa.
- **Solución propuesta:** propagar diagnóstico de mezcla y pistas afectadas; una salida sin audio debe ser una decisión explícita, no un fallback silencioso con éxito genérico.
- **Dependencias:** D: F17 y F22 base; C: F11 y F14.
- **Aceptación:** fallo inducido de filtro o entrada de audio produce error útil y estado final correcto; exportar sin audio tras fallo requiere aceptación explícita y queda registrado; audio válido conserva pistas, duración y política de mezcla prevista; se verifica tanto pipe como ruta alternativa vigente.

### F13 — Diagnósticos y contrapresión de FFmpeg

- **Severidad original:** Alta. **Verificación:** omisiones confirmadas estáticamente; bloqueo probable bajo carga/fallo, no reproducido. **Estado:** Pendiente.
- **Módulos:** `mediaBackendPlugin.ts`, spawn de FFmpeg, stderr y espera de `stdin.drain`. **Impacto potencial:** proceso o petición pendientes indefinidamente.
- **Solución propuesta:** consumir stderr con retención acotada y cerrar toda espera por drain, error, cierre, cancelación o timeout explícito.
- **Dependencias:** D: F22 base; C: F17 para contrato de cancelación.
- **Aceptación:** un doble que llena stderr no bloquea el productor; si no llega drain, error/cierre/cancelación/timeout resuelven o rechazan la espera; diagnóstico retenido está acotado; no quedan listeners ni promesas pendientes al finalizar.

### F14 — Audio vinculado y mezcla divergente

- **Severidad original:** Media. **Verificación:** destino del inspector y diferencias de mezcla confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** `VideoInspector.tsx`, `AudioInspector.tsx`, store, preview de audio, expresiones FFmpeg y exportación. **Impacto potencial:** controles sin efecto sobre audio oído y sonido distinto entre preview y exportación.
- **Solución propuesta:** resolver clip de audio vinculado y compartir reglas de volumen, fades y crossfade. Decidir ganancia máxima compatible con `HTMLAudioElement`; no prescribir migración a Web Audio sin necesidad demostrada.
- **Dependencias:** D: F06 y F22 base; C: F20, F12.
- **Aceptación:** cambiar volumen desde inspector de video modifica su audio vinculado; audio separado y video sin audio tienen comportamiento explícito; muestras de volumen, mute, fades y cruce coinciden entre preview/exportación según tolerancias justificadas, incluidas ganancias superiores a 1; undo/redo recupera valores.

### F15 — Pegado fusiona grupos y pierde assets entre proyectos

- **Severidad original:** Media. **Verificación:** grupo único y dependencias ausentes confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** store, portapapeles, grupos vinculados, magnetismo e importación. **Impacto potencial:** mover clips independientes juntos o insertar referencias inexistentes.
- **Solución propuesta:** remapear cada grupo por separado y preservar clips independientes; elegir transferencia de assets o rechazo explícito del pegado entre proyectos hasta soportarlo.
- **Dependencias:** D: F03, F05 y F22 base; C: F16.
- **Aceptación:** copiar dos grupos y un clip independiente preserva independencia y desfases tras pegar y mover con magnetismo; pegado en otro proyecto transfiere dependencias válidas o se rechaza sin mutación; cortar, undo/redo y referencias compartidas no duplican ni pierden identidades.

### F16 — Persistencia sin validación ni reemplazo atómico

- **Severidad original:** Media. **Verificación:** diseño confirmado estáticamente; corrupción por interrupción no reproducida. **Estado:** Pendiente.
- **Módulos:** `/api/projects`, lectura/listado en backend y `src/types/project.ts`. **Impacto potencial:** proyecto ilegible, oculto por el listado o estructuralmente inválido.
- **Solución propuesta:** validar entrada y lectura, introducir versión y compatibilidad/migración documentadas, escribir temporal y reemplazar atómicamente con recuperación de versión anterior. Definir límites de durabilidad sin prometer tolerancia a toda falla del sistema.
- **Dependencias:** D: F22 base; C: F01 y F03; coordinar cambios de modelo con F04/F06.
- **Aceptación:** datos inválidos no sobrescriben proyecto válido; fallo antes/durante el reemplazo deja una versión recuperable y se informa; fixtures sin versión y versiones conocidas cargan/migran sin pérdida, versión futura se rechaza conservando archivo; JSON corrupto aparece diagnosticado, no desaparece silenciosamente.

### F17 — Cancelación y limpieza incompletas

- **Severidad original:** Media. **Verificación:** retirada prematura del job y ausencia de cancelación ante error confirmadas estáticamente. **Estado:** Pendiente.
- **Módulos:** backend activeExportJobs/finalize/cancel, lectores y manejo de errores de `ExportModal.tsx`. **Impacto potencial:** procesos abandonados, temporales vivos o éxito posterior a cancelar.
- **Solución propuesta:** estado del trabajo hasta su terminación, registro de procesos de codificación y mezcla, cancelación propagada y limpieza idempotente en finally.
- **Dependencias:** D: F13 y F22 base; C: F04 para propiedad de temporales.
- **Aceptación:** cancelar durante decodificación, envío, finalización y mezcla termina todos los procesos/lectores del trabajo; error frontend cancela backend; cancel repetido es seguro; ningún resultado tardío sustituye estado cancelado; limpieza no elimina recursos ajenos ni medios persistentes.

### F18 — Resolución de salida altera composición

- **Severidad original:** Media. **Verificación:** coordenadas y texto a escala fija confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** compositor `CanvasPreviewStage.tsx` y dimensiones en `ExportModal.tsx`. **Impacto potencial:** posiciones y texto relativos distintos al exportar 720p.
- **Solución propuesta:** componer en coordenadas del proyecto y escalar resultado o aplicar escala consistente a todas las magnitudes espaciales. Elegir alternativa mínima que preserve el preview y las animaciones.
- **Dependencias:** D: F22 base; C: F06 y F07 para fixtures animados y transiciones.
- **Aceptación:** comparar posiciones normalizadas, tamaño de texto/medios, rotación, bordes y solapamientos en 1080p/720p para 16:9, 9:16 y 1:1; incluir keyframes y tarjeta offline; definir tolerancia de rasterización sin exigir igualdad binaria entre motores.

### F19 — Detección offline obsoleta y respuestas cruzadas

- **Severidad original:** Media. **Verificación:** llamadores y lista reutilizada confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** store `checkProjectMediaStatus`, errores multimedia, `RelinkModal.tsx` y preflight de `ExportModal.tsx`. **Impacto potencial:** advertencia ausente tras mover archivos o estado offline aplicado a otro proyecto.
- **Solución propuesta:** revalidar al exportar, reaccionar a errores multimedia, asociar resultados a proyecto/revisión y definir tratamiento de comprobación fallida; no confundir desconocido con disponible.
- **Dependencias:** D: F03 y F22 base; C: F08 y F10. No exige watcher permanente para resolver el alcance inicial.
- **Aceptación:** mover/borrar tras abrir se detecta ante error o preflight; responder tarde una comprobación del proyecto anterior no altera el actual; error de API se comunica; revincular y revalidar limpia solo ausencias resueltas y el exportador utiliza esa comprobación reciente.

### F20 — Historial y preview sin transacción por gesto

- **Severidad original:** Media. **Verificación:** persistencia sin snapshot y hover persistente confirmados estáticamente. **Estado:** Pendiente.
- **Módulos:** `TransformSection.tsx`, `TextInspector.tsx`, controles/gizmo y acciones live/commit del store. **Impacto potencial:** edición no deshacible, pasos espurios y exceso de guardados.
- **Solución propuesta:** separar preview transitorio de confirmación y definir inicio/fin/cancelación de gesto con un paso de historial; tratar navegación de fuentes sin confirmar como preview.
- **Dependencias:** D: F03 y F22 base; C: F06 y F21.
- **Aceptación:** un arrastre o edición confirmada genera un paso; hover seguido de salida/cancelación no persiste ni consume historial; undo/redo restaura texto, transformaciones y keyframes; cancelar gesto y cambiar proyecto no confirma accidentalmente.

### F21 — Coste de canvas, snapshots y suscripciones

- **Severidad original:** Media. **Verificación:** mecanismos confirmados estáticamente; magnitud de pausas y memoria probable, no medida. **Estado:** Pendiente.
- **Módulos:** `AudioWaveformCanvas.tsx`, timeline, suscripciones al store, clonación de proyecto e historial. **Impacto potencial:** pausas, consumo creciente y límites de canvas en proyectos largos.
- **Solución propuesta:** medir primero con proyectos representativos; aplicar segmentación/virtualización de ondas, selectores y separación de blobs de snapshots solo donde se demuestre necesidad y se preserve semántica.
- **Dependencias:** D: F22 base y F20; C: comportamiento estabilizado de F06 y exportación. No bloquea correcciones de integridad.
- **Aceptación:** registrar baseline de memoria, renderizados, latencia y dimensiones del canvas con entorno/datos; fijar objetivos a partir de esa medición antes de optimizar; repetir escenarios idénticos y demostrar cumplimiento sin romper recortes, zoom, HiDPI, undo/redo ni referencias; documentar límites para cargas no soportadas.

### F22 — Verificaciones que no cubren producción o efectos finales

- **Severidad original:** Media. **Verificación:** Base aislada y suites históricas migradas en fase 14; 70 tests passing, guardas de FS/red activas y pruebas de mutación deliberada validadas. **Estado:** En validación (Base habilitadora disponible; pendientes pruebas nativas/DOM y regresiones específicas de fases 15–20).
- **Módulos:** `scripts/run-tests.mjs`, `tests/`, `package.json`, `server/storageConfig.ts` y puntos de prueba del store/backend.
- **Impacto potencial:** mitigado para las suites migradas; entorno de pruebas no accede a proyectos/caché personales ni red no controlada.
- **Solución implementada:** runner con `node:test` y `esbuild`; creación de sandbox temporal con `mkdtemp`; guardas de red y socket; reescritura de fetch; importación de producción (p. ej. `extractWaveformPeaks`); aserciones sobre `project.json` en disco; comprobación de mutaciones en copias aisladas.
- **Dependencias:** D: ninguna; C: F24 para cadena de herramientas.
- **Aceptación:** Verificaciones relevantes migradas a `tests/`; extracción importa producción; ejecución no accede a `~/.local/share/video-editor` ni red externa; comandos documentados en `package.json` (`npm test`, `npm run test:types`); mutaciones deliberadas demostraron fallo en copias aisladas. Documentado en `docs/FASE_14.md`.

### F23 — Arranque por puerto sin identidad ni propiedad

- **Severidad original:** Media. **Verificación:** control insuficiente confirmado estáticamente; multiinstancia no ejecutada. **Estado:** Pendiente.
- **Módulos:** `src-tauri/src/lib.rs`, `server/standaloneServer.ts`, endpoint `/health` y comunicación inicial frontend. **Impacto potencial:** aceptar otro servicio, compartir servidor sin propiedad o continuar sin backend.
- **Solución propuesta:** handshake de identidad/versión/readiness, política explícita de instancia única o propiedad/uso compartido, errores visibles y recuperación; cerrar únicamente procesos propios y no confundir TCP abierto con servicio listo.
- **Dependencias:** D: F22 base; C: diseño F02. F23 entrega identidad y propiedad; F02 utiliza ese contrato para autenticación, evitando dependencia circular.
- **Aceptación:** puerto ocupado por servicio ajeno no se acepta; Node/bundle ausente o arranque fallido se informa; backend compatible responde handshake válido; abrir/cerrar dos instancias respeta la política elegida sin matar procesos ajenos ni dejar otra ventana sin servicio; readiness vence con error explícito según política documentada.

### F24 — Herramienta de build transitiva

- **Severidad original:** Baja. **Verificación:** Declaración directa resuelta en `package.json` y `package-lock.json`; validada instalación limpia con `npm ci` y compilación completa en directorio aislado. **Estado:** Resuelto.
- **Módulos:** `package.json`, `package-lock.json` y scripts de build.
- **Impacto potencial:** resuelto; la herramienta de compilación ya no depende de la resolución transitiva de Vite.
- **Solución implementada:** Declaración explícita de `"esbuild": "^0.25.12"` en `devDependencies` y en el paquete raíz de `package-lock.json`.
- **Dependencias:** D: ninguna; C: F22.
- **Aceptación:** Demostrado mediante `npm ci` en copia temporal limpia sin dependencias preexistentes; `npm ls esbuild` resuelve como dependencia directa; `build:server` genera `dist-server/index.mjs` (48.7 kB); la cadena `npm run build` (`build:server` + `tsc -b` + `vite build`) pasa exitosamente. Documentado en `docs/FASE_14.md`.

## 4. Fases de desarrollo propuestas

La asignación principal es única. Que un hallazgo figure como dependencia o regresión de otra fase no transfiere su responsabilidad de cierre. Todas las fases están por iniciar.

### Fase 14 — Base de verificación aislada y herramientas explícitas

- **Objetivo:** poder detectar regresiones sin tocar datos personales y hacer reproducible la herramienta usada por el build.
- **Hallazgos principales:** F22, F24.
- **Agrupamiento:** ambos establecen confianza en la evidencia futura; F24 no justifica una actualización general de paquetes.
- **Dependencias previas:** ninguna. La primera entrega es la base mínima para F01 y persistencia; no esperar una suite universal.
- **Alcance:** fixtures, red/FS/procesos controlados, pruebas sobre producción, aserciones de efectos y comandos documentados; dependencia directa de build.
- **Exclusiones:** implementación de las demás correcciones, CI extensa y refactorización general para testabilidad.
- **Riesgos:** mocks que oculten errores reales o scripts que continúen usando almacenamiento personal.
- **Pruebas necesarias:** demostrar aislamiento, fixture efectivo, fallo ante regresión deliberada y construcción futura en entorno limpio para F24.
- **Finalización:** criterios F22/F24 respaldados por evidencia; distinguir base habilitadora disponible del cierre completo de F22. Las regresiones específicas se incorporan en cada fase posterior.

### Fase 15 — Integridad de proyectos, medios y transacciones de edición

- **Objetivo:** preservar datos, identidades e historial antes de ampliar cambios de comportamiento.
- **Hallazgos principales:** F01, F03, F04, F05, F15, F16, F20.
- **Agrupamiento:** comparten documento editable, referencias y frontera de persistencia; corregirlos con un contrato de identidad y confirmación evita parches incompatibles.
- **Dependencias previas:** F22 base para cada caso; F24 no bloquea la guardia de F01. Orden interno: F01; F03/F16; F04/F05; F20/F15 según sus dependencias. F03 y F16 deben acordar revisión y compatibilidad antes de modificar el formato.
- **Alcance:** validar eliminación, ordenar guardados, escritura recuperable, separación de medios/caché, identidad estable, grupos de portapapeles y un paso de undo por gesto.
- **Exclusiones:** nuevo formato de edición completo, motor de base de datos, nuevas herramientas de timeline o papelera avanzada obligatoria.
- **Riesgos:** migración de rutas y documentos antiguos, snapshots incompatibles y pérdida de cambios durante operaciones concurrentes.
- **Pruebas necesarias:** fallos de escritura en FS temporal, respuestas invertidas, cambios de proyecto, limpieza durante trabajo activo, reimportación, pegado y gestos con undo/redo.
- **Finalización:** cada criterio principal validado, fixtures antiguos conservados o migrados de forma recuperable; ninguna regresión conocida de pérdida de datos queda escondida bajo la etiqueta de fase terminada.

### Fase 16 — Identidad del backend y control de acceso local

- **Objetivo:** distinguir el backend propio y limitar operaciones a clientes y archivos autorizados.
- **Hallazgos principales:** F02, F23.
- **Agrupamiento:** Rust decide qué proceso aceptar; la API debe autenticar sobre una identidad y propiedad conocidas.
- **Dependencias previas:** F22 base; acuerdo temprano sobre credenciales y modo Vite/Tauri. No requiere cerrar toda la fase 15. Primero definir confianza, después handshake/propiedad F23 y autenticación completa F02; controles independientes de contención pueden adelantarse.
- **Alcance:** handshake, readiness, política multiinstancia, errores de arranque, credenciales, origen/host, concesiones de archivos, cuerpos limitados y revisión CSP.
- **Exclusiones:** servicio remoto, cuentas de usuario, reescritura del backend en Rust o empaquetado de Node sin necesidad demostrada.
- **Riesgos:** romper streaming, recursos multimedia, desarrollo Vite o acceso legítimo a carpetas locales; filtrar credenciales en logs.
- **Pruebas necesarias:** matriz Vite/Tauri, clientes inválidos, rutas y Range, puerto ajeno, ausencia de Node/bundle y dos instancias según política acordada.
- **Finalización:** autorización e identidad verificadas con casos positivos/negativos; bootstrap documentado y sin bloqueo circular entre handshake y credenciales.

### Fase 17 — Semántica temporal y fidelidad audiovisual

- **Objetivo:** conservar animación, transición, mezcla y composición al editar y exportar.
- **Hallazgos principales:** F06, F07, F14, F18.
- **Agrupamiento:** son reglas de contenido que deben coincidir entre inspector, preview y salida; separarlas de recuperación de procesos permite comparar contenido estable.
- **Dependencias previas:** base F22; F03/F20 para cambios temporales deshacibles. Coordinar compatibilidad con F16 y contratos HTTP con fase 16; el cálculo puro no espera toda la fase 16.
- **Alcance:** semántica de curvas para split/trim/I/O, catálogo de transiciones compatible, resolución de audio vinculado y reglas de mezcla, coordenadas independientes de resolución.
- **Exclusiones:** paneo nuevo, editor avanzado de curvas, reemplazo de todo el compositor o adopción automática de Web Audio.
- **Riesgos:** easing alterado por una segmentación aproximada, cambio de apariencia en proyectos existentes y tolerancias audiovisuales mal definidas.
- **Pruebas necesarias:** cinco interpolaciones, varios FPS, límites de recorte, identificadores históricos, clips vinculados, comparación de mezcla y fotogramas en resoluciones/formatos de lienzo soportados.
- **Finalización:** comportamiento esperado acordado y criterios F06/F07/F14/F18 validados, incluyendo proyectos anteriores. Un compositor compartido no basta como evidencia de fidelidad.

### Fase 18 — Ciclo de exportación, errores y recuperación

- **Objetivo:** que cada trabajo termine con resultado verificable, error explícito o cancelación completa.
- **Hallazgos principales:** F11, F12, F13, F17.
- **Agrupamiento:** comparten procesos, pipes, estados de trabajo, temporales y respuestas de éxito; necesitan un contrato coherente de recursos y terminación.
- **Dependencias previas:** F22 base y F04 para recuperación con temporales; acordar el modelo de resultado con F02. Orden interno: F13, F17, después F11/F12. No se exige terminar toda la fase 17 para probar fallos de proceso; sí usar su mezcla validada para cierre audiovisual integrado.
- **Alcance:** consumo acotado de diagnósticos, contrapresión, estados hasta terminación, cancelación de todos los procesos, errores reales, recuperación de frames y decisión explícita sobre audio fallido.
- **Exclusiones:** codecs nuevos, exportación distribuida y optimización general de velocidad.
- **Riesgos:** esperas pendientes, procesos nietos no terminados, reintentos duplicados y éxito tardío tras cancelar.
- **Pruebas necesarias:** dobles de proceso y trabajos con FFmpeg real en entorno aislado; fallos de encoder/mux, cierre durante drain, cancelación por etapa y recuperación CPU. Hardware VAAPI, si se usa para afirmar compatibilidad, debe verificarse aparte.
- **Finalización:** criterios de los cuatro hallazgos, recursos liberados y ausencia de éxito silencioso ante fallo; las rutas no ensayadas se declaran como límites, sin certificar recuperación total.

### Fase 19 — Disponibilidad de medios, revinculación y exportación offline

- **Objetivo:** que la disponibilidad conocida corresponda al proyecto actual y determine fuentes y decodificación.
- **Hallazgos principales:** F08, F09, F10, F19.
- **Agrupamiento:** un mismo contrato de disponibilidad debe gobernar la recuperación en preview y el plan de exportación; F09 alinea también la resolución de fuentes de imágenes.
- **Dependencias previas:** F03/F05, F22 base y F17 para errores de lectores; respetar los permisos de F02. F08/F09/F19 pueden avanzar con sus dependencias concretas sin esperar el cierre completo de la fase 18; F10 depende de F19 y F17.
- **Alcance:** comprobaciones por proyecto/revisión, preflight, reacción a errores, invalidación de fuentes, validación de reemplazos, URLs coherentes y exclusión de lectores offline/ocultos.
- **Exclusiones:** watcher permanente obligatorio, búsqueda global en discos o deducción de archivos renombrados sin identificación fiable.
- **Riesgos:** carreras entre comprobación y lectura, reprobes parciales, recurso viejo retenido o aceptación silenciosa de medio más corto.
- **Pruebas necesarias:** mover archivo después de abrir, respuesta tardía de otro proyecto, relink con recurso ya cargado, tipos incompatibles, imagen en Tauri/Vite, pista oculta y borrador offline; desaparición durante exportación con limpieza.
- **Finalización:** criterios de los cuatro hallazgos validados en los dos modos; el cierre no se basa solo en que desaparezca un badge o aparezca un mensaje de éxito.

### Fase 20 — Rendimiento medido y límites de recursos

- **Objetivo:** reducir los costes demostrados sin alterar las reglas de edición ni prometer rendimiento universal.
- **Hallazgo principal:** F21.
- **Agrupamiento:** reúne medición de canvas, historial y suscripciones, evitando optimizaciones especulativas aisladas.
- **Dependencias previas:** F22 base, F20 y reglas estables de las rutas que se midan; usar regresiones de fases 17–19 cuando la optimización las afecte.
- **Alcance:** baseline reproducible, objetivos fundamentados, optimización focalizada de ondas, selectores o snapshots y documentación de límites.
- **Exclusiones:** reescritura de Zustand, cambio de framework/renderizador y migración general a workers sin cuello de botella demostrado.
- **Riesgos:** cachés desactualizadas, más complejidad sin beneficio y cambios semánticos del historial.
- **Pruebas necesarias:** escenarios cortos/largos con varias pistas, zoom y HiDPI; memoria/renderizados/latencia antes/después; regresiones de recorte y undo/redo.
- **Finalización:** baseline y mediciones comparables, objetivos acordados satisfechos y comportamiento preservado. No cerrar por apreciación subjetiva de fluidez.

## 5. Metodología incremental y cierre

Para cada hallazgo, en una futura tarea autorizada:

1. **Verificar vigencia:** revisar la ruta actual, diferenciar mecanismo confirmado de consecuencia inferida y registrar revisión/entorno. Si no se reproduce, documentar qué escenarios faltan; no cambiar automáticamente a Resuelto.
2. **Preparar regresión:** construir fixture o escenario mínimo y aislado. Para persistencia, borrado y procesos, preparar la prueba antes de modificar; confirmar que detecta la condición relevante cuando sea viable. No reproducir acciones destructivas contra almacenamiento personal.
3. **Corregir lo mínimo:** limitar el cambio al contrato afectado. Extraer funciones o gestores solo cuando sean necesarios para probar o compartir invariantes; justificar alcance y compatibilidad. Acordar decisiones abiertas antes de alterar datos.
4. **Verificar la corrección:** ejecutar las pruebas pertinentes en la tarea futura, con comandos, resultado y evidencia. Usar procesos simulados para carreras/errores y ejecución real para la integración que se pretenda certificar.
5. **Comprobar regresiones:** cubrir consumidores y proyectos antiguos afectados; no asumir que un test unitario prueba WebKitGTK, GPU o empaquetado. Marcar qué entornos quedaron sin validar y su relevancia para el cierre.
6. **Actualizar documentación:** registrar decisiones y resultados en la futura fase; actualizar contexto solo con comportamiento implementado y validado al nivel declarado. Mantener antecedentes útiles y el informe original intactos.
7. **Registrar resolución:** enlazar prueba/escenario, comando, entorno, salida o artefacto, commit real y límites. El commit identifica la corrección, pero no sustituye la evidencia. No crear commits que incluyan cambios locales ajenos; acordar su alcance en la tarea correspondiente.

Plantilla de evidencia por hallazgo:

> Revisión inicial y cambios locales relevantes: …; escenario/fixture: …; prueba antes de corregir: …; decisión y cambio: …; comando/entorno: …; resultado y artefacto: …; regresiones: …; commit de corrección: …; límites pendientes: …; fecha/revisor: …

Los puntos suspensivos son campos vacíos, no resultados. Si se demuestra que un hallazgo ya no aplica, conservar ID y evidencia de la causa/revisión; no borrarlo ni inventar una corrección. Si un criterio importante no se cumple, permanece En validación o Bloqueado con causa explícita, nunca Resuelto solo por haber cambiado código.

## 6. Tabla maestra de seguimiento

En cada fila se conserva la prioridad propuesta y una única fase responsable. «Sin evidencia» significa que no hay evidencia de **resolución**, no que falte la evidencia estática del hallazgo.

| ID | Fase responsable | Prioridad | Complejidad estimada | Riesgo de regresión | Estado | Dependencias | Evidencia de resolución |
|---|---|---|---|---|---|---|---|
| F01 | 15 | P0 | Baja | Medio | Pendiente | D: F22 base; C: F16, F02 | Sin evidencia; por registrar |
| F02 | 16 | P0 | Alta | Alto | Pendiente | D: F22 base, F23; C: F01, F04 | Sin evidencia; por registrar |
| F03 | 15 | P0 | Alta | Alto | Pendiente | D: F22 base; C: F16, F20 | Sin evidencia; por registrar |
| F04 | 15 | P0 | Media | Alto | Pendiente | D: F22 base; C: F16, F17 | Sin evidencia; por registrar |
| F05 | 15 | P0 | Media | Alto | Pendiente | D: F03, F22 base; C: F04, F16, F08 | Sin evidencia; por registrar |
| F06 | 17 | P1 | Alta | Alto | Pendiente | D: F03, F20 base, F22 base; C: F14, F16 | Sin evidencia; por registrar |
| F07 | 17 | P1 | Media | Medio | Pendiente | D: F22 base; C: F16, F18 | Sin evidencia; por registrar |
| F08 | 19 | P1 | Alta | Alto | Pendiente | D: F05, F22 base; C: F03, F16, F19, F02 | Sin evidencia; por registrar |
| F09 | 19 | P1 | Baja | Medio | Pendiente | D: F22 base; C: F02, F10 | Sin evidencia; por registrar |
| F10 | 19 | P1 | Media | Alto | Pendiente | D: F19, F17, F22 base; C: F08, F09 | Sin evidencia; por registrar |
| F11 | 18 | P1 | Alta | Alto | Pendiente | D: F13, F17, F04, F22 base; C: F12 | Sin evidencia; por registrar |
| F12 | 18 | P1 | Media | Alto | Pendiente | D: F17, F22 base; C: F11, F14 | Sin evidencia; por registrar |
| F13 | 18 | P1 | Media | Alto | Pendiente | D: F22 base; C: F17 | Sin evidencia; por registrar |
| F14 | 17 | P1 | Alta | Alto | Pendiente | D: F06, F22 base; C: F20, F12 | Sin evidencia; por registrar |
| F15 | 15 | P1 | Media | Alto | Pendiente | D: F03, F05, F22 base; C: F16 | Sin evidencia; por registrar |
| F16 | 15 | P0 | Alta | Alto | Pendiente | D: F22 base; C: F01, F03, F04, F06 | Sin evidencia; por registrar |
| F17 | 18 | P1 | Alta | Alto | Pendiente | D: F13, F22 base; C: F04 | Sin evidencia; por registrar |
| F18 | 17 | P1 | Media | Alto | Pendiente | D: F22 base; C: F06, F07 | Sin evidencia; por registrar |
| F19 | 19 | P1 | Media | Medio | Pendiente | D: F03, F22 base; C: F08, F10 | Sin evidencia; por registrar |
| F20 | 15 | P1 | Media | Alto | Pendiente | D: F03, F22 base; C: F06, F21 | Sin evidencia; por registrar |
| F21 | 20 | P2 | Alta | Alto | Pendiente | D: F22 base, F20; C: F06, fases 18–19 | Sin evidencia; por registrar |
| F22 | 14 | P0 | Media | Medio | En validación | D: ninguna; C: F24 | Base habilitadora en FASE_14; 70 tests passing; mutaciones verificadas |
| F23 | 16 | P0 | Alta | Alto | Pendiente | D: F22 base; C: diseño F02 | Sin evidencia; por registrar |
| F24 | 14 | P1 | Baja | Bajo | Resuelto | D: ninguna; C: F22 | esbuild directo verificado con npm ci y build limpio en FASE_14 |

Estados permitidos, separados del estado de verificación técnica:

| Estado | Uso |
|---|---|
| Pendiente | No se ha iniciado el trabajo del hallazgo. |
| En investigación | Se verifica vigencia, reproducción, alcance o decisión técnica. |
| En implementación | Se aplica una corrección autorizada con regresión preparada. |
| En validación | Hay cambio propuesto y faltan verificaciones o revisión de aceptación. |
| Resuelto | Criterios satisfechos y evidencia de resolución/commit registrados. |
| Bloqueado | Existe impedimento explícito; registrar causa, dependencia y condición para continuar. |

Transición habitual: Pendiente → En investigación → En implementación → En validación → Resuelto. Se puede volver a investigación o implementación si la evidencia lo exige; Bloqueado no equivale a cierre. Completar documentación o diseñar una prueba en este plan no inicia la implementación.

## 7. Reglas de mantenimiento y continuidad

- Mantener el informe original como fotografía histórica. No corregirlo retrospectivamente para aparentar que un problema nunca existió.
- Actualizar este plan con decisiones, prioridad, dependencia, estado y evidencia reales. Los cinco contextos describen el estado implementado; no deben presentar el plan como capacidad existente.
- Las futuras fases 14–20 documentarán decisiones, cambios, pruebas y resultados. Sus archivos se crearán solo al autorizar la tarea correspondiente; este documento no los crea.
- Mantener una única fase principal por hallazgo. Si cambia la distribución, actualizar inventario, fase y tabla, preservando el ID y la justificación.
- No cerrar una fase con criterios relevantes incumplidos. Una contención parcial puede registrarse como avance con alcance explícito, sin marcar el hallazgo Resuelto.
- No usar resultados históricos como pruebas actuales ni extrapolar dobles de proceso a compatibilidad VAAPI real. Registrar ausencia de hardware/entorno como límite y resolver si bloquea el criterio comprometido.
- No convertir estimaciones cualitativas en fechas u objetivos numéricos sin evidencia. F21 requiere medición antes de fijar umbrales.

**Control inicial de cobertura:** 24 hallazgos inventariados; distribución principal: fase 14 (2), 15 (7), 16 (2), 17 (4), 18 (4), 19 (4), 20 (1). Total: 24, sin duplicar responsables principales. Todos comienzan Pendiente y sin evidencia de resolución.
