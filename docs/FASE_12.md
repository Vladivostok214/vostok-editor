# FASE 12: Visualización de Formas de Onda de Audio de Alta Definición en la Línea de Tiempo

Este documento especifica el diagnóstico técnico, la arquitectura de renderizado, el modelo de muestreo y el plan de implementación para dotar a **VOSTOK EDITOR** de una visualización de formas de onda de audio profesional, precisa y de alto rendimiento en la línea de tiempo.

---

## Estado verificado — 2026-11-04

Inspección estática del árbol de trabajo con HEAD `4564f63`, incluidos cambios locales; sin pruebas ni compilaciones. Se conservan el diagnóstico inicial, la decisión de evitar un reproductor adicional y los objetivos de calidad como antecedentes y criterios de diseño.

- **Implementado:** `probeMediaFile` calcula `max(120, min(15000, round(duration * 50)))` para audio y video con sonido. `AudioWaveformCanvas.tsx` está integrado en `TimelinePanel.tsx`, usa HiDPI, ventana por `sourceStart`/duración y máximos por barra. La onda acústica se representa en el clip de audio, incluido el vinculado al video; no en una franja secundaria del clip visual de video.
- **Parcial / límites actuales:** 50 picos/s es una densidad objetivo con mínimo 120 y máximo 15.000; por encima de 300 s disminuye el detalle temporal. `extractWaveformPeaks` acumula PCM en `execFile` antes de calcular picos, con `maxBuffer` de 35 MiB. Ante error o salida insuficiente devuelve una onda sintética de valores `0.25`, que no acredita contenido acústico real.
- **Riesgos estáticos:** el canvas abarca el ancho completo `clipDuration * timelineZoom`, multiplicado por la densidad de pantalla. Duración y zoom pueden aumentar memoria y alcanzar límites del canvas. No se ha reproducido ni medido su impacto en esta revisión.
- **Pendiente de validación:** rendimiento con archivos largos, límites de canvas y precisión visual efectiva en WebKitGTK. “Cero costo”, aceleración efectiva y 50–150 ms son objetivos o afirmaciones históricas no revalidadas.
- **Evidencia de verificación disponible:** `scripts/verify_phase12.ts` existe, pero copia la función de extracción en lugar de importar la función de producción; no demuestra por sí solo la integración del backend y del timeline. No se ejecutó y no se certifica un resultado actual.

Referencias: `server/mediaBackendPlugin.ts`, `src/components/AudioWaveformCanvas.tsx`, `src/components/TimelinePanel.tsx` y [auditoría estática](audits/AUDITORIA_TECNICA_2026-11-04.md).

## 1. Visión General y Diagnóstico

### 1.1. Diagnóstico histórico del sistema previo
El diagnóstico original describía las siguientes limitaciones, sustituidas por la implementación indicada en el estado verificado:
1. **Muestreo Estático Insuficiente en Backend ([`server/mediaBackendPlugin.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts)):**
   La función `extractWaveformPeaks` extrae una cantidad fija de 100 muestras para todo el archivo, sin importar si dura 3 segundos o 10 minutos. Para audios largos, 100 muestras reducen la forma de onda a una aproximación tosca sin detalle de transitorios ni silencios.
2. **Visualización Primitiva en Frontend ([`TimelinePanel.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/TimelinePanel.tsx)):**
   El timeline toma únicamente los primeros 60 valores del array (`asset.waveform.slice(0, 60)`) y genera 60 etiquetas `<div>` HTML individuales:
   * **Inmune al recorte (`sourceStart`):** Si un clip de audio de 3 minutos se recorta para iniciar en el minuto 1:30, la interfaz sigue dibujando los primeros 60 puntos del inicio del archivo original.
   * **Inmune al zoom del timeline:** Al alejar o acercar el zoom, los 60 `<div>` simplemente se comprimen o expanden como barras estiradas sin aumentar ni reducir el nivel de detalle temporal.
   * **Sobrecarga de Nodos DOM:** Cada clip genera decenas de nodos HTML independientes que saturan el árbol de renderizado en proyectos con múltiples pistas.
   * **Ausencia en Clips de Video con Sonido:** Los videos que contienen pistas de audio no muestran su forma de onda integrada en la pista correspondiente.

