// Sestavení stylu MapLibre z „receptu“ (nastavení šablony) a převod zpět.
// Recept ukládá jen rozdíly proti podkladovému stylu OpenFreeMap, proto je malý
// a vejde se do jedné buňky Google tabulky.

import { STATY, REGIONY, OPRAVY } from './nazvy.js';

export const ZAKLADY = {
  liberty: { nazev: 'Liberty', popis: 'Barevná mapa, výchozí pro všechny šablony', soubor: 'data/liberty.json' },
  positron: { nazev: 'Positron', popis: 'Světle šedá, tlumená', soubor: 'data/positron.json' },
  bright: { nazev: 'Bright', popis: 'Výrazná barevná mapa', soubor: 'data/bright.json' },
};

// Vlastní zdroje, které se při stažení stylu vloží přímo do souboru.
export const MISTNI_ZDROJE = {
  kraje_hranice: { nazev: 'Hranice krajů ČR', soubor: 'data/kraje_hranice.geojson' },
  kraje_nazvy: { nazev: 'Názvy krajů ČR', soubor: 'data/kraje_nazvy.geojson' },
  sporna_uzemi: { nazev: 'Sporná území (úpravy redakce)', soubor: 'data/sporna_uzemi.geojson' },
};

// Popisky vždy česky: český název, jinak místní název latinkou, jinak původní.
export const CESKY_NAZEV = ['coalesce', ['get', 'name:cs'], ['get', 'name:latin'], ['get', 'name']];

// Slovníky {český název: [klíče]} → rychlé hledání klíč → český název (pro klik v mapě).
const naMapu = (skupiny) => new Map(Object.entries(skupiny).flatMap(([cz, klice]) => klice.map((k) => [k, cz])));
const STATY_MAPA = naMapu(STATY);
const REGIONY_MAPA = naMapu(REGIONY);

// ---------------------------------------------------------------- exonyma sídel
// OSM má v name:cs i archaické tvary (Inšpruk, Řezno, Štýrský Hradec, Pětikostelí…).
// U sídel v Evropě, jejichž místní název je latinkou, se český tvar použije, jen když je
// v tomto seznamu běžně užívaných názvů (nebo je částí místního názvu, např. Brusel
// v „Bruxelles - Brussel“). Jinak zůstane místní název. Mimo Evropu a u místních názvů
// v jiném písmu (Moskva, Peking, Bombaj) se český tvar používá vždy.
export const POVOLENA_EXONYMA = [
  // Německo, Rakousko, Švýcarsko
  'Berlín', 'Hamburk', 'Brémy', 'Mnichov', 'Norimberk', 'Drážďany', 'Lipsko', 'Kolín nad Rýnem',
  'Frankfurt nad Mohanem', 'Frankfurt nad Odrou', 'Magdeburk', 'Vídeň', 'Linec', 'Salcburk',
  'Curych', 'Ženeva', 'Basilej', 'Lucern',
  // Itálie, Vatikán, Monako
  'Řím', 'Milán', 'Benátky', 'Florencie', 'Neapol', 'Janov', 'Turín', 'Terst', 'Syrakusy', 'Vatikán', 'Monako',
  // západ a sever Evropy
  'Paříž', 'Štrasburk', 'Dunkerk', 'Londýn', 'Brusel', 'Antverpy', 'Bruggy', 'Lutych', 'Haag', 'Lucemburk',
  'Lisabon', 'Valencie', 'Kodaň', 'Helsinky', 'Riga',
  // Polsko
  'Varšava', 'Krakov', 'Vratislav', 'Gdaňsk', 'Gdyně', 'Štětín', 'Katovice', 'Poznaň', 'Lodž', 'Toruň',
  'Opolí', 'Čenstochová', 'Bělostok', 'Těšín',
  // Maďarsko, Rumunsko, Moldavsko, Balkán, Turecko
  'Budapešť', 'Debrecín', 'Segedín', 'Miškovec', 'Šoproň', 'Bukurešť', 'Kluž', 'Brašov', 'Ploješť', 'Konstanca',
  'Kišiněv', 'Záhřeb', 'Lublaň', 'Dubrovník', 'Priština', 'Tirana', 'Istanbul',
  // jen jiný přepis (bez diakritiky apod.)
  'Malaga', 'Ibiza', 'Palma de Mallorca', 'San Sebastián', 'Kingston upon Hull',
];
// Archaické tvary u sídel s místním názvem v jiném písmu → místní název latinkou.
export const ZAKAZANA_EXONYMA = ['Nový Sad'];
// Hrubý obdélník Evropy (vč. Islandu, Kanárských ostrovů a Turecka po 45° v. d.).
const EVROPA = { type: 'Polygon', coordinates: [[[-32, 27], [45, 27], [45, 72], [-32, 72], [-32, 27]]] };
const POVOLENA_SET = new Set(POVOLENA_EXONYMA);

