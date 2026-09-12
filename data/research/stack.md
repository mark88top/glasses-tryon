# Stack para virtual try-on de anteojos en el browser (2026)

> Investigado y verificado el **2026-09-11**. Todo lo marcado como *verificado* se chequeó
> contra el codigo fuente de MediaPipe o con `curl` contra la URL real (se anota el HTTP status).
> Lo que no se pudo verificar esta marcado explicitamente como tal.

**Veredicto corto:** `@mediapipe/tasks-vision` **1.0.1** (FaceLandmarker, 478 puntos + matriz de
pose) + **three.js 0.186.0**, todo servido local desde `vendor/`. No hace falta ningun framework de
AR extra: la matriz `facialTransformationMatrixes` ya resuelve la pose 6-DoF de la cabeza.

---

## 1. Version recomendada + comando npm

| Paquete | Version | Notas |
|---|---|---|
| `@mediapipe/tasks-vision` | **1.0.1** | dist-tag `latest`. Verificado con `npm view`. |
| `three` | **0.186.0** | dist-tag `latest`. Verificado con `npm view`. |

```bash
npm install @mediapipe/tasks-vision@1.0.1 three@0.186.0
```

> **Estado en este repo:** ya instalado. `node_modules/@mediapipe/tasks-vision` = 1.0.1 y
> `node_modules/three` = 0.186.0, y `vendor/` ya tiene el wasm y el modelo (ver seccion 2).

### Ojo con el canal `nightly`
El paquete publica una release candidate **por dia** con el formato `1.0.1-rc.YYYYMMDD`
(dist-tag `nightly`, la ultima al momento de escribir es `1.0.1-rc.20260911`).
**No usar `nightly` ni `@latest` en URLs**: pinear `1.0.1` siempre, si no el wasm y el `.mjs`
pueden desincronizarse entre deploys.

---

## 2. URLs verificadas del wasm y del modelo

Todas chequeadas con `curl -r 0-1023` el 2026-09-11. `206` = Partial Content (o sea, existe y sirve
range requests, que es lo que queremos para vendorizar).

### 2.1 Bundle wasm (`FilesetResolver.forVisionTasks`)

Base path a pasarle al resolver:

```
https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm
```

Archivos reales dentro de ese directorio (tamanos del listado de jsDelivr):

| Archivo | Tamano | HTTP | Cuando se usa |
|---|---|---|---|
| `vision_wasm_internal.js` | 323.377 B | 206 | loader SIMD (el camino normal) |
| `vision_wasm_internal.wasm` | 11.756.954 B | 206 | binario SIMD |
| `vision_wasm_nosimd_internal.js` | 323.180 B | 206 | fallback sin SIMD |
| `vision_wasm_nosimd_internal.wasm` | 10.960.242 B | 206 | fallback sin SIMD |
| `vision_wasm_module_internal.js` | 323.415 B | — | variante ES module (`useModule=true`) |
| `vision_wasm_module_internal.wasm` | 11.756.972 B | — | variante ES module |

`FilesetResolver` detecta SIMD en runtime y elige el par correspondiente, por eso hay que copiar
**el directorio entero**, no un archivo suelto. El bundle JS de la libreria:

```
https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs   # 155.439 B, HTTP 206
```

### 2.2 Modelo `face_landmarker.task`

| URL | Bytes | HTTP | Comentario |
|---|---|---|---|
| `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | **3.758.596** | 206 | **Recomendada.** Canal versionado (`/1/`), inmutable. |
| `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task` | — | 206 | Canal `latest`, puede cambiar sin aviso. |
| `https://storage.googleapis.com/mediapipe-assets/face_landmarker_v2_with_blendshapes.task` | — | 206 | El que usan los CodePen/demos oficiales. |

**No hay variantes lite / full / heavy para FaceLandmarker.** Se verificaron las tres URLs de
arriba y solo existe el bundle **float16** (a diferencia de `pose_landmarker`, que si publica
lite/full/heavy). El `.task` es un *bundle* que adentro trae los tres modelos: detector de cara,
mesh con attention (478 puntos) y el blendshape predictor.

> **Estado en este repo:** `vendor/models/face_landmarker.task` pesa exactamente **3.758.596 B**,
> o sea que es byte a byte el del canal `/1/`. Y `vendor/tasks-vision/wasm/` tiene los 6 archivos
> con los tamanos exactos de la tabla. Todo verificado, no hay que volver a bajar nada.

---

## 3. Indices de landmarks (face mesh de 478 puntos)

### 3.1 Fuentes usadas

| Fuente | Que aporta |
|---|---|
| `mediapipe/python/solutions/face_mesh_connections.py` | los sets canonicos `FACEMESH_*` |
| `mediapipe/modules/face_landmark/tensors_to_face_landmarks_with_attention.pbtxt` | el mapping exacto de los 10 puntos de iris, con comentarios del propio Google |
| `mediapipe/modules/face_geometry/data/canonical_face_model.obj` | las coordenadas 3D en cm de los 468 puntos base |

(bajadas de `cdn.jsdelivr.net/gh/google-ai-edge/mediapipe@master/...`, HTTP 200)

### 3.2 La trampa de los nombres izquierda/derecha

Esto hay que tenerlo clarisimo antes de escribir una sola linea, porque **MediaPipe se contradice
a si mismo en los nombres**:

- El `.pbtxt` del modelo llama **"left iris"** al grupo **468-472**.
- `face_mesh_connections.py` llama **`FACEMESH_RIGHT_IRIS`** a **469-472**.

Ambos se refieren al mismo ojo fisico. El `.pbtxt` nombra por el tensor del modelo (lado izquierdo
de la *imagen*), y `face_mesh_connections.py` nombra por la *anatomia del sujeto*.

La prueba dura: el bloque "left iris" del `.pbtxt` calcula su Z promediando los landmarks
`33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173`, que es
**exactamente** el set `FACEMESH_RIGHT_EYE`. O sea, el iris 468-472 vive adentro del ojo que el
resto de la libreria llama *derecho*.

