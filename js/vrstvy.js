// Rozdělení vrstev do česky pojmenovaných skupin a jejich srozumitelné názvy.

export const SKUPINY = [
  ['pozadi', 'Pevnina (pozadí)'],
  ['relief', 'Stínovaný reliéf'],
  ['voda', 'Voda'],
  ['pokryv', 'Krajinný pokryv a parky'],
  ['hranice', 'Hranice'],
  ['silnice', 'Silnice a cesty'],
  ['zeleznice', 'Železnice a lanovky'],
  ['letiste', 'Letiště'],
  ['budovy', 'Budovy'],
  ['body_sidel', 'Body sídel'],
  ['popisky_mist', 'Popisky – státy, regiony, sídla'],
  ['popisky_vody', 'Popisky – vodstvo'],
  ['popisky_silnic', 'Popisky a značky silnic'],
  ['body_zajmu', 'Body zájmu a letiště'],
  ['vlastni', 'Vlastní vrstvy'],
];

export function skupina(l) {
  const sl = l['source-layer'];
  const id = l.id;
  if (l.type === 'background') return 'pozadi';
  if (l.type === 'raster' || l.type === 'hillshade') return 'relief';
  if (l.source === 'kraje_hranice') return 'hranice';
  if (l.source === 'kraje_nazvy') return 'popisky_mist';
  if (l.source === 'sporna_uzemi') return l.type === 'line' ? 'hranice' : 'popisky_mist';
  if (l.type === 'circle' && sl === 'place') return 'body_sidel';
  if (l.type === 'symbol') {
    if (sl === 'place') return 'popisky_mist';
    if (sl === 'water_name' || sl === 'waterway') return 'popisky_vody';
    if (sl === 'transportation_name' || sl === 'transportation') return 'popisky_silnic';
    if (sl === 'poi' || sl === 'aerodrome_label') return 'body_zajmu';
  }
  if (sl === 'water' || sl === 'waterway') return 'voda';
  if (sl === 'landcover' || sl === 'landuse' || sl === 'park') return 'pokryv';
  if (sl === 'boundary') return 'hranice';
  if (sl === 'aeroway') return 'letiste';
  if (sl === 'building') return 'budovy';
  if (sl === 'transportation') {
    if (/rail|transit|cable|ferry/.test(id)) return 'zeleznice';
    return 'silnice';
  }
  return 'vlastni';
}

const NAZVY = {
  background: 'Pevnina',
  natural_earth: 'Stínovaný reliéf (Natural Earth)',
  sporne_hranice_plne: 'Sporná území – uznané hranice (Golany)',
  sporne_hranice_teckovane: 'Sporná území – tečkované hranice (Západní Sahara)',
  sporne_nazvy_staty: 'Sporná území – názvy (Západní Sahara)',
  sporne_nazvy_oblasti: 'Sporná území – názvy (Kaliningrad, Nachičevan)',
  sporne_nazvy_golan: 'Sporná území – název Golanských výšin',
  water: 'Vodní plochy a moře',
  'water-intermittent': 'Občasné vodní plochy',
  pobrezi: 'Pobřežní čára',
  waterway_river: 'Řeky',
  'waterway-river': 'Řeky',
  waterway_other: 'Potoky a kanály',
  waterway_tunnel: 'Vodní toky v tunelu',
  waterway: 'Vodní toky',
  park: 'Parky a chráněná území',
  park_outline: 'Obrys parků',
  landcover_wood: 'Lesy',
  'landcover-wood': 'Lesy',
  landcover_grass: 'Louky',
  landcover_ice: 'Ledovce',
  landcover_sand: 'Písek',
  landcover_wetland: 'Mokřady',
  landuse_residential: 'Obytné území',
  boundary_2: 'Hranice států',
  boundary_3: 'Hranice regionů a krajů (OpenStreetMap)',
  boundary_disputed: 'Sporné hranice',
  kraje_hranice: 'Hranice krajů ČR (vlastní)',
  kraje_nazvy: 'Názvy krajů ČR (vlastní)',
  building: 'Budovy',
  'building-3d': 'Budovy 3D',
  label_country_1: 'Státy – největší',
  label_country_2: 'Státy – velké',
  label_country_3: 'Státy – ostatní',
  label_state: 'Spolkové země, regiony',
  label_city_capital: 'Hlavní města',
  label_city: 'Města',
  label_town: 'Menší města',
  label_village: 'Obce',
  label_other: 'Čtvrti, osady a ostatní',
  bod_city_capital: 'Body hlavních měst',
  bod_city: 'Body měst',
  bod_town: 'Body menších měst',
  bod_village: 'Body obcí',
  water_name_point_label: 'Názvy moří a jezer',
  water_name_line_label: 'Názvy moří (podél čáry)',
  waterway_line_label: 'Názvy řek',
  airport: 'Letiště',
  poi_transit: 'Zastávky a nádraží',
  poi_r1: 'Body zájmu – nejdůležitější',
  poi_r7: 'Body zájmu – střední',
  poi_r20: 'Body zájmu – ostatní',
  'highway-name-major': 'Názvy hlavních silnic',
  'highway-name-minor': 'Názvy ulic',
  'highway-name-path': 'Názvy cest',
  'highway-shield-non-us': 'Čísla silnic',
};

export function nazevVrstvy(l) {
  if (NAZVY[l.id]) return NAZVY[l.id];
  return l.id.replace(/[_-]+/g, ' ');
}

// Vlastnosti, které má smysl v editoru nabízet podle typu vrstvy.
export const BARVY_VRSTVY = {
  background: ['background-color'],
  fill: ['fill-color', 'fill-outline-color'],
  line: ['line-color'],
  symbol: ['text-color', 'text-halo-color'],
  circle: ['circle-color', 'circle-stroke-color'],
  'fill-extrusion': ['fill-extrusion-color'],
  raster: [],
};

export const KRYTI_VRSTVY = {
  background: 'background-opacity',
  fill: 'fill-opacity',
  line: 'line-opacity',
  symbol: 'text-opacity',
  circle: 'circle-opacity',
  'fill-extrusion': 'fill-extrusion-opacity',
  raster: 'raster-opacity',
};

export const POPISY_VLASTNOSTI = {
  'background-color': 'Barva',
  'fill-color': 'Výplň',
  'fill-outline-color': 'Obrys',
  'line-color': 'Barva čáry',
  'text-color': 'Písmo',
  'text-halo-color': 'Obrys písma',
  'circle-color': 'Výplň bodu',
  'circle-stroke-color': 'Obrys bodu',
  'fill-extrusion-color': 'Barva',
};