export const NAZEV_SIDLA = ['case',
  ['all', ['has', 'name:cs'], ['==', ['get', 'name'], ['get', 'name:latin']], ['within', EVROPA],
    ['!', ['in', ['to-string', ['get', 'name:cs']], ['literal', POVOLENA_EXONYMA]]],
    ['!', ['in', ['to-string', ['get', 'name:cs']], ['to-string', ['get', 'name']]]]],
  ['get', 'name'],
  ['in', ['to-string', ['coalesce', ['get', 'name:cs'], '']], ['literal', ZAKAZANA_EXONYMA]], ['coalesce', ['get', 'name:latin'], ['get', 'name']],
  CESKY_NAZEV];

const vEvrope = (g) => {
  const c = g?.type === 'Point' ? g.coordinates : null;
  return !c || (c[0] >= -32 && c[0] <= 45 && c[1] >= 27 && c[1] <= 72);
};
function nazevSidlaJS(p, g) {
  const cs = p['name:cs'];
  if (cs && p.name === p['name:latin'] && vEvrope(g) && !POVOLENA_SET.has(cs) && !String(p.name).includes(cs)) return p.name;
  if (cs && ZAKAZANA_EXONYMA.includes(cs)) return p['name:latin'] || p.name;
  return cs || p['name:latin'] || p.name || p.nazev || null;
}

const jeVrstvaStatu = (l) => /^label_country/.test(l.id) || /"class"\],"country"/.test(JSON.stringify(l.filter || ''));
const jeVrstvaRegionu = (l) => l.id === 'label_state' || /"class"\],"state"/.test(JSON.stringify(l.filter || ''));

function matchZeSkupin(vstup, skupiny, vychozi) {
  const e = ['match', vstup];
  for (const [cz, klice] of Object.entries(skupiny)) {
    if (!klice.length) continue;
    e.push(klice.length === 1 ? klice[0] : klice, cz);
  }
  if (e.length === 2) return vychozi;
  e.push(vychozi);
  return e;
}

// Základní (český) název popisku podle vrstvy: státy podle kódu, regiony podle slovníku.
export function zakladNazvu(l) {
  if (jeVrstvaStatu(l)) return matchZeSkupin(['coalesce', ['get', 'iso_a2'], ''], STATY, CESKY_NAZEV);
  if (jeVrstvaRegionu(l)) return matchZeSkupin(['get', 'name'], REGIONY, CESKY_NAZEV);
  if (l['source-layer'] === 'place') return NAZEV_SIDLA;
  return CESKY_NAZEV;
}

// Totéž v JavaScriptu – pro název, na který se kliklo v mapě.
export function zakladNazvuPrvku(p, l, geometrie) {
  if (l && jeVrstvaStatu(l) && STATY_MAPA.has(p.iso_a2)) return STATY_MAPA.get(p.iso_a2);
  if (l && jeVrstvaRegionu(l) && REGIONY_MAPA.has(p.name)) return REGIONY_MAPA.get(p.name);
  if (l && l['source-layer'] === 'place' && !jeVrstvaStatu(l) && !jeVrstvaRegionu(l)) return nazevSidlaJS(p, geometrie);
  return p['name:cs'] || p['name:latin'] || p.name || p.nazev || null;
}

