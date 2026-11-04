# FASE 11: Sistema Universal de Keyframes para Video y Audio

Este documento especifica la arquitectura técnica, modelo de datos, motor de interpolación matemática, diseño de interfaz (UI/UX) y plan de integración del sistema de keyframes para **VOSTOK EDITOR**.

---

## 1. Visión y Principios de Diseño

1. **Abstracción Matemática Unificada:**
   Tanto en video (*posición X/Y, escala, rotación, opacidad*) como en audio (*volumen, paneo*), un keyframe responde al mismo principio: **el valor de una propiedad en un punto temporal determinado, con una regla de interpolación entre puntos contiguos**.
2. **Coordenadas de Tiempo Relativas al Clip (`timeOffset`):**
   Los keyframes se almacenan siempre en segundos relativos al inicio del clip (`0 <= timeOffset <= clip.duration`).
   * *Ventaja crucial:* Al mover o desplazar un clip en la línea de tiempo, o reordenar pistas, la animación viaja con el clip de forma inmutable, sin requerir recomputar la base de datos.
3. **Cero Impacto en Proyectos Existentes:**
   Si un clip no tiene keyframes definidos para una propiedad, el sistema utiliza el valor estático por defecto (`clip.transform.*`, `clip.volume`).
4. **Rendimiento de Grado Profesional:**
   El motor de interpolación se implementa como función pura de cálculo sub-microsegundo (cero asignación de memoria en el ciclo de renderizado a 60/120 FPS).

---

## 2. Modelo de Datos y Tipos en TypeScript

```typescript
// src/types/project.ts

export type InterpolationType = 'linear' | 'ease-in-out' | 'ease-in' | 'ease-out' | 'hold';

export interface Keyframe {
  id: string;
  timeOffset: number; // Segundos relativos al clip (0 <= timeOffset <= clip.duration)
  value: number;      // Valor numérico de la propiedad en ese instante
  interpolation?: InterpolationType; // Por defecto 'linear' o 'ease-in-out'
}

export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'scale'
  | 'rotation'
  | 'opacity'
  | 'volume';

export type ClipKeyframes = Partial<Record<AnimatableProperty, Keyframe[]>>;

export interface TimelineClip {
  id: string;
  // ... campos existentes (startTime, duration, transform, volume...)
  
  /** Diccionario de pistas de keyframes por propiedad animable */
  keyframes?: ClipKeyframes;
}
```

---

## 3. Motor Matemático de Interpolación (`src/lib/keyframeEngine.ts`)

La evaluación temporal se ejecuta mediante la función pura `evaluatePropertyAtTime`:

```typescript
export function evaluatePropertyAtTime(
  keyframes: Keyframe[] | undefined,
  staticValue: number,
  timeOffset: number
): number {
  if (!keyframes || keyframes.length === 0) return staticValue;

  // 1. Antes del primer keyframe -> valor del primer keyframe
  if (timeOffset <= keyframes[0].timeOffset) return keyframes[0].value;

  // 2. Después del último keyframe -> valor del último keyframe
  const last = keyframes[keyframes.length - 1];
  if (timeOffset >= last.timeOffset) return last.value;

  // 3. Localizar el segmento [kPrev, kNext]
  let prev = keyframes[0];
  let next = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (timeOffset >= keyframes[i].timeOffset && timeOffset <= keyframes[i + 1].timeOffset) {
      prev = keyframes[i];
      next = keyframes[i + 1];
      break;
    }
  }

  // 4. Factor normalizado u ∈ [0, 1]
  const segmentDuration = next.timeOffset - prev.timeOffset;
  if (segmentDuration <= 0.0001) return prev.value;
  const u = (timeOffset - prev.timeOffset) / segmentDuration;

  // 5. Aplicar curva de interpolación
  let p = u;
  const interp = prev.interpolation || 'linear';
  if (interp === 'ease-in-out') {
    p = u * u * (3 - 2 * u); // SmoothStep
  } else if (interp === 'ease-in') {
    p = u * u;
  } else if (interp === 'ease-out') {
    p = 1 - (1 - u) * (1 - u);
  } else if (interp === 'hold') {
    return prev.value;
  }

  // 6. Mezcla lineal con factor suavizado
  return prev.value + (next.value - prev.value) * p;
}
```

---

## 4. Integración en el Pipeline Visual y de Audio

