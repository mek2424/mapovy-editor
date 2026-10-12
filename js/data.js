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
  vlastni: { nazev: 'Vlastní data (nahraný soubor)', typ: 'vlastni' },
};

// ---- vlastní data: CSV se souřadnicemi nebo GeoJSON
const KLIC_VLASTNI = 'mapovy-editor:vlastni-data';
let vlastni = null;
try { vlastni = JSON.parse(localStorage.getItem(KLIC_VLASTNI) || 'null'); } catch { vlastni = null; }

export const vlastniData = () => vlastni;

export function nastavVlastniData(nazev, geojson) {
  const sloupce = new Map();
  for (const f of geojson.features) {
    for (const [k, v] of Object.entries(f.properties || {})) {
      const z = sloupce.get(k) || { cisla: 0, hodnoty: new Set() };
      if (typeof v === 'number' && Number.isFinite(v)) z.cisla++;
      if (z.hodnoty.size < 50) z.hodnoty.add(String(v));
      sloupce.set(k, z);
    }
  }
  const n = geojson.features.length;
  vlastni = {
    nazev,
    geojson,
    sloupce: [...sloupce.entries()].map(([k, z]) => ({ nazev: k, ciselny: z.cisla >= n * 0.8, ruznych: z.hodnoty.size })),
  };
  try {
    const t = JSON.stringify(vlastni);
    if (t.length < 2_500_000) localStorage.setItem(KLIC_VLASTNI, t); else localStorage.removeItem(KLIC_VLASTNI);
  } catch { /* příliš velké pro prohlížeč – data zůstanou jen do zavření stránky */ }
  return vlastni;
}

function rozdelCsv(text) {
  const radek1 = text.split(/\r?\n/)[0];
  const odd = [';', '\t', ','].map((o) => [o, radek1.split(o).length]).sort((a, b) => b[1] - a[1])[0][0];
  const radky = [];
  let pole = []; let bunka = ''; let uvozovky = false;
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (uvozovky) {
      if (z === '"' && text[i + 1] === '"') { bunka += '"'; i++; }
      else if (z === '"') uvozovky = false;
      else bunka += z;
    } else if (z === '"') uvozovky = true;
    else if (z === odd) { pole.push(bunka); bunka = ''; }
    else if (z === '\n' || z === '\r') {
      if (z === '\r' && text[i + 1] === '\n') i++;
      pole.push(bunka); bunka = '';
      if (pole.some((x) => x !== '')) radky.push(pole);
      pole = [];
    } else bunka += z;
  }
  pole.push(bunka);
  if (pole.some((x) => x !== '')) radky.push(pole);
  return { radky, odd };
}

const naCislo = (v) => {
  if (typeof v !== 'string') return v;
  const t = v.trim().replace(/\s/g, '');
  if (!/^[-+]?\d+([.,]\d+)?$/.test(t)) return v;
  return parseFloat(t.replace(',', '.'));
};

// Text souboru → GeoJSON. Vyhodí chybu se srozumitelnou zprávou.
export function prectiSoubor(text, jmeno) {
  const t = text.replace(/^\uFEFF/, '').trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    const j = JSON.parse(t);
    if (j.type === 'FeatureCollection') return j;
    if (j.type === 'Feature') return { type: 'FeatureCollection', features: [j] };
    if (j.type && j.coordinates) return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: j }] };
    throw new Error('JSON není GeoJSON.');
  }
  const { radky } = rozdelCsv(t);
  if (radky.length < 2) throw new Error('Soubor nemá žádné řádky s daty.');
  const hlavicka = radky[0].map((x) => x.trim());
  const najdi = (re) => hlavicka.findIndex((h) => re.test(h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  const iLat = najdi(/^(lat|latitude|y|sirka|zem\.? ?sirka|zemepisna sirka)$/);
  const iLon = najdi(/^(lon|lng|long|longitude|x|delka|zem\.? ?delka|zemepisna delka)$/);
  if (iLat < 0 || iLon < 0) throw new Error(`V ${jmeno} chybí sloupce se souřadnicemi (např. lat a lon, latitude a longitude).`);
  const features = [];
  for (const r of radky.slice(1)) {
    const lat = naCislo(r[iLat] ?? ''); const lon = naCislo(r[iLon] ?? '');
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const properties = {};
    hlavicka.forEach((h, i) => { if (i !== iLat && i !== iLon) properties[h] = naCislo(r[i] ?? ''); });
    features.push({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } });
  }
  if (!features.length) throw new Error('Žádný řádek nemá platné souřadnice.');
  return { type: 'FeatureCollection', features };
}