// Všechna přejmenování: opravy z kódu < výchozí týmu < tato mapa.
export function vsechnaPrejmenovani(recept, tymove = {}) {
  const v = { ...OPRAVY, ...(tymove || {}), ...(recept?.popisky?.prejmenovane || {}) };
  for (const [k, n] of Object.entries(v)) if (!n || n === k) delete v[k];
  return v;
}

function sPrejmenovanim(zaklad, prejm) {
  const skupiny = {};
  for (const [k, n] of Object.entries(prejm)) (skupiny[n] = skupiny[n] || []).push(k);
  if (!Object.keys(skupiny).length) return zaklad;
  return ['let', 'nazev', zaklad, matchZeSkupin(['var', 'nazev'], skupiny, ['var', 'nazev'])];
}

// ---------------------------------------------------------------- sporná území (rozhodnutí redakce)
// Popisky regionů, které vyjadřují jen ruský nárok (OSM je má vedle ukrajinských), a regiony,
// které nahrazují vlastní popisky s příslušností (Kaliningrad, Nachičevan).
const SKRYTE_REGIONY = ['Республика Крым', 'город Севастополь', 'Севастополь',
  'Калининградская область', 'Kaliningrad', 'Naxçıvan', 'Naxçıvan Muxtar Respublikası'];
const SPORNY_NAZEV = ['to-string', ['coalesce', ['get', 'disputed_name'], '']];
// Sporné úseky, které se kreslí jako běžná státní hranice (plnou čarou).
const PLNE_SPORNE = ['ArunachalPradesh', 'Bhutan-China', "China'sclaimedborder", 'disputedborder(BT-CN)', 'KutoeGewog,LhuentseBhutan'];
const jeOsetie = ['in', 'Осет', SPORNY_NAZEV];
const SPORNE_JAKO_STATNI = ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1],
  ['any', jeOsetie, ['in', SPORNY_NAZEV, ['literal', PLNE_SPORNE]]]];
// Hranice Arunáčalpradéše s Ásámem je vnitřní hranice Indie.
const SPORNE_JAKO_VNITRNI = ['all', ['==', SPORNY_NAZEV, 'ArunachalPradesh'], ['==', ['get', 'admin_level'], 4]];
const SPORNE_SKRYT = ['any', jeOsetie, ['in', SPORNY_NAZEV, ['literal', PLNE_SPORNE]]];

const jeHraniceVrstva = (l) => l.type === 'line' && l['source-layer'] === 'boundary';
export function upravSpornaUzemi(l) {
  const pridat = (podminka) => { l.filter = l.filter ? ['all', l.filter, podminka] : podminka; };
  const nebo = (podminka) => { if (l.filter) l.filter = ['any', l.filter, podminka]; };
  if (jeHraniceVrstva(l)) {
    const f = JSON.stringify(l.filter || '');
    if (/disputed/.test(l.id) || /\["==",\["get","disputed"\],1\]/.test(f)) {
      // Ruské nároky (Krym) se nekreslí; Osetie, Bhútán a Arunáčalpradéš se nekreslí tečkovaně.
      pridat(['!=', ['coalesce', ['get', 'claimed_by'], ''], 'RU']);
      pridat(['!', SPORNE_SKRYT]);
    } else if (l.id === 'boundary_2') nebo(SPORNE_JAKO_STATNI);
    else if (l.id === 'boundary_3') nebo(SPORNE_JAKO_VNITRNI);
  }
  if (l.type === 'symbol' && jeVrstvaRegionu(l)) pridat(['!', ['in', ['get', 'name'], ['literal', SKRYTE_REGIONY]]]);
  return l;
}