**Regla operativa que conviene adoptar en el codigo:** olvidarse de "left/right" y nombrar los
grupos por el signo de X en el canonical model.

- **Grupo A (X negativo)** = centro `468`, anillo `33/133`. Es el ojo **derecho anatomico** del sujeto.
- **Grupo B (X positivo)** = centro `473`, anillo `263/362`. Es el ojo **izquierdo anatomico**.

En una preview espejada tipo selfie (lo normal), el Grupo A aparece a la **derecha de la pantalla**.

### 3.3 Tabla de indices

Coordenadas del `canonical_face_model.obj`, en **centimetros**. Eje: **+X = lado izquierdo
anatomico del sujeto, +Y = arriba, +Z = hacia adelante (hacia la nariz)**. Sistema **right-handed**,
igual que three.js.

| Idx | Significado | x | y | z | Fuente |
|---:|---|---:|---:|---:|---|
| **468** | **Centro del iris — Grupo A (ojo derecho anatomico)** | — | — | — | `.pbtxt` `# Center` |
| 469 | iris A, borde "right" | — | — | — | `.pbtxt` |
| 470 | iris A, borde "top" | — | — | — | `.pbtxt` |
| 471 | iris A, borde "left" | — | — | — | `.pbtxt` |
| 472 | iris A, borde "bottom" | — | — | — | `.pbtxt` |
| **473** | **Centro del iris — Grupo B (ojo izquierdo anatomico)** | — | — | — | `.pbtxt` `# Center` |
| 474 | iris B, borde "right" | — | — | — | `.pbtxt` |
| 475 | iris B, borde "top" | — | — | — | `.pbtxt` |
| 476 | iris B, borde "left" | — | — | — | `.pbtxt` |
| 477 | iris B, borde "bottom" | — | — | — | `.pbtxt` |
| **33** | **Canto externo ojo derecho** (esquina exterior) | -4.446 | 2.664 | 3.173 | `FACEMESH_RIGHT_EYE` + obj |
| 133 | Canto interno ojo derecho | -1.856 | 2.585 | 3.758 | idem |
| **263** | **Canto externo ojo izquierdo** (esquina exterior) | 4.446 | 2.664 | 3.173 | `FACEMESH_LEFT_EYE` + obj |
| 362 | Canto interno ojo izquierdo | 1.856 | 2.585 | 3.758 | idem |
| **168** | Puente nasal alto (bajo el entrecejo) | 0.000 | 3.271 | 5.236 | `FACEMESH_NOSE` + obj |
| **6** | **Puente nasal medio — mejor punto de apoyo** | 0.000 | 2.473 | 5.789 | `FACEMESH_NOSE` + obj |
| 197 | Puente nasal bajo | 0.000 | 1.728 | 6.317 | `FACEMESH_NOSE` + obj |
| 195 | Nariz, sobre el dorso | 0.000 | 1.059 | 6.775 | `FACEMESH_NOSE` + obj |
| 4 | Punta de la nariz | 0.000 | -0.463 | 7.587 | `FACEMESH_NOSE` + obj |
| 9 | Glabela (entrecejo) | 0.000 | 4.886 | 5.385 | obj |
| **234** | **Lateral derecho de la cara (sien / proxy de patilla)** | -7.664 | 0.673 | -2.436 | `FACEMESH_FACE_OVAL` + obj |
| **454** | **Lateral izquierdo de la cara (sien / proxy de patilla)** | 7.664 | 0.673 | -2.436 | `FACEMESH_FACE_OVAL` + obj |
| 127 | Sien derecha (mas arriba que 234) | -7.743 | 2.365 | -2.005 | `FACEMESH_FACE_OVAL` + obj |
| 356 | Sien izquierda | 7.743 | 2.365 | -2.005 | `FACEMESH_FACE_OVAL` + obj |
| 93 | Lateral derecho bajo (zona pre-auricular) | -7.542 | -1.049 | -2.431 | obj |
| 323 | Lateral izquierdo bajo (zona pre-auricular) | 7.542 | -1.049 | -2.431 | obj |
| 10 | Tope de la frente | 0.000 | 8.262 | 4.482 | obj |
| 152 | Menton | 0.000 | -9.403 | 4.264 | obj |

### 3.4 Dos cosas importantes sobre esta tabla

**(a) Los iris no tienen coordenadas en el canonical model.** El `.obj` tiene **exactamente 468
vertices**. Los 10 puntos de iris (468-477) los agrega el modelo de *attention* en runtime y solo
existen en espacio de imagen normalizado. Confirmado ademas en el codigo del pipeline de geometria
(`face_geometry_from_landmarks_graph.cc`), que hace `range.set_begin(0); range.set_end(468);`,
o sea que **la matriz de pose se estima ignorando los iris**. Los iris sirven para medir y para
mirada, no para pose.

**(b) No existen landmarks de oreja.** El face mesh corta en el ovalo facial. Para apoyar las
patillas lo mas exterior disponible son `234`/`454` (o `127`/`356`, un poco mas arriba y atras).
En la practica, para anteojos alcanza: las patillas se ocluyen casi siempre contra la cara.

### 3.5 Medidas derivadas del canonical model (utiles para escalar)

| Medida | Valor |
|---|---|
| Ancho de cara `234` ↔ `454` | **15.33 cm** |
| Ancho de sienes `127` ↔ `356` | 15.49 cm |
| Canto externo a canto externo `33` ↔ `263` | 8.89 cm |
| Distancia inter-canto interno `133` ↔ `362` | 3.71 cm |
| Alto frente-menton `10` ↔ `152` | 17.67 cm |
| Apoyo sugerido del puente (landmark `6`) | `(0, 2.473, 5.789)` |

