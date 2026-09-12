# Probador de anteojos

Probador virtual con cámara: te ponés los modelos reales del catálogo sobre tu
cara y, además de ver cómo te quedan, te dice **qué talle te entra de verdad**.

## Cómo se usa

Doble clic en **`Probador de anteojos.command`**. Se abre el browser solo.
La primera vez el sistema puede pedir permiso para ejecutarlo (botón derecho →
Abrir). Después, permitir la cámara cuando el browser lo pida.

Si preferís la terminal:

```bash
cd "glasses-tryon"
python3 -m http.server 8777
# abrir http://localhost:8777
```

Nada sale de tu máquina: el modelo de detección de cara corre en el browser y el
video no se sube a ningún lado. No hay backend.

### Atajos

| Tecla | Qué hace |
|---|---|
| ← / → | Modelo anterior / siguiente |
| Espacio | Sacar foto |
| F | Guardar en mi lista |
| Esc | Sacarme los anteojos |

### Cámara

Arriba a la derecha se elige **qué cámara** y **a qué resolución** (hasta 4K, si
la cámara da). Chrome por defecto entrega 640×480, que se ve blando: por eso la
app pide Full HD explícitamente. Al lado se muestra la resolución real que
entregó la cámara. La elección queda guardada.

## Qué es lo que te muestra

- **DIP** (distancia interpupilar) y **ancho de cara** en milímetros reales.
  Se miden usando el iris como regla: el iris humano mide 11,7 mm en casi todos
  los adultos, con un desvío de medio milímetro. Es la única referencia de escala
  confiable que hay en una cara.
- **Tu talle**, en el formato que se usa en la óptica: `calibre–puente–varilla`.
- Por cada modelo, un veredicto de **talle**: *te entra* / *justo* / *no es tu talle*.
  Sale de comparar el ancho total del armazón contra el ancho de tu cara
  (±4 mm ideal, ±8 mm tolerable). Con la lista ordenada, lo que te entra sube primero.

Los anteojos se dibujan a escala real: un aviador de 58 mm de calibre se ve más
grande sobre tu cara que un redondo de 47 mm, igual que en la vida real.

## Las monturas 3D

Lo que se ve puesto sobre la cara son **monturas 3D reales** (mallas con texturas
PBR, de Sketchfab y del catálogo MIT de BeeAR), no siluetas dibujadas. Hay una
montura por forma —aviador, wayfarer, redonda, cat eye, panto, envolvente,
óptica fina, angular— y cada modelo del catálogo usa la de su forma.

**Lo importante:** la montura es *representativa de la forma*, no es el producto
de esa marca. Lo que sí es exacto es el **tamaño**: se escala a los milímetros
reales del modelo, así que el chequeo de talle vale igual. La app lo avisa en el
panel de cada modelo.

El botón **◉ 3D real / ◻ Silueta** cambia entre la montura 3D y el dibujo
paramétrico. La silueta sigue ahí porque es el respaldo: se usa mientras carga el
3D y si la máquina no tiene WebGL.

Las miniaturas de la lista siguen siendo siluetas a propósito: son 282 y
renderizar 3D en cada una colgaría la pestaña.

### Atribución (obligatoria)

Las monturas CC-BY exigen acreditar al autor. Están todas en el botón
**Créditos** de la app y en `assets/models/credits.json`. No borres ese archivo.

## Qué NO es

No es una foto del producto. Sirve para decidir forma, tamaño y color. No sirve
para juzgar terminaciones, texturas del acetato ni la calidad de la bisagra.

Los modelos marcados con ⚠ tienen medidas aproximadas que ningún agente pudo
verificar contra la ficha del fabricante. Los demás salen de la página oficial.

## Estructura

```
index.html            La app
src/geometry.js       Geometría paramétrica del armazón (silueta de respaldo)
src/model3d.js        Carga de monturas 3D y su auto-orientación
src/render3d.js       Render 3D sobre el video (three.js)
src/pose.js           Landmarks -> pose de cabeza + medidas de la cara
src/render.js         Proyección y dibujo sobre el video
src/app.js            Cámara, loop, catálogo, UI
data/catalog.json     Catálogo unificado (generado)
data/research/        Lo que devolvieron los agentes de investigación
scripts/seed.mjs      Semilla curada de modelos
scripts/build_catalog.mjs  Une semilla + investigación -> catalog.json
vendor/               MediaPipe y el modelo de detección, servidos localmente
assets/models/        Monturas 3D de terceros + credits.json (atribución)
test/shot.mjs         Prueba visual en Chrome headless sobre una foto
test/calibrate.mjs    Revisa la orientación de cada montura 3D
```

## Si faltan las monturas 3D

`assets/models/` pesa 50 MB y está fuera de git (salvo `credits.json` y
`frames3d.json`). Para rebajarlas: `./scripts/setup_assets.sh`.

## Si falta `vendor/`

`vendor/` pesa 38 MB (el runtime de MediaPipe y el modelo de detección) y está
fuera de git. Para reconstruirlo:

```bash
./scripts/setup_vendor.sh
```

## Regenerar el catálogo

```bash
node scripts/build_catalog.mjs
```

Lee todo `data/research/*.json` y lo fusiona con la semilla. El dato verificado
en la página del fabricante siempre le gana a la semilla.

## Correr la prueba visual

```bash
python3 -m http.server 8777 &
node test/shot.mjs                      # modelos por defecto
node test/shot.mjs ray-ban--rb3016-clubmaster
FACE=face2.jpg PREFIX=turn- node test/shot.mjs
```

Deja las capturas en `test/out/`.