// Vlastní čáry a popisky ze zdroje sporna_uzemi: vzhled převezmou od vrstev podkladu
// (barvy, šířky i skrytí z karty Vrstvy), aby vypadaly jako ostatní hranice a názvy.
const SPORNE_VRSTVY = [
  { id: 'sporne_hranice_plne', vzor: 'boundary_2', filtr: ['==', ['get', 'druh'], 'plna'] },
  { id: 'sporne_hranice_teckovane', vzor: 'boundary_disputed', filtr: ['==', ['get', 'druh'], 'sporna'] },
  { id: 'sporne_nazvy_staty', vzor: 'label_country_3', filtr: ['==', ['get', 'vrstva'], 'stat'], minzoom: 3, maxzoom: 9 },
  { id: 'sporne_nazvy_oblasti', vzor: 'label_state', filtr: ['==', ['get', 'vrstva'], 'oblast'], minzoom: 3, maxzoom: 9 },
  { id: 'sporne_nazvy_golan', vzor: 'label_state', filtr: ['==', ['get', 'vrstva'], 'golan'], minzoom: 6, maxzoom: 12 },
];
export const ID_SPORNYCH = new Set(SPORNE_VRSTVY.map((v) => v.id));

function pridejSpornaUzemi(vrstvy, recept) {
  vrstvy = vrstvy.filter((l) => !ID_SPORNYCH.has(l.id));
  for (const v of SPORNE_VRSTVY) {
    const i = vrstvy.findIndex((l) => l.id === v.vzor);
    if (i < 0) continue;
    const vzor = vrstvy[i];
    const nova = { id: v.id, type: vzor.type, source: 'sporna_uzemi', filter: v.filtr };
    if (vzor.paint) nova.paint = kopie(vzor.paint);
    if (vzor.layout) nova.layout = kopie(vzor.layout);
    if (vzor.type === 'symbol') {
      nova.layout['text-field'] = ['get', 'nazev'];
      nova.minzoom = v.minzoom; nova.maxzoom = v.maxzoom;
    } else {
      if (vzor.minzoom != null) nova.minzoom = vzor.minzoom;
      if (vzor.maxzoom != null) nova.maxzoom = vzor.maxzoom;
    }
    vrstvy.splice(i + 1, 0, aplikujUpravy(nova, recept.vrstvy[v.id]));
  }
  return vrstvy;
}

const PUNTIKOVE = new Set(['label_city_capital', 'label_city', 'label_town', 'label_village']);
const PUNTIK = 'circle_11_black';
// Puntík u jednotlivých názvů: ano = vždy, ne = nikdy, ostatní podle vrstvy.
function obalIkonu(o, nazev, ano, ne) {
  const obal = (x) => {
    const e = ['case'];
    if (ano.length) e.push(['in', nazev, ['literal', ano]], PUNTIK);
    if (ne.length) e.push(['in', nazev, ['literal', ne]], '');
    e.push(x ?? '');
    return e;
  };
  if (Array.isArray(o) && o[0] === 'step' && JSON.stringify(o[1]) === '["zoom"]') {
    return o.map((x, i) => (i >= 2 && i % 2 === 0 ? obal(x) : x));
  }
  if (Array.isArray(o) && JSON.stringify(o).includes('"zoom"')) return o;
  return obal(o);
}

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
  return { verze: 1, zaklad, vrstvy: {}, pridane: [], popisky: { skryteNazvy: [], posuny: {}, jenVybrane: false, vybraneNazvy: [], prejmenovane: {}, puntiky: {} }, mapa: { glob: false }, maska: prazdnaMaska() };
}

