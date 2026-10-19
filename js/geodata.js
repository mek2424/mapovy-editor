// Drobné nástroje nad GeoJSONem pro kartu Úpravy: název prvku, hranice, těžiště,
// počet bodů, velikost souboru a převod KML (ten mapshaper ve vlákně neumí).

const bezDiakritiky = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export { bezDiakritiky };

// Název prvku: nejdřív náš sloupec „nazev“, pak obvyklé názvy sloupců z cizích souborů.
const SLOUPCE_NAZVU = ['nazev', 'název', 'NAZEV', 'name:cs', 'name', 'NAME', 'Name', 'nazev_obce', 'NAZ_OBEC', 'NAZ_KRAJ', 'NAZ_OKRES', 'NAZ_ORP', 'NAZEV_OBCE', 'title', 'label'];
export function nazevPrvku(p = {}) {
  for (const k of SLOUPCE_NAZVU) if (p[k] != null && p[k] !== '') return String(p[k]);
  const prvni = Object.entries(p).find(([k, v]) => typeof v === 'string' && v && !k.startsWith('_'));
  return prvni ? prvni[1] : '';
}
const SLOUPCE_ID = ['id', 'ID', 'kod', 'KOD', 'kód', 'code', 'ref', 'KOD_OBEC', 'KOD_KRAJ', 'KOD_OKRES', 'iso', 'ISO'];
export function idPrvku(p = {}) {
  for (const k of SLOUPCE_ID) if (p[k] != null && p[k] !== '') return String(p[k]);
  return '';
}

// Prochází všechny souřadnice geometrie.
export function proBody(g, fn) {
  if (!g) return;
  if (g.type === 'GeometryCollection') { g.geometries.forEach((x) => proBody(x, fn)); return; }
  const jdi = (c) => { if (typeof c[0] === 'number') fn(c); else c.forEach(jdi); };
  if (g.coordinates) jdi(g.coordinates);
}

export function hranice(prvky) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of prvky) proBody(f?.geometry, ([x, y]) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; });
  return b[0] <= b[2] ? b : null;
}

export function pocetBodu(fc) {
  let n = 0;
  for (const f of fc.features) proBody(f.geometry, () => { n++; });
  return n;
}

// Těžiště největšího polygonu (u čar a bodů střed jejich hranic) – pro výběr lasem.
function plochaKruhu(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}
// Plocha geometrie ve stupních² (jen pro porovnání dvou verzí téhož tvaru).
export function plocha(g) {
  const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  let a = 0;
  for (const p of polys) p.forEach((r, i) => { a += (i ? -1 : 1) * Math.abs(plochaKruhu(r)); });
  return a;
}
export function teziste(g) {
  if (!g) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (polys) {
    let nej = null; let max = -1;
    for (const p of polys) { const a = Math.abs(plochaKruhu(p[0] || [])); if (a > max) { max = a; nej = p[0]; } }
    if (nej && max > 0) {
      let x = 0; let y = 0; let a = 0;
      for (let i = 0, j = nej.length - 1; i < nej.length; j = i++) {
        const k = nej[j][0] * nej[i][1] - nej[i][0] * nej[j][1];
        a += k; x += (nej[j][0] + nej[i][0]) * k; y += (nej[j][1] + nej[i][1]) * k;
      }
      if (a) return [x / (3 * a), y / (3 * a)];
    }
  }
  const b = hranice([{ geometry: g }]);
  return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : null;
}

// Bod v mnohoúhelníku (souřadnice obrazovky).
export function bodVPolygonu([x, y], body) {
  let uvnitr = false;
  for (let i = 0, j = body.length - 1; i < body.length; j = i++) {
    const [xi, yi] = body[i]; const [xj, yj] = body[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) uvnitr = !uvnitr;
  }
  return uvnitr;
}

