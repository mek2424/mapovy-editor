import { ZAKLADY, sestavStyl, prazdnyRecept, doplnRecept, receptZeStylu, kopie } from './styl.js';
import { PALETA_CT, SKALY, odstiny, ladici, hex, kontrast } from './barvy.js';
import { SKUPINY, skupina, nazevVrstvy, BARVY_VRSTVY, KRYTI_VRSTVY, POPISY_VLASTNOSTI } from './vrstvy.js';
import { DATA, pridejData, vlastniData, nastavVlastniData, prectiSoubor, hraniceDat } from './data.js';
import { SCHEMATA, zmenySchematu, CISTY_PODKLAD } from './schemata.js';
import * as ul from './ulozeni.js';

const $ = (s, el = document) => el.querySelector(s);

// Malý pomocník na tvorbu prvků: h('div', {class: 'x', onclick}, 'text', dite)
function h(tag, vl = {}, ...deti) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(vl || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const d of deti.flat()) if (d != null && d !== false) el.append(d instanceof Node ? d : String(d));
  return el;
}

// ---------------------------------------------------------------- stav

const VYCHOZI_NAHLED = { sada: 'anomalie', kryti: 0.4, skala: 'anomalie', barvaBodu: '#001464', popiskyNadDaty: true };
let stav = {
  meta: { id: null, nazev: 'Nová mapa', popis: '', autor: '', vytvoreno: null },
  recept: prazdnyRecept('liberty'),
  nahled: { ...VYCHOZI_NAHLED },
  ulozeno: true,
};
const ulozeny = ul.nactiRozpracovane();
if (ulozeny?.recept) {
  stav = { ...stav, ...ulozeny, recept: doplnRecept(ulozeny.recept), nahled: { ...VYCHOZI_NAHLED, ...ulozeny.nahled } };
}

let historie = [];
let budouci = [];
let posledniKlic = null;
let posledniCas = 0;
let posledniStyl = null;
let karta = 'sablony';
const otevreneSkupiny = new Set(['pozadi', 'voda', 'hranice', 'popisky_mist']);
const otevreneVrstvy = new Set();
let vyberovyRezim = false;
let vybranyNazev = null;
let mapa = null;

const snimek = () => JSON.stringify({ meta: stav.meta, recept: stav.recept });

// Každá úprava jde přes tuto funkci: uloží krok pro „Zpět“, překreslí mapu a panel.
// klic: posuvníky a výběr barvy slučují rychlé po sobě jdoucí změny do jednoho kroku.
function zmena(fn, { klic = null, prekreslit = true } = {}) {
  const ted = Date.now();
  if (!(klic && klic === posledniKlic && ted - posledniCas < 1500)) {
    historie.push(snimek());
    if (historie.length > 200) historie.shift();
    budouci = [];
  }
  posledniKlic = klic;
  posledniCas = ted;
  fn(stav);
  stav.ulozeno = false;
  poZmene(prekreslit);
}

function poZmene(prekreslit = true) {
  ul.ulozRozpracovane(stav);
  aktualizujListu();
  naplanujMapu();
  if (prekreslit) vykresliPanel();
}

function zpet() {
  if (!historie.length) return;
  budouci.push(snimek());
  const s = JSON.parse(historie.pop());
  stav.meta = s.meta; stav.recept = s.recept; stav.ulozeno = false;
  posledniKlic = null;
  poZmene();
}
function znovu() {
  if (!budouci.length) return;
  historie.push(snimek());
  const s = JSON.parse(budouci.pop());
  stav.meta = s.meta; stav.recept = s.recept; stav.ulozeno = false;
  posledniKlic = null;
  poZmene();
}

// Úpravy jednotlivých vrstev v receptu.
const upravy = (id) => (stav.recept.vrstvy[id] = stav.recept.vrstvy[id] || {});
function nastav(id, cast, klic, hodnota) {
  const u = upravy(id);
  u[cast] = u[cast] || {};
  u[cast][klic] = hodnota;
}
function zrusNastaveni(id, cast, klic) {
  const u = stav.recept.vrstvy[id];
  if (!u?.[cast]) return;
  delete u[cast][klic];
  if (!Object.keys(u[cast]).length) delete u[cast];
}
const vrstvaStylu = (id) => posledniStyl?.layers.find((l) => l.id === id);
const jeViditelna = (l) => l?.layout?.visibility !== 'none';
const jeUpravena = (id) => {
  const u = stav.recept.vrstvy[id];
  if (!u) return false;
  return Object.keys(u).some((k) => k !== 'skryta');
};

// ---------------------------------------------------------------- mapa

let casovac = null;
let poradi = 0;
function naplanujMapu() {
  clearTimeout(casovac);
  casovac = setTimeout(aktualizujMapu, 60);
}

async function aktualizujMapu() {
  const moje = ++poradi;
  let styl;
  try {
    styl = await sestavStyl(stav.recept, { nazev: stav.meta.nazev });
  } catch (e) {
    hlaska(`Styl se nepodařilo sestavit: ${e.message}`, true);
    return;
  }
  if (moje !== poradi) return;
  const stareIds = posledniStyl?.layers.map((l) => l.id).join();
  posledniStyl = styl;
  const jineVrstvy = stareIds !== styl.layers.map((l) => l.id).join();
  const sDaty = pridejData(kopie(styl), stav.nahled);
  if (!mapa) {
    mapa = new maplibregl.Map({
      container: 'mapa', style: sDaty, center: [15.3, 49.8], zoom: 5.2,
      attributionControl: { compact: false }, hash: true,
    });
    mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    mapa.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    mapa.on('move', infoMapy);
    mapa.on('resize', infoMapy);
    mapa.on('load', infoMapy);
    mapa.on('click', klikNaMapu);
    mapa.on('error', (e) => console.warn('Mapa:', e?.error?.message || e));
  } else {
    mapa.setStyle(sDaty, { diff: true });
  }
  // Panel se překreslí, jen když přibyla nebo ubyla vrstva (ne při tažení posuvníku).
  if (jineVrstvy) vykresliPanel();
  window.mapovyEditor = { mapa, stav, styl: () => posledniStyl };
}

function infoMapy() {
  if (!mapa) return;
  const c = mapa.getCenter();
  const sirka = mapa.getContainer().clientWidth;
  const bezOpakovani = Math.max(0, Math.ceil(Math.log2(sirka / 512) * 10) / 10);
  $('#info-mapy').textContent =
    `Přiblížení ${cislo(mapa.getZoom())} · střed ${cislo(c.lat, 3)}, ${cislo(c.lng, 3)} · ` +
    `svět se neopakuje od přiblížení ${cislo(bezOpakovani, 1)} (šířka ${sirka} px)`;
}

// ---------------------------------------------------------------- výběr názvu v mapě

function nazevPrvku(p) {
  return p['name:cs'] || p['name:latin'] || p.name || p.nazev || null;
}

function klikNaMapu(e) {
  if (!vyberovyRezim || !posledniStyl) return;
  const vrstvy = posledniStyl.layers.filter((l) => l.type === 'symbol' && jeViditelna(l)).map((l) => l.id);
  const pole = [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]];
  const f = mapa.queryRenderedFeatures(pole, { layers: vrstvy.filter((id) => mapa.getLayer(id)) });
  const s = f.find((x) => nazevPrvku(x.properties));
  if (!s) { hlaska('Tady žádný název není. Klikni přímo na text.'); return; }
  vybranyNazev = nazevPrvku(s.properties);
  vykresliVyberNazvu();
}

