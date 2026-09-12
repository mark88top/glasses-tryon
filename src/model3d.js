/**
 * model3d.js — Carga de monturas 3D reales y su normalizacion.
 *
 * Cada modelo viene de un autor distinto: escala arbitraria (metros, centimetros
 * o unidades de Blender), orientacion arbitraria y origen en cualquier lado.
 * Para poder ponerlo sobre una cara hay que llevarlos todos al MISMO sistema:
 *
 *    X = ancho de la cara (+ hacia la derecha)
 *    Y = arriba
 *    Z = adelante (+ hacia la camara); las patillas se van hacia -Z
 *    escala: ancho total del armazon = 1
 *    origen: punto medio entre las pupilas, sobre el plano de las lentes
 *
 * La orientacion se deduce de la geometria, no se hardcodea:
 *  - el eje X es el unico con simetria especular (un anteojo es simetrico
 *    izquierda/derecha y no en los otros dos ejes),
 *  - de los dos que quedan, el de menor extension es el vertical,
 *  - el frente es la mitad con mas vertices (las lentes concentran malla; las
 *    patillas son dos tubos finos),
 *  - arriba es donde esta el puente: sobre el eje central, el material esta por
 *    encima del centro (abajo, entre las lentes, no hay nada).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

/** Junta una muestra de vertices del modelo, ya en coordenadas del objeto raiz. */
function samplePoints(root, maxPoints = 24000) {
  const meshes = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) meshes.push(o); });
  let total = 0;
  for (const m of meshes) total += m.geometry.attributes.position.count;
  const stride = Math.max(1, Math.ceil(total / maxPoints));

  const pts = [];
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      pts.push(v.x, v.y, v.z);
    }
  }
  return { pts: new Float32Array(pts), count: pts.length / 3, meshCount: meshes.length, vertexTotal: total };
}

function extentsOf(pts, count) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      const val = pts[i * 3 + a];
      if (val < min[a]) min[a] = val;
      if (val > max[a]) max[a] = val;
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
           center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2] };
}

/**
 * Puntaje de simetria especular respecto del plano perpendicular al eje `axis`.
 * Voxeliza y compara la ocupacion con su espejo: cuanto mas alto, mas simetrico.
 */
function symmetryScore(pts, count, axis, ext, res = 24) {
  const size = ext.size;
  const grid = new Uint8Array(res * res * res);
  const idx = (a, b, c) => (a * res + b) * res + c;
  const cell = (val, a) => {
    const t = (val - ext.min[a]) / (size[a] || 1);
    return Math.max(0, Math.min(res - 1, Math.floor(t * res)));
  };
  for (let i = 0; i < count; i++) {
    grid[idx(cell(pts[i * 3], 0), cell(pts[i * 3 + 1], 1), cell(pts[i * 3 + 2], 2))] = 1;
  }
  let filled = 0, matched = 0;
  for (let a = 0; a < res; a++) for (let b = 0; b < res; b++) for (let c = 0; c < res; c++) {
    if (!grid[idx(a, b, c)]) continue;
    filled++;
    const m = [a, b, c];
    m[axis] = res - 1 - m[axis];
    if (grid[idx(m[0], m[1], m[2])]) matched++;
  }
  return filled ? matched / filled : 0;
}