export function hraniceDat(g) {
  const b = [180, 90, -180, -90];
  const pridej = (c) => {
    if (typeof c[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); } else c.forEach(pridej);
  };
  g.features.forEach((f) => f.geometry && pridej(f.geometry.coordinates));
  return b[0] <= b[2] ? [[b[0], b[1]], [b[2], b[3]]] : null;
}

function barvaVlastnich(n) {
  const sl = n.vlastniSloupec;
  if (!vlastni || !sl || n.vlastniBarvit === 'jedna') return n.barvaBodu || '#001464';
  if (n.vlastniBarvit === 'kategorie') {
    const hodnoty = [...new Set(vlastni.geojson.features.map((f) => String(f.properties?.[sl])))].slice(0, PALETA_CT.length);
    if (!hodnoty.length) return '#001464';
    return ['match', ['to-string', ['get', sl]], ...hodnoty.flatMap((h, i) => [h, PALETA_CT[i]]), '#9aa0b4'];
  }
  const skala = (SKALY[n.skala] || SKALY.anomalie).barvy;
  const cisla = vlastni.geojson.features.map((f) => f.properties?.[sl]).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!cisla.length) return '#001464';
  const prahy = [];
  for (let i = 1; i < skala.length; i++) {
    const p = cisla[Math.floor((cisla.length * i) / skala.length)];
    if (p != null && (!prahy.length || p > prahy.at(-1))) prahy.push(p);
  }
  const vyraz = ['step', ['to-number', ['get', sl], cisla[0]], skala[0]];
  prahy.forEach((p, i) => vyraz.push(p, skala[Math.min(skala.length - 1, Math.round(((i + 1) * (skala.length - 1)) / prahy.length))]));
  return vyraz;
}

// Hladké „počasí“ – stejné při každém načtení, ať se náhledy dají porovnat.
function hodnota(lon, lat) {
  const v = Math.sin(lon / 5.3) * 1.3 + Math.cos(lat / 3.1) * 1.2 + Math.sin((lon + lat) / 4.7) * 0.9 + Math.cos(lon / 2.3 - lat / 3.9) * 0.7;
  return v;
}

function mrizka(z, k, krok) {
  const prvky = [];
  for (let lon = z[0]; lon < z[2]; lon += krok) {
    for (let lat = z[1]; lat < z[3]; lat += krok) {
      const v = hodnota(lon + krok / 2, lat + krok / 2);
      const trida = Math.max(0, Math.min(6, Math.round((v + 2.6) / 5.2 * 6)));
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
  if (sada === 'zadna' || (sada === 'vlastni' && !vlastni)) return styl;
  styl.sources[ZDROJ] = { type: 'geojson', data: sada === 'vlastni' ? vlastni.geojson : geojson(sada) };
  const skala = SKALY[nastaveni.skala] || SKALY.anomalie;
  const vrstvy = [];
  if (sada === 'vlastni') {
    const barva = barvaVlastnich(nastaveni);
    const kryti = nastaveni.kryti ?? 0.4;
    vrstvy.push(
      { id: 'zkusebni_plochy', type: 'fill', source: ZDROJ, filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false], paint: { 'fill-color': barva, 'fill-opacity': kryti } },
      { id: 'zkusebni_obrys', type: 'line', source: ZDROJ, filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], paint: { 'line-color': barva, 'line-width': 2, 'line-opacity': Math.min(1, kryti + 0.4) } },
      { id: 'zkusebni_body', type: 'circle', source: ZDROJ, filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], paint: { 'circle-color': barva, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4, 8, 7, 12, 10], 'circle-opacity': Math.min(1, kryti + 0.5), 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } },
    );
  } else if (DATA[sada].typ === 'plochy') {
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
