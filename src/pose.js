/**
 * pose.js — De los 478 landmarks de MediaPipe a una pose de cabeza estable
 * y a medidas reales de la cara en milimetros.
 *
 * Idea central: el iris humano mide 11.7mm de diametro en practicamente todos
 * los adultos (desvio ~0.5mm). Es la regla de medir que tenemos en la cara:
 * con el iris calibramos px->mm y de ahi salen la distancia interpupilar (DIP)
 * y el ancho de cara reales, que es lo que define que talle de armazon entra.
 */

const IRIS_DIAMETER_MM = 11.7;

// Indices del face mesh (478 puntos, refineLandmarks: true).
export const LM = {
  irisA: [468, 469, 470, 471, 472],   // un iris (el lado se resuelve por X, no por nombre)
  irisB: [473, 474, 475, 476, 477],   // el otro
  eyeOuterA: 33,  eyeOuterB: 263,
  eyeInnerA: 133, eyeInnerB: 362,
  cheekA: 234,    cheekB: 454,        // extremos laterales de la cara (sienes/pomulos)
  earA: 127,      earB: 356,
  browA: 105,     browB: 334,
  noseBridge: 168, noseTip: 4, noseBottom: 2,
  chin: 152, forehead: 10,
};

export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Landmarks normalizados -> espacio isotropico en pixeles (z en la misma escala que x). */
function toPixels(landmarks, W, H) {
  return landmarks.map((p) => [p.x * W, p.y * H, (p.z || 0) * W]);
}

function centroid(pts, idx) {
  let x = 0, y = 0, z = 0;
  for (const i of idx) { x += pts[i][0]; y += pts[i][1]; z += pts[i][2]; }
  return [x / idx.length, y / idx.length, z / idx.length];
}

// Diametro del iris medido sobre sus 4 puntos perimetrales (el 1ro es el centro).
function irisDiameterPx(pts, idx) {
  const c = pts[idx[0]];
  let sum = 0;
  for (let i = 1; i < idx.length; i++) sum += len(sub(pts[idx[i]], c));
  return (sum / (idx.length - 1)) * 2;
}

/**
 * Calcula la pose: origen entre pupilas, base ortonormal (u=derecha, v=arriba,
 * w=hacia adelante) y la escala px/mm. Todo en el espacio isotropico de pixeles.
 */
export function computePose(landmarks, W, H) {
  const p = toPixels(landmarks, W, H);

  // El iris con menor X es el de la izquierda de la IMAGEN; no asumimos nada del naming.
  const cA = centroid(p, LM.irisA), cB = centroid(p, LM.irisB);
  const [leftIrisIdx, rightIrisIdx] = cA[0] < cB[0] ? [LM.irisA, LM.irisB] : [LM.irisB, LM.irisA];
  const pupilL = centroid(p, leftIrisIdx);   // izquierda de la imagen
  const pupilR = centroid(p, rightIrisIdx);  // derecha de la imagen

  const origin = scale(addv(pupilL, pupilR), 0.5);

  // u: eje horizontal de la cara, de pupila a pupila (hacia la derecha de la imagen).
  const u = norm(sub(pupilR, pupilL));
  // eje vertical aproximado: menton -> frente.
  const vRaw = norm(sub(p[LM.forehead], p[LM.chin]));
  // w sale del producto cruz y despues re-ortogonalizamos v (Gram-Schmidt).
  let w = norm(cross(u, vRaw));
  // w debe apuntar HACIA la camara (z negativo = mas cerca en MediaPipe).
  if (w[2] > 0) w = scale(w, -1);
  const v = norm(cross(w, u));

  // Escala real: el iris como regla de 11.7mm.
  const irisPx = (irisDiameterPx(p, leftIrisIdx) + irisDiameterPx(p, rightIrisIdx)) / 2;
  const pxPerMm = irisPx / IRIS_DIAMETER_MM;

  const pdPx = len(sub(pupilR, pupilL));
  const faceWidthPx = len(sub(p[LM.cheekB], p[LM.cheekA]));
  const faceHeightPx = len(sub(p[LM.forehead], p[LM.chin]));

  // Angulos de cabeza, en grados, para la UI y para decidir oclusiones.
  const yaw = Math.asin(Math.max(-1, Math.min(1, w[0]))) * 180 / Math.PI;
  const pitch = Math.asin(Math.max(-1, Math.min(1, -w[1]))) * 180 / Math.PI;
  const roll = Math.atan2(u[1], u[0]) * 180 / Math.PI;

  return {
    origin, u, v, w, pxPerMm,
    pupilL, pupilR,
    yaw, pitch, roll,
    measures: {
      pd: pdPx / pxPerMm,                    // distancia interpupilar (mm)
      faceWidth: faceWidthPx / pxPerMm,      // ancho de cara pomulo a pomulo (mm)
      faceHeight: faceHeightPx / pxPerMm,    // menton a frente (mm)
      // La nariz define donde apoya el puente: altura pupila -> base de la nariz.
      noseDrop: len(sub(p[LM.noseBottom], origin)) / pxPerMm,
    },
    px: p,
  };
}