function vykresliVyberNazvu() {
  const box = $('#vyber-nazvu');
  if (!vyberovyRezim || !vybranyNazev) { box.hidden = true; return; }
  const n = vybranyNazev;
  const pop = stav.recept.popisky;
  const posun = pop.posuny[n] || [0, 0];
  const skryty = pop.skryteNazvy.includes(n);
  const posunout = (dx, dy) => zmena((s) => {
    const p = s.recept.popisky.posuny[n] || [0, 0];
    const nove = [Math.round((p[0] + dx) * 100) / 100, Math.round((p[1] + dy) * 100) / 100];
    if (nove[0] === 0 && nove[1] === 0) delete s.recept.popisky.posuny[n];
    else s.recept.popisky.posuny[n] = nove;
  }, { klic: `posun-${n}` });
  box.replaceChildren(
    h('strong', {}, n),
    h('div', { class: 'poznamka' }, skryty ? 'Název je skrytý.' : `Posun: ${posun[0]} / ${posun[1]} em`),
    h('div', { class: 'sipky' },
      h('span'), h('button', { class: 'tl', onclick: () => posunout(0, -0.2), title: 'Nahoru' }, '↑'), h('span'),
      h('button', { class: 'tl', onclick: () => posunout(-0.2, 0), title: 'Doleva' }, '←'),
      h('button', { class: 'tl', onclick: () => zmena((s) => { delete s.recept.popisky.posuny[n]; }), title: 'Zpět na místo' }, '•'),
      h('button', { class: 'tl', onclick: () => posunout(0.2, 0), title: 'Doprava' }, '→'),
      h('span'), h('button', { class: 'tl', onclick: () => posunout(0, 0.2), title: 'Dolů' }, '↓'), h('span')),
    h('div', { class: 'tlacitka' },
      h('button', {
        class: 'tl', onclick: () => zmena((s) => {
          const l = s.recept.popisky.skryteNazvy;
          if (l.includes(n)) l.splice(l.indexOf(n), 1); else l.push(n);
        }),
      }, skryty ? 'Znovu zobrazit' : 'Skrýt název'),
      h('button', { class: 'tl', onclick: () => { vybranyNazev = null; box.hidden = true; } }, 'Zavřít')),
    h('div', { class: 'poznamka' }, 'Posun platí pro všechny výskyty tohoto názvu. Jednotka em = velikost písma.'),
  );
  box.hidden = false;
}

function nastavVyberovyRezim(zap) {
  vyberovyRezim = zap;
  document.querySelector('.nahled').classList.toggle('vyberovy-rezim', zap);
  if (!zap) { vybranyNazev = null; }
  vykresliVyberNazvu();
}

// ---------------------------------------------------------------- výběr barvy

let vybiracZavri = null;
function otevriVybirac(kotva, aktualni, poVyberu, { pozadi = null } = {}) {
  if (vybiracZavri) vybiracZavri(false);
  const box = $('#vybirac');
  const klic = `barva-${Date.now()}`;
  let zvolena = hex(aktualni) || '#001464';
  let zmeneno = false;

  const vyber = (b) => {
    zvolena = hex(b) || zvolena;
    zmeneno = true;
    poVyberu(zvolena, klic);
    // Vzorek v panelu se překreslí hned, celý panel až po zavření výběru.
    kotva.classList.remove('vyraz');
    const s = kotva.querySelector('span');
    if (s) s.style.background = zvolena;
    vykresli();
  };
  const vzorek = (b, titulek) => h('button', {
    class: `vzorek${hex(b) === zvolena ? ' zvolena' : ''}`, title: titulek || b, onclick: () => vyber(b),
  }, h('span', { style: `background:${b}` }));

  function vykresli() {
    const o = odstiny(zvolena);
    const k = pozadi ? kontrast(zvolena, pozadi) : null;
    box.replaceChildren(...[
      h('h3', {}, 'Paleta ČT'),
      h('div', { class: 'paleta' }, PALETA_CT.map((b) => vzorek(b))),
      h('h3', {}, 'Světlejší odstíny'),
      h('div', { class: 'paleta' }, o.svetlejsi.map((b) => vzorek(b))),
      h('h3', {}, 'Tmavší · tlumené · papírové'),
      h('div', { class: 'paleta' }, [...o.tmavsi, ...o.tlumene, ...o.papirove].map((b) => vzorek(b))),
      h('h3', {}, 'Barvy, které ladí'),
      h('div', { class: 'ladici' }, ladici(zvolena).map((x) => h('button', { onclick: () => vyber(x.barva), title: x.barva },
        h('span', { class: 'v', style: `background:${x.barva}` }), x.nazev + (x.zPalety ? ' ✓' : '')))),
      h('div', { class: 'poznamka' }, '✓ = barva přímo z palety ČT'),
      h('h3', {}, 'Vlastní'),
      h('div', { class: 'radek' },
        h('input', { type: 'color', value: zvolena, oninput: (e) => vyber(e.target.value) }),
        h('input', {
          type: 'text', value: zvolena, onchange: (e) => {
            const x = hex(e.target.value);
            if (x) vyber(x); else hlaska('Tuhle barvu nepoznám. Zkus např. #001464.', true);
          },
        })),
      k ? h('div', { class: `kontrast${k < 3 ? ' spatny' : ''}` },
        `Kontrast vůči podkladu ${k.toFixed(1).replace('.', ',')} : 1 – ${k >= 4.5 ? 'dobře čitelné' : k >= 3 ? 'čitelné u většího písma' : 'špatně čitelné'}`) : null,
    ].filter(Boolean));
  }
  vykresli();
  box.hidden = false;
  const r = kotva.getBoundingClientRect();
  const vyska = box.offsetHeight;
  box.style.left = `${Math.min(r.left, innerWidth - 348)}px`;
  box.style.top = `${Math.max(8, Math.min(r.bottom + 6, innerHeight - vyska - 8))}px`;

  const venku = (e) => { if (!box.contains(e.target) && e.target !== kotva && !kotva.contains(e.target)) zavri(); };
  const esc = (e) => { if (e.key === 'Escape') zavri(); };
  function zavri(prekreslit = true) {
    box.hidden = true;
    document.removeEventListener('mousedown', venku);
    document.removeEventListener('keydown', esc);
    vybiracZavri = null;
    // Panel až po dokončení kliknutí, jinak by zmizel vzorek, na který se právě kliká.
    if (prekreslit && zmeneno) setTimeout(() => { if ($('#vybirac').hidden) vykresliPanel(); }, 250);
  }
  setTimeout(() => { document.addEventListener('mousedown', venku); document.addEventListener('keydown', esc); });
  vybiracZavri = zavri;
}

function vzorekBarvy(hodnota, onclick, titulek) {
  const jeVyraz = typeof hodnota !== 'string';
  return h('button', {
    class: `vzorek${jeVyraz ? ' vyraz' : ''}`,
    title: titulek || (jeVyraz ? 'Barva se mění s přiblížením – výběrem ji nahradíš jednou barvou' : hodnota),
    onclick,
  }, h('span', { style: jeVyraz ? '' : `background:${hodnota}` }));
}

const barvaPevniny = () => vrstvaStylu(posledniStyl?.layers.find((l) => l.type === 'background')?.id)?.paint?.['background-color'] || '#ffffff';

// ---------------------------------------------------------------- vlastní vrstvy

const VLASTNI = {
  kraje_hranice: {
    nazev: 'Hranice krajů ČR', za: ['water', 'pobrezi'],
    vrstva: {
      id: 'kraje_hranice', type: 'line', source: 'kraje_hranice', minzoom: 4.5,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#001464', 'line-opacity': 0.45, 'line-dasharray': [3, 2], 'line-width': ['interpolate', ['linear'], ['zoom'], 4.5, 0.6, 7, 1.2, 10, 2] },
    },
  },
  kraje_nazvy: {
    nazev: 'Názvy krajů ČR', za: ['label_city_capital', 'label_country_1'],
    vrstva: {
      id: 'kraje_nazvy', type: 'symbol', source: 'kraje_nazvy', minzoom: 6,
      layout: { 'text-field': ['get', 'nazev'], 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 9, 14], 'text-max-width': 8 },
      paint: { 'text-color': '#4a5a9a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
    },
  },
  pobrezi: {
    nazev: 'Pobřežní čára', za: ['water'],
    vrstva: {
      id: 'pobrezi', type: 'line', source: 'openmaptiles', 'source-layer': 'water', filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#001464', 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 4, 0.9, 8, 1.2, 14, 1.5] },
    },
  },
};
const BODY_SIDEL = [
  ['label_village', 'village', 1.6, 9], ['label_town', 'town', 2, 6], ['label_city', 'city', 2.6, 3], ['label_city_capital', 'capital', 3.2, 3],
];

// Přidání vlastní vrstvy přímo do receptu (bez kroku pro „Zpět“).
function pridejVlastniDo(recept, styl, klic) {
  const v = VLASTNI[klic];
  if (recept.pridane.some((p) => p.vrstva.id === v.vrstva.id)) return;
  const ids = styl.layers.map((l) => l.id);
  const za = v.za.find((x) => ids.includes(x)) || null;
  recept.pridane.push({ za, vrstva: kopie(v.vrstva) });
  delete recept.vrstvy[v.vrstva.id];
}

