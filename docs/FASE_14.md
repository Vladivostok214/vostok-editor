# Fase 14 — Base de verificación aislada y herramientas explícitas

Fecha de finalización: **2026-11-04**.  
Estado: **Completada**.  
Hallazgos abordados: **F22** (base habilitadora y suites migradas) y **F24** (declaración explícita de `esbuild`).

---

## 1. Propósito y alcance de la fase

Establecer la infraestructura de pruebas automatizadas y reproducibles para el proyecto sin depender de dependencias transitivas no declaradas, sin tocar carpetas personales del usuario (`~/.local/share/video-editor`), sin realizar peticiones de red reales ni conectarse al puerto del backend local (`45173`), e importando funciones reales de producción en lugar de duplicar lógica en scripts ad-hoc.

---

## 2. Decisiones arquitectónicas

1. **Herramienta de pruebas sin dependencias externas pesadas:**
   - Se adoptó el motor nativo de Node.js (`node:test` y `node:assert/strict`) junto con `esbuild` para transpilar TypeScript a ESM en tiempo de ejecución.
   - No se requirió instalar paquetes adicionales como `jest`, `vitest` o `tsx`.

2. **Aislamiento configurable de almacenamiento (F22):**
   - Módulo [`server/storageConfig.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/storageConfig.ts): resolución centralizada de `appDataDir`, `tempCacheDir` y `homeDir`.
   - Variables de entorno del proyecto: `VIDEO_EDITOR_TEST_DATA_DIR`, `VIDEO_EDITOR_TEST_CACHE_DIR`, `VIDEO_EDITOR_TEST_SANDBOX_ROOT` y `VIDEO_EDITOR_TEST_MODE`.
   - Modo de pruebas estricto: Si `VIDEO_EDITOR_TEST_MODE='1'`, el backend aborta su importación inmediatamente si no se valida un sandbox seguro, impidiendo fallbacks silenciosos a rutas personales.

3. **Ciclo de vida del sandbox temporal:**
   - [`tests/helpers/sandbox.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/helpers/sandbox.ts): Cada ejecución del runner crea un directorio temporal exclusivo con `fs.mkdtempSync` (`/tmp/video-editor-test-*`), provisto de un token marcador criptográfico.
   - Se validan enlaces simbólicos y secuencias de path traversal (`..`, `\0`, rutas absolutas). Al finalizar, el runner elimina únicamente su propio sandbox (a menos que se pase el flag `--keep`).