### 1.2. Evaluación y Descarte de Bibliotecas Pesadas (ej. WaveSurfer.js)
Se conserva la evaluación original que desaconsejó integrar librerías como WaveSurfer.js por razones de arquitectura. Las afirmaciones de consumo, latencia y comportamiento de terceros de esta evaluación son antecedentes de la decisión, no resultados revalidados en esta revisión:
* **Consumo Excesivo de Memoria RAM:** WaveSurfer decodifica el audio completo en memoria sin comprimir mediante la API `AudioContext.decodeAudioData()`. En archivos de audio medianos o largos (música, grabaciones de 30 a 60 minutos), esto satura rápidamente cientos de megabytes de RAM, provocando cierres o congelamientos en WebKitGTK sobre Linux.
* **Desacople del Motor NLE:** WaveSurfer está diseñado como un reproductor autónomo con su propio transporte de tiempo, no como un sistema de clips recortables (`sourceStart`, `duration`), pistas apiladas y zoom sincronizado al milisegundo con una regla de tiempo multipista.
* **Sobrecarga Innecesaria:** El editor ya cuenta con un backend rápido basado en FFmpeg que puede entregar los picos normalizados en milisegundos sin sobrecargar el hilo principal del cliente.

### 1.3. Solución Estándar NLE (Estilo DaVinci Resolve / Adobe Premiere)
La arquitectura adoptada es la utilizada por los editores no lineales de clase profesional:
1. **Extracción en Backend por Tasa Temporal (FFmpeg):** Objetivo de **50 picos por segundo**, con `samplesCount = Math.max(120, Math.min(15000, Math.round(duration * 50)))`. Un minuto produce unos 3.000 picos; no se ha medido aquí el tamaño serializado ni su impacto.
2. **Renderizado en `<canvas>` 2D Nativo:** Sustitución de los elementos `<div>` por un elemento `<canvas>` liviano dentro de cada clip de audio, calculando matemáticamente la ventana de recorte visible y trazando una onda simétrica espejada y nítida.

---

## 2. Arquitectura Técnica y Flujo de Datos

```mermaid
flowchart TD
    A["Archivo Multimedia (Audio/Video con sonido)"] --> B["Backend FFmpeg: extractWaveformPeaks"]
    B -->|"Objetivo 50 picos/s; mínimo 120, máximo 15000"| C["MediaAsset.waveform en Store"]
    C --> D["TimelinePanel: Componente AudioWaveformCanvas"]
    E["Parámetros del Clip: sourceStart, duration, zoom"] --> D
    D -->|"Ventana: [sourceStart ... sourceStart + duration]"| F["Proyección Matemática en Canvas 2D"]
    F --> G["Forma de Onda Espejada de Alta Definición (Retina HiDPI)"]
```

### 2.1. Optimización en el Servidor Backend (`server/mediaBackendPlugin.ts`)
En la función de inspección de medios (`probeMediaFile`), se vincula la cantidad de muestras extraídas con la duración real del archivo:

```typescript
// server/mediaBackendPlugin.ts
const SAMPLES_PER_SECOND = 50; // Constante explicativa; el código vigente usa duration * 50

let waveform: number[] | undefined;
if (type === 'audio' || (type === 'video' && hasAudio)) {
  const targetSamples = Math.max(120, Math.min(15000, Math.round(duration * SAMPLES_PER_SECOND)));
  waveform = await extractWaveformPeaks(filePath, targetSamples);
}
```

FFmpeg produce PCM mono a 1.000 Hz (`-ar 1000 -ac 1 -f s16le pipe:1`). `execFile` acumula su salida binaria antes de calcular los picos, con un límite de 35 MiB. La cifra histórica de ~50–150 ms no se ha revalidado; no es una garantía para pistas completas.

### 2.2. Componente de Renderizado Frontend (`src/components/AudioWaveformCanvas.tsx`)
Existe un componente especializado y memoizado para gestionar el dibujo de la forma de onda:

#### Especificación de Props:
```typescript
interface AudioWaveformCanvasProps {
  waveform?: number[];       // Picos normalizados [0.0 - 1.0] del asset completo
  assetDuration: number;    // Duración total del archivo en segundos
  sourceStart: number;      // Tiempo inicial recortado del clip en segundos
  clipDuration: number;     // Duración efectiva del clip en la pista
  width: number;            // Ancho visible en píxeles (clipDuration * timelineZoom)
  height?: number;           // Alto del canvas (ej. 32px o 40px)
  className?: string;
  color?: string;           // Color principal
  secondaryColor?: string;  // Segundo color del gradiente
  mirrored?: boolean;
  barWidth?: number;        // Por defecto 2px
  barGap?: number;          // Por defecto 1px
}
```

#### Mapeo Matemático de Ventana Temporal:
Dado un array global de picos $P$ de tamaño $N$:
1. **Índice inicial en el array:**
   $$i_{\text{start}} = \left\lfloor \frac{\text{sourceStart}}{\text{assetDuration}} \times N \right\rfloor$$
