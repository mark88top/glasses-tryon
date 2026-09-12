/**
 * Semilla del catalogo. Las medidas marcadas verified:false salen de conocimiento
 * general de los modelos y las pisa build_catalog.mjs cuando la investigacion
 * devuelve el dato confirmado en la pagina del fabricante.
 *
 * Campos: [brand, model, category, shape, gender, lensW, bridge, temple, material, frameColors, lensColors, extra]
 * category: blue_light | optical | sunglasses
 */
const C = (name, hex) => ({ name, hex });
const L = (name, hex, opacity, mirrored = false, polarized = false) => ({ name, hex, opacity, mirrored, polarized });

// paletas reutilizables
const NEGRO = C('Negro', '#141414');
const CAREY = C('Carey / Havana', '#6b4423');
const CRISTAL = C('Cristal', '#d8d4cc');
const TORTUGA_MIEL = C('Havana miel', '#9c6b34');
const ORO = C('Oro', '#d4af37');
const GUNMETAL = C('Gunmetal', '#5a5f66');
const PLATA = C('Plata', '#c6ccd2');
const AZUL_NOCHE = C('Azul noche', '#22304a');
const VERDE_BOTELLA = C('Verde militar', '#2f3d2f');
const NUDE = C('Nude', '#c8a48a');
const BORDO = C('Bordo', '#5c2230');

// cristales
const CLARO = L('Transparente', '#e9eef2', 0.10);
const BLUE_LIGHT = L('Filtro luz azul (tinte ambar suave)', '#f2e3c4', 0.16);
const BLUE_LIGHT_CLARO = L('Filtro luz azul transparente', '#e6f0f5', 0.10);
const G15 = L('G-15 verde', '#2f4030', 0.62);
const B15 = L('B-15 marron', '#57351d', 0.60);
const GRIS = L('Gris', '#3a3d42', 0.62);
const VERDE_ESP = L('Verde espejado', '#2e6b4f', 0.60, true);
const AZUL_ESP = L('Azul espejado', '#2a5b8f', 0.60, true);
const DORADO_ESP = L('Dorado espejado', '#b58b32', 0.58, true);
const GRIS_POL = L('Gris polarizado', '#33363b', 0.66, false, true);
const MARRON_POL = L('Marron polarizado', '#4a3220', 0.64, false, true);
const PRIZM = L('Prizm rubi', '#7a2230', 0.58, true);

const M = (brand, model, category, shape, gender, lensW, bridge, temple, material, frameColors, lensColors, extra = {}) =>
  ({ brand, model, category, shape, gender, lensWidth: lensW, bridge, templeLength: temple, material,
     frameColors, lensColors, verified: false, source: 'conocimiento general — pendiente de verificar', ...extra });