4. **Aislamiento de red y Store HTTP:**
   - [`tests/helpers/network.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/helpers/network.ts): Guarda a nivel de sockets (`net.Socket.prototype.connect`) que bloquea cualquier conexión TCP que no sea hacia el puerto efímero asignado a la prueba en `127.0.0.1`.
   - Guarda a nivel de `globalThis.fetch` que reescribe transparentemente las llamadas del frontend dirigidas al origen por defecto (`http://127.0.0.1:45173`) hacia el servidor efímero en memoria, bloqueando cualquier otra solicitud externa.

5. **Exposición mínima de producción:**
   - Se exportó [`extractWaveformPeaks`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts) en `server/mediaBackendPlugin.ts` para ser consumida directamente por los tests de audio sin alterar su comportamiento interno.

---

## 3. Inventario de archivos modificados y creados

### Archivos creados
- [`server/storageConfig.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/storageConfig.ts): Configuración y validación estricta de rutas de datos/caché.
- [`scripts/run-tests.mjs`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/scripts/run-tests.mjs): Runner de pruebas basado en `esbuild` + `node:test`.
- [`tests/tsconfig.json`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/tsconfig.json): Configuración de TypeScript para verificación estática de las pruebas.
- [`tests/helpers/sandbox.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/helpers/sandbox.ts): Gestión segura del directorio temporal y path resolution.
- [`tests/helpers/network.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/helpers/network.ts): Guardas de red para sockets y fetch.
- [`tests/helpers/backend.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/helpers/backend.ts): Servidor HTTP efímero con montaje de `handleMediaBackendRequest`.
- [`tests/helpers/fixtures.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/helpers/fixtures.ts): Fábrica sintética de proyectos, pistas y clips.
- [`tests/helpers/storeHarness.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/helpers/storeHarness.ts): Coordinador para tests del store con backend y validación de disco.
- [`tests/smoke/sandbox.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/smoke/sandbox.test.ts): Pruebas de humo de sandbox, traversal y backend efímero.
- [`tests/smoke/test-mode-protection.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/smoke/test-mode-protection.test.ts): Pruebas negativas del modo de pruebas bajo subprocesos aislados.
- [`tests/store/store-isolation.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/store/store-isolation.test.ts): Pruebas de aislamiento de red y persistencia del store.
- [`tests/keyframes/stage1-engine.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/keyframes/stage1-engine.test.ts): Migración de FASE 11 Etapa 1.
- [`tests/keyframes/stage2-store.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/keyframes/stage2-store.test.ts): Migración de FASE 11 Etapa 2.
- [`tests/keyframes/stage3-canvas.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/keyframes/stage3-canvas.test.ts): Migración de FASE 11 Etapa 3.
- [`tests/keyframes/stage4-audio.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/keyframes/stage4-audio.test.ts): Migración de FASE 11 Etapa 4.
- [`tests/keyframes/stage5-inspector.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/keyframes/stage5-inspector.test.ts): Migración de FASE 11 Etapa 5.
- [`tests/keyframes/stage6-timeline.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/keyframes/stage6-timeline.test.ts): Migración de FASE 11 Etapa 6.
- [`tests/audio/waveform-phase12.test.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/tests/audio/waveform-phase12.test.ts): Migración de FASE 12.

### Archivos modificados
- [`package.json`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/package.json):
  - Añadida dependencia directa en devDependencies: `"esbuild": "^0.25.12"`.
  - Añadidos scripts: `"test": "node scripts/run-tests.mjs"` y `"test:types": "tsc -p tests/tsconfig.json"`.
- [`package-lock.json`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/package-lock.json): Declaración sincronizada de `esbuild` en el paquete raíz.
- [`server/mediaBackendPlugin.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts):
  - Rutas de almacenamiento enlazadas a `resolveStorageDirs()`.
  - Exportación de `extractWaveformPeaks`.

---

## 4. Verificaciones ejecutadas y resultados

1. **Tipado y comprobación estática:**
   - Comando: `npm run test:types`
   - Resultado: Salida limpia sin errores (código de salida 0).

2. **Ejecución de la suite completa de pruebas:**
   - Comando: `npm test`
   - Resultado: **21 suites**, **72 pruebas** (70 aprobadas, 0 fallidas, 2 omitidas justificadas).
   - Duración: ~3.5 s.

3. **Pruebas de mutación deliberada (F22):**
   - Ejecutadas en copias aisladas en `/tmp/vostok-f14-mut2-*`.
   - Se verificaron fallos seguros ante:
     - Alteración de los márgenes de `ClipKeyframeMarkers` (`markers`): 1 fallo.
     - Modificación del clamp acústico de `extractWaveformPeaks` (`waveclamp`): 2 fallos.
     - Alteración de la inserción de valor en `setClipKeyframe` (`setkf`): 7 fallos.
     - Supresión de la rotación en `drawSingleClipToContext` (`rotate`): 1 fallo.

4. **Instalación y compilación limpia (F24):**
   - Ejecutado en un directorio aislado temporal sin dependencias previas (`/tmp/vostok-clean-ci-*`):
     - `npm ci`: Instalación limpia exitosa resolviendo `esbuild@0.25.12` directamente.
     - `npm run build:server`: Generó `dist-server/index.mjs` (48.7 kB).
     - `npm run build`: Cadena completa (`build:server` + `tsc -b` + `vite build`) exitosa.
     - `npm test`: Suite de pruebas ejecutada al 100% en el entorno limpio.

5. **Integridad de datos personales y caché:**
   - Comparación de huella contra la línea base tomada en el Paso 0:
   - Contenido de `~/.local/share/video-editor/` (`projects/` y `exports/`): **100% idéntico e intacto**.
   - Caché `/tmp/video-editor-cache/`: **Intacto**.

---

## 5. Limitaciones documentadas y trabajo pendiente

- **Lógica inline de corte de onda:** La función de corte temporal de picos de audio reside inline dentro de `src/components/AudioWaveformCanvas.tsx` y no está expuesta como módulo puro. La prueba correspondiente se marcó como skipped documentado.
- **Interacciones DOM nativas:** El evento de doble clic en `VolumeRubberBand` y las interacciones de arrastre de gizmo visual en `CanvasPreviewStage` dependen del DOM del navegador y se difieren a pruebas nativas/WebKitGTK.
- **Endpoints de FS no acotados:** Endpoints como `/api/fs/browse`, `/api/fs/mkdir` y `/api/media/probe` que aceptan rutas del sistema de archivos no fueron sometidos a pruebas destructivas ya que su contención de seguridad forma parte de las fases 15 y 16 (hallazgos F01 y F02).

---

## 6. Validación manual posterior al cierre

* **Fecha:** 2026-11-04.
* **Resultado global:** 13/13 comprobaciones satisfactorias, sin errores observados.
* **Naturaleza de la prueba:** Verificación funcional manual realizada por el usuario en el entorno real de ejecución. No sustituye las pruebas automatizadas del proyecto ni valida la resolución de los hallazgos pendientes de la auditoría técnica.

### Áreas verificadas:
1. Arranque, creación, guardado y reapertura de proyectos.
2. Importación de video y audio.
3. Edición, recorte, división y reproducción de clips.
4. Keyframes de posición, escala y rotación.
5. Interpolación, undo/redo y guardado.
6. Exportación de video con imagen, audio y duración correctos.
7. Persistencia de clips, pistas y keyframes tras reiniciar la aplicación.

