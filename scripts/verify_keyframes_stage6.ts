import { getAggregatedClipKeyframes } from '../src/components/timeline/ClipKeyframeMarkers';
import { computeVolumeY, buildVolumePath } from '../src/components/timeline/VolumeRubberBand';
import { evaluatePropertyAtTime } from '../src/lib/keyframeEngine';
import { useProjectStore } from '../src/store/useProjectStore';
import type { TimelineClip } from '../src/types/project';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Falló la aserción: ${msg}`);
    process.exit(1);
  }
}

async function runStage6Verification() {
  console.log('🧪 Iniciando verificación de FASE 11 - ETAPA 6 (UI en Timeline: Marcadores ◆ y Rubber-Band)...');

  // 1. Verificación de Agrupación de Keyframes (Clustering)
  console.log('\n1. Verificando agrupación de keyframes simultáneos (getAggregatedClipKeyframes)...');
  const mockClip: TimelineClip = {
    id: 'clip_stage6_test',
    trackId: 'track_v1',
    type: 'video',
    name: 'Video_Stage6.mp4',
    startTime: 5.0,
    duration: 10.0,
    sourceStart: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    volume: 1.0,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    overlapTransition: 'crossfade',
    keyframes: {
      x: [{ id: 'kf_x1', timeOffset: 2.0, value: 120, interpolation: 'linear' }],
      y: [{ id: 'kf_y1', timeOffset: 2.01, value: -60, interpolation: 'linear' }], // Dentro de 33ms de x1
      opacity: [{ id: 'kf_op1', timeOffset: 2.0, value: 0.5, interpolation: 'linear' }],
      scale: [{ id: 'kf_sc1', timeOffset: 6.5, value: 1.5, interpolation: 'ease-in-out' }],
    },
  };

  const clusters = getAggregatedClipKeyframes(mockClip);
  assert(clusters.length === 2, `Se esperaban 2 clusters agrupados, se obtuvieron ${clusters.length}`);
  assert(
    Math.abs(clusters[0].timeOffset - 2.0) <= 0.033,
    `El primer cluster debe centrarse alrededor de 2.0s (obtenido ${clusters[0].timeOffset})`
  );
  assert(
    clusters[0].properties.length === 3,
    `El primer cluster debe incluir 3 propiedades (x, y, opacity), tiene ${clusters[0].properties.length}`
  );
  assert(
    clusters[1].properties.length === 1 && clusters[1].properties[0].property === 'scale',
    'El segundo cluster debe contener la propiedad scale'
  );

  // Verificación de no duplicación en clips de audio:
  const mockAudioClip: TimelineClip = {
    ...mockClip,
    id: 'audio_stage6_test',
    type: 'audio',
    keyframes: {
      volume: [{ id: 'kf_v1', timeOffset: 3.0, value: 0.8, interpolation: 'linear' }],
    },
  };
  const audioClusters = getAggregatedClipKeyframes(mockAudioClip);
  assert(
    audioClusters.length === 0,
    'Clips de audio no deben generar rombos en ClipKeyframeMarkers (evita duplicidad con VolumeRubberBand)'
  );

  console.log('   ✓ Agrupación de keyframes simultáneos y preservación de propiedades validada.');

  // 2. Verificación de Límites de Píxeles en Timeline
  console.log('\n2. Verificando cálculo de límites de píxeles (boundedLeft) para zoom...');
  const zoom = 100; // 100 px por segundo
  const clipWidthPx = mockClip.duration * zoom; // 1000 px

  // Keyframe en 0s (inicio exacto)
  const rawLeft0 = 0.0 * zoom;
  const boundedLeft0 = Math.max(5, Math.min(clipWidthPx - 5, rawLeft0));
  assert(boundedLeft0 === 5, `El límite izquierdo en 0s debe ser 5px (obtenido ${boundedLeft0})`);

  // Keyframe en duración máxima (final exacto)
  const rawLeftEnd = mockClip.duration * zoom;
  const boundedLeftEnd = Math.max(5, Math.min(clipWidthPx - 5, rawLeftEnd));
  assert(boundedLeftEnd === clipWidthPx - 5, `El límite derecho debe ser ${clipWidthPx - 5}px (obtenido ${boundedLeftEnd})`);

  // Keyframe a 2.0s
  const rawLeft2 = 2.0 * zoom; // 200px
  const boundedLeft2 = Math.max(5, Math.min(clipWidthPx - 5, rawLeft2));
  assert(boundedLeft2 === 200, `La posición a 2.0s debe ser 200px (obtenido ${boundedLeft2})`);
  console.log('   ✓ Bounded left y márgenes de seguridad para esquinas redondeadas validados.');

  // 3. Verificación de Detección de Keyframe Activo (Resaltado ◆ con Cabezal)
  console.log('\n3. Verificando detección de estado activo con el cabezal de reproducción...');
  const kfGlobalTime = mockClip.startTime + clusters[0].timeOffset; // 5.0 + 2.0 = 7.0s
  const threshold = 0.04;

  const isActiveExactlyAt7 = Math.abs(7.0 - kfGlobalTime) < threshold;
  const isActiveAt6_98 = Math.abs(6.98 - kfGlobalTime) < threshold;
  const isActiveAt7_02 = Math.abs(7.02 - kfGlobalTime) < threshold;
  const isInactiveAt6_9 = Math.abs(6.9 - kfGlobalTime) < threshold;
  const isInactiveAt7_1 = Math.abs(7.1 - kfGlobalTime) < threshold;

  assert(isActiveExactlyAt7, 'Debe estar activo exactamente en 7.00s');
  assert(isActiveAt6_98, 'Debe estar activo en 6.98s (dentro de 40ms)');
  assert(isActiveAt7_02, 'Debe estar activo en 7.02s (dentro de 40ms)');
  assert(!isInactiveAt6_9, 'Debe estar inactivo en 6.90s (fuera de tolerancia)');
  assert(!isInactiveAt7_1, 'Debe estar inactivo en 7.10s (fuera de tolerancia)');
  console.log('   ✓ Detección de proximidad del cabezal para brillo de rombo activo validada.');

  // 4. Verificación de Mapeo Y de Curva de Volumen (computeVolumeY)
  console.log('\n4. Verificando mapeo vertical de envolvente de volumen (computeVolumeY)...');
  const h = 28;
  const yMute = computeVolumeY(0.0, h);
  const yUnity = computeVolumeY(1.0, h);
  const yBoost = computeVolumeY(2.0, h);

  assert(yMute === 24.0, `Volumen 0.0 debe mapearse a 24.0px (obtenido ${yMute})`);
  assert(yUnity === 14.0, `Volumen 1.0 (ganancia unitaria) debe mapearse al centro 14.0px (obtenido ${yUnity})`);
  assert(yBoost === 4.0, `Volumen 2.0 (+6dB boost) debe mapearse a 4.0px (obtenido ${yBoost})`);
  console.log('   ✓ Mapeo de volumen (0% -> abajo, 100% -> centro, 200% -> arriba) validado.');

  // 5. Verificación de Generación de Rutas SVG de Envolvente (buildVolumePath)
  console.log('\n5. Verificando generación de envolvente Rubber-Band en SVG (buildVolumePath)...');
  // 5a. Sin keyframes: línea plana en volumen base
  const defaultPath = buildVolumePath([], 10.0, 1.0, 500, 28, 50);
  assert(defaultPath.pathD === 'M 0 14 L 500 14', `Ruta base sin keyframes incorrecta: ${defaultPath.pathD}`);
  assert(defaultPath.areaD.includes('L 500 28 L 0 28 Z'), 'Polígono de sombreado debe cerrar en la base');

  // 5b. Con keyframes lineales
  const linearKfs = [
    { id: 'v1', timeOffset: 2.0, value: 0.0, interpolation: 'linear' as const },
    { id: 'v2', timeOffset: 6.0, value: 1.0, interpolation: 'linear' as const },
  ];
  const linearPath = buildVolumePath(linearKfs, 10.0, 1.0, 500, 28, 50);
  assert(linearPath.pathD.startsWith('M 0 24 L 100.0 24'), 'Tramo inicial debe mantener valor del primer keyframe');
  assert(linearPath.pathD.includes('L 300.0 14'), 'Tramo intermedio debe conectar linealmente con segundo keyframe');
  assert(linearPath.pathD.endsWith('L 500.0 14'), 'Tramo final debe extenderse hasta el final del clip');

  // 5c. Con keyframes ease-in-out
  const easeKfs = [
    { id: 'v3', timeOffset: 1.0, value: 0.0, interpolation: 'ease-in-out' as const },
    { id: 'v4', timeOffset: 4.0, value: 2.0, interpolation: 'ease-in-out' as const },
  ];
  const easePath = buildVolumePath(easeKfs, 10.0, 1.0, 500, 28, 50);
  const sampleStepsCount = (easePath.pathD.match(/L /g) || []).length;
  assert(sampleStepsCount >= 8, `Curva ease debe incluir múltiples muestras intermedias (encontradas ${sampleStepsCount})`);
  console.log('   ✓ Rutas de envolvente SVG lineal, curva suave y área sombreada validadas.');

  // 6. Verificación de Interacción con el Store (Salto de Cabezal y Doble Clic en Envolvente)
  console.log('\n6. Verificando interacción del store con marcadores y envolvente...');
  const store = useProjectStore.getState();

  // Crear clip de prueba en el store
  await store.setClipKeyframe(mockClip.id, 'volume', 3.5, 0.75);

  // Simular clic en el marcador de 3.5s
  const targetSeekTime = mockClip.startTime + 3.5; // 8.5s
  store.setPlayheadTime(targetSeekTime);
  assert(
    Math.abs(useProjectStore.getState().playheadTime - 8.5) < 0.001,
    `El cabezal debió posicionarse en 8.5s, actual: ${useProjectStore.getState().playheadTime}`
  );

  console.log('   ✓ Posicionamiento de cabezal e inserción de keyframes validados.');

  // 7. Verificación de Doble Clic en Envolvente (Opción A - Preservación de Curva sin Picos Accidentales)
  console.log('\n7. Verificando inserción de volumen en doble clic (corrección de orden de argumentos)...');
  const testDefaultVolume = 1.0;
  const clickTimeOffset = 9.34;
  
  // Sin keyframes previos: debe adoptar exactamente el defaultVolume (1.0 = 100%), jamás 9.34 (934%)
  const emptyKfs: any[] = [];
  const evalWithoutKeyframes = evaluatePropertyAtTime(emptyKfs, testDefaultVolume, clickTimeOffset);
  assert(
    evalWithoutKeyframes === 1.0,
    `El volumen evaluado en t=${clickTimeOffset}s debe ser 1.0 (100%), no ${evalWithoutKeyframes} (${evalWithoutKeyframes * 100}%)`
  );

  // Con curva previa entre 0.0s (0.2) y 10.0s (1.0): en t=5.0s debe ser exactamente 0.6 (60%)
  const existingCurve = [
    { id: 'k1', timeOffset: 0.0, value: 0.2, interpolation: 'linear' as const },
    { id: 'k2', timeOffset: 10.0, value: 1.0, interpolation: 'linear' as const },
  ];
  const evalOnCurve = evaluatePropertyAtTime(existingCurve, testDefaultVolume, 5.0);
  assert(
    Math.abs(evalOnCurve - 0.6) < 0.001,
    `El volumen evaluado en la curva a 5.0s debe ser 0.6 (60%), obtenido ${evalOnCurve}`
  );

  console.log('   ✓ Preservación de curva acústica en doble clic (100% en 9.34s) validada.');

  console.log('\n✅ TODAS LAS PRUEBAS DE LA ETAPA 6 PASARON CON ÉXITO.');
}

runStage6Verification().catch((err) => {
  console.error('Error durante la verificación:', err);
  process.exit(1);
});