/** Suavizado exponencial adaptativo: sigue rapido los movimientos grandes y calma el jitter. */
export class PoseSmoother {
  constructor() { this.prev = null; }

  reset() { this.prev = null; }

  smooth(pose, dt = 1 / 30) {
    if (!this.prev) { this.prev = pose; return pose; }
    const prev = this.prev;

    // Velocidad del origen en px: mucho movimiento -> menos filtro (menos lag).
    const moved = Math.hypot(pose.origin[0] - prev.origin[0], pose.origin[1] - prev.origin[1]);
    const a = Math.min(0.92, 0.28 + moved * 0.05);   // factor hacia el valor nuevo

    const lerpV = (A, B) => [A[0] + (B[0] - A[0]) * a, A[1] + (B[1] - A[1]) * a, A[2] + (B[2] - A[2]) * a];
    const lerp = (x, y, k = a) => x + (y - x) * k;

    const out = {
      ...pose,
      origin: lerpV(prev.origin, pose.origin),
      u: norm(lerpV(prev.u, pose.u)),
      v: norm(lerpV(prev.v, pose.v)),
      w: norm(lerpV(prev.w, pose.w)),
      pxPerMm: lerp(prev.pxPerMm, pose.pxPerMm, 0.15),   // la escala casi no deberia saltar
      yaw: lerp(prev.yaw, pose.yaw), pitch: lerp(prev.pitch, pose.pitch), roll: lerp(prev.roll, pose.roll),
      measures: Object.fromEntries(
        Object.entries(pose.measures).map(([k, val]) => [k, lerp(prev.measures[k], val, 0.08)])
      ),
    };
    // Re-ortogonalizamos: interpolar rompe la base y el armazon se deformaria.
    out.w = norm(cross(out.u, out.v));
    if (out.w[2] > 0) out.w = scale(out.w, -1);
    out.v = norm(cross(out.w, out.u));

    this.prev = out;
    return out;
  }
}

/** Proyecta un punto 3D local (mm) al plano de la imagen. */
export function project(pose, [X, Y, Z]) {
  const { origin, u, v, w, pxPerMm } = pose;
  const s = pxPerMm;
  return [
    origin[0] + s * (X * u[0] + Y * v[0] + Z * w[0]),
    origin[1] + s * (X * u[1] + Y * v[1] + Z * w[1]),
    origin[2] + s * (X * u[2] + Y * v[2] + Z * w[2]),   // z = profundidad, para ordenar piezas
  ];
}

export const projectAll = (pose, pts) => pts.map((p) => project(pose, p));

/**
 * Recomendacion de talle a partir de las medidas de la cara.
 *
 * Para lentes PLANAS o con filtro (sin graduacion) el centrado optico es casi
 * irrelevante, y lo que decide el talle es el ancho.
 * Regla de optica: el ancho total del armazon deberia igualar el ancho de la
 * cara (+/-4mm ideal, +/-8mm tolerable). La descentracion queda como dato
 * informativo, solo molesta si algun dia le pone aumento.
 */
export function fitAdvice(measures, frameSpec) {
  const { pd, faceWidth } = measures;
  const total = frameSpec.totalWidth || frameSpec.frameWidth;
  const widthDelta = total - faceWidth;
  const framePd = frameSpec.lensWidth + frameSpec.bridge;
  const decentration = (framePd - pd) / 2;      // mm por lente

  let verdict = 'ok';
  const notes = [];

  if (widthDelta > 8) { verdict = 'mal'; notes.push('mas ancho que tu cara: se resbala y las patillas no apoyan'); }
  else if (widthDelta > 4) { verdict = 'justo'; notes.push('un toque ancho, revisa que no se deslice'); }
  else if (widthDelta < -8) { verdict = 'mal'; notes.push('mas angosto que tu cara: te aprieta las sienes'); }
  else if (widthDelta < -4) { verdict = 'justo'; notes.push('un toque angosto'); }
  else { notes.push('el ancho te da bien'); }

  if (Math.abs(decentration) > 6) {
    notes.push(`descentracion de ${Math.abs(decentration).toFixed(0)}mm por lente (sin aumento no molesta)`);
  }

  return { verdict, widthDelta, decentration, framePd, notes };
}

/** Que talle pedir en la optica, leido de la cara. */
export function suggestSize(measures) {
  const { pd, faceWidth } = measures;
  const bridge = Math.round(Math.max(14, Math.min(22, pd * 0.29)));
  // ancho total = 2*calibre + puente + terminales (~12mm entre los dos lados)
  const lensWidth = Math.round((faceWidth - bridge - 12) / 2);
  return {
    lensWidth, bridge,
    range: [lensWidth - 2, lensWidth + 2],
    frameWidth: Math.round(faceWidth),
    reading: `${lensWidth}\u2013${bridge}\u2013145`,
  };
}
