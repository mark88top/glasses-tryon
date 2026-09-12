/**
 * geometry.js — Geometria parametrica de anteojos.
 *
 * Todo modelo del catalogo se construye en milimetros reales, en un espacio
 * local centrado entre las pupilas:
 *    X = derecha de la cara (+)      Y = arriba (+)      Z = hacia adelante (+)
 * El origen (0,0,0) es el punto medio entre pupilas, sobre el plano de las lentes.
 *
 * Asi, un armazon de 52mm de calibre se dibuja mas chico que uno de 58mm sobre
 * la misma cara: el probador sirve para chequear talle, no solo estetica.
 */

/* ---------- utilidades de curvas ---------- */

// Catmull-Rom cerrada: convierte un poligono de control en una silueta suave.
export function smoothClosed(pts, perSeg = 14) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

// Superelipse: n=2 circulo, n grande = rectangulo con esquinas vivas.
function superellipse(n = 4, count = 48) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push([Math.sign(c) * Math.pow(Math.abs(c), 2 / n), Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
  }
  return pts;
}

function polygon(sides, rot = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  return pts;
}

/* ---------- siluetas de lente ----------
 * Definidas para la lente DERECHA en espacio normalizado x,y en [-1,1],
 * donde +x es el lado temporal (hacia la oreja) y -x el lado nasal.
 * La lente izquierda es el espejo exacto.
 */
export const SHAPES = {
  rectangle:   { pts: superellipse(4.5),                 aspect: 0.62, label: 'Rectangular' },
  square:      { pts: superellipse(5.5),                 aspect: 0.76, label: 'Cuadrada' },
  round:       { pts: superellipse(2.0),                 aspect: 1.00, label: 'Redonda' },
  oval:        { pts: superellipse(2.2),                 aspect: 0.70, label: 'Ovalada' },
  panto:       { pts: superellipse(2.6),                 aspect: 0.92, label: 'Panto' },
  hexagonal:   { pts: polygon(6, Math.PI / 6),           aspect: 0.80, label: 'Hexagonal' },
  octagonal:   { pts: polygon(8, Math.PI / 8),           aspect: 0.82, label: 'Octagonal' },

  wayfarer: {
    pts: smoothClosed([
      [-0.98, 0.58], [-0.82, 0.93], [-0.10, 1.00], [0.62, 0.99], [0.98, 0.86],
      [1.00, 0.20], [0.86, -0.52], [0.42, -0.94], [-0.34, -1.00], [-0.86, -0.74], [-1.00, -0.12],
    ], 8),
    aspect: 0.80, label: 'Wayfarer',
  },
  aviator: {
    pts: smoothClosed([
      [-0.96, 0.62], [-0.72, 0.94], [0.10, 1.00], [0.80, 0.92], [1.00, 0.52],
      [0.92, -0.18], [0.58, -0.78], [0.02, -1.00], [-0.56, -0.90], [-0.94, -0.44], [-1.00, 0.14],
    ], 8),
    aspect: 0.80, label: 'Aviador',
  },
  cat_eye: {
    pts: smoothClosed([
      [-0.98, 0.42], [-0.74, 0.82], [0.04, 0.92], [0.66, 1.02], [1.02, 1.22], [1.00, 0.58],
      [0.90, -0.16], [0.50, -0.82], [-0.28, -1.00], [-0.86, -0.70], [-1.00, -0.14],
    ], 8),
    aspect: 0.76, label: 'Cat eye',
  },
  browline: {
    pts: smoothClosed([
      [-0.98, 0.62], [-0.80, 0.96], [0.00, 1.02], [0.70, 0.98], [1.00, 0.74],
      [0.94, 0.02], [0.56, -0.72], [-0.20, -0.98], [-0.84, -0.72], [-1.00, -0.06],
    ], 8),
    aspect: 0.78, label: 'Browline', brow: true,
  },
  geometric: {
    pts: smoothClosed([
      [-1.00, 0.30], [-0.62, 0.96], [0.34, 1.00], [1.00, 0.66],
      [0.92, -0.22], [0.40, -0.92], [-0.48, -0.96], [-0.96, -0.36],
    ], 6),
    aspect: 0.80, label: 'Geometrica',
  },
  shield: {
    pts: smoothClosed([
      [-1.00, 0.70], [-0.20, 1.00], [0.70, 0.96], [1.00, 0.50],
      [0.96, -0.40], [0.30, -0.94], [-0.60, -0.98], [-1.00, -0.30],
    ], 8),
    aspect: 0.92, label: 'Mascara / sport',
  },
  oversized: {
    pts: smoothClosed([
      [-0.98, 0.66], [-0.70, 0.98], [0.20, 1.02], [0.86, 0.94], [1.00, 0.46],
      [0.90, -0.40], [0.44, -0.94], [-0.40, -1.00], [-0.88, -0.70], [-1.00, -0.06],
    ], 8),
    aspect: 0.86, label: 'Oversized',
  },
};