function pridejBodyDo(recept, styl, barva = '#001464', obrys = '#ffffff') {
  for (const [popisek, druh, r, minzoom] of BODY_SIDEL) {
    const id = `bod_${druh === 'capital' ? 'city_capital' : druh}`;
    const l = styl.layers.find((x) => x.id === popisek);
    if (!l) continue;
    const existujici = recept.pridane.find((p) => p.vrstva.id === id);
    if (existujici) {
      existujici.vrstva.paint['circle-color'] = barva;
      existujici.vrstva.paint['circle-stroke-color'] = obrys;
      continue;
    }
    const i = styl.layers.findIndex((x) => x.id === popisek);
    recept.pridane.push({
      za: i > 0 ? styl.layers[i - 1].id : null,
      vrstva: {
        id, type: 'circle', source: 'openmaptiles', 'source-layer': 'place', filter: kopie(l.filter), minzoom,
        paint: { 'circle-radius': r, 'circle-color': barva, 'circle-stroke-color': obrys, 'circle-stroke-width': 1 },
      },
    });
    // Černý puntík ze sady ikon se tím nahradí: ikonu u popisku vypneme.
    recept.vrstvy[popisek] = recept.vrstvy[popisek] || {};
    recept.vrstvy[popisek].layout = { ...(recept.vrstvy[popisek].layout || {}), 'icon-image': null };
  }
}

function odeberVlastniZ(recept, id) {
  recept.pridane = recept.pridane.filter((p) => p.vrstva.id !== id);
  delete recept.vrstvy[id];
  if (id.startsWith('bod_')) {
    const popisek = `label_${id.slice(4)}`;
    if (recept.vrstvy[popisek]?.layout && 'icon-image' in recept.vrstvy[popisek].layout) {
      delete recept.vrstvy[popisek].layout['icon-image'];
    }
  }
}

const pridejVlastni = (klic) => zmena((s) => pridejVlastniDo(s.recept, posledniStyl, klic));
const pridejBodySidel = () => zmena((s) => pridejBodyDo(s.recept, posledniStyl));
const odeberVlastni = (id) => zmena((s) => odeberVlastniZ(s.recept, id));
const odeberBodySidel = () => zmena((s) => BODY_SIDEL.forEach(([, d]) => odeberVlastniZ(s.recept, `bod_${d === 'capital' ? 'city_capital' : d}`)));

// Barevné schéma ČT na recept. styl = sestavený styl téhož receptu.
function aplikujSchemaNa(recept, styl, klic, cisty) {
  const sch = SCHEMATA[klic];
  for (const [id, vl, hodnota] of zmenySchematu(styl, sch)) {
    const u = (recept.vrstvy[id] = recept.vrstvy[id] || {});
    u.paint = u.paint || {};
    u.paint[vl] = hodnota;
  }
  if (sch.pobrezi) {
    pridejVlastniDo(recept, styl, 'pobrezi');
    const p = recept.pridane.find((x) => x.vrstva.id === 'pobrezi');
    p.vrstva.paint['line-color'] = sch.text;
    if (recept.vrstvy.pobrezi) delete recept.vrstvy.pobrezi.skryta;
  }
  const kraje = recept.pridane.find((x) => x.vrstva.id === 'kraje_hranice');
  if (kraje) kraje.vrstva.paint['line-color'] = sch.kraje;
  const nazvyKraju = recept.pridane.find((x) => x.vrstva.id === 'kraje_nazvy');
  if (nazvyKraju) Object.assign(nazvyKraju.vrstva.paint, { 'text-color': sch.staty, 'text-halo-color': sch.obrys });
  if (sch.tmava) pridejBodyDo(recept, styl, sch.text, sch.obrys);
  else if (recept.pridane.some((x) => x.vrstva.id === 'bod_city')) pridejBodyDo(recept, styl, sch.text, sch.obrys);
  if (cisty) {
    const vlastniIds = new Set(recept.pridane.map((x) => x.vrstva.id));
    for (const l of styl.layers) {
      if (vlastniIds.has(l.id)) continue;
      const u = (recept.vrstvy[l.id] = recept.vrstvy[l.id] || {});
      u.skryta = !CISTY_PODKLAD.has(l.id);
    }
    // Puntíky sídel ve všech přiblíženích, jako u dřívějších map.
    if (!sch.tmava && !vlastniIds.has('bod_city')) {
      for (const [popisek] of BODY_SIDEL) {
        if (!styl.layers.some((l) => l.id === popisek)) continue;
        const u = recept.vrstvy[popisek];
        u.layout = { ...(u.layout || {}), 'icon-image': 'circle_11_black' };
      }
    }
  }
}

function aplikujSchema(klic, cisty) {
  zmena((s) => aplikujSchemaNa(s.recept, posledniStyl, klic, cisty));
  hlaska(`Použito schéma ${SCHEMATA[klic].nazev}${cisty ? ' s čistým podkladem' : ''}.`);
}

async function novaMapa(zaklad, schema, cisty) {
  const recept = prazdnyRecept(zaklad);
  if (schema && schema !== 'puvodni') {
    const styl = await sestavStyl(recept);
    aplikujSchemaNa(recept, styl, schema, cisty);
  }
  historie = []; budouci = [];
  stav.meta = { id: null, nazev: 'Nová mapa', popis: '', autor: '', vytvoreno: null };
  stav.recept = recept;
  stav.ulozeno = true;
  poZmene();
}

// ---------------------------------------------------------------- panely

function vykresliPanel() {
  document.querySelectorAll('.karty button').forEach((b) => b.classList.toggle('aktivni', b.dataset.karta === karta));
  const obsah = $('#obsah-panelu');
  const scroll = obsah.scrollTop;
  const fn = { sablony: panelSablony, barvy: panelBarvy, vrstvy: panelVrstvy, popisky: panelPopisky, data: panelData, nastaveni: panelNastaveni }[karta];
  obsah.replaceChildren(...[fn()].flat(Infinity).filter((x) => x != null && x !== false));
  obsah.scrollTop = scroll;
  vykresliVyberNazvu();
}

function aktualizujListu() {
  const n = $('#nazev-sablony');
  if (document.activeElement !== n) n.value = stav.meta.nazev || '';
  $('#stav-ulozeni').textContent = stav.ulozeno ? (stav.meta.id ? 'uloženo' : '') : 'neuloženo';
  $('#zpet').disabled = !historie.length;
  $('#znovu').disabled = !budouci.length;
}

// Posuvník s popisem a hodnotou.
function posuvnik(popis, hodnota, { min, max, krok, format = (x) => x, klic, nastav: zapis }) {
  const vystup = h('span', { class: 'hodnota' }, format(hodnota));
  return h('div', { class: 'radek' },
    h('label', {}, popis),
    h('input', {
      type: 'range', min, max, step: krok, value: hodnota,
      oninput: (e) => {
        const v = parseFloat(e.target.value);
        vystup.textContent = format(v);
        zmena(() => zapis(v), { klic, prekreslit: false });
      },
      onchange: () => vykresliPanel(),
    }),
    vystup);
}

const cislo = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');

// ---- Šablony
let sablony = null;
let zdrojSablon = null;
let nacitamSablony = false;

async function nactiSablony() {
  nacitamSablony = true;
  try {
    const r = await ul.seznamSablon();
    sablony = r.sablony.sort((a, b) => (a.nazev || '').localeCompare(b.nazev || '', 'cs'));
    zdrojSablon = r.zdroj;
  } catch (e) {
    hlaska(`Šablony se nepodařilo načíst: ${e.message}`, true);
    sablony = [];
  }
  nacitamSablony = false;
  if (karta === 'sablony') vykresliPanel();
}

function otevriSablonu(s) {
  if (!stav.ulozeno && !confirm('Rozpracovaná mapa není uložená. Opravdu otevřít jinou šablonu?')) return;
  if (!s.nastaveni) { hlaska('Šablona nemá platné nastavení.', true); return; }
  historie = []; budouci = [];
  stav.meta = { id: s.id, nazev: s.nazev, popis: s.popis || '', autor: s.autor || '', vytvoreno: s.vytvoreno || null };
  stav.recept = doplnRecept(kopie(s.nastaveni));
  stav.ulozeno = true;
  poZmene();
  hlaska(`Otevřena šablona „${s.nazev}“`);
}