Un frame de anteojos real mide **13.5–14.5 cm** de ancho total. Contra los 15.33 cm de
`234`↔`454` eso da un factor de escala de **0.88–0.95**. Sirve como sanity check: si al modelo
`.glb` le calculas el bounding box en X y lo escalas para que de ~0.9 del ancho `234`↔`454`,
queda en tamano creible sin tunear a mano.

**Truco de escala metrica alternativo:** el diametro del iris humano es una constante biologica
notablemente estable (~11.7 mm). Como tenes los bordes del iris (`469`↔`471` para el grupo A,
`474`↔`476` para el B), podes derivar la escala real de la cara desde ahi sin depender de la
distancia a la camara. Es el metodo que usa el propio MediaPipe Iris para estimar profundidad.

---

## 4. Snippet minimo: init + loop de deteccion

Firmas verificadas contra `vendor/tasks-vision/vision.d.ts` de la 1.0.1.

```js
// src/pose.js
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

// --- init -------------------------------------------------------------
// El basePath apunta al DIRECTORIO wasm (no a un archivo). Servido local.
const vision = await FilesetResolver.forVisionTasks("/vendor/tasks-vision/wasm");

const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath: "/vendor/models/face_landmarker.task",
    delegate: "GPU",              // "CPU" | "GPU"
  },
  runningMode: "VIDEO",           // "IMAGE" | "VIDEO"
  numFaces: 1,
  outputFaceBlendshapes: false,               // true solo si vas a hacer expresiones
  outputFacialTransformationMatrixes: true,   // <- IMPRESCINDIBLE para el 3D
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
});

// --- webcam -----------------------------------------------------------
const video = document.querySelector("video");
video.srcObject = await navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720, facingMode: "user" },
  audio: false,
});
await video.play();

// --- loop -------------------------------------------------------------
let lastVideoTime = -1;

function tick() {
  // detectForVideo exige timestamps ESTRICTAMENTE crecientes; si le mandas el
  // mismo frame dos veces tira error. De ahi el guard por currentTime.
  if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
    lastVideoTime = video.currentTime;

    const res = faceLandmarker.detectForVideo(video, performance.now());

    if (res.faceLandmarks.length > 0) {
      const lm = res.faceLandmarks[0];          // 478 NormalizedLandmark {x,y,z}
      const m  = res.facialTransformationMatrixes[0]; // {rows:4, columns:4, data:number[16]}

      updateGlasses(lm, m);
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
```

Notas sobre la API que conviene no aprender a los golpes:

- `detectForVideo(videoFrame, timestamp, imageProcessingOptions?)` es **sincronica** y devuelve el
  resultado directo (no promesa). El timestamp va en **ms** y debe ser monotono creciente.
- `res.faceLandmarks[i]` son coordenadas **normalizadas de imagen**: `x`,`y` en `[0,1]`,
  y `z` es profundidad *relativa* (aprox. en la misma escala que x, con origen en el centro de la
  cabeza). **`z` no esta en cm** y no sirve para posicionar en 3D metrico: para eso esta la matriz.
- `FaceLandmarker` expone los sets de conexiones como estaticos, utiles para debug overlay:
  `FaceLandmarker.FACE_LANDMARKS_TESSELATION`, `FACE_LANDMARKS_CONTOURS`, `FACE_LANDMARKS_LEFT_IRIS`,
  `FACE_LANDMARKS_RIGHT_IRIS`, `FACE_LANDMARKS_FACE_OVAL`, etc.
- Para cambiar de `IMAGE` a `VIDEO` en caliente: `await faceLandmarker.setOptions({ runningMode: "VIDEO" })`.
- `delegate: "GPU"` usa WebGL. Si el equipo se porta raro, `"CPU"` es el fallback seguro.

---

## 5. La matriz de transformacion facial + camara de three.js

### 5.1 Convencion de la matriz: **COLUMN-MAJOR** (verificado en el codigo)

Esta es la pregunta que arruina mas tardes, asi que va la cadena de evidencia completa:

1. `mediapipe/framework/formats/matrix_data.proto` define
   `optional Layout layout = 4 [default = COLUMN_MAJOR];` con el comentario
   *"Defaults to COLUMN_MAJOR, which matches the default for mediapipe::Matrix and Eigen::Matrix*"*.
2. El pipeline de geometria (`face_geometry/libs/geometry_pipeline.cc`) serializa la matriz con
   `mediapipe::MatrixDataProtoFromMatrix(pose_transform_mat, ...)`.
3. Ese helper (`framework/formats/matrix.cc`) hace literalmente
   `matrix_data->clear_layout();` y copia `matrix.data()` crudo — o sea, deja el layout en el
   **default COLUMN_MAJOR** y vuelca el buffer de Eigen, que es column-major.
4. El wrapper web (`tasks/web/vision/face_landmarker/face_landmarker.ts`) hace
   `data: poseTransformMatrix.getPackedDataList().slice()` — **no transpone nada**.

**Conclusion: `facialTransformationMatrixes[0].data` es column-major**, que es justo el orden que
espera `THREE.Matrix4.fromArray()`. No hay que transponer.

Del otro lado la evidencia tambien esta cerrada, leyendo `node_modules/three/src/math/Matrix4.js`
de la 0.186.0: `fromArray()` copia el array **crudo** a `this.elements` (`elements[i] = array[i]`),
y el propio header del archivo aclara que `elements` esta *"stored ... in column-major order"*
mientras que `set()` *"take arguments in row-major order"*. Las dos puntas coinciden.

```js
import * as THREE from "three";

const mat = new THREE.Matrix4().fromArray(m.data);  // column-major: directo, sin transponer

// Si alguna vez necesitas el equivalente con .set(), ahi SI va transpuesto,
// porque Matrix4.set() toma los argumentos en row-major.
```

Aplicarla al objeto sin que three.js la pise con su propio TRS:

```js
glasses.matrixAutoUpdate = false;
glasses.matrix.copy(mat);          // pose 6-DoF de la cabeza, en cm
```