export const SHAPE_LABELS = Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.label]));

/* ---------- construccion del armazon ---------- */

// Escala un poligono normalizado a milimetros y lo ubica en su ojo.
function placeLens(shapePts, cx, halfW, halfH) {
  return shapePts.map(([x, y]) => [cx + x * halfW, y * halfH]);
}

// Espesor hacia afuera: offset del contorno respecto de su centroide.
function offsetOutline(pts, cx, grow) {
  let sy = 0;
  for (const p of pts) sy += p[1];
  const cyy = sy / pts.length;
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cyy;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * grow, y + (dy / d) * grow];
  });
}

// Curvatura del frente: las lentes se alejan del ojo en los extremos (base curve).
function frontZ(x, spec) {
  const t = x / (spec.frameWidth / 2);
  return spec.vertexZ - spec.wrap * t * t;
}

/**
 * Construye el "mesh" de un modelo. Devuelve piezas en 3D (mm) listas para proyectar.
 * spec: {shape, lensWidth, lensHeight, bridge, templeLength, rimThickness, ...}
 */
export function buildFrame(spec) {
  const S = SHAPES[spec.shape] || SHAPES.rectangle;
  const lensW = spec.lensWidth;                       // calibre (mm)
  const lensH = spec.lensHeight || lensW * S.aspect;  // altura de la lente (mm)
  const halfW = lensW / 2, halfH = lensH / 2;
  const cx = (lensW + spec.bridge) / 2;               // centro de la lente derecha
  const endpiece = spec.endpiece ?? 4;          // terminal + bisagra que sobresale de la lente
  const frameWidth = 2 * cx + lensW;            // ancho optico: 2 calibres + puente
  const totalWidth = frameWidth + 2 * (spec.rimThickness + endpiece);  // lo que realmente abarca en la cara
  const ctx = { ...spec, frameWidth };

  const rim = spec.rimThickness;
  const lift = spec.lift || 0;    // cuanto sube el armazon respecto de la pupila

  // Contornos de la lente derecha (la izquierda es espejo en X).
  const innerR = placeLens(S.pts, cx, halfW, halfH).map(([x, y]) => [x, y + lift]);
  const outerR = offsetOutline(innerR, cx, rim);

  const to3D = (pts, dz = 0) => pts.map(([x, y]) => [x, y, frontZ(x, ctx) + dz]);
  const mirror = (pts) => pts.map(([x, y, z]) => [-x, y, z]);

  const lensRight = to3D(innerR);
  const lensLeft = mirror(lensRight);
  const rimRight = { inner: to3D(innerR), outer: to3D(outerR, -0.3) };
  const rimLeft = { inner: mirror(rimRight.inner), outer: mirror(rimRight.outer) };

  // Puente: del borde nasal de una lente al de la otra, a la altura pedida.
  const bridgeY = lift + halfH * (spec.bridgeHeight ?? 0.30);
  const nasalX = cx - halfW;
  const bridgeSag = spec.bridgeSag ?? 0.22;   // cuanto "cuelga" el puente
  const bridge = [];
  const bSteps = 24;
  for (let i = 0; i <= bSteps; i++) {
    const t = i / bSteps;                       // 0 = derecha, 1 = izquierda
    const x = nasalX - t * (2 * nasalX);
    const s = Math.sin(t * Math.PI);
    const y = bridgeY - s * bridgeSag * halfH;
    bridge.push([x, y, frontZ(x, ctx) - s * 1.2]);
  }

  // Doble puente (aviator / clubmaster metal).
  let bridge2 = null;
  if (spec.doubleBridge) {
    bridge2 = [];
    const y2 = lift + halfH * 0.88;
    for (let i = 0; i <= bSteps; i++) {
      const t = i / bSteps;
      const x = nasalX - t * (2 * nasalX);
      bridge2.push([x, y2 - Math.sin(t * Math.PI) * 0.06 * halfH, frontZ(x, ctx)]);
    }
  }

  // Barra de ceja (browline / clubmaster). En estos modelos el aro de abajo es
  // metal finito y TODO el peso visual esta arriba: si se dibuja un aro grueso
  // completo deja de leerse como clubmaster y parece un armazon comun.
  let browBar = null;
  if (spec.browBar || S.brow) {
    const top = outerR.filter(([, y]) => y > lift + halfH * 0.12);
    top.sort((a, b) => a[0] - b[0]);
    // se extiende un poco mas alla del borde temporal, donde arranca la bisagra
    const bar = top.map(([x, y]) => [x, y, frontZ(x, ctx)]);
    if (bar.length) {
      const outer = bar[bar.length - 1];
      bar.push([outer[0] + rim * 1.2, outer[1] - halfH * 0.08, frontZ(outer[0], ctx)]);
    }
    browBar = { right: bar, left: mirror(bar) };
  }

  // Plaquetas: las que apoyan en la nariz. Solo en armazones de metal/browline,
  // que es donde se ven de verdad.
  let nosePads = null;
  if (spec.nosePads) {
    const padX = nasalX - 2.5, padTop = lift - halfH * 0.18, padLen = halfH * 0.40;
    const padR = [
      [padX, padTop, frontZ(padX, ctx) - 2],
      [padX - 2.2, padTop - padLen * 0.6, frontZ(padX, ctx) - 5],
      [padX - 2.6, padTop - padLen, frontZ(padX, ctx) - 6.5],
    ];
    nosePads = { right: padR, left: mirror(padR) };
  }

  // Patillas. La bisagra NO va en una altura fija: va pegada al punto mas ancho
  // del aro, que es donde se enganchan de verdad. Con una altura fija, en las
  // lentes redondas la patilla nacia flotando a varios milimetros del armazon.
  let hingePt = outerR[0];
  for (const pt of outerR) if (pt[0] > hingePt[0]) hingePt = pt;
  const hingeX = hingePt[0];
  const hingeY = spec.hingeHeight != null ? lift + halfH * spec.hingeHeight : hingePt[1];
  const hingeZ = frontZ(hingeX, ctx);
  const headHalf = spec.headHalfWidth ?? 74;   // mm, medio ancho de cabeza a la altura de las sienes
  const tl = spec.templeLength;                // largo total de la varilla (mm)
  const temple = [];
  const tSteps = 22;
  for (let i = 0; i <= tSteps; i++) {
    const t = i / tSteps;
    // se abre hacia afuera rapido y despues corre paralelo al craneo
    const x = hingeX + (headHalf - hingeX) * Math.min(1, t * 2.4);
    const z = hingeZ - tl * t;
    // el codo baja detras de la oreja (ultimo 22% del recorrido)
    const bend = t > 0.78 ? Math.pow((t - 0.78) / 0.22, 1.7) : 0;
    const y = hingeY - bend * 26;
    temple.push([x, y, z]);
  }

  return {
    spec: { ...spec, lensWidth: lensW, lensHeight: lensH, frameWidth, totalWidth, cx },
    lens: { right: lensRight, left: lensLeft },
    rim: { right: rimRight, left: rimLeft },
    bridge, bridge2, browBar, nosePads,
    temple: { right: temple, left: mirror(temple) },
    hinge: { right: [hingeX, hingeY, hingeZ], left: [-hingeX, hingeY, hingeZ] },
  };
}