async function ulozit(jakoNovou = false) {
  if (!stav.meta.nazev?.trim()) { hlaska('Nejdřív mapu pojmenuj.', true); $('#nazev-sablony').focus(); return; }
  if (jakoNovou || !stav.meta.id) {
    stav.meta.id = ul.noveId(stav.meta.nazev);
    stav.meta.vytvoreno = null;
  }
  try {
    const s = await ul.ulozSablonu({ ...stav.meta, zaklad: stav.recept.zaklad, nastaveni: stav.recept });
    stav.meta.vytvoreno = s.vytvoreno;
    stav.meta.autor = s.autor;
    stav.ulozeno = true;
    poZmene(false);
    hlaska(ul.jeNapojeno() ? 'Šablona je uložená v týmové tabulce.' : 'Šablona je uložená jen v tomto prohlížeči (tabulka není napojená).');
    await nactiSablony();
  } catch (e) {
    hlaska(`Uložení se nepovedlo: ${e.message}`, true);
  }
}

function panelSablony() {
  if (!sablony && !nacitamSablony) nactiSablony();
  const zdroj = zdrojSablon === 'tabulka'
    ? h('div', { class: 'zdroj-sablon' }, 'Šablony z týmové Google tabulky')
    : h('div', { class: 'zdroj-sablon mistni' }, 'Tabulka není napojená – šablony jsou jen v tomto prohlížeči. Napojíš ji v Nastavení.');
  const novy = h('select', { class: 'pole' }, Object.entries(ZAKLADY).map(([k, z]) => h('option', { value: k }, `${z.nazev} – ${z.popis}`)));
  const noveSchema = h('select', { class: 'pole' },
    Object.entries(SCHEMATA).map(([k, sch]) => h('option', { value: k }, `${sch.nazev} – ${sch.popis}`)),
    h('option', { value: 'puvodni' }, 'Původní barvy podkladu'));
  const noveCiste = h('input', { type: 'checkbox', checked: true });
  return [
    h('h2', {}, 'Aktuální mapa'),
    h('input', {
      class: 'pole', placeholder: 'Krátký popis (k čemu se hodí)', value: stav.meta.popis || '',
      onchange: (e) => zmena((s) => { s.meta.popis = e.target.value; }, { prekreslit: false }),
    }),
    h('div', { class: 'tlacitka' },
      h('button', { class: 'tl tl-modre', onclick: () => ulozit(false) }, stav.meta.id ? 'Uložit změny' : 'Uložit jako šablonu'),
      stav.meta.id ? h('button', { class: 'tl', onclick: () => ulozit(true) }, 'Uložit jako novou') : null),
    h('h2', {}, 'Nová mapa'),
    h('div', { class: 'radek' }, h('label', {}, 'Podklad'), novy),
    h('div', { class: 'radek' }, h('label', {}, 'Barvy'), noveSchema),
    h('label', { class: 'prepinac' }, noveCiste, 'Čistý podklad (jen voda, hranice, sídla, státy)'),
    h('div', { class: 'tlacitka' },
      h('button', {
        class: 'tl tl-modre', onclick: () => {
          if (!stav.ulozeno && !confirm('Rozpracovaná mapa není uložená. Opravdu začít novou?')) return;
          novaMapa(novy.value, noveSchema.value, noveCiste.checked);
        },
      }, 'Vytvořit mapu')),
    h('div', { class: 'poznamka' }, 'Bez čistého podkladu mapa ukáže všechny vrstvy (silnice, lesy, budovy…) přebarvené do zvoleného schématu. Co nechceš, vypneš na kartě Vrstvy.'),
    h('h2', {}, 'Šablony'),
    zdroj,
    nacitamSablony ? h('p', { class: 'poznamka' }, 'Načítám…') : null,
    sablony && !sablony.length && !nacitamSablony ? h('p', { class: 'poznamka' }, 'Zatím tu žádné šablony nejsou. Dřívější mapy nahraješ tlačítkem „Nahrát soubor“.') : null,
    (sablony || []).map((s) => h('div', { class: `sablona${s.id === stav.meta.id ? ' aktualni' : ''}` },
      h('div', { class: 'telo' },
        h('strong', {}, s.nazev || s.id),
        s.popis ? h('small', {}, s.popis) : null,
        h('small', {}, [s.autor, s.upraveno ? s.upraveno.replace('T', ' ').slice(0, 16) : null].filter(Boolean).join(' · '))),
      h('div', { class: 'tlacitka' },
        h('button', { class: 'tl tl-male', onclick: () => otevriSablonu(s) }, 'Otevřít'),
        h('button', {
          class: 'tl tl-male tl-nebezpecne', onclick: async () => {
            if (!confirm(`Smazat šablonu „${s.nazev}“? Nejde to vrátit.`)) return;
            try { await ul.smazSablonu(s.id); hlaska('Šablona smazána.'); await nactiSablony(); } catch (e) { hlaska(e.message, true); }
          },
        }, 'Smazat')))),
    h('h2', {}, 'Soubory'),
    h('div', { class: 'tlacitka' },
      h('button', { class: 'tl', onclick: () => vyberSoubor(nahrajSoubor) }, 'Nahrát soubor'),
      h('button', { class: 'tl', onclick: () => stahniSoubor('sablony-map.json', { typ: 'mapovy-editor-sablony', verze: 1, sablony: sablony || [] }) }, 'Stáhnout všechny šablony'),
      h('button', { class: 'tl', onclick: () => nactiSablony() }, 'Obnovit seznam')),
    h('div', { class: 'poznamka' }, 'Nahrát jde soubor šablon z editoru, nebo libovolný style.json – ten se převede na novou mapu.'),
  ];
}

async function nahrajSoubor(text, jmeno) {
  let j;
  try { j = JSON.parse(text); } catch { hlaska('Soubor není platný JSON.', true); return; }
  if (j.typ === 'mapovy-editor-sablony' && Array.isArray(j.sablony)) {
    if (!confirm(`Nahrát ${j.sablony.length} šablon${ul.jeNapojeno() ? ' do týmové tabulky' : ' do tohoto prohlížeče'}? Šablony se stejným id se přepíšou.`)) return;
    try {
      const n = await ul.ulozVice(j.sablony);
      hlaska(`Nahráno šablon: ${n}`);
      await nactiSablony();
    } catch (e) { hlaska(`Nahrání se nepovedlo: ${e.message}`, true); }
    return;
  }
  if (j.version === 8 && Array.isArray(j.layers)) {
    if (!stav.ulozeno && !confirm('Rozpracovaná mapa není uložená. Opravdu ji nahradit nahraným stylem?')) return;
    const n = (j.name || '').toLowerCase();
    const zaklad = n.includes('positron') ? 'positron' : n.includes('bright') ? 'bright' : 'liberty';
    const r = await receptZeStylu(j, zaklad);
    historie = []; budouci = [];
    stav.meta = { id: null, nazev: j.name || jmeno.replace(/\.json$/i, ''), popis: '', autor: '', vytvoreno: null };
    stav.recept = r;
    stav.ulozeno = false;
    poZmene();
    hlaska(`Styl převeden na novou mapu (podklad ${ZAKLADY[zaklad].nazev}). Ulož ji jako šablonu.`);
    return;
  }
  hlaska('Tomuhle souboru nerozumím – čekám soubor šablon nebo style.json.', true);
}

