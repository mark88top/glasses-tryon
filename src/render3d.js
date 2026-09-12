/**
 * render3d.js — Dibuja la montura 3D real sobre el video.
 *
 * La pose de la cara ya da una base ortonormal (u derecha, v arriba, w hacia la
 * camara) y la escala px/mm. Con eso se arma directamente la matriz del objeto y
 * se proyecta con una camara ortografica en coordenadas de pixel: es exactamente
 * la misma proyeccion debil que usa el dibujo 2D, asi que la montura 3D cae
 * clavada donde caia la silueta, con el tamano real en milimetros.
 */

import * as THREE from 'three';
import { loadFrame } from './model3d.js';

/**
 * Entorno de estudio procedural: cielo claro arriba, piso oscuro abajo y una
 * mancha de luz al frente que hace de key. 64x32 pixeles alcanzan: los reflejos
 * de una montura son difusos, no se lee el detalle.
 */
function makeStudioEnv() {
  const W = 64, H = 32;
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);                       // 0 arriba, 1 abajo
    // cielo -> horizonte -> piso
    const sky = [232, 240, 250], horiz = [176, 182, 196], floor = [58, 60, 68];
    const mix = (a, b, k) => a + (b - a) * k;
    for (let x = 0; x < W; x++) {
      let r, g, b;
      if (t < 0.5) { const k = t / 0.5; r = mix(sky[0], horiz[0], k); g = mix(sky[1], horiz[1], k); b = mix(sky[2], horiz[2], k); }
      else { const k = (t - 0.5) / 0.5; r = mix(horiz[0], floor[0], k); g = mix(horiz[1], floor[1], k); b = mix(horiz[2], floor[2], k); }
      // key frontal: un lobulo claro al frente y arriba, que deja el brillo
      const u = x / W;
      const key = Math.max(0, Math.cos((u - 0.5) * Math.PI * 2.2)) * Math.max(0, 1 - Math.abs(t - 0.3) * 3.2);
      r = Math.min(255, r + key * 70); g = Math.min(255, g + key * 70); b = Math.min(255, b + key * 62);
      const i = (y * W + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const matInfo = (m) => ({
  name: m.name || '(sin nombre)', type: m.type,
  color: m.color ? '#' + m.color.getHexString() : null,
  opacity: m.opacity, transparent: m.transparent,
  metalness: m.metalness, roughness: m.roughness, hasMap: !!m.map,
});

export class Renderer3D {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    // premultipliedAlpha en true (el default) es obligatorio: este canvas se
    // compone encima del video con drawImage, y en false los semitransparentes
    // -los cristales- se ven lavados.
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();

    // Mapa de entorno: sin esto los materiales metalicos salen NEGROS, porque un
    // metal no tiene color propio, refleja lo que lo rodea. Una montura dorada
    // sin entorno se ve como un armazon de carbon.
    // Es un equirectangular procedural en vez de PMREM sobre RoomEnvironment:
    // PMREM tarda minutos cuando no hay GPU real (y varios cientos de ms cuando
    // la hay), y para un reflejo de montura alcanza con un degrade cielo/suelo.
    this.scene.environment = makeStudioEnv();
    this.scene.environmentIntensity = 1.15;

    this.holder = new THREE.Group();
    this.holder.matrixAutoUpdate = false;
    this.scene.add(this.holder);

    // Iluminacion: el grueso lo aporta el mapa de entorno. Las luces solo agregan
    // el brillo direccional. Con three.js en modo fisico, intensidades de 2+ como
    // las que se usaban antes del entorno SOBREEXPONEN: un cristal verde oscuro
    // terminaba renderizado gris claro y parecia transparente.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x505565, 0.25));
    this.key = new THREE.DirectionalLight(0xffffff, 1.0);
    this.key.position.set(0.4, 1.2, 2.2);
    this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0xbfd4ff, 0.25);
    this.fill.position.set(-1.4, 0.2, 0.8);
    this.scene.add(this.fill);

    this.camera = new THREE.OrthographicCamera(0, width, 0, height, -5000, 5000);
    this.camera.position.set(0, 0, 1000);
    this.camera.lookAt(0, 0, 0);

    this.cache = new Map();     // url -> Promise<{object,...}>
    this.current = null;
    this.currentUrl = null;
    this.resize(width, height);
  }

  resize(width, height) {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width; this.canvas.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.left = 0; this.camera.right = width;
    this.camera.top = 0; this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
  }

  /** Carga (con cache) y deja lista la montura. Devuelve false si todavia no esta. */
  async setFrame(url) {
    if (this.currentUrl === url && this.current) return true;
    this.currentUrl = url;
    if (!this.cache.has(url)) this.cache.set(url, loadFrame(url));
    const loaded = await this.cache.get(url);
    if (this.currentUrl !== url) return false;   // el usuario ya cambio de modelo
    this.holder.clear();
    this.holder.add(loaded.object);
    this.current = loaded;
    this._classifyMaterials(loaded.object);
    return true;
  }

  /** Estado VIVO de los materiales, despues de aplicar el estilo. Para diagnostico. */
  liveMats() {
    if (!this.mats) return null;
    const dump = (m) => ({
      name: m.name, type: m.type,
      color: m.color ? '#' + m.color.getHexString() : null,
      opacity: +(m.opacity ?? 1).toFixed(3), transparent: m.transparent,
      transmission: m.transmission, thickness: m.thickness, ior: m.ior,
      envMapIntensity: m.envMapIntensity, metalness: m.metalness, roughness: m.roughness,
      blending: m.blending, depthWrite: m.depthWrite, visible: m.visible,
    });
    return { frame: this.mats.frame.map(dump), lens: this.lensMat ? [dump(this.lensMat)] : [] };
  }

  clear() { this.holder.clear(); this.current = null; this.currentUrl = null; }

  /**
   * Separa materiales de armazon y de cristal. Sin esto no se puede recolorear
   * el armazon sin pintar tambien las lentes.
   */
  _classifyMaterials(obj) {
    const frame = [], lens = [], weight = new Map();
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const verts = o.geometry?.attributes?.position?.count || 0;
      for (const mt of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!mt) continue;
        weight.set(mt, (weight.get(mt) || 0) + verts);
        if (frame.includes(mt) || lens.includes(mt)) continue;
        const name = `${mt.name || ''} ${o.name || ''}`.toLowerCase();
        const isLens = /lens|glass|cristal|lente|vidrio/.test(name) || (mt.transparent && mt.opacity < 0.9);
        if (!mt.userData.__base) {
          mt.userData.__base = { color: mt.color ? mt.color.clone() : null, opacity: mt.opacity, transparent: mt.transparent };
        }
        (isLens ? lens : frame).push(mt);
      }
    });
    // Solo se recolorea el material principal del armazon. Si se pintan todos,
    // se pierden las plaquetas, los remaches y los detalles que hacen que el
    // modelo parezca real y no un objeto de un solo color.
    let primary = null, best = -1;
    for (const mt of frame) { const w = weight.get(mt) || 0; if (w > best) { best = w; primary = mt; } }
    this.primaryFrameMat = primary;

    // Los cristales se reemplazan por un material PLANO, sin iluminacion.
    // Un cristal teñido no se comporta como una superficie opaca: oscurece lo que
    // hay detras. Sombreado como solido, un G-15 verde oscuro terminaba
    // renderizado gris medio -la luz lo levanta y el sRGB lo aclara mas- y se
    // veia transparente. Plano + alfa es lo que da un cristal creible.
    const lensSet = new Set(lens);
    this.lensMat = new THREE.MeshBasicMaterial({
      color: 0x333333, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide,
    });
    this.glareMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    obj.traverse((o) => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) {
        o.material = o.material.map((mt) => (lensSet.has(mt) ? this.lensMat : mt));
      } else if (lensSet.has(o.material)) {
        o.material = this.lensMat;
        o.renderOrder = 2;               // el cristal va despues del armazon
      }
    });
    // Si no se detecto ninguna lente, no inventamos: se deja todo como armazon.
    this.mats = { frame, lens };
    this.matReport = { frame: frame.map(matInfo), lens: lens.map(matInfo) };
  }

  /** Aplica el color de armazon y el tinte de cristal elegidos en el catalogo. */
  applyStyle(style) {
    if (!this.mats) return;
    for (const mt of this.mats.frame) {
      if (!mt.color) continue;
      if (mt === this.primaryFrameMat && style.frameColor) {
        mt.color.set(style.frameColor);
        // Si el material trae textura, el color la multiplica: la aclaramos para
        // que el tinte no la apague del todo.
        if (mt.map) mt.color.lerp(new THREE.Color(0xffffff), 0.35);
      } else if (mt.userData.__base?.color) {
        mt.color.copy(mt.userData.__base.color);   // los detalles quedan como el autor los hizo
      }
      mt.envMapIntensity = 1.0;
      if (mt.metalness !== undefined) {
        if (/metal|titanio/i.test(style.material || '')) { mt.metalness = 0.9; mt.roughness = 0.22; }
        else { mt.metalness = Math.min(mt.metalness, 0.15); mt.roughness = Math.max(mt.roughness ?? 0.4, 0.42); }
      }
    }
    if (this.lensMat && style.lensColor) {
      const op = style.lensOpacity ?? 0.3;
      this.lensMat.color.set(style.lensColor);
      // Espejado tapa casi del todo; el resto deja pasar algo de la cara.
      this.lensMat.opacity = style.mirrored ? Math.min(0.96, op + 0.32) : Math.min(0.9, op + 0.1);
      if (style.mirrored) this.lensMat.color.lerp(new THREE.Color(0xffffff), 0.25);
    }
  }

  /**
   * @param pose    salida de computePose (suavizada)
   * @param widthMm ancho total del armazon en mm, del catalogo
   * @param mirror  si la imagen se muestra espejada
   */
  render(pose, widthMm, mirror, fit = {}) {
    if (!this.current) return null;
    const { origin, u, v, w, pxPerMm } = pose;
    const s = pxPerMm * widthMm;   // el modelo viene normalizado a ancho 1

    // El origen del modelo quedo en el centro de las lentes, sobre el frente.
    // La pupila no esta ahi: el cristal va unos milimetros ADELANTE del ojo
    // (distancia de vertice) y el armazon se apoya un poco mas arriba.
    const obj = this.current.object;
    obj.position.set(0, (fit.lift ?? 2) / widthMm, (fit.vertex ?? 13) / widthMm);

    // El espacio de imagen tiene la Y hacia abajo y la Z de MediaPipe crece
    // alejandose; three.js espera lo contrario en Z, por eso se invierte.
    const m = new THREE.Matrix4();
    m.set(
      s * u[0], s * v[0], s * w[0], origin[0],
      s * u[1], s * v[1], s * w[1], origin[1],
      -s * u[2], -s * v[2], -s * w[2], -origin[2],
      0, 0, 0, 1,
    );
    this.holder.matrix.copy(m);
    this.holder.matrixWorldNeedsUpdate = true;

    // La luz acompana el giro de la cabeza para que el brillo caiga donde toca.
    this.key.position.set(u[0] * 0.4 + w[0] * 2, -1.2, -w[2] * 2 + 1);

    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }
}
