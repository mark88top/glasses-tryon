# Goal: probador de anteojos usable para decidir una compra

**Caso de uso:** comprar anteojos para proteger la vista frente a pantallas, sin
graduación (lentes planas con filtro). Comprador en Argentina, por eso el
catálogo prioriza lo que se consigue localmente y los precios en ARS.

**Objetivo de la herramienta:** probarse modelos reales sobre la propia cara desde
la compu, filtrar por marca / tipo / género / forma, y salir con una lista corta
de qué comprar y dónde, con el talle correcto.

## Estado: **funcionando**

- Detección de cara en el browser (MediaPipe FaceLandmarker, 478 puntos, local).
- Pose de cabeza y medidas reales vía el iris como regla (11,7 mm).
- Armazones generados en geometría paramétrica 3D a escala real en milímetros.
- Catálogo de 257 modelos / 39 marcas, 215 verificados contra la página oficial.
- Veredicto de talle por modelo, contra el ancho de cara medido.
- Cámara en vivo o prueba sobre una foto. Fotos, comparación y lista de favoritos.
- **Monturas 3D reales** (mallas PBR) escaladas a los milímetros del modelo, con
  selector de cámara y resolución hasta 4K.

## Lo que falta (en orden de valor)

1. **Precios en ARS para las marcas globales.** Ray-Ban, Oakley y Persol quedaron
   sin precio local: `sunglasshut.com.ar` no resuelve y Mercado Libre devuelve 403.
   Hace falta una vía que no sea scraping directo.
2. **Cerrar los modelos sin medidas.** Maui Jim, Quay e Izipizi no publican
   calibre/puente. Sin eso el veredicto de talle de esos modelos es una estimación.
3. **Más cobertura argentina:** ópticas locales con catálogo online y stock real
   (La Óptica Web, Lookout, Numag, Rimland, Infinit ya están; faltan cadenas).
4. **Colores reales por modelo.** Muchos hex están derivados del nombre del color
   oficial, no muestreados de la foto del producto.
5. **Una montura 3D por modelo, no por forma.** Hoy hay 9 monturas 3D para 282
   modelos: se elige por forma. Un Persol 714 y un Tom Ford Snowdon comparten
   malla. Lo correcto sería modelar o conseguir los icónicos uno por uno.
6. **Colores reales sobre la malla 3D.** Hoy se tiñe el material dominante; un
   carey o un degradé de verdad necesitan textura, no un color plano.
7. Oclusión de la patilla con el pelo y sombra de contacto sobre la nariz.
8. Miniaturas de la lista en 3D (hoy son siluetas, por costo de render).

## Reglas de este proyecto

- **Ningún dato inventado.** Medida, precio o color que no se verifique contra la
  página del fabricante va en `null` y el modelo queda marcado `verified: false`,
  que la UI muestra con ⚠. Un probador que miente en las medidas es peor que no tenerlo.
- El video **nunca** sale de la máquina. Sin backend, sin subida, sin analytics.
- El dato verificado siempre le gana a la semilla curada al fusionar el catálogo.