// rezim: 'oriznout' = mimo oblast nic (plný překryv, popisky mimo skryté), 'zvyraznit' = průhledný překryv.
export function prazdnaMaska() {
  return { oblasti: [], rezim: 'oriznout', barva: '#ffffff', kryti: 0.6, skrytPopisky: true, obrys: { zap: true, barva: '#001464', sirka: 1.5, carky: null } };
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
  // Starší masky neměly režim: plná neprůhledná maska se skrytými popisky = oříznutí.
  if (r?.maska && !r.maska.rezim) {
    const kryti = r.maska.kryti ?? 1;
    v.maska.rezim = kryti >= 1 && r.maska.skrytPopisky !== false ? 'oriznout' : 'zvyraznit';
    v.maska.kryti = kryti;
  }
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

  vrstvy = pridejSpornaUzemi(vrstvy, recept);

  // Zdroje vlastních vrstev.
  const potreba = new Set(vrstvy.map((l) => l.source).filter((s) => s && MISTNI_ZDROJE[s]));
  for (const id of potreba) {
    const soubor = MISTNI_ZDROJE[id].soubor;
    styl.sources[id] = {
      type: 'geojson',
      data: moznosti.export ? await nactiJson(soubor) : new URL(soubor, location.href).href,
    };
  }

  // Skryté, posunuté a „jen vybrané“ jednotlivé názvy (nastavují se klikem v náhledu).
  const skryte = recept.popisky.skryteNazvy || [];
  const posuny = recept.popisky.posuny || {};
  const posunuteNazvy = Object.keys(posuny);
  const jenVybrane = !!recept.popisky.jenVybrane;
  const vybrane = recept.popisky.vybraneNazvy || [];
  const prejm = vsechnaPrejmenovani(recept, moznosti.tymoveNazvy);
  const puntiky = recept.popisky.puntiky || {};
  const sPuntikem = Object.keys(puntiky).filter((n) => puntiky[n] === true);
  const bezPuntiku = Object.keys(puntiky).filter((n) => puntiky[n] === false);
  const pridat = (l, podminka) => { l.filter = l.filter ? ['all', l.filter, podminka] : podminka; };
  for (const l of vrstvy) {
    upravSpornaUzemi(l);
    // Barevné body sídel: bez bodu u názvů s vypnutým puntíkem, při „jen vybraných“ jen u vybraných.
    if (l.type === 'circle' && l.id.startsWith('bod_') && l['source-layer'] === 'place') {
      if (bezPuntiku.length) pridat(l, ['!', ['in', NAZEV_SIDLA, ['literal', bezPuntiku]]]);
      if (jenVybrane && !moznosti.zvyraznitVyber) pridat(l, ['in', NAZEV_SIDLA, ['literal', vybrane]]);
      continue;
    }
    if (l.type !== 'symbol' || !l.layout?.['text-field']) continue;
    let nazev;
    if (obsahujeNazev(l.layout['text-field'])) {
      nazev = zakladNazvu(l);
    } else if (JSON.stringify(l.layout['text-field']) === '["get","nazev"]') {
      nazev = ['get', 'nazev'];
    } else continue;
    l.layout['text-field'] = sPrejmenovanim(kopie(nazev), prejm);
    if (PUNTIKOVE.has(l.id) && (sPuntikem.length || bezPuntiku.length)) {
      l.layout['icon-image'] = obalIkonu(l.layout['icon-image'], nazev, sPuntikem, bezPuntiku);
    }
    if (skryte.length) pridat(l, ['!', ['in', nazev, ['literal', skryte]]]);
    if (jenVybrane) {
      const jeVybrany = ['in', nazev, ['literal', vybrane]];
      if (moznosti.zvyraznitVyber) {
        // Při výběru v náhledu zůstanou vidět i ostatní názvy, jen bledé, aby se na ně dalo kliknout.
        l.paint = l.paint || {};
        l.paint['text-opacity'] = ['case', jeVybrany, 1, 0.3];
        l.paint['icon-opacity'] = ['case', jeVybrany, 1, 0.3];
      } else pridat(l, jeVybrany);
    }
    if (posunuteNazvy.length && !jeVyrazSeZoomem(l.layout['text-offset'])) {
      const vychozi = l.layout['text-offset'] ?? [0, 0];
      const vyraz = ['match', nazev];
      for (const n of posunuteNazvy) {
        const [dx, dy] = posuny[n];
        const z = Array.isArray(vychozi) && typeof vychozi[0] === 'number' ? vychozi : [0, 0];
        vyraz.push(n, ['literal', [round2(z[0] + dx), round2(z[1] + dy)]]);
      }
      vyraz.push(Array.isArray(vychozi) && typeof vychozi[0] === 'number' ? ['literal', vychozi] : vychozi);
      l.layout['text-offset'] = vyraz;
    }
  }

  // Popisky nahoru ještě před maskou: maska pak leží nad VŠEMI ostatními vrstvami
  // (hranice, silnice, reliéf…) a pod ní zůstanou jen popisky, které skryje filtr.
  styl.layers = popiskyNahoru(vrstvy);
  if (recept.maska.oblasti.length) await pridejMasku(styl, recept.maska);
  styl.layers = popiskyNahoru(styl.layers);
  // Šablona ČT ve Flourishi při „Show place labels“ zapne VŠECHNY vrstvy popisků,
  // i ty skryté. Skryté vrstvy proto do staženého stylu vůbec nepatří.
  if (moznosti.export) styl.layers = styl.layers.filter((l) => l.layout?.visibility !== 'none');
  if (recept.mapa.glob) styl.projection = { type: 'globe' };
  else delete styl.projection;
  return styl;
}