// ---- Barvy
const RYCHLE = [
  { nazev: 'Pevnina', vyber: (l) => l.type === 'background', vl: 'background-color' },
  { nazev: 'Moře a jezera', vyber: (l) => l['source-layer'] === 'water' && l.type === 'fill', vl: 'fill-color' },
  { nazev: 'Řeky a potoky', vyber: (l) => l['source-layer'] === 'waterway' && l.type === 'line', vl: 'line-color' },
  { nazev: 'Pobřežní čára', vyber: (l) => l.id === 'pobrezi', vl: 'line-color' },
  { nazev: 'Hranice států', vyber: (l) => ['boundary_2', 'boundary_disputed'].includes(l.id), vl: 'line-color' },
  { nazev: 'Hranice krajů', vyber: (l) => l.id === 'kraje_hranice' || l.id === 'boundary_3', vl: 'line-color' },
  { nazev: 'Názvy států', vyber: (l) => /^label_country/.test(l.id), vl: 'text-color' },
  { nazev: 'Názvy sídel', vyber: (l) => /^label_(city|town|village|other)/.test(l.id), vl: 'text-color' },
  { nazev: 'Názvy krajů a regionů', vyber: (l) => l.id === 'kraje_nazvy' || l.id === 'label_state', vl: 'text-color' },
  { nazev: 'Názvy vodstva', vyber: (l) => skupina(l) === 'popisky_vody', vl: 'text-color' },
  { nazev: 'Obrys všech popisků', vyber: (l) => l.type === 'symbol' && !!l.layout?.['text-field'], vl: 'text-halo-color' },
  { nazev: 'Body sídel', vyber: (l) => l.type === 'circle' && l['source-layer'] === 'place', vl: 'circle-color' },
];

function panelBarvy() {
  if (!posledniStyl) return h('p', { class: 'poznamka' }, 'Načítám…');
  const polozky = RYCHLE.map((r) => {
    const vrstvy = posledniStyl.layers.filter(r.vyber);
    if (!vrstvy.length) return null;
    const viditelne = vrstvy.filter(jeViditelna);
    const prvni = (viditelne[0] || vrstvy[0]);
    const hodnota = prvni.paint?.[r.vl];
    const jednotna = vrstvy.every((l) => JSON.stringify(l.paint?.[r.vl]) === JSON.stringify(hodnota));
    const vzorek = vzorekBarvy(hodnota ?? '#000000', (e) => otevriVybirac(e.currentTarget, typeof hodnota === 'string' ? hodnota : '#001464',
      (b, klic) => zmena(() => vrstvy.forEach((l) => nastav(l.id, 'paint', r.vl, b)), { klic, prekreslit: false }),
      { pozadi: r.vl === 'text-color' ? barvaPevniny() : null }));
    return h('div', { class: 'barva-polozka' }, vzorek,
      h('div', { class: 'popis' }, r.nazev,
        h('div', {}, h('code', {}, typeof hodnota === 'string' ? hodnota : 'mění se s přiblížením'),
          !jednotna ? h('code', {}, ' · vrstvy se liší') : null,
          !viditelne.length ? h('code', {}, ' · skryté') : null)));
  });
  const ciste = h('input', { type: 'checkbox' });
  return [
    h('h2', {}, 'Barvy ČT jedním klikem'),
    h('div', { class: 'schemata' }, Object.entries(SCHEMATA).map(([k, sch]) => h('button', {
      class: 'schema', title: sch.popis, onclick: () => aplikujSchema(k, ciste.checked),
    },
    h('span', { class: 'nahled-schematu' },
      h('span', { style: `background:${sch.pevnina}` }),
      h('span', { style: `background:${sch.voda}` }),
      h('span', { style: `background:${sch.hranice}` }),
      h('span', { style: `background:${sch.text}` })),
    h('span', { class: 'jmeno-schematu' }, sch.nazev)))),
    h('label', { class: 'prepinac' }, ciste, 'Zároveň vyčistit podklad (jen voda, hranice, sídla, státy)'),
    h('div', { class: 'poznamka' }, 'Schéma přebarví všechny vrstvy podkladu – i silnice, lesy a budovy – do odstínů palety ČT. Pak můžeš cokoli doladit ručně.'),
    h('h2', {}, 'Podklad'),
    h('select', {
      class: 'pole', onchange: (e) => {
        if (!confirm('Změna podkladu zachová úpravy jen u vrstev, které má i nový podklad. Pokračovat?')) { e.target.value = stav.recept.zaklad; return; }
        zmena((s) => { s.recept.zaklad = e.target.value; });
      },
    }, Object.entries(ZAKLADY).map(([k, z]) => h('option', { value: k, selected: k === stav.recept.zaklad }, `${z.nazev} – ${z.popis}`))),
    h('h2', {}, 'Hlavní barvy'),
    h('div', { class: 'poznamka' }, 'Barva se nastaví všem vrstvám dané skupiny. Jednotlivé vrstvy doladíš na kartě Vrstvy.'),
    polozky,
    h('h2', {}, 'Paleta ČT'),
    h('div', { class: 'paleta' }, PALETA_CT.map((b) => h('span', { class: 'vzorek', title: b }, h('span', { style: `background:${b}` })))),
    h('div', { class: 'poznamka' }, 'Hlavní modrá #001464 je barva písma v grafikách. Odvozené odstíny a ladicí barvy nabízí výběr barvy po kliknutí na vzorek.'),
  ];
}

// ---- Vrstvy
function panelVrstvy() {
  if (!posledniStyl) return h('p', { class: 'poznamka' }, 'Načítám…');
  const pridanaIds = new Set(stav.recept.pridane.map((p) => p.vrstva.id));
  const podleSkupin = new Map(SKUPINY.map(([k]) => [k, []]));
  for (const l of posledniStyl.layers) podleSkupin.get(skupina(l))?.push(l);

  const vlastni = h('div', { class: 'tlacitka' },
    Object.entries(VLASTNI).map(([k, v]) => pridanaIds.has(v.vrstva.id)
      ? h('button', { class: 'tl tl-male tl-zapnuto', title: 'Kliknutím vrstvu odebereš', onclick: () => odeberVlastni(v.vrstva.id) }, `✓ ${v.nazev}`)
      : h('button', { class: 'tl tl-male', onclick: () => pridejVlastni(k) }, `+ ${v.nazev}`)),
    pridanaIds.has('bod_city')
      ? h('button', { class: 'tl tl-male tl-zapnuto', title: 'Kliknutím body odebereš', onclick: odeberBodySidel }, '✓ Barevné body sídel')
      : h('button', { class: 'tl tl-male', onclick: pridejBodySidel }, '+ Barevné body sídel'));

  return [
    h('h2', {}, 'Přidat vlastní vrstvy'),
    vlastni,
    h('div', { class: 'poznamka' }, 'Zapnuté vrstvy mají ✓, dalším kliknutím je odebereš. Barevné body sídel nahradí černé puntíky (ty přebarvit nejde).'),
    h('h2', {}, `Všechny vrstvy (${posledniStyl.layers.length})`),
    h('div', { class: 'tlacitka' },
      h('button', { class: 'tl tl-male', onclick: () => zmena(() => posledniStyl.layers.forEach((l) => { upravy(l.id).skryta = false; })) }, 'Zapnout vše'),
      h('button', { class: 'tl tl-male', onclick: () => zmena(() => posledniStyl.layers.forEach((l) => { if (l.type !== 'background') upravy(l.id).skryta = true; })) }, 'Vypnout vše kromě pevniny'),
      h('button', { class: 'tl tl-male', onclick: () => { otevreneSkupiny.clear(); vykresliPanel(); } }, 'Sbalit')),
    SKUPINY.map(([k, nazev]) => {
      const vrstvy = podleSkupin.get(k);
      if (!vrstvy.length) return null;
      const vid = vrstvy.filter(jeViditelna).length;
      const zaskrt = h('input', { type: 'checkbox', checked: vid === vrstvy.length, onclick: (e) => e.stopPropagation(),
        onchange: (e) => zmena(() => vrstvy.forEach((l) => { upravy(l.id).skryta = !e.target.checked; })) });
      zaskrt.indeterminate = vid > 0 && vid < vrstvy.length;
      const otevrena = otevreneSkupiny.has(k);
      return h('div', { class: `skupina${otevrena ? ' otevrena' : ''}` },
        h('header', { onclick: () => { otevrena ? otevreneSkupiny.delete(k) : otevreneSkupiny.add(k); vykresliPanel(); } },
          zaskrt, h('span', { class: 'nazev-skupiny' }, nazev), h('span', { class: 'pocet' }, `${vid}/${vrstvy.length}`), h('span', { class: 'sipka' }, '›')),
        otevrena ? h('div', { class: 'vrstvy-skupiny' }, vrstvy.map((l) => radekVrstvy(l, pridanaIds.has(l.id)))) : null);
    }),
  ];
}

