// Zkušební data pro náhled. Do staženého stylu se nikdy nedostanou.
import { SKALY, PALETA_CT } from './barvy.js';

const ZDROJ = 'zkusebni_data';
export const VRSTVY_DAT = ['zkusebni_plochy', 'zkusebni_obrys', 'zkusebni_body'];

const STATUTARNI_MESTA = [
  ['Praha', 14.42, 50.09], ['Brno', 16.61, 49.2], ['Ostrava', 18.29, 49.83], ['Plzeň', 13.38, 49.75],
  ['Liberec', 15.06, 50.77], ['Olomouc', 17.25, 49.59], ['České Budějovice', 14.47, 48.97],
  ['Hradec Králové', 15.83, 50.21], ['Ústí nad Labem', 14.03, 50.66], ['Pardubice', 15.78, 50.04],
  ['Zlín', 17.67, 49.23], ['Havířov', 18.42, 49.78], ['Kladno', 14.1, 50.15], ['Most', 13.64, 50.5],
  ['Opava', 17.9, 49.94], ['Frýdek-Místek', 18.35, 49.68], ['Karviná', 18.54, 49.85], ['Jihlava', 15.59, 49.4],
  ['Teplice', 13.82, 50.64], ['Děčín', 14.21, 50.78], ['Karlovy Vary', 12.87, 50.23], ['Chomutov', 13.42, 50.46],
  ['Jablonec nad Nisou', 15.17, 50.72], ['Mladá Boleslav', 14.9, 50.41], ['Prostějov', 17.11, 49.47],
  ['Přerov', 17.45, 49.46], ['Třinec', 18.67, 49.68],
];

export const DATA = {
  zadna: { nazev: 'Bez zkušebních dat' },
  anomalie: { nazev: 'Anomálie teploty – Evropa (čtverce)', typ: 'plochy' },
  anomalie_svet: { nazev: 'Anomálie teploty – svět (hrubé čtverce)', typ: 'plochy' },
  body_modre: { nazev: 'Body – statutární města, jedna barva', typ: 'body' },
  body_paleta: { nazev: 'Body – statutární města, barvy palety', typ: 'body' },
  body_skala: { nazev: 'Body – statutární města, obarvené škálou', typ: 'body' },
};

// Hladké „počasí“ – stejné při každém načtení, ať se náhledy dají porovnat.
function hodnota(lon, lat) {
  const v = Math.sin(lon / 9) * 1.2 + Math.cos(lat / 6) * 1.1 + Math.sin((lon + lat) / 13) * 0.9 + Math.cos(lon / 4.3 - lat / 7.1) * 0.6;
  return v;
}

function mrizka(z, k, krok) {
  const prvky = [];
  for (let lon = z[0]; lon < z[2]; lon += krok) {
    for (let lat = z[1]; lat < z[3]; lat += krok) {
      const v = hodnota(lon + krok / 2, lat + krok / 2);
      const trida = Math.max(0, Math.min(6, Math.round((v + 3) / 6 * 6)));
      prvky.push({
        type: 'Feature',
        properties: { trida },
        geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + krok, lat], [lon + krok, lat + krok], [lon, lat + krok], [lon, lat]]] },
      });
    }
  }
  return { type: 'FeatureCollection', features: prvky };
}

const cache = {};
function geojson(id) {
  if (cache[id]) return cache[id];
  let g;
  if (id === 'anomalie') g = mrizka([-25, 34, 45, 72], null, 1);
  else if (id === 'anomalie_svet') g = mrizka([-180, -60, 180, 80], null, 5);
  else {
    g = {
      type: 'FeatureCollection',
      features: STATUTARNI_MESTA.map(([n, lon, lat], i) => ({
        type: 'Feature',
        properties: { nazev: n, poradi: i, trida: i % 7 },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      })),
    };
  }
  cache[id] = g;
  return g;
}

const barvyTrid = (barvy) => ['match', ['get', 'trida'], ...barvy.flatMap((b, i) => [i, b]), '#999999'];

// Přidá zdroj a vrstvy zkušebních dat do stylu náhledu.
// nastaveni: { sada, kryti, skala, barvaBodu, popiskyNadDaty }
export function pridejData(styl, nastaveni) {
  const sada = nastaveni?.sada || 'zadna';
  if (sada === 'zadna') return styl;
  styl.sources[ZDROJ] = { type: 'geojson', data: geojson(sada) };
  const skala = SKALY[nastaveni.skala] || SKALY.anomalie;
  const vrstvy = [];
  if (DATA[sada].typ === 'plochy') {
    vrstvy.push({
      id: 'zkusebni_plochy', type: 'fill', source: ZDROJ,
      paint: { 'fill-color': barvyTrid(skala.barvy), 'fill-opacity': nastaveni.kryti ?? 0.4, 'fill-antialias': false },
    });
  } else {
    let barva = nastaveni.barvaBodu || '#001464';
    if (sada === 'body_paleta') barva = ['match', ['%', ['get', 'poradi'], PALETA_CT.length], ...PALETA_CT.flatMap((b, i) => [i, b]), '#001464'];
    if (sada === 'body_skala') barva = barvyTrid(skala.barvy);
    vrstvy.push({
      id: 'zkusebni_body', type: 'circle', source: ZDROJ,
      paint: {
        'circle-color': barva,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 8, 12, 12],
        'circle-opacity': Math.min(1, (nastaveni.kryti ?? 0.4) + 0.5),
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    });
  }
  // Popisky nad daty: data se vloží pod první viditelnou vrstvu popisků,
  // tedy stejně, jako to dělá šablona ve Flourishi.
  const prvniPopisek = styl.layers.findIndex((l) => l.type === 'symbol');
  if (nastaveni.popiskyNadDaty === false || prvniPopisek < 0) styl.layers.push(...vrstvy);
  else styl.layers.splice(prvniPopisek, 0, ...vrstvy);
  return styl;
}