const round2 = (x) => Math.round(x * 100) / 100;

// Šablona ČT ve Flourishi vkládá data pod souvislý blok popisků (vrstev typu
// „symbol“) na samém vrcholu stylu. Jakákoli jiná vrstva v tom bloku – i skrytá –
// ho přeruší a popisky pod ní skončí pod daty. Proto se všechny popisky
// přesunou nahoru za ostatní vrstvy; jejich vzájemné pořadí zůstává.
export function popiskyNahoru(vrstvy) {
  return [...vrstvy.filter((l) => l.type !== 'symbol'), ...vrstvy.filter((l) => l.type === 'symbol')];
}
function jeVyrazSeZoomem(v) {
  return Array.isArray(v) && JSON.stringify(v).includes('"zoom"');
}

// Převod libovolného stylu (např. dřívější mapy) na recept proti zvolenému podkladu.
export async function receptZeStylu(styl, zaklad = 'liberty') {
  const zakl = await nactiZaklad(zaklad);
  // Porovnává se s podkladem po úpravách sporných území, aby se do receptu nedostaly jako ruční změny.
  const zaklVrstvy = new Map(zakl.layers.map((l) => [l.id, upravSpornaUzemi(kopie(l))]));
  const ids = new Set(styl.layers.map((l) => l.id));
  const r = prazdnyRecept(zaklad);
  for (const b of zakl.layers) if (!ids.has(b.id)) r.vrstvy[b.id] = { skryta: true };
  let predchozi = null;
  for (const l of styl.layers) {
    if (ID_SPORNYCH.has(l.id)) continue;
    const b = zaklVrstvy.get(l.id);
    if (b) {
      const u = {};
      for (const cast of ['paint', 'layout']) {
        const d = {};
        const klice = new Set([...Object.keys(b[cast] || {}), ...Object.keys(l[cast] || {})]);
        for (const k of klice) {
          if (k === 'visibility' || k === 'text-field') continue;
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
  const oriznout = maska.rezim !== 'zvyraznit';
  const nove = [{
    id: 'maska', type: 'fill', source: 'maska',
    paint: { 'fill-color': maska.barva || '#ffffff', 'fill-opacity': oriznout ? 1 : (maska.kryti ?? 1), 'fill-antialias': false },
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

  if (oriznout || maska.skrytPopisky) {
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