Si necesitas ademas un offset propio del modelo (centrarlo en el puente, escalarlo), componelo
*adentro*, no afuera:

```js
const offset = new THREE.Matrix4()
  .makeScale(s, s, s)
  .premultiply(new THREE.Matrix4().makeTranslation(0, 2.473, 5.789)); // landmark 6
glasses.matrix.multiplyMatrices(mat, offset);
```

### 5.2 Que transforma exactamente

La matriz mapea **canonical face model → cara detectada**, en el espacio metrico 3D de MediaPipe.
Es una transformacion rigida + escala uniforme (rotacion, traslacion y escala), **en centimetros**.
Por eso el pipeline corre con los 468 puntos base y no con los iris.

Escala verificada empiricamente sobre el `.obj`: ancho de cara 15.33, alto frente-menton 17.67,
canto-a-canto 8.89. Son medidas antropometricas humanas reales **en cm**, asi que la unidad
esta confirmada (no son mm ni metros).

### 5.3 Setup de la camara three.js (valores exactos del codigo de MediaPipe)

De `tasks/cc/vision/face_geometry/face_geometry_from_landmarks_graph.cc`, funcion
`ConfigureFaceGeometryEnvGeneratorCalculator`:

```cpp
options.mutable_environment()->set_origin_point_location(
    proto::OriginPointLocation::TOP_LEFT_CORNER);
perspective_camera.set_vertical_fov_degrees(63.0 /*degrees*/);
perspective_camera.set_near_plane(1.0 /* 1cm */);
perspective_camera.set_far_plane(10000.0 /* 100m */);
```

Traducido a three.js, uno a uno:

```js
const camera = new THREE.PerspectiveCamera(
  63,                                   // vertical_fov_degrees, EXACTO
  video.videoWidth / video.videoHeight, // aspect = el del VIDEO, no el de la ventana
  1,                                    // near  = 1 cm
  10000                                 // far   = 100 m
);
// La camara se queda en el origen con la orientacion default de three.js
// (mirando hacia -Z), que es justo la convencion del espacio metrico de MediaPipe.
camera.position.set(0, 0, 0);
camera.rotation.set(0, 0, 0);
```

### 5.4 Los cuatro detalles que rompen el alineado

1. **El FOV de 63° es una suposicion fija de MediaPipe, no el FOV real de tu webcam.** No lo
   cambies por el "real": la matriz fue estimada *bajo ese supuesto*, asi que la camara de three.js
   tiene que replicarlo o el objeto va a flotar adelante/atras de la cara. Si mas adelante calibras
   la camara de verdad, hay que reinyectar el FOV del lado de MediaPipe, no del lado de three.js.
2. **Aspect ratio = el del video.** Si el canvas de three.js tiene otro aspect que el stream, o si
   usas `object-fit: cover` con crop, el overlay se descalibra. Lo mas simple es forzar canvas y
   video al mismo rect y usar el aspect del `videoWidth/videoHeight`.
3. **Espejado.** La preview selfie normalmente va con `transform: scaleX(-1)`. Si espejas solo el
   `<video>` por CSS, el overlay 3D queda al reves. Espeja **los dos** (poné el CSS sobre el
   contenedor que envuelve video + canvas), o no espejes ninguno. No intentes arreglarlo
   negando la X de la matriz: eso invierte el handedness y te da normales y culling al reves.
4. **`origin_point_location: TOP_LEFT_CORNER`** ya viene resuelto por el propio pipeline en el
   camino web; no hay que compensar Y a mano. Si ves todo espejado en Y, el problema es (3), no esto.

### 5.5 Alternativa sin matriz (fallback)

Si por lo que sea la matriz no alcanza, se puede armar la pose a mano desde 3 landmarks:
posicion = landmark `6` (puente), eje X = `454 - 234` normalizado, eje Y ≈ `10 - 152`, y Z =
producto vectorial. Escala = `‖454 - 234‖ / 15.33`. Es mas ruidoso y jitterea mas que la matriz
(que viene de un Procrustes sobre 468 puntos), asi que usarlo solo como plan B.

### 5.6 Jitter

La matriz cruda tiembla un poco frame a frame. Lo que funciona: descomponer en
posicion/quaternion/escala, y suavizar con un **one-euro filter** (o un simple lerp/slerp con
alpha ~0.3–0.5) por componente. Slerp para el quaternion, lerp para posicion y escala. Suavizar
la matriz entrada por entrada no: rompe la ortonormalidad y deforma el modelo.

---

## 6. Repos open source de VTO de anteojos: licencia y veredicto

Licencias **leidas del archivo `LICENSE` literal** via `api.github.com/contents` (raw.githubusercontent
devolvia 503 por el proxy). Donde no se pudo verificar, se dice.