export const SEED = [
  /* ---------------- BLUE LIGHT / computadora ---------------- */
  M('Gunnar', 'Intercept', 'blue_light', 'square', 'unisex', 54, 17, 135, 'inyectado', [C('Onyx', '#17181a'), C('Crystal', '#cfd3d6')], [BLUE_LIGHT, BLUE_LIGHT_CLARO], { blueLightBlock: '65%', notes: 'El clasico gamer. Tinte ambar fuerte, vira bastante el color.' }),
  M('Gunnar', 'Vertex', 'blue_light', 'rectangle', 'unisex', 56, 17, 140, 'inyectado', [NEGRO, C('Crystal', '#cfd3d6'), C('Rubi', '#7b2c39')], [BLUE_LIGHT, BLUE_LIGHT_CLARO], { blueLightBlock: '65%' }),
  M('Gunnar', 'Torpedo', 'blue_light', 'geometric', 'male', 55, 17, 135, 'metal', [ORO, GUNMETAL], [BLUE_LIGHT], { blueLightBlock: '65%' }),
  M('Barner', 'Dalston', 'blue_light', 'panto', 'unisex', 50, 21, 145, 'acetato', [NEGRO, CAREY, C('Gris humo', '#4b4f54')], [BLUE_LIGHT_CLARO], { blueLightBlock: '40%', notes: 'Marca española, envia a Argentina. Lente casi transparente.' }),
  M('Barner', 'Le Marais', 'blue_light', 'round', 'unisex', 48, 22, 145, 'metal', [ORO, NEGRO], [BLUE_LIGHT_CLARO], { blueLightBlock: '40%' }),
  M('Barner', 'Chamberi', 'blue_light', 'rectangle', 'unisex', 52, 19, 145, 'acetato', [NEGRO, CAREY], [BLUE_LIGHT_CLARO], { blueLightBlock: '40%' }),
  M('Felix Gray', 'Turing', 'blue_light', 'rectangle', 'male', 52, 19, 145, 'acetato', [CAREY, NEGRO, C('Whiskey', '#8a5a2b')], [BLUE_LIGHT_CLARO], { blueLightBlock: '15% (sin tinte visible)', notes: 'Filtro suave sin virar color, pensado para oficina.' }),
  M('Felix Gray', 'Nash', 'blue_light', 'round', 'unisex', 49, 21, 145, 'acetato', [CAREY, C('Slate', '#4a5159')], [BLUE_LIGHT_CLARO], { blueLightBlock: '15%' }),
  M('Felix Gray', 'Roebling', 'blue_light', 'browline', 'male', 52, 20, 145, 'mixto', [CAREY, NEGRO], [BLUE_LIGHT_CLARO], { browBar: true, blueLightBlock: '15%' }),
  M('Izipizi', 'Screen #C', 'blue_light', 'panto', 'unisex', 50, 20, 143, 'inyectado', [NEGRO, CAREY, C('Azul', '#2b4a7d'), NUDE], [BLUE_LIGHT_CLARO], { blueLightBlock: '40%', notes: 'Baratos, se consiguen importados. Vienen tambien con aumento.' }),
  M('Izipizi', 'Screen #D', 'blue_light', 'square', 'unisex', 52, 19, 143, 'inyectado', [NEGRO, CAREY, C('Verde', '#37543f')], [BLUE_LIGHT_CLARO], { blueLightBlock: '40%' }),
  M('Warby Parker', 'Percey', 'blue_light', 'round', 'unisex', 49, 20, 145, 'acetato', [C('Whiskey Tortoise', '#8a5a2b'), C('Striped Sassafras', '#7a4a2a'), NEGRO], [BLUE_LIGHT_CLARO], { notes: 'Se pide con "blue-light filtering" como opcion de cristal.' }),
  M('Warby Parker', 'Wilkie', 'blue_light', 'rectangle', 'male', 52, 19, 145, 'acetato', [NEGRO, CAREY, C('Sea Glass Gray', '#6f7b7d')], [BLUE_LIGHT_CLARO], {}),
  M('Warby Parker', 'Haskell', 'blue_light', 'browline', 'male', 51, 20, 145, 'mixto', [CAREY, C('Eastern Bluebird', '#3d5a80')], [BLUE_LIGHT_CLARO], { browBar: true }),
  M('Ambr', 'Nemo', 'blue_light', 'rectangle', 'unisex', 52, 20, 145, 'acetato', [NEGRO, CAREY], [BLUE_LIGHT_CLARO], {}),
  M('Horus X', 'One Pro', 'blue_light', 'square', 'unisex', 54, 18, 140, 'TR90', [NEGRO, C('Azul', '#22304a')], [BLUE_LIGHT], { blueLightBlock: '86% en el pico azul' }),

  /* ---------------- Armazones de receta (se piden con cristal plano + filtro) ---------------- */
  M('Ray-Ban', 'RB5154 Clubmaster Optics', 'optical', 'browline', 'unisex', 51, 21, 145, 'mixto', [C('Negro / oro', '#1c1c1c'), C('Havana / oro', '#6b4423')], [CLARO, BLUE_LIGHT_CLARO], { browBar: true, iconic: true, notes: 'El browline clasico: la ceja gruesa y el aro inferior metalico fino.' }),
  M('Ray-Ban', 'RB5121 Wayfarer Optics', 'optical', 'wayfarer', 'unisex', 50, 22, 150, 'acetato', [NEGRO, CAREY, C('Negro brillante', '#0f0f0f')], [CLARO, BLUE_LIGHT_CLARO], { iconic: true }),
  M('Ray-Ban', 'RB3447V Round Metal Optics', 'optical', 'round', 'unisex', 47, 21, 145, 'metal', [ORO, GUNMETAL, C('Cobre', '#b06b3a')], [CLARO, BLUE_LIGHT_CLARO], { iconic: true }),
  M('Ray-Ban', 'RB6396 Hexagonal Optics', 'optical', 'hexagonal', 'unisex', 51, 19, 145, 'metal', [ORO, PLATA, GUNMETAL], [CLARO, BLUE_LIGHT_CLARO], {}),
  M('Persol', 'PO3007V', 'optical', 'panto', 'male', 52, 20, 145, 'acetato', [CAREY, NEGRO, C('Terra di Siena', '#8a4b2a')], [CLARO, BLUE_LIGHT_CLARO], { notes: 'Acetato italiano, calidad de bisagra muy superior al promedio.' }),
  M('Oakley', 'Holbrook RX', 'optical', 'square', 'male', 54, 18, 137, 'inyectado', [C('Satin Black', '#1b1b1b'), C('Grey Smoke', '#6d7278')], [CLARO, BLUE_LIGHT_CLARO], {}),
  M('Infinit', 'Ruta 8', 'optical', 'rectangle', 'unisex', 52, 19, 145, 'acetato', [NEGRO, CAREY, CRISTAL], [CLARO, BLUE_LIGHT_CLARO], { argentina: true, notes: 'Marca argentina, se compra online y en locales propios.' }),
  M('Infinit', 'Milan', 'optical', 'round', 'unisex', 48, 21, 145, 'metal', [ORO, NEGRO], [CLARO, BLUE_LIGHT_CLARO], { argentina: true }),

  /* ---------------- Anteojos de sol ---------------- */
  M('Ray-Ban', 'RB3025 Aviator Classic', 'sunglasses', 'aviator', 'unisex', 58, 14, 135, 'metal', [ORO, PLATA, GUNMETAL, C('Oro rosa', '#c98f6e')], [G15, B15, GRIS_POL, AZUL_ESP, DORADO_ESP], { doubleBridge: true, iconic: true, rimThickness: 1.4 }),
  M('Ray-Ban', 'RB2140 Wayfarer Original', 'sunglasses', 'wayfarer', 'unisex', 50, 22, 150, 'acetato', [NEGRO, CAREY, C('Azul', '#24365c')], [G15, B15, GRIS_POL], { iconic: true }),
  M('Ray-Ban', 'RB2132 New Wayfarer', 'sunglasses', 'wayfarer', 'unisex', 52, 18, 145, 'acetato', [NEGRO, CAREY, C('Negro mate', '#1f1f1f')], [G15, GRIS, MARRON_POL], { iconic: true }),
  M('Ray-Ban', 'RB3016 Clubmaster', 'sunglasses', 'browline', 'unisex', 51, 21, 145, 'mixto', [C('Negro / oro', '#1c1c1c'), C('Havana / oro', '#6b4423')], [G15, B15, GRIS_POL], { browBar: true, iconic: true }),
  M('Ray-Ban', 'RB3447 Round Metal', 'sunglasses', 'round', 'unisex', 50, 21, 145, 'metal', [ORO, GUNMETAL, C('Cobre', '#b06b3a')], [G15, B15, AZUL_ESP], { iconic: true }),
  M('Ray-Ban', 'RB3548 Hexagonal Flat', 'sunglasses', 'hexagonal', 'unisex', 51, 21, 145, 'metal', [ORO, GUNMETAL], [GRIS, DORADO_ESP, VERDE_ESP], {}),
  M('Ray-Ban', 'RB4165 Justin', 'sunglasses', 'rectangle', 'male', 54, 16, 145, 'inyectado', [C('Negro goma', '#1a1a1a'), C('Havana goma', '#5e3d23')], [GRIS, AZUL_ESP, GRIS_POL], { notes: 'Mas grande y anguloso que el Wayfarer.' }),
  M('Ray-Ban', 'RB4171 Erika', 'sunglasses', 'oval', 'female', 54, 18, 145, 'mixto', [C('Negro goma', '#1a1a1a'), CAREY, NUDE], [GRIS, L('Rosa degrade', '#d38a9a', 0.5)], { notes: 'Redondeado grande, muy usado como modelo femenino.' }),
  M('Oakley', 'Holbrook', 'sunglasses', 'square', 'male', 55, 18, 137, 'inyectado', [C('Matte Black', '#1b1b1b'), C('Woodgrain', '#6a4a2d'), C('Polished Clear', '#d5d8da')], [PRIZM, GRIS_POL, AZUL_ESP], { iconic: true }),
  M('Oakley', 'Frogskins', 'sunglasses', 'wayfarer', 'unisex', 54, 17, 138, 'inyectado', [NEGRO, C('Matte Black', '#1b1b1b'), C('Crystal', '#cfd3d6')], [PRIZM, GRIS, VERDE_ESP], { iconic: true }),
  M('Oakley', 'Sutro', 'sunglasses', 'shield', 'male', 68, 12, 130, 'inyectado', [C('Matte Black', '#1b1b1b'), C('Blanco', '#e8e8e8')], [PRIZM, AZUL_ESP, VERDE_ESP], { wrap: 16, notes: 'Mascara deportiva de una sola lente, muy envolvente.' }),
  M('Oakley', 'Radar EV Path', 'sunglasses', 'shield', 'male', 66, 13, 128, 'inyectado', [C('Matte Black', '#1b1b1b'), C('Blanco', '#e8e8e8')], [PRIZM, AZUL_ESP], { wrap: 18 }),
  M('Persol', 'PO0714 Steve McQueen', 'sunglasses', 'aviator', 'male', 52, 20, 140, 'acetato', [CAREY, NEGRO, C('Terra di Siena', '#8a4b2a')], [B15, GRIS_POL, L('Verde cristal', '#2f4030', 0.6)], { iconic: true, notes: 'El plegable historico. Acetato con remaches en flecha.' }),
  M('Persol', 'PO0649', 'sunglasses', 'square', 'male', 54, 20, 140, 'acetato', [CAREY, NEGRO], [B15, G15], { iconic: true }),
  M('Persol', 'PO3152S', 'sunglasses', 'panto', 'unisex', 52, 20, 145, 'acetato', [CAREY, NEGRO, C('Azul', '#25365a')], [B15, GRIS], {}),
  M('Carrera', '1001/S', 'sunglasses', 'aviator', 'male', 59, 15, 145, 'metal', [ORO, GUNMETAL, NEGRO], [GRIS, DORADO_ESP], {}),
  M('Carrera', 'Champion', 'sunglasses', 'wayfarer', 'male', 62, 12, 125, 'inyectado', [NEGRO, C('Blanco', '#e8e8e8')], [GRIS, AZUL_ESP], { notes: 'Grande y noventoso, queda en caras anchas.' }),
  M('Vulk', 'Ryder', 'sunglasses', 'square', 'male', 55, 18, 140, 'inyectado', [C('Negro mate', '#1b1b1b'), CAREY], [GRIS_POL, VERDE_ESP], { argentina: true, notes: 'Marca fuerte en Argentina, buena relacion precio-calidad.' }),
  M('Vulk', 'Saint', 'sunglasses', 'round', 'unisex', 50, 20, 145, 'metal', [ORO, GUNMETAL], [GRIS, MARRON_POL], { argentina: true }),
  M('Infinit', 'Perro Salchicha', 'sunglasses', 'wayfarer', 'unisex', 52, 19, 145, 'acetato', [NEGRO, CAREY, CRISTAL], [GRIS, B15], { argentina: true }),
  M('Infinit', 'Titan', 'sunglasses', 'aviator', 'male', 58, 14, 140, 'metal', [ORO, GUNMETAL], [GRIS, VERDE_ESP], { argentina: true, doubleBridge: true }),
  M('Le Specs', 'Bandwagon', 'sunglasses', 'cat_eye', 'female', 51, 21, 142, 'inyectado', [NEGRO, CAREY, C('Rosa', '#d9a3a8')], [GRIS, L('Rosa degrade', '#d38a9a', 0.5)], {}),
  M('Le Specs', 'Air Heart', 'sunglasses', 'aviator', 'female', 51, 18, 140, 'metal', [ORO, C('Oro rosa', '#c98f6e')], [L('Rosa espejado', '#d38a9a', 0.55, true), GRIS], {}),
  M('Gentle Monster', 'Lang', 'sunglasses', 'square', 'unisex', 55, 20, 145, 'acetato', [NEGRO, CAREY, CRISTAL], [GRIS, L('Marron degrade', '#6b4a30', 0.5)], { notes: 'Coreanos, formas grandes y planas. Muy de moda.' }),
  M('Gentle Monster', 'Papas', 'sunglasses', 'oversized', 'female', 58, 18, 145, 'acetato', [NEGRO, C('Beige', '#cbb79c')], [GRIS, L('Marron degrade', '#6b4a30', 0.5)], {}),
  M('Prada', 'PR 17WS Symbole', 'sunglasses', 'geometric', 'female', 53, 20, 140, 'acetato', [NEGRO, C('Blanco', '#e8e8e8'), BORDO], [GRIS, L('Marron degrade', '#6b4a30', 0.5)], { iconic: true }),
  M('Gucci', 'GG0061S', 'sunglasses', 'oversized', 'female', 57, 17, 140, 'acetato', [NEGRO, CAREY], [GRIS, L('Marron degrade', '#6b4a30', 0.5)], { iconic: true }),
  M('Tom Ford', 'FT0237 Snowdon', 'sunglasses', 'wayfarer', 'male', 52, 20, 145, 'acetato', [CAREY, NEGRO], [B15, GRIS], { iconic: true, notes: 'El de Kingsman. Acetato grueso con la T metalica en la varilla.' }),
  M('Tom Ford', 'FT0335 Marko', 'sunglasses', 'aviator', 'male', 58, 13, 140, 'metal', [GUNMETAL, ORO], [GRIS, AZUL_ESP], { doubleBridge: true }),
  M('Saint Laurent', 'SL 28', 'sunglasses', 'wayfarer', 'unisex', 49, 22, 145, 'acetato', [NEGRO, CAREY], [GRIS, B15], { iconic: true }),
  M('Hawkers', 'One', 'sunglasses', 'wayfarer', 'unisex', 54, 18, 140, 'inyectado', [NEGRO, C('Azul', '#24365c'), C('Blanco', '#e8e8e8')], [GRIS, AZUL_ESP, DORADO_ESP], { notes: 'Baratos, buenos para probar una forma antes de invertir.' }),
  M('Warby Parker', 'Griffin', 'sunglasses', 'square', 'male', 53, 20, 145, 'acetato', [CAREY, NEGRO], [GRIS_POL, G15], {}),
  M('Quay Australia', 'High Key', 'sunglasses', 'aviator', 'female', 56, 16, 140, 'metal', [ORO, NEGRO], [L('Rosa espejado', '#d38a9a', 0.55, true), GRIS], {}),
  M('Izipizi', 'Sun #E', 'sunglasses', 'round', 'unisex', 49, 21, 143, 'inyectado', [CAREY, NEGRO, NUDE], [GRIS, B15], {}),
  M('Maui Jim', 'Peahi', 'sunglasses', 'shield', 'male', 65, 15, 120, 'inyectado', [C('Negro mate', '#1b1b1b'), CAREY], [MARRON_POL, GRIS_POL], { wrap: 14, notes: 'Polarizado de referencia para sol fuerte.' }),
];
