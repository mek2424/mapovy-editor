// Sestavení stylu MapLibre z „receptu“ (nastavení šablony) a převod zpět.
// Recept ukládá jen rozdíly proti podkladovému stylu OpenFreeMap, proto je malý
// a vejde se do jedné buňky Google tabulky.

export const ZAKLADY = {
  liberty: { nazev: 'Liberty', popis: 'Barevná mapa, výchozí pro všechny šablony', soubor: 'data/liberty.json' },
  positron: { nazev: 'Positron', popis: 'Světle šedá, tlumená', soubor: 'data/positron.json' },
  bright: { nazev: 'Bright', popis: 'Výrazná barevná mapa', soubor: 'data/bright.json' },
};

// Vlastní zdroje, které se při stažení stylu vloží přímo do souboru.
export const MISTNI_ZDROJE = {
  kraje_hranice: { nazev: 'Hranice krajů ČR', soubor: 'data/kraje_hranice.geojson' },
  kraje_nazvy: { nazev: 'Názvy krajů ČR', soubor: 'data/kraje_nazvy.geojson' },
};

// Popisky vždy česky: český název, jinak místní název latinkou, jinak původní.
export const CESKY_NAZEV = ['coalesce', ['get', 'name:cs'], ['get', 'name:latin'], ['get', 'name']];