export function velikost(n) {
  if (n == null) return '–';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${String(Math.round((n / 1024 / 1024) * 10) / 10).replace('.', ',')} MB`;
}

export const pocet = (n) => Number(n || 0).toLocaleString('cs-CZ');
// „1 prvek“, „3 prvky“, „5 prvků“
export const prvku = (n) => `${pocet(n)} ${n === 1 ? 'prvek' : n >= 2 && n <= 4 ? 'prvky' : 'prvků'}`;

// Druh geometrie vrstvy pro popis: plochy / čáry / body / smíšené.
export function druhGeometrie(fc) {
  const d = new Set();
  for (const f of fc.features) {
    const t = f.geometry?.type || '';
    if (/Polygon/.test(t)) d.add('plochy'); else if (/Line/.test(t)) d.add('čáry'); else if (/Point/.test(t)) d.add('body');
    if (d.size > 1) return 'smíšené';
  }
  return [...d][0] || 'prázdná';
}

// ---- KML → GeoJSON (Placemark s body, čarami, plochami a MultiGeometry)
export function kmlNaGeojson(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Soubor KML nejde přečíst.');
  const vse = (el, jmeno) => [...el.getElementsByTagNameNS('*', jmeno)];
  const deti = (el) => [...el.children];
  const souradnice = (el) => (el?.textContent || '').trim().split(/\s+/)
    .map((t) => t.split(',').slice(0, 2).map(Number)).filter((c) => c.length === 2 && c.every(Number.isFinite));
  const kruh = (hranice) => souradnice(hranice && vse(hranice, 'coordinates')[0]);
  function geometrie(el) {
    switch (el.localName) {
      case 'Point': return { type: 'Point', coordinates: souradnice(vse(el, 'coordinates')[0])[0] };
      case 'LineString': return { type: 'LineString', coordinates: souradnice(vse(el, 'coordinates')[0]) };
      case 'LinearRing': return { type: 'Polygon', coordinates: [souradnice(vse(el, 'coordinates')[0])] };
      case 'Polygon': {
        const vnejsi = vse(el, 'outerBoundaryIs')[0];
        return { type: 'Polygon', coordinates: [kruh(vnejsi), ...vse(el, 'innerBoundaryIs').map(kruh)] };
      }
      case 'MultiGeometry': {
        const casti = deti(el).map(geometrie).filter(Boolean);
        const typy = new Set(casti.map((c) => c.type));
        if (typy.size === 1 && typy.has('Polygon')) return { type: 'MultiPolygon', coordinates: casti.map((c) => c.coordinates) };
        if (typy.size === 1 && typy.has('LineString')) return { type: 'MultiLineString', coordinates: casti.map((c) => c.coordinates) };
        if (typy.size === 1 && typy.has('Point')) return { type: 'MultiPoint', coordinates: casti.map((c) => c.coordinates) };
        return casti.length ? { type: 'GeometryCollection', geometries: casti } : null;
      }
      default: return null;
    }
  }
  const features = [];
  for (const pm of vse(doc, 'Placemark')) {
    const properties = {};
    const jmeno = deti(pm).find((x) => x.localName === 'name');
    if (jmeno) properties.nazev = jmeno.textContent.trim();
    const popis = deti(pm).find((x) => x.localName === 'description');
    if (popis) properties.popis = popis.textContent.trim();
    for (const d of vse(pm, 'Data')) {
      const v = vse(d, 'value')[0];
      if (d.getAttribute('name')) properties[d.getAttribute('name')] = v ? v.textContent.trim() : '';
    }
    for (const d of vse(pm, 'SimpleData')) if (d.getAttribute('name')) properties[d.getAttribute('name')] = d.textContent.trim();
    const g = deti(pm).map(geometrie).find(Boolean);
    if (g) features.push({ type: 'Feature', properties, geometry: g });
  }
  if (!features.length) throw new Error('V souboru KML nejsou žádná místa s geometrií.');
  return { type: 'FeatureCollection', features };
}
