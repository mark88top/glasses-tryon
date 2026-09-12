/**
 * render.js — Dibuja el armazon 3D sobre el frame de video.
 *
 * El orden importa y es lo que da la sensacion de que los anteojos estan
 * PUESTOS y no pegados encima:
 *   sombra sobre la cara -> patilla lejana (recortada fuera del ovalo facial)
 *   -> tinte de lente (multiply sobre la piel) -> aro -> puente -> patilla cercana
 *   -> reflejo sobre la lente.
 */

import { project, FACE_OVAL } from './pose.js';

/* ---------- color ---------- */

const FALLBACK = [34, 34, 34];

/** Acepta #rgb, #rrggbb y rgb()/rgba(). Nunca devuelve NaN: un color roto no puede romper el dibujo. */
function toRgb(color) {
  if (Array.isArray(color)) return color;
  if (typeof color !== 'string') return FALLBACK;
  const str = color.trim();
  const m = str.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').map((n) => parseFloat(n));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) return parts.slice(0, 3).map((n) => Math.round(n));
    return FALLBACK;
  }
  const h = str.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(f)) return FALLBACK;
  const v = [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
  return v.every(Number.isFinite) ? v : FALLBACK;
}

const rgba = (color, a) => { const [r, g, b] = toRgb(color); return `rgba(${r},${g},${b},${a})`; };