| Repo | Licencia verificada | Stars | Ultimo commit | Assets 3D | Veredicto |
|---|---|---:|---|---|---|
| [`jeeliz/jeelizFaceFilter`](https://github.com/jeeliz/jeelizFaceFilter) | **Apache 2.0 puro** | 2.937 | 2025-11-14 | Si (`demos/threejs/glassesVTO/models3D/*.json`) | **REUSAR** |
| [`google-ai-edge/mediapipe-samples-web`](https://github.com/google-ai-edge/mediapipe-samples-web) | **Apache 2.0** | 81 | 2026-09-11 | No | **REUSAR** (esqueleto) |
| [`bensonruan/Virtual-Glasses-Try-on`](https://github.com/bensonruan/Virtual-Glasses-Try-on) | Codigo **sin licencia**; modelos **CC-BY-4.0** | 64 | 2023-07-15 | **Si, 7 monturas CC-BY-4.0** | **REUSAR solo assets** |
| [`mergeos-bounties/BeeAR`](https://github.com/mergeos-bounties/BeeAR) | **MIT** | 14 | 2026-07-21 | **Si, ~11 GLB MIT** | **MIRAR / reusar assets** |
| [`WebAR-rocks/WebAR.rocks.face`](https://github.com/WebAR-rocks/WebAR.rocks.face) | **MIT acotado por directorio** | 123 | 2025-11-15 | Si, en `/demos` (licencia ambigua) | **MIRAR** |
| [`alperenuzun/basic-virtual-tryon-glasses`](https://github.com/alperenuzun/basic-virtual-tryon-glasses) | **SIN LICENSE** (badge MIT sin archivo) | 37 | 2026-02-08 | Si, pero basura de 2-3 KB | **MIRAR** |
| [`breathingcyborg/mediapipe-face-effects`](https://github.com/breathingcyborg/mediapipe-face-effects) | Sin LICENSE; `package.json` dice ISC | 80 | 2025-03-13 | 2 gltf sin procedencia | **MIRAR** |
| [`estephanobrusa/GlassesTryOn`](https://github.com/estephanobrusa/GlassesTryOn) | **MIT** | 9 | 2026-03-22 | 2 glb sin procedencia | **MIRAR** (arquitectura) |
| [`jeeliz/jeelizGlassesVTOWidget`](https://github.com/jeeliz/jeelizGlassesVTOWidget) | **Jeeliz VTO Commercial License** (de pago) | 330 | 2026-07-08 | No (backend remoto) | **DESCARTAR** |
| [`matasarei/tryonface`](https://github.com/matasarei/tryonface) | **GPL-3.0** | 82 | 2025-10-26 | No | **DESCARTAR** |

### 6.1 El hallazgo mas importante: no existe el ejemplo oficial

**Google no publica en ningun lado un ejemplo que ate `facialTransformationMatrixes` a three.js.**
Se verifico `src/tasks/face-landmarker.ts` de `mediapipe-samples-web`: activa
`outputFacialTransformationMatrixes` pero despues **renderiza en 2D con `DrawingUtils` y nunca
importa three.js**. Y la busqueda `tasks-vision glasses` en GitHub devuelve **cero repos**.

Traduccion practica: el puente matriz → three.js de la seccion 5 **hay que escribirlo**, y es
justamente la parte de mayor valor de este proyecto. No hay atajo que copiar.

### 6.2 Notas por repo que valen la pena

**`jeelizFaceFilter` (Apache 2.0) — la sorpresa.** Es el hermano permisivo del widget propietario.
El `LICENSE` se leyo entero (11.357 chars, Apache 2.0 sin clausulas agregadas) y el README dice
*"Apache 2.0. This application is free for both commercial and non-commercial use."* La tabla de
precios que aparece en el README esta **adentro de un comentario HTML**: es un plan de soporte
discontinuado, no un gate de licencia. Trae `demos/threejs/glassesVTO/` con
`JeelizThreeGlassesCreator.js`, un envMap, el `.blend` de las patillas dobladas y los modelos
`glassesFrames.json` / `glassesFramesBranchesBent.json` / `glassesLenses.json`, todos Apache 2.0.
Contra: formato three.js JSON Geometry **legacy**, hay que convertirlos a glTF. El tracker es
propio, no MediaPipe — se reusan los assets y la logica, no el motor.

**`WebAR.rocks.face` — la mejor referencia tecnica, con asterisco legal.** `helpers/WebARRocksMirror.js`
resuelve el problema completo: doblado de patillas, fade de la patilla cerca de la oreja por nombre
de material, occluder, PBR. Esta en `/helpers`, que **si** entra en el "LICENSED PROPERTY" MIT.
⚠️ Pero `/demos` **no esta** en esa lista y la clausula de extension habla de *"source code"*, no de
binarios: **la licencia de los `.glb` de `demos/VTOGlasses/` es ambigua**. Para uso comercial, o se
le pregunta por escrito a WebAR.rocks, o se modela la montura propia — y el README de esa carpeta
regala la spec exacta para hacerlo (ancho interior = 2 unidades, pupilas en Y=0/Z=0, patillas
paralelas, material con "frame" en el nombre, export GLB con *Export Extras* + *Convert Z up to Y up*).
Esa spec sola ya justifica mirar el repo.

**`alperenuzun/basic-virtual-tryon-glasses` — el unico con el stack exacto, y aun asi lo hace mal.**
Es `@mediapipe/tasks-vision@0.10.7` + FaceLandmarker + three, con un occluder dinamico de face mesh
en `src/engine/occluder.js`. Pero tiene `outputFacialTransformationMatrixes: false`: posiciona por
landmarks a mano en vez de usar la matriz. O sea que **nuestro enfoque es estrictamente mejor**.
Ademas no tiene archivo LICENSE (el badge MIT del README no esta respaldado): sin LICENSE es
*all rights reserved*, asi que se mira, no se copia.

**`bensonruan` — el codigo no sirve, los assets si.** Stack de 2023 (jQuery + tfjs 2.4). Pero trae
**7 monturas de Sketchfab con `license.txt` por carpeta, todas CC-BY-4.0 con uso comercial
permitido**. Es el mejor botin de assets del lote (detalle en la seccion 7).

**`BeeAR` — el unico catalogo GLB con MIT limpio.** `packages/catalog/glb/` con aviator-gold,
cateye-rose, clubmaster-amber, hex-graphite, rectangle-frost, round-tortoise, sport-blue,
wayfarer-black. Sin obligacion de atribucion. Contra: varios se llaman `glasses_meshy_*`, lo que
delata generacion por IA (Meshy) — calidad a verificar abriendo los archivos.

**`GlassesTryOn` — el mapa de arquitectura.** MIT, TypeScript limpio:
`CameraEngine → FaceMeshRunner → FaceGeometryEstimator → PoseApplier → ThreeSceneManager`.
Vale como plano de como separar capas. El propio README avisa *"Not production-ready ... built for
learning purposes"*, y usa `face_mesh` legacy: hay que swapear el runner por Tasks Vision.

### 6.3 Descartados y por que

- **`jeelizGlassesVTOWidget`**: el `LICENSE` **no es Apache 2.0**, es un *"Jeeliz VTO Commercial
  License Agreement"* propietario. Solo es gratis si el uso es no comercial, o son **menos de 10
  modelos**, o **todavia no se deployo publico**. Prohibe reverse engineering, sublicenciar y
  redistribuir. Ademas el codigo viene **solo minificado**, no trae assets (los sirve el backend
  propietario GlassesDB) y el README lo declara *"our legacy solution"*. Incompatible.
- **`matasarei/tryonface`**: **GPL-3.0**, copyleft — veneno para un producto comercial cerrado.
  Encima usa `clmtrackr`, un tracker 2D de 2014.

### 6.4 Complementos utiles

- **`WebAR.rocks.faceDepth`** (MIT, ultimo commit *"[DOC] Relicense to MIT"*): estimacion de
  profundidad de la cara. Es el camino serio para que **las patillas se oculten detras de la cabeza**.
- **`pmndrs/drei`** componente `<Facemesh>` (MIT, 9.863 stars, activo): solo si se va a React Three Fiber.
- **`kalidokit`** y **`vladmandic/human`** (ambos MIT, mantenidos): no son VTO de anteojos, pero
  sirven como referencia de suavizado y kinematica.
- **Licencias del stack base, verificadas:** MediaPipe **Apache-2.0** (`LICENSE` del repo y
  `"license": "Apache-2.0"` en el `package.json` instalado), three.js **MIT**. La doc oficial
  aclara *"code samples are licensed under the Apache 2.0 License"*. La pagina del modelo **no
  publica una licencia especifica para el `.task`** mas alla de los model cards: si el proyecto se
  vuelve comercial en serio, ese es el punto a revisar con Google.

### 6.5 Camino recomendado

1. Esqueleto de init/loop de FaceLandmarker desde `mediapipe-samples-web` (Apache 2.0).
2. Poner `outputFacialTransformationMatrixes: true` y escribir el puente a three.js (seccion 5).
   Esto no existe publicado: es trabajo nuevo.
3. Portar **conceptualmente** el doblado de patillas / occluder / fade de `WebARRocksMirror.js` (MIT)
   y del `glassesVTO` de `jeelizFaceFilter` (Apache 2.0).
4. Monturas: BeeAR (MIT, sin atribucion) o bensonruan (CC-BY-4.0, con bloque de creditos).
5. Mas adelante, oclusion real con la idea de `WebAR.rocks.faceDepth`.

---

## 7. Assets `.glb` de anteojos con licencia permisiva

### 7.1 Ganador: Poly Pizza (CC0, sin atribucion, CORS abierto)

Es el mirror vivo del difunto Google Poly. El patron **no esta documentado** pero se extrajo del HTML:
la pagina es `https://poly.pizza/m/<id>` y el binario directo `https://static.poly.pizza/<uuid>.glb`.

Los 26 de abajo se verificaron **uno por uno** con `curl -I -H "Origin: ..."`:
**HTTP/2 200 + `access-control-allow-origin: *`**, sin login ni API key. En uno se leyeron los
primeros bytes: `676c 5446 0200 0000` = magic `glTF` v2 binario real.

**CC0 1.0 — dominio publico, sin atribucion.** Todos de **iPoly3D** (pack "Glasses Pack"):

| Nombre | Pagina | GLB directo | Bytes |
|---|---|---|---:|
| Glasses | `poly.pizza/m/LYEp20yfFh` | `https://static.poly.pizza/03bbb311-4de2-4a0c-93ba-e478141d5310.glb` | 49.780 |
| Glasses | `poly.pizza/m/j3xPyO1mvt` | `https://static.poly.pizza/4f5cf8fc-1f56-4b79-a3bb-e216a3c401b5.glb` | 45.564 |
| Glasses | `poly.pizza/m/DBEk0SMQCt` | `https://static.poly.pizza/ebadf2b5-3f28-4aa9-b0fd-942a4a6a06c5.glb` | 46.380 |
| Glasses | `poly.pizza/m/7NZp449iJq` | `https://static.poly.pizza/2d41e1c6-fa3b-464a-b1ae-43d47e360c3f.glb` | 48.220 |
| Glasses | `poly.pizza/m/YchMXfQNU0` | `https://static.poly.pizza/be7d660c-88f7-48f4-ac8f-1f662f9f6732.glb` | 42.944 |
| Glasses | `poly.pizza/m/yYdsPoULg1` | `https://static.poly.pizza/6c14a5a0-2ed9-4669-8ef0-ee273b3692e2.glb` | 42.880 |
| Glasses | `poly.pizza/m/1TJPsi4VIT` | `https://static.poly.pizza/04b2dccd-9213-4a34-82bf-94eb365acd27.glb` | 42.768 |
| Glasses | `poly.pizza/m/9SQY3Gsq2s` | `https://static.poly.pizza/566087b3-e5ba-4c6f-9cb9-feb388dd41f6.glb` | 42.240 |
| Glasses | `poly.pizza/m/Dz9SyIEq7w` | `https://static.poly.pizza/7344afdd-38b3-4f0c-b10b-612963690302.glb` | 40.124 |
| Glasses | `poly.pizza/m/j3zHqDAnzH` | `https://static.poly.pizza/c76726de-859c-4ba4-9006-915af5141913.glb` | 40.108 |
| Glasses | `poly.pizza/m/9xOJlCsQzX` | `https://static.poly.pizza/403dfb59-d182-43cb-9a39-8d2850f27ce7.glb` | 39.796 |
| Glasses | `poly.pizza/m/p5QgQxkMBE` | `https://static.poly.pizza/1a9d3811-09fe-4028-9bf6-0e880f9b4c84.glb` | 39.448 |
| Glasses | `poly.pizza/m/SyNFHIhIDd` | `https://static.poly.pizza/a725e413-48f0-4112-9aff-4a5165320677.glb` | 39.320 |
| Glasses | `poly.pizza/m/oc8MPJuSud` | `https://static.poly.pizza/a4ccaeb9-79ce-4e5b-8938-478b835051ad.glb` | 39.016 |
| Party Glasses | `poly.pizza/m/tPrk0HHagr` | `https://static.poly.pizza/0151e9cf-453f-4d2e-a867-a1ebb9835a15.glb` | 39.932 |
| Pixel Glasses | `poly.pizza/m/VQuqLwtyTa` | `https://static.poly.pizza/e8445020-e255-4477-af2f-cdd7518a5af7.glb` | 27.312 |
| Ski Goggles | `poly.pizza/m/4YCjSY3U6H` | `https://static.poly.pizza/d9c725b3-b39a-49c9-bc51-1159c1a747db.glb` | 27.856 |

**CC-BY 3.0 — requieren atribucion al autor:**

| Nombre | Autor | GLB directo | Bytes |
|---|---|---|---:|
| Aviator sunglasses | Poly by Google | `https://static.poly.pizza/f06bb790-a71c-4739-ad2d-f658fc625bc0.glb` | 140.768 |
| Monocle | Poly by Google | `https://static.poly.pizza/c9a20f84-1753-4575-9d66-f9b06ca6771e.glb` | 10.608 |
| Sunglasses | jeremy | `https://static.poly.pizza/f7dafd04-8ef5-45f5-a57c-78c7a3d4f0cb.glb` | 28.748 |
| Glasses | jeremy | `https://static.poly.pizza/46f52f27-291c-4460-9568-e7608b8d030d.glb` | 19.168 |
| Sunglasses | J-Toastie | `https://static.poly.pizza/9de97bf5-3466-4c95-82a4-66ca97203dd3.glb` | 28.392 |
| Heart Glasses | J-Toastie | `https://static.poly.pizza/b5db43c1-155f-44de-be8c-76476eb759a9.glb` | 26.180 |
| Pixel Sunglasses | TRASH - TANUKI | `https://static.poly.pizza/0ba7e1d8-4529-40eb-bed5-05bccb433c71.glb` | 62.172 |
| Glasses | Michael Fuchs | `https://static.poly.pizza/4749fcec-cabb-4956-af6f-76671f0c71ac.glb` | 709.104 |
| Time Hotel 5.10 AviatorGlasses | S. Paul Michael | `https://static.poly.pizza/d2594fa9-6a59-41b2-b286-45242f6a45cd.glb` | 1.007.628 |

Pack completo: `https://poly.pizza/bundle/Glasses-Pack-gPz05eJm9w` (iPoly3D, **29 modelos CC0**).
El ZIP del bundle **redirige a `/login`**; los `.glb` individuales no piden nada. Quedaron 8 IDs del
mismo pack sin verificar individualmente: `3jamofoetY`, `J289oMy6pQ`, `i5dNUjQMUG`, `kAxq5NzcFZ`,
`XLysBbtilu`, `fNEK0SGJ6D`, `Zh87A7UV3V`, `oQtjZCNFoo`.

La **API** de Poly Pizza (`api.poly.pizza`) devuelve **401**: necesita key de
`poly.pizza/settings/api`. **No hace falta** — los `.glb` de `static.poly.pizza` salen sin key.

⚠️ **No linkear `static.poly.pizza` desde produccion.** Son UUIDs opacos, sin SLA ni promesa de
permanencia. Bajarlos una vez, auto-hostearlos, y dejar un `credits.json` con autor + licencia +
URL de origen por modelo.

### 7.2 Las 7 monturas CC-BY-4.0 de `bensonruan` (verificadas aparte)

Formato glTF separado (`scene.gltf` + `scene.bin` + texturas), **cada carpeta con su `license.txt`**.
Verificado: HTTP 206 por jsDelivr y los 7 `license.txt` leidos enteros. Todos **CC-BY-4.0,
"Author must be credited. Commercial use is allowed."** Son de mejor calidad que los low-poly de
Poly Pizza (mallas de 0.6 a 5.2 MB, con texturas PBR).

Patron de URL: `https://cdn.jsdelivr.net/gh/bensonruan/Virtual-Glasses-Try-on@master/3dmodel/glasses-0N/scene.gltf`

| # | Titulo | Autor | `scene.bin` |
|---|---|---|---:|
| 01 | Sport Glasses B307 | hanchiahui | 2.849.788 |
| 02 | Glasses 07 | Dokono Kinokoda (JunkWren) | 5.256.608 |
| 03 | Cartoon Glasses | Lucas_Bartolomeo | 729.344 |
| 04 | Plastic Sunglasses | Incg5764 | 862.528 |
| 05 | Aviator sunglasses | Kimppo | 1.675.200 |
| 06 | EyeGlasses | thelegendofwolf | 3.229.696 |
| 07 | 3D frames generated in less than 10 seconds | VReeAI | 613.152 |

Todos vienen de Sketchfab. El `license.txt` de cada uno trae el bloque de credito exacto listo para
copiar, del tipo:

> This work is based on "Aviator sunglasses"
> (https://sketchfab.com/3d-models/aviator-sunglasses-00d1cb5aa82745228a3b764c97f867de)
> by Kimppo (https://sketchfab.com/Kimppo) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

### 7.3 Khronos: si tiene anteojos, pero con trampa de marca

De los 162 modelos de `glTF-Sample-Assets` hay **exactamente uno** de anteojos: **`SunglassesKhronos`**.

```
https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/SunglassesKhronos/glTF-Binary/SunglassesKhronos.glb
```
HTTP **200**, `content-type: model/gltf-binary`, 371.188 bytes, CORS `*`, magic glTF v2 confirmado.
Licencia **CC-BY 4.0**, Eric Chadwick (2024) / Darmstadt Graphics Group.

⚠️ El `LICENSE.md` dice *"This license excludes logos and associated trademarks"*, y el modelo
**tiene los logos de Khronos y 3D Commerce impresos en las patillas**. Sirve como **banco de pruebas
de materiales** (usa `KHR_materials_iridescence` + transmission, ideal para calibrar el PBR de las
lentes), **no como producto vendible**. Si se usa, pinear el **commit SHA** en lugar de `@main`.

### 7.4 Lo que NO sirve

| Fuente | Por que |
|---|---|
| **Sketchfab (automatizado)** | `api.sketchfab.com/v3/models/<uid>/download` devuelve **401**; requiere OAuth y la URL que entrega es **firmada y expira** → inservible como URL estable. El filtro `license=cc0` no devolvio nada: en eyewear casi todo es CC-BY. Sirve solo como descarga manual + auto-host + credito. |
| **three.js examples** | Se listo `examples/models/gltf` entero: **no hay ningun modelo de anteojos**. |
| **Kenney** | Todo CC0, pero los accesorios vienen en ZIP y son *cartoon* de personaje. **No hay URL directa a un `.glb` de anteojos.** No verificado del todo (catalogo JS-driven). |
| **Quaternius** | CC0, pero **no tiene eyewear**. `/packs.html` da 404. |
| **Smithsonian 3D** | CC0 real, pero son escaneos de museo (alta densidad, topologia sucia). No se encontraron anteojos. No verificado con curl. |
| **Google Poly** | Muerto. Su contenido vive en Poly Pizza (ver 7.1). |
| **Jeeliz VTO Widget** | Licencia comercial propietaria, y ademas no trae assets locales. |

### 7.5 Assets adentro de repos (ver seccion 6)

- **`jeelizFaceFilter`** `demos/threejs/glassesVTO/models3D/*.json` — **Apache 2.0**, incluye la
  version con patillas dobladas. Formato three.js JSON legacy, hay que convertir a glTF.
- **`BeeAR`** `packages/catalog/glb/` — declarado **MIT**, ~11 monturas (aviator-gold, cateye-rose,
  clubmaster-amber, hex-graphite, rectangle-frost, round-tortoise, sport-blue, wayfarer-black...).
  *No se pudo verificar por cuenta propia*: jsDelivr devolvio 403/404 para ese repo y la API de
  GitHub estaba rate-limited. Varios se llaman `glasses_meshy_*` → generados por IA, calidad a
  revisar abriendo los archivos.
- **`WebAR.rocks.face`** `demos/VTOGlasses/assets/models3D/*.glb` — **licencia ambigua**, `/demos`
  no entra en el "LICENSED PROPERTY" del MIT. No usar comercialmente sin preguntar.

### 7.6 Recomendacion de assets

1. **Arrancar con los 17 CC0 de iPoly3D** (Poly Pizza): cero friccion legal, 27-50 KB, CORS abierto,
   perfectos para tener catalogo ya mismo. Son low-poly: alcanzan para validar el pipeline.
2. **Subir la calidad con las 7 CC-BY-4.0 de `bensonruan`**, que tienen PBR de verdad. Cuesta un
   bloque de creditos en el footer y nada mas.
3. **Calibrar materiales de lente con `SunglassesKhronos`** (iridiscencia + transmission), sin
   shippearlo.
4. Para catalogo propio de verdad, modelar siguiendo la **spec de `WebAR.rocks.face/demos/VTOGlasses`**
   (seccion 6.2): resuelve de entrada el problema de escala y orientacion.
5. Ojo con las **replicas de marcas reales** (Ray-Ban, Prada, Balenciaga) que circulan en Sketchfab
   con licencia CC-BY: la licencia cubre la malla, **no la marca registrada**.

> **Nota sobre `data/research/sunglasses.json`** (ya existente en esta carpeta): es un catalogo de
> **producto** de Infinit (23 modelos con colores, formas y precios), no de assets 3D. Sirve para
> el catalogo comercial, pero no aporta ningun `.glb`.

---

## 8. Resumen ejecutivo

| # | Dato | Valor |
|---|---|---|
| 1 | Version | `@mediapipe/tasks-vision@1.0.1` + `three@0.186.0` (ambas ya instaladas) |
| 2 | Modelo | `storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` — 3.758.596 B, sin variantes lite/full |
| 3 | wasm | `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm` (directorio completo, 6 archivos) |
| 4 | Iris | centro **468** (ojo derecho anatomico, X negativo) y **473** (izquierdo, X positivo); contornos 469-472 y 474-477, en orden `[centro, right, top, left, bottom]` |
| 5 | Matriz | **column-major** → `new THREE.Matrix4().fromArray(m.data)`, sin transponer |
| 6 | Camara | `PerspectiveCamera(63, videoW/videoH, 1, 10000)` en el origen, unidades **cm** |
| 7 | Mejor repo | `jeelizFaceFilter` (Apache 2.0, con demo de glassesVTO) + `mediapipe-samples-web` (Apache 2.0) como esqueleto |
| 8 | Assets | 17 `.glb` **CC0** en Poly Pizza + 7 `.gltf` **CC-BY-4.0** en `bensonruan` |

### Lo que hay que construir (no existe publicado)

El puente `facialTransformationMatrixes` → three.js. Google activa la opcion en su sample pero
renderiza en 2D, y la busqueda `tasks-vision glasses` en GitHub da **cero repos**. Es trabajo nuevo,
y la seccion 5 tiene todo lo necesario para escribirlo bien de una.

### Puntos abiertos, marcados honestamente

- Licencia especifica del archivo `.task` (la doc solo cubre codigo con Apache 2.0). Revisar si el
  proyecto se comercializa.
- Licencia de los `.glb` de `WebAR.rocks.face/demos/` — ambigua, hay que preguntar.
- Catalogo GLB de BeeAR: declarado MIT pero no verificado por cuenta propia.
- Contenido de los CodePens oficiales (`OJBVQJm`, `oNPKmEy`): CodePen responde 403 por Cloudflare.
- 8 IDs de iPoly3D del Glasses Pack sin verificar individualmente.