function radekVrstvy(l, pridana) {
  const otevrena = otevreneVrstvy.has(l.id);
  const vid = jeViditelna(l);
  const barvy = (BARVY_VRSTVY[l.type] || []).filter((p) => l.paint?.[p] != null || p === BARVY_VRSTVY[l.type][0]);
  return h('div', { class: `vrstva${otevrena ? ' otevrena' : ''}${vid ? '' : ' skryta'}` },
    h('div', { class: 'hlava' },
      h('input', { type: 'checkbox', checked: vid, title: vid ? 'Skrýt vrstvu' : 'Zobrazit vrstvu', onchange: (e) => zmena(() => { upravy(l.id).skryta = !e.target.checked; }) }),
      h('div', { class: 'jmeno', onclick: () => { otevrena ? otevreneVrstvy.delete(l.id) : otevreneVrstvy.add(l.id); vykresliPanel(); } },
        nazevVrstvy(l), h('small', {}, `${l.id} · ${l.type}${l.minzoom != null ? ` · od ${l.minzoom}` : ''}${l.maxzoom != null ? ` · do ${l.maxzoom}` : ''}`)),
      jeUpravena(l.id) || pridana ? h('span', { class: 'upraveno', title: pridana ? 'Vlastní vrstva' : 'Upravená vrstva' }) : null,
      barvy.slice(0, 2).map((p) => vzorekBarvy(l.paint?.[p] ?? '#000000',
        (e) => otevriVybirac(e.currentTarget, typeof l.paint?.[p] === 'string' ? l.paint[p] : '#001464',
          (b, klic) => zmena(() => nastav(l.id, 'paint', p, b), { klic, prekreslit: false }),
          { pozadi: p === 'text-color' ? barvaPevniny() : null }),
        POPISY_VLASTNOSTI[p])),
      h('span', { class: 'sipka', onclick: () => { otevrena ? otevreneVrstvy.delete(l.id) : otevreneVrstvy.add(l.id); vykresliPanel(); } }, '›')),
    otevrena ? h('div', { class: 'upravy' }, upravyVrstvy(l, pridana)) : null);
}

const PISMA = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'];
const UKOTVENI = [
  ['', 'Výchozí'], ['bottom', 'Text nad bodem'], ['top', 'Text pod bodem'], ['left', 'Text vpravo od bodu'],
  ['right', 'Text vlevo od bodu'], ['center', 'Text přímo na bodu'], ['bottom-left', 'Vpravo nahoře'],
  ['bottom-right', 'Vlevo nahoře'], ['top-left', 'Vpravo dole'], ['top-right', 'Vlevo dole'],
];
const CARKOVANI = [['', 'Výchozí'], ['plna', 'Plná'], ['3,2', 'Čárkovaná'], ['1,2', 'Tečkovaná'], ['4,2,1,2', 'Čerchovaná']];

function upravyVrstvy(l, pridana) {
  const u = stav.recept.vrstvy[l.id] || {};
  const prvky = [];
  const k = (x) => `${l.id}-${x}`;

  // Barvy
  for (const p of BARVY_VRSTVY[l.type] || []) {
    const v = l.paint?.[p];
    prvky.push(h('div', { class: 'radek' }, h('span', { class: 'popis' }, POPISY_VLASTNOSTI[p] || p),
      h('code', {}, typeof v === 'string' ? v : v == null ? 'nenastaveno' : 'výraz'),
      vzorekBarvy(v ?? '#000000', (e) => otevriVybirac(e.currentTarget, typeof v === 'string' ? v : '#001464',
        (b, klic) => zmena(() => nastav(l.id, 'paint', p, b), { klic, prekreslit: false }),
        { pozadi: p === 'text-color' ? barvaPevniny() : null }))));
  }

  // Krytí
  const kp = KRYTI_VRSTVY[l.type];
  if (kp) {
    const v = l.paint?.[kp];
    prvky.push(posuvnik('Krytí', typeof v === 'number' ? v : 1, {
      min: 0, max: 1, krok: 0.05, format: (x) => `${Math.round(x * 100)} %`, klic: k('kryti'),
      nastav: (x) => nastav(l.id, 'paint', kp, x),
    }));
    if (Array.isArray(v)) prvky.push(h('div', { class: 'poznamka' }, 'Krytí se teď mění s přiblížením; posuvník ho nastaví napevno.'));
  }

  if (l.type === 'line') {
    prvky.push(posuvnik('Šířka čáry', u.sirka || 1, {
      min: 0.25, max: 5, krok: 0.05, format: (x) => `× ${cislo(x)}`, klic: k('sirka'),
      nastav: (x) => { upravy(l.id).sirka = x === 1 ? undefined : x; },
    }));
    const dash = u.paint && 'line-dasharray' in u.paint ? (u.paint['line-dasharray'] ? u.paint['line-dasharray'].join(',') : 'plna') : '';
    prvky.push(h('div', { class: 'radek' }, h('label', {}, 'Styl čáry'),
      h('select', {
        onchange: (e) => zmena(() => {
          const v = e.target.value;
          if (!v) zrusNastaveni(l.id, 'paint', 'line-dasharray');
          else nastav(l.id, 'paint', 'line-dasharray', v === 'plna' ? null : v.split(',').map(Number));
        }),
      }, CARKOVANI.map(([v, t]) => h('option', { value: v, selected: v === dash }, t)))));
  }
  if (l.type === 'circle') {
    prvky.push(posuvnik('Velikost bodu', u.sirka || 1, {
      min: 0.25, max: 5, krok: 0.05, format: (x) => `× ${cislo(x)}`, klic: k('sirka'),
      nastav: (x) => { upravy(l.id).sirka = x === 1 ? undefined : x; },
    }));
    const sw = l.paint?.['circle-stroke-width'];
    prvky.push(posuvnik('Obrys bodu', typeof sw === 'number' ? sw : 0, {
      min: 0, max: 4, krok: 0.1, format: (x) => `${cislo(x, 1)} px`, klic: k('obrys'),
      nastav: (x) => nastav(l.id, 'paint', 'circle-stroke-width', x),
    }));
  }

  if (l.type === 'symbol' && l.layout?.['text-field']) {
    const pismo = Array.isArray(l.layout['text-font']) ? l.layout['text-font'][0] : 'Noto Sans Regular';
    prvky.push(h('div', { class: 'radek' }, h('label', {}, 'Písmo'),
      h('select', { onchange: (e) => zmena(() => nastav(l.id, 'layout', 'text-font', [e.target.value])) },
        PISMA.map((p) => h('option', { value: p, selected: p === pismo }, p.replace('Noto Sans ', '').replace('Regular', 'Obyčejné').replace('Bold', 'Tučné').replace('Italic', 'Kurzíva'))))));
    prvky.push(posuvnik('Velikost písma', u.velikost || 1, {
      min: 0.5, max: 2.5, krok: 0.05, format: (x) => `× ${cislo(x)}`, klic: k('velikost'),
      nastav: (x) => { upravy(l.id).velikost = x === 1 ? undefined : x; },
    }));
    prvky.push(h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: l.layout['text-transform'] === 'uppercase', onchange: (e) => zmena(() => nastav(l.id, 'layout', 'text-transform', e.target.checked ? 'uppercase' : 'none')) }),
      'Verzálky (VELKÁ PÍSMENA)'));
    const ls = l.layout['text-letter-spacing'];
    prvky.push(posuvnik('Prostrkání', typeof ls === 'number' ? ls : 0, {
      min: 0, max: 0.5, krok: 0.01, format: (x) => cislo(x), klic: k('prostrkani'),
      nastav: (x) => nastav(l.id, 'layout', 'text-letter-spacing', x),
    }));
    const hw = l.paint?.['text-halo-width'];
    prvky.push(posuvnik('Šířka obrysu', typeof hw === 'number' ? hw : 0, {
      min: 0, max: 4, krok: 0.1, format: (x) => `${cislo(x, 1)} px`, klic: k('halo'),
      nastav: (x) => nastav(l.id, 'paint', 'text-halo-width', x),
    }));
    const off = Array.isArray(l.layout['text-offset']) && typeof l.layout['text-offset'][0] === 'number' ? l.layout['text-offset'] : [0, 0];
    const offU = u.layout?.['text-offset'];
    const offAkt = Array.isArray(offU) ? offU : off;
    prvky.push(posuvnik('Odsazení vodorovně', offAkt[0], {
      min: -4, max: 4, krok: 0.05, format: (x) => `${cislo(x)} em`, klic: k('offx'),
      nastav: (x) => { const t = upravy(l.id).layout?.['text-offset'] || [...offAkt]; nastav(l.id, 'layout', 'text-offset', [x, t[1]]); },
    }));
    prvky.push(posuvnik('Odsazení svisle', offAkt[1], {
      min: -4, max: 4, krok: 0.05, format: (x) => `${cislo(x)} em`, klic: k('offy'),
      nastav: (x) => { const t = upravy(l.id).layout?.['text-offset'] || [...offAkt]; nastav(l.id, 'layout', 'text-offset', [t[0], x]); },
    }));
    const kotva = u.layout?.['text-anchor'] ?? '';
    prvky.push(h('div', { class: 'radek' }, h('label', {}, 'Umístění textu'),
      h('select', {
        onchange: (e) => zmena(() => {
          if (e.target.value) nastav(l.id, 'layout', 'text-anchor', e.target.value);
          else zrusNastaveni(l.id, 'layout', 'text-anchor');
        }),
      }, UKOTVENI.map(([v, t]) => h('option', { value: v, selected: v === kotva }, t)))));
    if (l['source-layer'] === 'place' && l.id.startsWith('label_')) {
      const ikona = u.layout && 'icon-image' in u.layout ? (u.layout['icon-image'] === 'circle_11_black' ? 'vzdy' : 'nikdy') : 'vychozi';
      prvky.push(h('div', { class: 'radek' }, h('label', {}, 'Černý puntík'),
        h('select', {
          onchange: (e) => zmena(() => {
            const v = e.target.value;
            if (v === 'vychozi') zrusNastaveni(l.id, 'layout', 'icon-image');
            else nastav(l.id, 'layout', 'icon-image', v === 'vzdy' ? 'circle_11_black' : null);
          }),
        }, [['vychozi', 'Podle podkladu'], ['vzdy', 'Vždy'], ['nikdy', 'Nikdy']].map(([v, t]) => h('option', { value: v, selected: v === ikona }, t)))));
    }
  }

  // Přiblížení
  const zoomPole = (popis, klic) => h('div', { class: 'radek' }, h('label', {}, popis),
    h('input', {
      type: 'number', min: 0, max: 24, step: 0.5, value: l[klic] ?? '', placeholder: '—',
      onchange: (e) => zmena(() => {
        const v = e.target.value === '' ? null : Math.max(0, Math.min(24, parseFloat(e.target.value)));
        upravy(l.id)[klic] = v;
      }),
    }));
  prvky.push(zoomPole('Zobrazit od přiblížení', 'minzoom'), zoomPole('Zobrazit do přiblížení', 'maxzoom'));

  prvky.push(h('div', { class: 'tlacitka' },
    !pridana ? h('button', {
      class: 'tl tl-male', onclick: () => zmena((s) => {
        const skryta = s.recept.vrstvy[l.id]?.skryta;
        delete s.recept.vrstvy[l.id];
        if (skryta) upravy(l.id).skryta = true;
      }),
    }, 'Vrátit vzhled podkladu') : null,
    pridana ? h('button', { class: 'tl tl-male tl-nebezpecne', onclick: () => odeberVlastni(l.id) }, 'Odebrat vrstvu') : null));
  return prvky;
}