// Devuelve SIEMPRE hex, para poder encadenar shade() dentro de rgba() sin romper el parseo.
function shade(color, amt) {
  const [r, g, b] = toRgb(color);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/* ---------- helpers de canvas ---------- */

function pathFrom(ctx, pts2d, close = true) {
  ctx.beginPath();
  ctx.moveTo(pts2d[0][0], pts2d[0][1]);
  for (let i = 1; i < pts2d.length; i++) ctx.lineTo(pts2d[i][0], pts2d[i][1]);
  if (close) ctx.closePath();
}

// Centro del bounding box, para orientar los gradientes.
function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/**
 * Renderer con estado: cachea el mesh y el mirror, dibuja un frame por llamada.
 */
export class GlassesRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.mirror = true;
    this._depth = 0;
  }

  // save/restore contados: si algo explota a mitad del dibujo, el estado se desarma igual
  // y no queda un clip pegado corrompiendo todos los frames siguientes.
  _save() { this._depth++; this.ctx.save(); }
  _restore() { if (this._depth > 0) { this._depth--; this.ctx.restore(); } }
  _unwind() { while (this._depth > 0) this._restore(); }

  /** Proyecta y aplica el espejado horizontal al final (el video se ve como un espejo). */
  _p(pose, pt) {
    const [x, y, z] = project(pose, pt);
    return [this.mirror ? this.canvas.width - x : x, y, z];
  }
  _pAll(pose, pts) { return pts.map((p) => this._p(pose, p)); }

  _mirrorPx(p) { return [this.mirror ? this.canvas.width - p[0] : p[0], p[1]]; }

  /** Dibuja el video cubriendo el canvas (object-fit: cover), espejado. */
  drawVideo(video) {
    const { ctx, canvas } = this;
    const cw = canvas.width, ch = canvas.height;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const s = Math.max(cw / vw, ch / vh);
    const dw = vw * s, dh = vh * s;
    const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    this._save();
    if (this.mirror) { ctx.translate(cw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, this.mirror ? cw - dw - dx : dx, dy, dw, dh);
    this._restore();
    return { s, dx, dy, dw, dh };
  }

  /** Camino del ovalo facial, en pixeles de canvas: sirve de mascara de oclusion. */
  _faceOvalPath(pose) {
    const pts = FACE_OVAL.map((i) => this._mirrorPx(pose.px[i]));
    return pts;
  }

  /**
   * @param pose   salida de computePose (ya suavizada)
   * @param frame  salida de buildFrame
   * @param style  {frameColor, lensColor, lensOpacity, mirrored, material, metalness}
   */
  draw(pose, frame, style, opts = {}) {
    const flat = !!opts.flat;   // miniaturas: sin sombra ni oclusion contra la cara
    const { ctx } = this;
    const mm = pose.pxPerMm;
    const material = style.material || 'acetato';
    const isMetal = material === 'metal' || material === 'titanio';

    const lensR = this._pAll(pose, frame.lens.right);
    const lensL = this._pAll(pose, frame.lens.left);
    const rimR = { inner: this._pAll(pose, frame.rim.right.inner), outer: this._pAll(pose, frame.rim.right.outer) };
    const rimL = { inner: this._pAll(pose, frame.rim.left.inner), outer: this._pAll(pose, frame.rim.left.outer) };
    const bridge = this._pAll(pose, frame.bridge);
    const bridge2 = frame.bridge2 ? this._pAll(pose, frame.bridge2) : null;
    const brow = frame.browBar
      ? { right: this._pAll(pose, frame.browBar.right), left: this._pAll(pose, frame.browBar.left) }
      : null;
    const pads = frame.nosePads
      ? { right: this._pAll(pose, frame.nosePads.right), left: this._pAll(pose, frame.nosePads.left) }
      : null;
    const tR = this._pAll(pose, frame.temple.right);
    const tL = this._pAll(pose, frame.temple.left);

    // Que patilla esta mas lejos de la camara: z mayor = mas atras.
    const farIsRight = tR.at(-1)[2] > tL.at(-1)[2];
    const far = farIsRight ? tR : tL;
    const near = farIsRight ? tL : tR;

    this._save();
    try {

    /* 1. Sombra proyectada sobre la cara */
    if (!flat) {
    this._save();
    ctx.globalAlpha = 0.30;
    ctx.filter = `blur(${Math.max(2, mm * 1.6)}px)`;
    ctx.fillStyle = '#000';
    const shOff = mm * 2.5;
    for (const lens of [lensR, lensL]) {
      pathFrom(ctx, lens.map(([x, y]) => [x + shOff * 0.25, y + shOff]));
      ctx.fill();
    }
    this._restore();
    }

    /* 2. Patilla lejana: solo la parte que cae FUERA del ovalo de la cara */
    this._save();
    if (!flat) {
      ctx.beginPath();
      ctx.rect(0, 0, this.canvas.width, this.canvas.height);
      pathFrom(ctx, this._faceOvalPath(pose));
      ctx.clip('evenodd');
    }
    this._drawTemple(ctx, far, style, mm, isMetal, flat ? 0.55 : 0.85);
    this._restore();

    /* 3. Cristales */
    for (const lens of [lensR, lensL]) this._drawLens(ctx, lens, style, mm);

    /* 4. Aros */
    for (const rim of [rimR, rimL]) this._drawRim(ctx, rim, style, isMetal);

    /* 5. Puente(s) y barra de ceja */
    const rimPx = Math.max(1.2, frame.spec.rimThickness * mm);
    this._drawBar(ctx, bridge, style, isMetal, rimPx * (isMetal ? 0.9 : 1.05));
    if (bridge2) this._drawBar(ctx, bridge2, style, isMetal, rimPx * 0.7);
    if (brow) {
      // La ceja lleva el grosor del acetato aunque el aro sea de metal fino.
      const browPx = Math.max(2.5, 7 * mm);
      for (const b of [brow.right, brow.left]) this._drawBar(ctx, b, style, false, browPx, style.browColor);
    }
    if (pads) {
      for (const pd of [pads.right, pads.left]) this._drawBar(ctx, pd, style, true, Math.max(0.8, 1.0 * mm), '#9aa3ae', 0.38);
    }

    /* 6. Patilla cercana, completa y encima de todo */
    this._drawTemple(ctx, near, style, mm, isMetal, 1);

    /* 7. Reflejo sobre el cristal */
    for (const lens of [lensR, lensL]) this._drawGlare(ctx, lens, style);

    } finally {
      this._unwind();   // pase lo que pase, el canvas queda limpio para el proximo frame
    }
  }

  _drawLens(ctx, lens, style, mm) {
    const b = bbox(lens);
    const tint = style.lensColor || '#9fb3c8';
    const op = style.lensOpacity ?? 0.35;
    if (op <= 0.02) return;

    this._save();
    pathFrom(ctx, lens);
    ctx.clip();

    if (style.mirrored) {
      // Espejado: tapa la piel con un degrade metalico en vez de oscurecerla.
      const g = ctx.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
      g.addColorStop(0, rgba(shade(tint, 0.45), Math.min(1, op + 0.45)));
      g.addColorStop(0.5, rgba(tint, Math.min(1, op + 0.35)));
      g.addColorStop(1, rgba(shade(tint, -0.4), Math.min(1, op + 0.4)));
      ctx.fillStyle = g;
      ctx.fillRect(b.x0 - 5, b.y0 - 5, b.w + 10, b.h + 10);
    } else {
      // Tinte real: multiply oscurece la piel como un cristal de verdad.
      ctx.globalCompositeOperation = 'multiply';
      const g = ctx.createLinearGradient(b.x0, b.y0, b.x0, b.y1);
      g.addColorStop(0, rgba(shade(tint, -0.25), Math.min(1, op + 0.12)));
      g.addColorStop(1, rgba(tint, op));
      ctx.fillStyle = g;
      ctx.fillRect(b.x0 - 5, b.y0 - 5, b.w + 10, b.h + 10);
      // Un velo suave para que el cristal tenga cuerpo y no sea solo un filtro.
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba('#ffffff', op > 0.4 ? op * 0.05 : op * 0.16);
      ctx.fillRect(b.x0 - 5, b.y0 - 5, b.w + 10, b.h + 10);
    }
    this._restore();
  }

  _drawGlare(ctx, lens, style) {
    const b = bbox(lens);
    this._save();
    pathFrom(ctx, lens);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createLinearGradient(b.x0, b.y1, b.x0 + b.w * 0.75, b.y0);
    const strength = style.mirrored ? 0.42 : (style.lensOpacity > 0.25 ? 0.24 : 0.15);
    g.addColorStop(0.0, 'rgba(255,255,255,0)');
    g.addColorStop(0.42, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, `rgba(255,255,255,${strength})`);
    g.addColorStop(0.68, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.x0 - 5, b.y0 - 5, b.w + 10, b.h + 10);
    this._restore();
  }

  _drawRim(ctx, rim, style, isMetal) {
    const b = bbox(rim.outer);
    const color = style.frameColor || '#1a1a1a';

    this._save();
    // Anillo entre contorno externo e interno.
    ctx.beginPath();
    ctx.moveTo(rim.outer[0][0], rim.outer[0][1]);
    for (let i = 1; i < rim.outer.length; i++) ctx.lineTo(rim.outer[i][0], rim.outer[i][1]);
    ctx.closePath();
    ctx.moveTo(rim.inner[0][0], rim.inner[0][1]);
    for (let i = rim.inner.length - 1; i >= 0; i--) ctx.lineTo(rim.inner[i][0], rim.inner[i][1]);
    ctx.closePath();

    const g = ctx.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
    if (isMetal) {
      g.addColorStop(0, shade(color, 0.55));
      g.addColorStop(0.22, shade(color, -0.15));
      g.addColorStop(0.45, shade(color, 0.65));
      g.addColorStop(0.7, shade(color, -0.35));
      g.addColorStop(1, shade(color, 0.25));
    } else {
      g.addColorStop(0, shade(color, 0.28));
      g.addColorStop(0.45, color);
      g.addColorStop(1, shade(color, -0.42));
    }
    ctx.fillStyle = g;
    ctx.fill('evenodd');

    // Filo superior iluminado: lo que hace que el acetato se lea como volumen.
    ctx.globalAlpha = isMetal ? 0.5 : 0.28;
    ctx.strokeStyle = shade(color, 0.7);
    ctx.lineWidth = Math.max(0.7, (b.w + b.h) * 0.004);
    pathFrom(ctx, rim.outer);
    ctx.stroke();
    this._restore();
  }

  _drawBar(ctx, pts, style, isMetal, width, colorOverride, alpha = 1) {
    const color = colorOverride || style.frameColor || '#1a1a1a';
    const b = bbox(pts);
    this._save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const g = ctx.createLinearGradient(b.x0, b.y0 - width, b.x0, b.y1 + width);
    g.addColorStop(0, shade(color, isMetal ? 0.6 : 0.3));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color, -0.45));
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, width);
    pathFrom(ctx, pts, false);
    ctx.stroke();
    this._restore();
  }

  _drawTemple(ctx, pts, style, mm, isMetal, alpha) {
    const color = style.frameColor || '#1a1a1a';
    const w = Math.max(1.2, mm * (isMetal ? 1.4 : 3.6));
    this._save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Sombra propia para despegar la patilla de la piel.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = w * 1.5;
    pathFrom(ctx, pts.map(([x, y]) => [x, y + w * 0.4]), false);
    ctx.stroke();

    const b = bbox(pts);
    const g = ctx.createLinearGradient(b.x0, b.y0 - w, b.x0, b.y1 + w);
    g.addColorStop(0, shade(color, isMetal ? 0.55 : 0.22));
    g.addColorStop(0.45, color);
    g.addColorStop(1, shade(color, -0.5));
    ctx.strokeStyle = g;
    ctx.lineWidth = w;
    pathFrom(ctx, pts, false);
    ctx.stroke();
    this._restore();
  }
}