/** Valores por defecto por tipo de armazon, para completar specs incompletos del catalogo. */
export function normalizeSpec(model) {
  const S = SHAPES[model.shape] || SHAPES.rectangle;
  const lensWidth = model.lensWidth || (model.category === 'sunglasses' ? 54 : 51);
  return {
    shape: model.shape || 'rectangle',
    lensWidth,
    lensHeight: model.lensHeight || lensWidth * S.aspect,
    bridge: model.bridge || Math.round(lensWidth * 0.33),
    templeLength: model.templeLength || 145,
    rimThickness: model.rimThickness ?? (
      model.browBar ? 1.2                                   // browline: aro inferior finito
      : /metal|titanio/i.test(model.material || '') ? 1.3
      : 3.4),
    nosePads: model.nosePads ?? (!!model.browBar || /metal|titanio/i.test(model.material || '')),
    wrap: model.wrap ?? (model.shape === 'shield' ? 14 : 6),
    vertexZ: model.vertexZ ?? 13,
    lift: model.lift ?? 2,
    endpiece: model.endpiece,
    bridgeHeight: model.bridgeHeight,
    bridgeSag: model.bridgeSag,
    hingeHeight: model.hingeHeight,
    doubleBridge: !!model.doubleBridge,
    browBar: !!model.browBar,
    material: model.material || 'acetato',
  };
}