// ---- Popisky
function panelPopisky() {
  const pop = stav.recept.popisky;
  return [
    h('h2', {}, 'Popisky a data'),
    h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: stav.nahled.popiskyNadDaty, onchange: (e) => { stav.nahled.popiskyNadDaty = e.target.checked; poZmene(false); } }),
      'Popisky nad daty'),
    h('div', { class: 'poznamka' }, 'Platí pro náhled. Ve Flourishi o tom rozhoduje nastavení šablony „Draw them above the data“ – styl je na obojí připravený.'),
    h('h2', {}, 'Jednotlivé názvy'),
    h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: vyberovyRezim, onchange: (e) => nastavVyberovyRezim(e.target.checked) }),
      'Vybírat názvy kliknutím v mapě'),
    h('div', { class: 'poznamka' }, 'Klikni na název v mapě a můžeš ho skrýt nebo posunout. Hodí se, když název zakrývá data.'),
    h('h2', {}, `Skryté názvy (${pop.skryteNazvy.length})`),
    pop.skryteNazvy.length ? pop.skryteNazvy.map((n) => h('div', { class: 'radek' }, h('span', { class: 'popis' }, n),
      h('button', { class: 'tl tl-male', onclick: () => zmena((s) => { s.recept.popisky.skryteNazvy = s.recept.popisky.skryteNazvy.filter((x) => x !== n); }) }, 'Zobrazit')))
      : h('p', { class: 'poznamka' }, 'Žádné.'),
    h('h2', {}, `Posunuté názvy (${Object.keys(pop.posuny).length})`),
    Object.keys(pop.posuny).length ? Object.entries(pop.posuny).map(([n, p]) => h('div', { class: 'radek' }, h('span', { class: 'popis' }, `${n} (${cislo(p[0])}; ${cislo(p[1])} em)`),
      h('button', { class: 'tl tl-male', onclick: () => zmena((s) => { delete s.recept.popisky.posuny[n]; }) }, 'Vrátit')))
      : h('p', { class: 'poznamka' }, 'Žádné.'),
    h('div', { class: 'poznamka' }, 'Velikost, písmo, odsazení a umístění celé skupiny popisků nastavíš na kartě Vrstvy po rozkliknutí vrstvy.'),
  ];
}

// ---- Data
function panelData() {
  const n = stav.nahled;
  const zmenNahled = (fn, prekreslit = true) => { fn(n); poZmene(prekreslit); };
  const typ = DATA[n.sada]?.typ;
  return [
    h('h2', {}, 'Zkušební data v náhledu'),
    h('div', { class: 'poznamka' }, 'Jen pro kontrolu čitelnosti. Do staženého stylu se nedostanou.'),
    h('select', { class: 'pole', onchange: (e) => zmenNahled((x) => { x.sada = e.target.value; }) },
      Object.entries(DATA).map(([k, d]) => h('option', { value: k, selected: k === n.sada }, d.nazev))),
    n.sada !== 'zadna' ? posuvnik('Krytí dat', n.kryti, {
      min: 0.05, max: 1, krok: 0.05, format: (x) => `${Math.round(x * 100)} %`, klic: 'data-kryti',
      nastav: (x) => { n.kryti = x; ul.ulozRozpracovane(stav); naplanujMapu(); },
    }) : null,
    (typ === 'plochy' || n.sada === 'body_skala') ? h('div', { class: 'radek' }, h('label', {}, 'Barevná škála'),
      h('select', { onchange: (e) => zmenNahled((x) => { x.skala = e.target.value; }) },
        Object.entries(SKALY).map(([k, s]) => h('option', { value: k, selected: k === n.skala }, s.nazev)))) : null,
    h('h2', {}, 'Vlastní data'),
    h('div', { class: 'tlacitka' }, h('button', { class: 'tl', onclick: () => vyberSoubor(nahrajData, '.csv,.tsv,.txt,.json,.geojson') }, 'Nahrát CSV nebo GeoJSON')),
    h('div', { class: 'poznamka' }, vlastniData()
      ? `Nahráno: ${vlastniData().nazev} (${vlastniData().geojson.features.length} prvků).`
      : 'CSV potřebuje sloupce se souřadnicemi (lat a lon, latitude a longitude, šířka a délka). Oddělovač čárka, středník i tabulátor, desetinná čárka nevadí.'),
    n.sada === 'vlastni' && vlastniData() ? [
      h('div', { class: 'radek' }, h('label', {}, 'Barvit'),
        h('select', { onchange: (e) => zmenNahled((x) => { x.vlastniBarvit = e.target.value; }) },
          [['jedna', 'Jednou barvou'], ['kategorie', 'Podle kategorií (paleta ČT)'], ['skala', 'Podle čísel (škála)']]
            .map(([v, t]) => h('option', { value: v, selected: v === (n.vlastniBarvit || 'jedna') }, t)))),
      n.vlastniBarvit && n.vlastniBarvit !== 'jedna' ? h('div', { class: 'radek' }, h('label', {}, 'Sloupec'),
        h('select', { onchange: (e) => zmenNahled((x) => { x.vlastniSloupec = e.target.value; }) },
          h('option', { value: '' }, '— vyber —'),
          vlastniData().sloupce.filter((c) => n.vlastniBarvit !== 'skala' || c.ciselny)
            .map((c) => h('option', { value: c.nazev, selected: c.nazev === n.vlastniSloupec }, `${c.nazev}${c.ciselny ? ' (čísla)' : ` (${c.ruznych} hodnot)`}`)))) : null,
      n.vlastniBarvit === 'skala' ? h('div', { class: 'radek' }, h('label', {}, 'Škála'),
        h('select', { onchange: (e) => zmenNahled((x) => { x.skala = e.target.value; }) },
          Object.entries(SKALY).map(([k, sk]) => h('option', { value: k, selected: k === n.skala }, sk.nazev)))) : null,
      h('div', { class: 'tlacitka' }, h('button', { class: 'tl tl-male', onclick: () => priblizNaData() }, 'Přiblížit na data')),
    ] : null,
    (n.sada === 'body_modre' || (n.sada === 'vlastni' && (n.vlastniBarvit || 'jedna') === 'jedna')) ? h('div', { class: 'radek' }, h('span', { class: 'popis' }, 'Barva'),
      vzorekBarvy(n.barvaBodu, (e) => otevriVybirac(e.currentTarget, n.barvaBodu, (b) => zmenNahled((x) => { x.barvaBodu = b; }, false)))) : null,
    h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: n.popiskyNadDaty, onchange: (e) => zmenNahled((x) => { x.popiskyNadDaty = e.target.checked; }) }),
      'Popisky nad daty'),
    h('div', { class: 'poznamka' }, 'Škály Reds, Blues a Oranges odpovídají předlohám ColorBrewer, ze kterých vychází Flourish. Vlastní data zůstávají jen v tomto prohlížeči a do stylu se nedostanou.'),
  ];
}