2. **Índice final en el array:**
   $$i_{\text{end}} = \left\lceil \frac{\text{sourceStart} + \text{clipDuration}}{\text{assetDuration}} \times N \right\rceil$$
3. **Subconjunto de muestras visibles:**
   $$P_{\text{visible}} = P[i_{\text{start}} \dots i_{\text{end}}]$$

#### Algoritmo de Trazado en Canvas 2D:
* **Soporte HiDPI (`window.devicePixelRatio`):** Escala el canvas interno por el pixel ratio del monitor para eliminar bordes borrosos en pantallas 2K/4K o pantallas Retina.
* **Onda Espejada Simétrica:** Se dibuja tanto hacia arriba como hacia abajo desde el centro vertical ($Y_{\text{center}} = \text{height} / 2$).
* **Resolución Adaptativa por Barra:** Se calcula el máximo del tramo de muestras asignado a cada barra, con separación uniforme definida por `barWidth + barGap`; no se implementa interpolación lineal entre muestras.
* **Paleta Estética Profesional:** Barras con gradiente configurable (`color`, `secondaryColor`); valores por defecto `#10b981` y `#059669`, con línea central sutil.

---

## 3. Objetivos de la Fase 12

Se conservan los objetivos originales. Las expresiones de precisión absoluta y costo cero son aspiraciones; sus límites vigentes se describen al inicio.

1. **Precisión Milimétrica al Recortar (*Trimming & Slip*):**
   Al desplazar el inicio del clip (`sourceStart`) o acortar su duración, la forma de onda debe reflejar fielmente la sección exacta del audio que se está escuchando, facilitando cortes al ritmo de la voz o de la música.
2. **Escalabilidad Fluida al Zoom:**
   Desde un zoom mínimo (visión global del proyecto) hasta un zoom máximo (edición quirúrgica fotograma a fotograma), la onda debe mantenerse nítida sin deformarse ni perder coherencia visual.
3. **Rendimiento Cero-Costo en WebKitGTK (Tauri Linux):**
   Erradicar los cientos de etiquetas `<div>` del DOM, reduciendo el costo de composición a una única textura de canvas 2D acelerada por hardware.
4. **Base Visual para la Fase 11 (Sistema de Keyframes):**
   Dejar la superficie del clip de audio lista para que la línea elástica de volumen (*rubber-band*) y los rombos de keyframes de la Fase 11 se superpongan directamente sobre la onda.

---

## 4. Plan histórico de Implementación Paso a Paso

Los pasos 1–3 cuentan con implementación presente, con los límites indicados arriba. El paso 4 conserva las verificaciones previstas y no indica que se hayan ejecutado en esta revisión.

### Paso 1: Optimización de Extracción en Servidor Backend
* Modificar [`server/mediaBackendPlugin.ts`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/server/mediaBackendPlugin.ts):
  * Ajustar `extractWaveformPeaks` para recibir `samplesCount` calculado en base a `Math.max(120, Math.round(duration * 50))`.
  * Garantizar la extracción tanto para archivos de audio dedicados (`type === 'audio'`) como para videos con audio (`type === 'video' && hasAudio`).

### Paso 2: Creación del Componente `AudioWaveformCanvas`
* Crear [`src/components/AudioWaveformCanvas.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/AudioWaveformCanvas.tsx):
  * Manejo del ciclo de vida del canvas mediante `useRef` y `useEffect`.
  * Ajuste de resolución de densidad de píxeles (`devicePixelRatio`).
  * Cálculo de subsegmento `[sourceStart, sourceStart + duration]`.
  * Dibujo eficiente de la onda espejada simétrica con esquinas redondeadas o barras continuas.

### Paso 3: Integración en `TimelinePanel.tsx`
* Sustituir el bloque original de 60 `<div>`s en [`src/components/TimelinePanel.tsx`](file:///home/vladivostok/Documentos/EDITOR%20DE%20VIDEO/src/components/TimelinePanel.tsx#L1314) por `<AudioWaveformCanvas />`.
* Pasar las propiedades:
  * `waveform={asset.waveform}`
  * `assetDuration={asset.duration}`
  * `sourceStart={clip.sourceStart ?? 0}`
  * `clipDuration={clip.duration}`
  * `width={clip.duration * timelineZoom}`
  * `height={28}`
* Habilitar también la visualización en clips de video en pistas de audio desvinculadas o vinculadas.

### Paso 4: Pruebas y Verificación
* Validar que al cambiar el zoom del timeline los canvas se actualicen con nitidez instantánea.
* Validar que al recortar con las manijas izquierda/derecha de un clip de audio, la onda se desplace con absoluta fidelidad.
* Ejecutar verificación de tipos de TypeScript y compilación de producción (`npm run build`).