### 4.1. Video y Gráficos (`CanvasPreviewStage.tsx`)
En `drawSingleClipToContext`, la transformación estática se reemplaza por la resolución dinámica en el instante `time`:
```typescript
const timeOffset = Math.max(0, time - clip.startTime);
const tf = {
  x: evaluatePropertyAtTime(clip.keyframes?.x, clip.transform.x, timeOffset),
  y: evaluatePropertyAtTime(clip.keyframes?.y, clip.transform.y, timeOffset),
  scale: evaluatePropertyAtTime(clip.keyframes?.scale, clip.transform.scale, timeOffset),
  rotation: evaluatePropertyAtTime(clip.keyframes?.rotation, clip.transform.rotation, timeOffset),
  opacity: evaluatePropertyAtTime(clip.keyframes?.opacity, clip.transform.opacity, timeOffset),
  flipX: clip.transform.flipX,
};
```
* **Exportación MP4:** Como el motor de exportación utiliza este mismo compositor fotograma a fotograma, las animaciones de escala, zoom, posición y opacidad se exportan a 1080p con 100% de fidelidad visual sin requerir modificaciones en el backend.

### 4.2. Audio en Tiempo Real y Exportación FFmpeg
1. **Previsualización en Vivo:**
   En el bucle de sincronización de audio:
   ```typescript
   const timeOffset = Math.max(0, playheadTime - clip.startTime);
   const keyframeVol = evaluatePropertyAtTime(clip.keyframes?.volume, clip.volume, timeOffset);
   aud.volume = Math.max(0, Math.min(1, keyframeVol * fadeFactor * ovFactor));
   ```
2. **Exportación con FFmpeg (`server/mediaBackendPlugin.ts`):**
   Si el clip contiene keyframes de volumen, el filtro estático `volume=X` se construye dinámicamente como expresión matemática por tramos temporales con `volume=eval=frame:volume='...'`, garantizando que las automatizaciones de volumen queden fielmente grabadas en el archivo `.mp4` final.

---

## 5. Diseño de Experiencia de Usuario (UI/UX)

### 5.1. En el Inspector Contextual (`InspectorPanel.tsx`, `TransformSection.tsx`, `AudioInspector.tsx`)
Cada propiedad animable cuenta con un bloque de control de keyframes:
1. **Botón Rombo de Estado (`◇` / `◆`):**
   * **Gris translúcido (`◇`):** No existe keyframe en el segundo actual del cabezal. Al pulsar, **añade un keyframe** con el valor actual del control.
   * **Cian activo (`◆`):** El cabezal coincide exactamente con un keyframe existente. Al pulsar, **elimina ese keyframe**.
   * **Auto-Keyframing inteligente:** Si la propiedad ya tiene keyframes y el usuario mueve el slider o campo numérico en una posición distinta del tiempo, se genera automáticamente un nuevo keyframe en dicho punto.
2. **Flechas de Navegación Rápida (`‹` y `›`):**
   * Permiten saltar el cabezal de reproducción instantáneamente al keyframe anterior o siguiente de esa propiedad para ajustes de precisión.

### 5.2. En la Línea de Tiempo (`TimelinePanel.tsx`)
* Al seleccionar un clip con keyframes, se renderizan pequeños rombos cian (`◆`) sobre la pista del clip a la altura de su `startTime + timeOffset`.
* Los rombos pueden ser seleccionados, arrastrados horizontalmente para ajustar el *timing* o eliminados con la tecla `Supr`.
* En clips de audio, se dibuja la curva de volumen continua sobre la forma de onda (*volume envelope*).

---

## 6. Acciones en el Store Central (`useProjectStore.ts`)

```typescript
// Métodos a incorporar en useProjectStore:

setClipKeyframe: (
  clipId: string,
  property: AnimatableProperty,
  timeOffset: number,
  value: number,
  interpolation?: InterpolationType
) => Promise<void>;

removeClipKeyframe: (
  clipId: string,
  property: AnimatableProperty,
  keyframeId: string
) => Promise<void>;

clearClipKeyframes: (
  clipId: string,
  property?: AnimatableProperty
) => Promise<void>;
```

---

## 7. Registro de Implementación por Etapas (Completadas al 100%)

1. **Etapa 1: Tipos, Motor Matemático y Suite de Pruebas Unitarias** — *[COMPLETADA]*
   * Creación de tipos en `src/types/project.ts` (`InterpolationType`, `AnimatableProperty`, `Keyframe`, `ClipKeyframes`).
   * Motor `src/lib/keyframeEngine.ts` con soporte completo para `linear`, `ease-in-out` (SmoothStep), `ease-in`, `ease-out`, `hold` y optimización con búsqueda binaria $O(\log N)$ para listas de keyframes >16.
   * Suite de pruebas `scripts/verify_keyframes_stage1.ts` (6/6 pruebas aprobadas).

2. **Etapa 2: Acciones en Zustand Store e Historial Deshacer/Rehacer** — *[COMPLETADA]*
   * Implementación de `setClipKeyframe`, `removeClipKeyframe` y `clearClipKeyframes` en `src/store/useProjectStore.ts`.
   * Deduplicación y actualización in-place con ventana de tolerancia de 33ms (1 frame a 30 FPS) y ordenamiento cronológico garantizado.
   * Integración con la pila de Undo/Redo (`Ctrl+Z` / `Ctrl+Y`) mediante `commitProjectUpdate`.
   * Suite de pruebas `scripts/verify_keyframes_stage2.ts` (7/7 pruebas aprobadas).