const cache = new Map();
async function nactiJson(soubor) {
  if (!cache.has(soubor)) {
    cache.set(soubor, fetch(soubor).then((r) => {
      if (!r.ok) throw new Error(`Soubor ${soubor} se nepodařilo načíst (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(soubor);
}

export const kopie = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

export async function nactiZaklad(id) {
  const z = ZAKLADY[id] || ZAKLADY.liberty;
  return kopie(await nactiJson(z.soubor));
}

export function prazdnyRecept(zaklad = 'liberty') {
  return { verze: 1, zaklad, vrstvy: {}, pridane: [], popisky: { skryteNazvy: [], posuny: {} }, mapa: { glob: false }, maska: prazdnaMaska() };
}

export function prazdnaMaska() {
  return { oblasti: [], barva: '#ffffff', kryti: 1, skrytPopisky: true, obrys: { zap: true, barva: '#001464', sirka: 1.5, carky: null } };
}

// Doplní chybějící části receptu (starší nebo ručně psané recepty).
export function doplnRecept(r) {
  const p = prazdnyRecept(r?.zaklad || 'liberty');
  const v = { ...p, ...(r || {}) };
  v.vrstvy = v.vrstvy || {};
  v.pridane = v.pridane || [];
  v.popisky = { ...p.popisky, ...(v.popisky || {}) };
  v.mapa = { ...p.mapa, ...(v.mapa || {}) };
  v.maska = { ...p.maska, ...(v.maska || {}), obrys: { ...p.maska.obrys, ...(v.maska?.obrys || {}) } };
  return v;
}

// Vynásobí číselné výstupy hodnoty nebo výrazu podle přiblížení.
// Výrazy se zoomem nejde zabalit do ["*", …], proto se násobí jednotlivé kroky.
export function nasobHodnotu(v, f) {
  if (f == null || f === 1) return v;
  const zaokr = (x) => Math.round(x * f * 100) / 100;
  if (typeof v === 'number') return zaokr(v);
  if (!Array.isArray(v)) return v;
  const op = v[0];
  if (op === 'interpolate' || op === 'interpolate-hcl' || op === 'interpolate-lab') {
    return v.map((x, i) => (i >= 4 && i % 2 === 0 && typeof x === 'number' ? zaokr(x) : x));
  }
  if (op === 'step') {
    return v.map((x, i) => (i >= 2 && i % 2 === 0 && typeof x === 'number' ? zaokr(x) : x));
  }
  return v;
}

const obsahujeNazev = (tf) => {
  const s = JSON.stringify(tf);
  return s.includes('name') && !s.includes('"nazev"');
};

function aplikujUpravy(vrstva, u) {
  if (!u) return vrstva;
  vrstva.paint = vrstva.paint || {};
  for (const cast of ['paint', 'layout']) {
    if (!u[cast]) continue;
    vrstva[cast] = vrstva[cast] || {};
    for (const [k, h] of Object.entries(u[cast])) {
      if (h === null) delete vrstva[cast][k];
      else vrstva[cast][k] = kopie(h);
    }
  }
  for (const k of ['minzoom', 'maxzoom', 'filter']) {
    if (k in u) {
      if (u[k] === null) delete vrstva[k];
      else vrstva[k] = kopie(u[k]);
    }
  }
  if (u.velikost && vrstva.layout?.['text-size'] != null) {
    vrstva.layout['text-size'] = nasobHodnotu(vrstva.layout['text-size'], u.velikost);
  }
  if (u.velikost && vrstva.type === 'symbol' && vrstva.layout?.['text-size'] == null) {
    vrstva.layout = vrstva.layout || {};
    vrstva.layout['text-size'] = Math.round(16 * u.velikost * 10) / 10;
  }
  if (u.sirka) {
    if (vrstva.type === 'line') vrstva.paint['line-width'] = nasobHodnotu(vrstva.paint?.['line-width'] ?? 1, u.sirka);
    if (vrstva.type === 'circle') vrstva.paint['circle-radius'] = nasobHodnotu(vrstva.paint?.['circle-radius'] ?? 5, u.sirka);
  }
  vrstva.layout = vrstva.layout || {};
  if (u.skryta) vrstva.layout.visibility = 'none';
  else if (u.skryta === false) delete vrstva.layout.visibility;
  if (vrstva.layout && Object.keys(vrstva.layout).length === 0) delete vrstva.layout;
  return vrstva;
}

// Hlavní funkce: recept → kompletní styl.
// moznosti.export = true vloží data vlastních zdrojů přímo do stylu.
export async function sestavStyl(receptVstup, moznosti = {}) {
  const recept = doplnRecept(receptVstup);
  const styl = await nactiZaklad(recept.zaklad);
  styl.name = moznosti.nazev || styl.name;

  let vrstvy = styl.layers.map((l) => aplikujUpravy(l, recept.vrstvy[l.id]));

  for (const p of recept.pridane) {
    if (!p?.vrstva?.id) continue;
    const nova = aplikujUpravy(kopie(p.vrstva), recept.vrstvy[p.vrstva.id]);
    vrstvy = vrstvy.filter((l) => l.id !== nova.id);
    const i = p.za == null ? -1 : vrstvy.findIndex((l) => l.id === p.za);
    if (p.za == null) vrstvy.unshift(nova);
    else if (i < 0) vrstvy.push(nova);
    else vrstvy.splice(i + 1, 0, nova);
  }

  // Zdroje vlastních vrstev.
  const potreba = new Set(vrstvy.map((l) => l.source).filter((s) => s && MISTNI_ZDROJE[s]));
  for (const id of potreba) {
    const soubor = MISTNI_ZDROJE[id].soubor;
    styl.sources[id] = {
      type: 'geojson',
      data: moznosti.export ? await nactiJson(soubor) : new URL(soubor, location.href).href,
    };
  }

  // Skryté a posunuté jednotlivé názvy (nastavují se klikem v náhledu).
  const skryte = recept.popisky.skryteNazvy || [];
  const posuny = recept.popisky.posuny || {};
  const posunuteNazvy = Object.keys(posuny);
  for (const l of vrstvy) {
    if (l.type !== 'symbol' || !l.layout?.['text-field']) continue;
    if (obsahujeNazev(l.layout['text-field'])) l.layout['text-field'] = kopie(CESKY_NAZEV);
    else continue;
    if (skryte.length) {
      const podminka = ['!', ['in', CESKY_NAZEV, ['literal', skryte]]];
      l.filter = l.filter ? ['all', l.filter, podminka] : podminka;
    }
    if (posunuteNazvy.length && !jeVyrazSeZoomem(l.layout['text-offset'])) {
      const vychozi = l.layout['text-offset'] ?? [0, 0];
      const vyraz = ['match', CESKY_NAZEV];
      for (const n of posunuteNazvy) {
        const [dx, dy] = posuny[n];
        const z = Array.isArray(vychozi) && typeof vychozi[0] === 'number' ? vychozi : [0, 0];
        vyraz.push(n, ['literal', [round2(z[0] + dx), round2(z[1] + dy)]]);
      }
      vyraz.push(Array.isArray(vychozi) && typeof vychozi[0] === 'number' ? ['literal', vychozi] : vychozi);
      l.layout['text-offset'] = vyraz;
    }
  }

  styl.layers = vrstvy;
  if (recept.maska.oblasti.length) await pridejMasku(styl, recept.maska);
  if (recept.mapa.glob) styl.projection = { type: 'globe' };
  else delete styl.projection;
  return styl;
}

const round2 = (x) => Math.round(x * 100) / 100;
function jeVyrazSeZoomem(v) {
  return Array.isArray(v) && JSON.stringify(v).includes('"zoom"');
}

// Převod libovolného stylu (např. dřívější mapy) na recept proti zvolenému podkladu.
export async function receptZeStylu(styl, zaklad = 'liberty') {
  const zakl = await nactiZaklad(zaklad);
  const zaklVrstvy = new Map(zakl.layers.map((l) => [l.id, l]));
  const ids = new Set(styl.layers.map((l) => l.id));
  const r = prazdnyRecept(zaklad);
  for (const b of zakl.layers) if (!ids.has(b.id)) r.vrstvy[b.id] = { skryta: true };
  let predchozi = null;
  for (const l of styl.layers) {
    const b = zaklVrstvy.get(l.id);
    if (b) {
      const u = {};
      for (const cast of ['paint', 'layout']) {
        const d = {};
        const klice = new Set([...Object.keys(b[cast] || {}), ...Object.keys(l[cast] || {})]);
        for (const k of klice) {
          if (k === 'visibility') continue;
          const bv = JSON.stringify(b[cast]?.[k]);
          const lv = JSON.stringify(l[cast]?.[k]);
          if (bv !== lv) d[k] = l[cast]?.[k] ?? null;
        }
        if (Object.keys(d).length) u[cast] = d;
      }
      for (const k of ['minzoom', 'maxzoom', 'filter']) {
        if (JSON.stringify(b[k]) !== JSON.stringify(l[k])) u[k] = l[k] ?? null;
      }
      if (l.layout?.visibility === 'none') u.skryta = true;
      if (Object.keys(u).length) r.vrstvy[l.id] = u;
    } else {
      const v = kopie(l);
      if (v.source && styl.sources?.[v.source]?.type === 'geojson' && !MISTNI_ZDROJE[v.source]) {
        // Cizí vložená data zatím recept neumí nést – vrstva se přeskočí.
        predchozi = l.id;
        continue;
      }
      r.pridane.push({ za: predchozi, vrstva: v });
    }
    predchozi = l.id;
  }
  if (styl.projection?.type === 'globe') r.mapa.glob = true;
  return r;
}

// ---------------------------------------------------------------- ořezová maska
// Styl MapLibre neumí mapu opravdu oříznout. Maska je proto plocha přes celý svět
// s „dírou“ ve tvaru vybraných oblastí; popisky mimo oblast skryje filtr „within“.

export async function geometrieOblasti(o) {
  if (o.typ === 'stat') return (await nactiJson(`data/oblasti/stat/${o.id}.json`)).geometry;
  const fc = await nactiJson(`data/oblasti/regiony/${o.stat}.json`);
  const f = fc.features.find((x) => x.properties.id === o.id);
  if (!f) throw new Error(`Oblast ${o.nazev || o.id} nebyla nalezena`);
  return f.geometry;
}

const polygony = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

// Zjednodušení čáry (Douglas–Peucker) – pro filtr popisků stačí hrubší tvar.
function zjednodus(body, tol) {
  if (body.length < 5) return body;
  const drz = new Uint8Array(body.length);
  drz[0] = drz[body.length - 1] = 1;
  const zasobnik = [[0, body.length - 1]];
  while (zasobnik.length) {
    const [a, b] = zasobnik.pop();
    let max = 0; let idx = -1;
    const [x1, y1] = body[a]; const [x2, y2] = body[b];
    const dx = x2 - x1; const dy = y2 - y1; const d = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const v = Math.abs(dy * body[i][0] - dx * body[i][1] + x2 * y1 - y2 * x1) / d;
      if (v > max) { max = v; idx = i; }
    }
    if (max > tol && idx > 0) { drz[idx] = 1; zasobnik.push([a, idx], [idx, b]); }
  }
  const out = body.filter((_, i) => drz[i]);
  return out.length >= 4 ? out : body;
}

export function hraniceGeometrie(polys) {
  const b = [180, 90, -180, -90];
  for (const p of polys) for (const [x, y] of p[0]) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return b;
}

export async function polygonyMasky(maska) {
  const polys = [];
  for (const o of maska.oblasti) polys.push(...polygony(await geometrieOblasti(o)));
  return polys;
}

async function pridejMasku(styl, maska) {
  const polys = await polygonyMasky(maska);
  if (!polys.length) return;
  const svet = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const maskaGeom = {
    type: 'MultiPolygon',
    coordinates: [[svet, ...polys.map((p) => p[0])], ...polys.flatMap((p) => p.slice(1).map((dira) => [dira]))],
  };
  const oblast = { type: 'MultiPolygon', coordinates: polys };
  styl.sources.maska = { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: maskaGeom } };
  const nove = [{
    id: 'maska', type: 'fill', source: 'maska',
    paint: { 'fill-color': maska.barva || '#ffffff', 'fill-opacity': maska.kryti ?? 1, 'fill-antialias': false },
  }];
  if (maska.obrys?.zap) {
    styl.sources.maska_oblast = { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: oblast } };
    const obrys = {
      id: 'maska_obrys', type: 'line', source: 'maska_oblast',
      layout: { 'line-join': 'round', 'line-cap': maska.obrys.carky && maska.obrys.carky[0] === 0 ? 'round' : 'butt' },
      paint: { 'line-color': maska.obrys.barva || '#001464', 'line-width': maska.obrys.sirka ?? 1.5 },
    };
    if (maska.obrys.carky) obrys.paint['line-dasharray'] = maska.obrys.carky;
    nove.push(obrys);
  }
  const prvniPopisek = styl.layers.findIndex((l) => l.type === 'symbol');
  if (prvniPopisek < 0) styl.layers.push(...nove);
  else styl.layers.splice(prvniPopisek, 0, ...nove);

  if (maska.skrytPopisky) {
    const [x1, y1, x2, y2] = hraniceGeometrie(polys);
    const tol = Math.hypot(x2 - x1, y2 - y1) * 0.002;
    const hruby = { type: 'MultiPolygon', coordinates: polys.map((p) => p.map((ring) => zjednodus(ring, tol))) };
    for (const l of styl.layers) {
      if (l.type !== 'symbol' || l.layout?.visibility === 'none' || l.source === 'zkusebni_data') continue;
      const podminka = ['within', hruby];
      l.filter = l.filter ? ['all', l.filter, podminka] : podminka;
    }
  }
}