/** Decide el mapeo de ejes del modelo -> nuestro sistema (X ancho, Y arriba, Z adelante). */
export function detectOrientation(pts, count) {
  const ext = extentsOf(pts, count);
  const sym = [0, 1, 2].map((a) => symmetryScore(pts, count, a, ext));

  // X = el eje con mayor simetria especular.
  let ax = sym.indexOf(Math.max(...sym));
  // De los otros dos, el vertical es el de menor extension (un anteojo es chato).
  const rest = [0, 1, 2].filter((a) => a !== ax);
  let ay = ext.size[rest[0]] <= ext.size[rest[1]] ? rest[0] : rest[1];
  let az = rest.find((a) => a !== ay);

  // Signo de Z: el frente concentra vertices (lentes); atras solo hay dos patillas.
  let frontHalf = 0, backHalf = 0;
  const midZ = ext.center[az];
  for (let i = 0; i < count; i++) (pts[i * 3 + az] > midZ ? frontHalf++ : backHalf++, 0);
  const signZ = frontHalf >= backHalf ? 1 : -1;

  // Signo de Y: sobre el eje central esta el puente, que va ARRIBA del centro.
  // Debajo del puente, entre las dos lentes, no hay material.
  const halfW = ext.size[ax] / 2;
  let bridgeSum = 0, bridgeN = 0;
  for (let i = 0; i < count; i++) {
    const dx = Math.abs(pts[i * 3 + ax] - ext.center[ax]);
    const dz = (pts[i * 3 + az] - midZ) * signZ;
    if (dx < halfW * 0.16 && dz > 0) { bridgeSum += pts[i * 3 + ay] - ext.center[ay]; bridgeN++; }
  }
  const signY = bridgeN > 20 ? (bridgeSum >= 0 ? 1 : -1) : 1;

  return {
    axes: { x: ax, y: ay, z: az },
    signs: { x: 1, y: signY, z: signZ },
    symmetry: sym.map((v) => +v.toFixed(3)),
    extents: ext.size.map((v) => +v.toFixed(4)),
    confidence: +(Math.max(...sym) - Math.min(...sym)).toFixed(3),
    bridgeSamples: bridgeN,
  };
}

/** Matriz que lleva el modelo crudo a nuestro sistema normalizado. */
export function orientationMatrix(o) {
  const m = new THREE.Matrix4();
  const e = m.elements;
  e.fill(0); e[15] = 1;
  // columna de destino <- eje de origen
  const put = (dstRow, srcAxis, sign) => { e[srcAxis * 4 + dstRow] = sign; };
  put(0, o.axes.x, o.signs.x);
  put(1, o.axes.y, o.signs.y);
  put(2, o.axes.z, o.signs.z);
  // Si el mapeo quedo con handedness invertida, la malla se ve del reves: lo corregimos.
  if (new THREE.Matrix4().copy(m).determinant() < 0) put(0, o.axes.x, -o.signs.x);
  return m;
}

/**
 * Carga un modelo y lo devuelve normalizado: ancho 1, origen entre las pupilas,
 * mirando a +Z. `override` permite corregir a mano lo que la deteccion falle.
 */
export async function loadFrame(url, override = {}) {
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene || gltf.scenes[0];

  const sample = samplePoints(root);
  const detected = detectOrientation(sample.pts, sample.count);
  const orient = { ...detected, ...(override.orientation || {}) };

  // Aplicamos la orientacion a un contenedor y volvemos a medir ya alineado.
  const oriented = new THREE.Group();
  oriented.add(root);
  root.applyMatrix4(orientationMatrix(orient));
  oriented.updateMatrixWorld(true);

  const s2 = samplePoints(oriented);
  const ext = extentsOf(s2.pts, s2.count);
  const width = ext.size[0] || 1;

  // El plano de las lentes: la franja frontal del modelo.
  const zFront = ext.max[2];
  let ySum = 0, yN = 0;
  for (let i = 0; i < s2.count; i++) {
    if (s2.pts[i * 3 + 2] > zFront - ext.size[2] * 0.22) { ySum += s2.pts[i * 3 + 1]; yN++; }
  }
  const yLens = yN ? ySum / yN : ext.center[1];

  // Origen: centrado en X, a la altura del centro de las lentes, sobre el frente.
  const anchor = new THREE.Vector3(ext.center[0], yLens, zFront);
  root.position.sub(anchor.clone().multiplyScalar(1));
  oriented.scale.setScalar(1 / width);

  // Materiales: sin esto las mallas con caras invertidas se ven agujereadas.
  oriented.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mt of mats) {
      if (!mt) continue;
      mt.side = THREE.DoubleSide;
      if (mt.transparent && mt.opacity < 0.25) mt.opacity = 0.35;  // lentes fantasma
      mt.depthWrite = !mt.transparent;
    }
  });

  return {
    object: oriented,
    detected, orient,
    stats: {
      meshes: sample.meshCount, vertices: sample.vertexTotal,
      widthRaw: +width.toFixed(4),
      aspect: { h: +(ext.size[1] / width).toFixed(3), d: +(ext.size[2] / width).toFixed(3) },
    },
  };
}