3. **Etapa 3: Integración en Canvas 2D y Gizmo con Auto-Keyframing** — *[COMPLETADA]*
   * Conexión dinámica de `evaluatePropertyAtTime` en `drawSingleClipToContext` y `renderProjectFrameToCanvas` en `CanvasPreviewStage.tsx`.
   * Exportación MP4 a 1080p en `ExportModal.tsx` con soporte nativo de transformaciones animadas.
   * Auto-Keyframing inteligente en `updateClipTransformLive` para mover, escalar y rotar con el Gizmo visual insertando automáticamente keyframes si la propiedad ya está animada.
   * Suite de pruebas `scripts/verify_keyframes_stage3.ts` (5/5 pruebas aprobadas).

4. **Etapa 4: Pipeline Acústico de Audio en Vivo y Exportación FFmpeg** — *[COMPLETADA]*
   * Evaluación de volumen a 60 FPS en Web Audio dentro de `CanvasPreviewStage.tsx`.
   * Generador de expresiones matemáticas de volumen de FFmpeg `buildFFmpegVolumeExpression` con protección `isnan(t)` en `keyframeEngine.ts`.
   * Integración en el backend `mediaBackendPlugin.ts` con filtros `volume=eval=frame:volume='...'` y sincronización con puntos In/Out en `ExportModal.tsx`.
   * Suite de pruebas `scripts/verify_keyframes_stage4.ts` con renderizado de audio real mediante FFmpeg y análisis espectral (4/4 pruebas aprobadas).

5. **Etapa 5: Controles Profesionales en el Inspector (UI)** — *[COMPLETADA]*
   * Componente reutilizable `KeyframeControlGroup.tsx` con navegación temporal rápida (`‹` y `›`), rombo interactivo reactivo (`◇` inactivo / `◆` activo con resplandor cian) y soporte para propiedades simples o duales (Posición X/Y).
   * Integración en `TransformSection.tsx` (Opacidad, Escala, Posición X/Y, Rotación) y en `AudioInspector.tsx` (Volumen).
   * Evaluación de valores interpolados en vivo en sliders y cajas numéricas durante el desplazamiento del cabezal.
   * Suite de pruebas `scripts/verify_keyframes_stage5.ts` (5/5 pruebas aprobadas).

6. **Etapa 6: Marcadores en Timeline y Envolvente Rubber-Band para Audio** — *[COMPLETADA]*
   * Componente `ClipKeyframeMarkers.tsx` en `TimelinePanel.tsx`: renderizado de rombos cian (`◆`) en posiciones temporales exactas, resaltado brillante al coincidir con el cabezal de reproducción y clic directo para posicionar el cabezal en el keyframe.
   * Componente `VolumeRubberBand.tsx`: curva continua de envolvente de volumen en SVG con polígono de sombreado sobre la forma de onda de audio de alta resolución, nodos romboidales en keyframes y creación por doble clic sobre la envolvente.
   * Suite de pruebas `scripts/verify_keyframes_stage6.ts` (6/6 pruebas aprobadas).

---

## 8. Refinamientos y Mejoras de Usabilidad Post-Implementación

1. **Preservación Acústica de la Curva en Doble Clic:**
   * Corrección del orden de argumentos en `evaluatePropertyAtTime(rawKeyframes, defaultVolume, timeOffset)` dentro de `VolumeRubberBand.tsx`.
   * Al hacer doble clic en cualquier punto temporal de la envolvente, el keyframe adopta exactamente el nivel de volumen que la curva tiene en ese instante, previniendo picos o anomalías de volumen.
2. **Sincronización Milimétrica con el Cabezal (Eliminación de Desfases):**
   * Eliminación del margen `inset-x-1` (4px) en los contenedores de `VolumeRubberBand` y `AudioWaveformCanvas`.
   * Coordenadas horizontales unificadas con `widthPx`, logrando que la línea vertical del cabezal coincida exactamente con el centro del rombo del keyframe.
3. **Unicidad de Rombos en Clips de Audio:**
   * Supresión de marcadores redundantes en clips de audio: `ClipKeyframeMarkers` se reserva para pistas de video, imagen y texto.
   * En pistas de audio, el rombo vive exclusivamente montado sobre la curva de volumen con el color cian oficial `#00d4e5`.
4. **Limpieza Visual de Pistas de Video:**
   * Remoción de la franja secundaria de onda de 12px al pie de los clips de video. Las pistas de video muestran de forma limpia sus miniaturas de fotogramas, mientras que la pista de audio vinculada gestiona la representación acústica.