async function nahrajData(text, jmeno) {
  try {
    const g = prectiSoubor(text, jmeno);
    nastavVlastniData(jmeno, g);
    stav.nahled.sada = 'vlastni';
    stav.nahled.vlastniBarvit = stav.nahled.vlastniBarvit || 'jedna';
    poZmene();
    priblizNaData();
    hlaska(`Nahráno ${g.features.length} prvků z ${jmeno}.`);
  } catch (e) {
    hlaska(`Soubor se nepodařilo načíst: ${e.message}`, true);
  }
}

function priblizNaData() {
  const d = vlastniData();
  const b = d && hraniceDat(d.geojson);
  if (b && mapa) mapa.fitBounds(b, { padding: 60, maxZoom: 9, duration: 600 });
}

// ---- Nastavení
function panelNastaveni() {
  const n = ul.napojeni();
  const url = h('input', { class: 'pole', placeholder: 'https://script.google.com/macros/s/…/exec', value: n.url || '' });
  const heslo = h('input', { class: 'pole', type: 'password', placeholder: 'Týmové heslo', value: n.heslo || '' });
  const autor = h('input', { class: 'pole', placeholder: 'Tvoje jméno (ukládá se k šablonám)', value: n.autor || '' });
  const uloz = () => ul.ulozNapojeni({ url: url.value.trim(), heslo: heslo.value, autor: autor.value.trim() });
  return [
    h('h2', {}, 'Mapa'),
    h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: stav.recept.mapa.glob, onchange: (e) => zmena((s) => { s.recept.mapa.glob = e.target.checked; }) }),
      'Zobrazit jako glóbus'),
    h('div', { class: 'poznamka' }, 'Glóbus se při oddálení neopakuje. Ve Flourishi funguje jen s MapLibre od verze 5.'),
    h('h2', {}, 'Týmová tabulka šablon'),
    h('div', { class: 'radek' }, h('label', {}, 'Adresa skriptu')), url,
    h('div', { class: 'radek' }, h('label', {}, 'Heslo')), heslo,
    h('div', { class: 'radek' }, h('label', {}, 'Jméno')), autor,
    h('div', { class: 'tlacitka' },
      h('button', {
        class: 'tl tl-modre', onclick: async () => {
          uloz();
          if (!url.value.trim()) { hlaska('Napojení zrušeno, šablony se ukládají jen do prohlížeče.'); sablony = null; return; }
          try {
            const pocet = await ul.vyzkousejNapojeni();
            hlaska(`Napojeno. V tabulce je šablon: ${pocet}.`);
            sablony = null;
          } catch (e) { hlaska(`Napojení nefunguje: ${e.message}`, true); }
        },
      }, 'Uložit a vyzkoušet')),
    h('div', { class: 'poznamka' }, 'Adresa a heslo se ukládají jen v tomto prohlížeči. Návod na zprovoznění skriptu je v souboru apps-script/Kod.gs v úložišti.'),
    h('h2', {}, 'O editoru'),
    h('div', { class: 'poznamka' }, 'Podklad: OpenFreeMap, data © OpenStreetMap (licence ODbL) – atribuce musí v mapě zůstat. Hranice krajů: Natural Earth (volné dílo).'),
  ];
}

// ---------------------------------------------------------------- stažení stylu

let validator = null;
async function overStyl(styl) {
  try {
    validator = validator || await import('https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-style-spec@24/+esm');
    return validator.validateStyleMin(styl).map((e) => e.message);
  } catch (e) {
    console.warn('Kontrola stylu nedostupná', e);
    return null;
  }
}

async function stahniStyl() {
  try {
    const styl = await sestavStyl(stav.recept, { export: true, nazev: stav.meta.nazev || 'Mapa' });
    const chyby = await overStyl(styl);
    if (chyby && chyby.length) {
      console.error(chyby);
      if (!confirm(`Styl má ${chyby.length} chyb(y):\n\n${chyby.slice(0, 5).join('\n')}\n\nStáhnout přesto?`)) return;
    }
    const jmeno = `${ul.noveId(stav.meta.nazev || 'mapa').replace(/-[a-z0-9]+$/, '')}.json`;
    stahniSoubor(jmeno, styl, true);
    hlaska(chyby === null ? 'Staženo. Kontrolu stylu se nepodařilo spustit, ověř ho prosím ve Flourishi.' : 'Staženo, styl je platný.');
  } catch (e) {
    hlaska(`Stažení se nepovedlo: ${e.message}`, true);
  }
}

function stahniSoubor(jmeno, data, kompaktne = false) {
  const blob = new Blob([JSON.stringify(data, null, kompaktne ? 0 : 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: jmeno });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function vyberSoubor(poNacteni, prijima = '.json,application/json') {
  const vstup = $('#soubor');
  vstup.accept = prijima;
  vstup.value = '';
  vstup.onchange = async () => {
    const f = vstup.files[0];
    if (f) poNacteni(await f.text(), f.name);
  };
  vstup.click();
}

// ---------------------------------------------------------------- drobnosti

let hlaskaCasovac = null;
function hlaska(text, chyba = false) {
  const el = $('#hlaska');
  el.textContent = text;
  el.classList.toggle('chyba', chyba);
  el.classList.add('videt');
  clearTimeout(hlaskaCasovac);
  hlaskaCasovac = setTimeout(() => el.classList.remove('videt'), chyba ? 6000 : 3500);
}

// ---------------------------------------------------------------- start

document.querySelectorAll('.karty button').forEach((b) => b.addEventListener('click', () => { karta = b.dataset.karta; vykresliPanel(); }));
$('#nazev-sablony').addEventListener('input', (e) => zmena((s) => { s.meta.nazev = e.target.value; }, { klic: 'nazev', prekreslit: false }));
$('#zpet').addEventListener('click', zpet);
$('#znovu').addEventListener('click', znovu);
$('#ulozit').addEventListener('click', () => ulozit(false));
$('#stahnout').addEventListener('click', stahniStyl);
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.target.matches('input[type=text], input:not([type]), textarea')) return;
  if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); zpet(); }
  if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); znovu(); }
});

aktualizujListu();
if (!ulozeny?.recept) {
  novaMapa('liberty', 'svetla', false);
} else {
  vykresliPanel();
  aktualizujMapu();
}
