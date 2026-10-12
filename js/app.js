import { ZAKLADY, sestavStyl, prazdnyRecept, doplnRecept, receptZeStylu, kopie, polygonyMasky, hraniceGeometrie } from './styl.js';
import { PALETA_CT, SKALY, odstiny, ladici, hex, kontrast, smichej } from './barvy.js';
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
const novaMeta = (nazev = 'Nová mapa') => ({ id: null, nazev, popis: '', autor: '', upravil: '', vytvoreno: null, upraveno: null });
let stav = {
  meta: novaMeta(),
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
let karta = 'barvy';
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
    historie.push({ s: snimek(), cas: ted });
    if (historie.length > 200) historie.shift();
    budouci = [];
  }
  posledniKlic = klic;
  posledniCas = ted;
  fn(stav);
  stav.ulozeno = false;
  poZmene(prekreslit);
}

// Panel se kreslí až z hotového stylu, jinak by ukazoval staré hodnoty.
let prekreslitPoStylu = false;
function poZmene(prekreslit = true) {
  ul.ulozRozpracovane(stav);
  aktualizujListu();
  if (prekreslit) prekreslitPoStylu = true;
  naplanujMapu();
}

function obnovSnimek(retezec) {
  const s = JSON.parse(retezec);
  stav.meta = s.meta; stav.recept = doplnRecept(s.recept); stav.ulozeno = false;
  posledniKlic = null;
  poZmene();
}
function zpet(kroku = 1) {
  for (let i = 0; i < kroku && historie.length; i++) {
    budouci.push({ s: snimek(), cas: Date.now() });
    const k = historie.pop();
    stav.meta = JSON.parse(k.s).meta; stav.recept = JSON.parse(k.s).recept;
  }
  obnovSnimek(snimek());
}
function znovu() {
  if (!budouci.length) return;
  historie.push({ s: snimek(), cas: Date.now() });
  obnovSnimek(budouci.pop().s);
}

// Krátký popis kroku: co se změnilo mezi dvěma stavy.
function popisKroku(predtim, potom) {
  const a = JSON.parse(predtim); const b = JSON.parse(potom);
  const zmeny = [];
  if (a.meta.nazev !== b.meta.nazev) zmeny.push('název mapy');
  if (a.recept.zaklad !== b.recept.zaklad) zmeny.push('podklad');
  if (JSON.stringify(a.recept.maska) !== JSON.stringify(b.recept.maska)) zmeny.push('maska');
  if (JSON.stringify(a.recept.popisky) !== JSON.stringify(b.recept.popisky)) zmeny.push('jednotlivé názvy');
  if (JSON.stringify(a.recept.mapa) !== JSON.stringify(b.recept.mapa)) zmeny.push('glóbus');
  const pa = a.recept.pridane.map((x) => x.vrstva.id); const pb = b.recept.pridane.map((x) => x.vrstva.id);
  pb.filter((x) => !pa.includes(x)).forEach((x) => zmeny.push(`+ ${nazevVrstvy({ id: x })}`));
  pa.filter((x) => !pb.includes(x)).forEach((x) => zmeny.push(`− ${nazevVrstvy({ id: x })}`));
  const ids = new Set([...Object.keys(a.recept.vrstvy), ...Object.keys(b.recept.vrstvy)]);
  const vr = [...ids].filter((id) => JSON.stringify(a.recept.vrstvy[id]) !== JSON.stringify(b.recept.vrstvy[id]));
  if (vr.length > 3) zmeny.push(`${vr.length} vrstev`);
  else vr.forEach((id) => zmeny.push(nazevVrstvy({ id })));
  return zmeny.length ? zmeny.slice(0, 3).join(', ') : 'beze změny vzhledu';
}

function otevriHistorii(kotva) {
  const box = $('#vybirac');
  if (vybiracZavri) vybiracZavri(false);
  const polozky = [];
  let dalsi = snimek();
  for (let i = historie.length - 1; i >= 0 && polozky.length < 40; i--) {
    const k = historie[i];
    const pocet = historie.length - i;
    const sekund = Math.round((Date.now() - k.cas) / 1000);
    const kdy = sekund < 60 ? `před ${sekund} s` : sekund < 3600 ? `před ${Math.round(sekund / 60)} min` : new Date(k.cas).toLocaleTimeString('cs');
    polozky.push(h('button', { class: 'volba', onclick: () => { zavri(); zpet(pocet); } },
      `Vrátit: ${popisKroku(k.s, dalsi)}`, h('small', {}, kdy)));
    dalsi = k.s;
  }
  box.replaceChildren(h('h3', {}, `Historie úprav (${historie.length})`),
    polozky.length ? h('div', { class: 'seznam-voleb' }, polozky) : h('p', { class: 'poznamka' }, 'Zatím žádné úpravy.'),
    h('div', { class: 'poznamka' }, 'Kliknutím se vrátíš do stavu před danou úpravou. Vrácené kroky obnovíš tlačítkem ↷.'));
  box.hidden = false;
  const r = kotva.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(r.left - 160, innerWidth - 348))}px`;
  box.style.top = `${r.bottom + 6}px`;
  const venku = (e) => { if (!box.contains(e.target) && e.target !== kotva) zavri(); };
  function zavri() { box.hidden = true; document.removeEventListener('mousedown', venku); vybiracZavri = null; }
  setTimeout(() => document.addEventListener('mousedown', venku));
  vybiracZavri = zavri;
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
    styl = await sestavStyl(stav.recept, { nazev: stav.meta.nazev, zvyraznitVyber: vyberovyRezim });
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
  // Panel se překreslí po změně (ne při tažení posuvníku) nebo když přibyla či ubyla vrstva.
  if (prekreslitPoStylu || jineVrstvy) { prekreslitPoStylu = false; vykresliPanel(); }
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
  const nazev = nazevPrvku(s.properties);
  if (stav.recept.popisky.jenVybrane) {
    const zapnout = !stav.recept.popisky.vybraneNazvy.includes(nazev);
    zmena((st) => {
      const v = st.recept.popisky.vybraneNazvy;
      if (zapnout) v.push(nazev); else v.splice(v.indexOf(nazev), 1);
    });
    hlaska(zapnout ? `Zobrazí se: ${nazev}` : `Skryto: ${nazev}`);
  }
  vybranyNazev = nazev;
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
  naplanujMapu();
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
    if (prekreslit && zmeneno) setTimeout(() => { if ($('#vybirac').hidden) { prekreslitPoStylu = true; naplanujMapu(); } }, 250);
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
  stav.meta = novaMeta();
  stav.recept = recept;
  stav.ulozeno = true;
  poZmene();
}

// ---------------------------------------------------------------- panely

function vykresliPanel() {
  document.querySelectorAll('.karty button').forEach((b) => b.classList.toggle('aktivni', b.dataset.karta === karta));
  const obsah = $('#obsah-panelu');
  const scroll = obsah.scrollTop;
  const fn = { barvy: panelBarvy, vrstvy: panelVrstvy, maska: panelMaska, popisky: panelPopisky, data: panelData, nastaveni: panelNastaveni }[karta];
  obsah.replaceChildren(...[fn()].flat(Infinity).filter((x) => x != null && x !== false));
  obsah.scrollTop = scroll;
  vykresliVyberNazvu();
}

function aktualizujListu() {
  const n = $('#nazev-sablony');
  if (document.activeElement !== n) n.value = stav.meta.nazev || '';
  const st = $('#stav-ulozeni');
  st.textContent = stav.ulozeno ? (stav.meta.id ? 'uloženo' : '') : 'neuložené změny';
  st.classList.toggle('neulozeno', !stav.ulozeno);
  $('#zpet').disabled = !historie.length;
  $('#historie').disabled = !historie.length;
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
      onchange: () => { prekreslitPoStylu = true; naplanujMapu(); },
    }),
    vystup);
}

const cislo = (x, d = 2) => String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ',');

// ---- Týmové mapy (okno Mapy, uložení, úvodní obrazovka)
let sablony = null;
let zdrojSablon = null;
let nacitamSablony = false;

const datum = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 19 ? `${iso}Z` : iso);
  if (Number.isNaN(+d)) return iso.replace('T', ' ').slice(0, 16);
  const cas = d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const dnes = new Date();
  if (d.toDateString() === dnes.toDateString()) return `dnes ${cas}`;
  const vcera = new Date(dnes); vcera.setDate(dnes.getDate() - 1);
  if (d.toDateString() === vcera.toDateString()) return `včera ${cas}`;
  return `${d.getDate()}. ${d.getMonth() + 1}.${d.getFullYear() !== dnes.getFullYear() ? ` ${d.getFullYear()}` : ''} ${cas}`;
};

function nastavKontrolku(stavTabulky, text) {
  const k = $('#stav-tabulky');
  k.dataset.stav = stavTabulky;
  k.lastChild.textContent = text || 'Tabulka';
  k.title = {
    ok: 'Týmová tabulka připojená – kliknutím načíst mapy znovu',
    nacitam: 'Načítám mapy z týmové tabulky…',
    chyba: 'Týmová tabulka neodpovídá – kliknutím zkusit znovu',
  }[stavTabulky] || '';
}

async function nactiSablony() {
  nacitamSablony = true;
  nastavKontrolku('nacitam');
  if (mapyUI.otevreno) vykresliMapy();
  try {
    const r = await ul.seznamSablon();
    sablony = r.sablony;
    zdrojSablon = r.zdroj;
    nastavKontrolku(r.zdroj === 'tabulka' ? 'ok' : 'chyba', r.zdroj === 'tabulka' ? 'Tabulka' : 'Jen prohlížeč');
  } catch (e) {
    nastavKontrolku('chyba', 'Tabulka neodpovídá');
    if (e.spatneHeslo) { ul.zapomenHeslo(); zobrazUvod('Týmové heslo se změnilo. Zadej nové.'); }
    else hlaska(`Mapy se nepodařilo načíst: ${e.message}`, true);
    sablony = sablony || [];
  }
  nacitamSablony = false;
  if (mapyUI.otevreno) vykresliMapy();
}

const pocitejSvetlost = (barva) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex(barva) || '');
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

// Barvy mapy z receptu – pro náhled karty bez obrázku a pro filtr Světlé/Tmavé.
function barvyMapy(recept) {
  const vrstvy = recept?.vrstvy || {};
  const najdi = (vl, vychozi) => {
    for (const u of Object.values(vrstvy)) {
      const v = u?.paint?.[vl];
      if (typeof v === 'string') return v;
    }
    return vychozi;
  };
  const zeme = najdi('background-color', '#f8f4f0');
  const more = (typeof vrstvy.water?.paint?.['fill-color'] === 'string' && vrstvy.water.paint['fill-color']) || '#a0c8f0';
  const kraje = vrstvy.kraje_hranice?.paint?.['line-color'];
  return { zeme, more, kraje: typeof kraje === 'string' && !vrstvy.kraje_hranice?.skryta ? kraje : null };
}

function obrazekKarty(s) {
  if (s.nahled && /^data:image\//.test(s.nahled)) return h('img', { src: s.nahled, alt: '', loading: 'lazy' });
  const b = barvyMapy(s.nastaveni);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 240 150');
  svg.setAttribute('aria-hidden', 'true');
  const tvar = (tag, atributy) => { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(atributy)) el.setAttribute(k, v); svg.append(el); };
  tvar('rect', { width: 240, height: 150, fill: b.more });
  tvar('path', { d: 'M0 150 L0 92 C22 84 34 64 58 62 C80 60 92 40 118 44 C140 48 150 30 176 34 C198 38 214 56 240 50 L240 150 Z', fill: b.zeme });
  if (b.kraje) tvar('path', { d: 'M52 66 C60 84 74 96 70 116 M104 50 C112 70 128 84 122 108 M150 40 C160 62 176 72 172 100 M196 46 C204 66 214 78 212 104', fill: 'none', stroke: b.kraje, 'stroke-width': 1, 'stroke-dasharray': '3 2', opacity: 0.8 });
  tvar('path', { d: 'M0 118 C40 110 70 126 112 112 C150 100 196 118 240 104', fill: 'none', stroke: pocitejSvetlost(b.zeme) > 0.5 ? '#001464' : '#a3aedb', 'stroke-width': 2, opacity: 0.6 });
  return svg;
}

// ---- okno Mapy
const mapyUI = {
  otevreno: false, zalozka: 'tymove', hledat: '', filtr: 'vse', razeni: 'upraveno', menu: null,
  nova: { zaklad: 'liberty', schema: 'svetla', cisty: true },
};

function otevriMapy(zalozka) {
  mapyUI.otevreno = true;
  if (zalozka) mapyUI.zalozka = zalozka;
  mapyUI.menu = null;
  $('#okno-map').hidden = false;
  if (!sablony && !nacitamSablony) nactiSablony();
  vykresliMapy();
  setTimeout(() => $('#okno-map .hledat input')?.focus(), 30);
}
function zavriMapy() {
  mapyUI.otevreno = false;
  $('#okno-map').hidden = true;
  $('#okno-map').replaceChildren();
}

function filtrovaneMapy() {
  const ja = ul.jmeno();
  const q = mapyUI.hledat.trim().toLowerCase();
  let vse = (sablony || []).filter((s) => {
    if (q && !`${s.nazev} ${s.popis} ${s.autor} ${s.upravil}`.toLowerCase().includes(q)) return false;
    if (mapyUI.filtr === 'moje') return !!ja && (s.autor === ja || s.upravil === ja);
    if (mapyUI.filtr === 'svetle' || mapyUI.filtr === 'tmave') {
      const svetla = pocitejSvetlost(barvyMapy(s.nastaveni).zeme) > 0.5;
      return mapyUI.filtr === 'svetle' ? svetla : !svetla;
    }
    return true;
  });
  vse = vse.slice().sort(mapyUI.razeni === 'nazev'
    ? (a, b) => (a.nazev || '').localeCompare(b.nazev || '', 'cs')
    : (a, b) => (b.upraveno || '').localeCompare(a.upraveno || ''));
  return vse;
}

function vykresliMapy() {
  const okno = $('#okno-map');
  if (!mapyUI.otevreno) return;
  const pocet = sablony ? sablony.length : null;
  const zalozka = (klic, text, cislo) => h('button', {
    class: `zalozka${mapyUI.zalozka === klic ? ' aktivni' : ''}`, role: 'tab', 'aria-selected': String(mapyUI.zalozka === klic),
    onclick: () => { mapyUI.zalozka = klic; mapyUI.menu = null; vykresliMapy(); },
  }, text, cislo != null ? h('span', { class: 'pocet' }, ` ${cislo}`) : null);
  const stavTabulky = $('#stav-tabulky').dataset.stav || 'nacitam';
  const okenko = h('section', { class: 'okno okno-map', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Mapy', onclick: (e) => e.stopPropagation() },
    h('header', { class: 'okno-hlava' },
      h('h1', {}, 'Mapy'),
      h('nav', { class: 'zalozky', role: 'tablist' }, zalozka('tymove', 'Týmové mapy', pocet), zalozka('nova', 'Nová mapa')),
      h('div', { class: 'okno-hlava-vpravo' },
        h('button', {
          class: 'kontrolka velka', 'data-stav': stavTabulky, onclick: () => nactiSablony(),
          title: 'Načíst mapy z tabulky znovu',
        }, h('span', { class: 'tecka' }), { ok: 'Týmová tabulka připojená', nacitam: 'Načítám mapy…', chyba: 'Tabulka neodpovídá – zkusit znovu' }[stavTabulky]),
        h('button', { class: 'zavrit', 'aria-label': 'Zavřít', onclick: zavriMapy }, '×'))),
    mapyUI.zalozka === 'tymove' ? obsahTymove() : obsahNova());
  okno.replaceChildren(okenko);
}

function obsahTymove() {
  const mapy = filtrovaneMapy();
  const filtr = (klic, text) => h('button', {
    class: `cip${mapyUI.filtr === klic ? ' zapnuto' : ''}`, 'aria-pressed': String(mapyUI.filtr === klic),
    onclick: () => { mapyUI.filtr = klic; vykresliMapy(); },
  }, text);
  const hledat = h('input', {
    type: 'search', placeholder: 'Hledat podle názvu, popisu nebo jména', 'aria-label': 'Hledat mapy', value: mapyUI.hledat,
    oninput: (e) => {
      mapyUI.hledat = e.target.value;
      const pozice = e.target.selectionStart;
      vykresliMapy();
      const novy = $('#okno-map .hledat input');
      novy.focus(); novy.setSelectionRange(pozice, pozice);
    },
  });
  let obsah;
  if (!sablony) obsah = h('p', { class: 'prazdne' }, 'Načítám mapy…');
  else if (!sablony.length) obsah = h('p', { class: 'prazdne' }, 'V tabulce zatím nejsou žádné mapy. Vytvoř novou, nebo nahraj soubor.');
  else if (!mapy.length) obsah = h('p', { class: 'prazdne' }, 'Žádná mapa neodpovídá hledání.');
  else obsah = h('div', { class: 'mrizka-map' }, mapy.map(kartaMapy));
  return [
    h('div', { class: 'okno-nastroje' },
      h('label', { class: 'hledat' }, h('span', { class: 'lupa', 'aria-hidden': 'true' }), hledat),
      h('div', { class: 'cipy', role: 'group', 'aria-label': 'Filtr' },
        filtr('vse', 'Všechny'), filtr('moje', 'Moje'), filtr('svetle', 'Světlé'), filtr('tmave', 'Tmavé')),
      h('label', { class: 'razeni' }, 'Řadit',
        h('select', { onchange: (e) => { mapyUI.razeni = e.target.value; vykresliMapy(); } },
          h('option', { value: 'upraveno', selected: mapyUI.razeni === 'upraveno' }, 'Naposledy upravené'),
          h('option', { value: 'nazev', selected: mapyUI.razeni === 'nazev' }, 'Podle názvu'))),
      h('button', { class: 'tl', onclick: () => vyberSoubor(nahrajSoubor) }, 'Nahrát soubor')),
    h('div', { class: 'okno-telo', onclick: () => { if (mapyUI.menu) { mapyUI.menu = null; vykresliMapy(); } } }, obsah),
    h('footer', { class: 'okno-pata' },
      h('span', {}, zdrojSablon === 'prohlizec' ? 'Mapy jsou jen v tomto prohlížeči.' : 'Mapy jsou v soukromé týmové tabulce.'),
      sablony?.length ? h('button', {
        class: 'odkaz', onclick: () => stahniSoubor('mapy-tymu.json', { typ: 'mapovy-editor-sablony', verze: 1, sablony }),
      }, 'Stáhnout zálohu všech map') : null),
  ];
}

function kartaMapy(s) {
  const otevrena = s.id === stav.meta.id;
  const menuOtevrene = mapyUI.menu === s.id;
  const kdo = s.upravil || s.autor;
  const polozka = (text, fn, nebezpecne) => h('button', {
    role: 'menuitem', class: nebezpecne ? 'nebezpecne' : null,
    onclick: (e) => { e.stopPropagation(); mapyUI.menu = null; fn(); },
  }, text);
  return h('article', { class: `karta-mapy${otevrena ? ' otevrena' : ''}${menuOtevrene ? ' s-menu' : ''}` },
    h('button', { class: 'obrazek', 'aria-label': `Otevřít mapu ${s.nazev}`, onclick: () => otevriSablonu(s) },
      obrazekKarty(s),
      otevrena ? h('span', { class: 'znacka-otevrena' }, 'Právě otevřená') : null,
      h('span', { class: 'otevrit' }, h('span', {}, 'Otevřít'))),
    h('div', { class: 'popis-karty' },
      h('div', { class: 'texty' },
        h('strong', { title: s.nazev }, s.nazev || s.id),
        s.popis ? h('span', { class: 'popis', title: s.popis }, s.popis) : null,
        h('span', { class: 'meta' }, [kdo, datum(s.upraveno)].filter(Boolean).join(' · '))),
      h('button', {
        class: 'tri-tecky', 'aria-label': 'Další akce', 'aria-haspopup': 'menu', 'aria-expanded': String(menuOtevrene),
        onclick: (e) => { e.stopPropagation(); mapyUI.menu = menuOtevrene ? null : s.id; vykresliMapy(); },
      }, h('span'), h('span'), h('span'))),
    menuOtevrene ? h('div', { class: 'menu-karty', role: 'menu', onclick: (e) => e.stopPropagation() },
      polozka('Otevřít', () => otevriSablonu(s)),
      polozka('Duplikovat', () => duplikuj(s)),
      polozka('Přejmenovat a upravit popis', () => prejmenuj(s)),
      polozka('Stáhnout style.json', () => stahniStylMapy(s)),
      h('hr'),
      polozka('Smazat…', () => smaz(s), true)) : null);
}

async function duplikuj(s) {
  try {
    await ul.ulozSablonu({ ...s, id: ul.noveId(s.nazev), nazev: `${s.nazev} (kopie)`, vytvoreno: null, autor: '', upravil: '' });
    hlaska(`Vytvořena kopie mapy „${s.nazev}“.`);
    await nactiSablony();
  } catch (e) { hlaska(`Kopie se nepovedla: ${e.message}`, true); }
}

function prejmenuj(s) {
  const nazev = h('input', { id: 'prejmenovat-nazev', class: 'pole velke', value: s.nazev || '' });
  const popis = h('textarea', { id: 'prejmenovat-popis', class: 'pole velke', rows: 3 }, s.popis || '');
  maleOkno('Přejmenovat mapu', [
    h('label', { class: 'popisek', for: 'prejmenovat-nazev' }, 'Název'), nazev,
    h('label', { class: 'popisek', for: 'prejmenovat-popis' }, 'Popis'), popis,
  ], [
    { text: 'Uložit', hlavni: true, fn: async () => {
      if (!nazev.value.trim()) { nazev.focus(); return false; }
      try {
        await ul.ulozSablonu({ ...s, nazev: nazev.value.trim(), popis: popis.value.trim() });
        if (s.id === stav.meta.id) { stav.meta.nazev = nazev.value.trim(); stav.meta.popis = popis.value.trim(); aktualizujListu(); }
        hlaska('Mapa přejmenovaná.');
        await nactiSablony();
      } catch (e) { hlaska(`Uložení se nepovedlo: ${e.message}`, true); return false; }
    } },
    { text: 'Zrušit' },
  ]);
  setTimeout(() => nazev.select(), 30);
}

async function stahniStylMapy(s) {
  try {
    const recept = doplnRecept(kopie(s.nastaveni));
    const styl = await sestavStyl(recept, { export: true, nazev: s.nazev || 'Mapa' });
    const chyby = await overStyl(styl);
    if (chyby && chyby.length && !confirm(`Styl má ${chyby.length} chyb(y):\n\n${chyby.slice(0, 5).join('\n')}\n\nStáhnout přesto?`)) return;
    stahniSoubor(`${ul.noveId(s.nazev || 'mapa').replace(/-[a-z0-9]+$/, '')}.json`, styl, true);
  } catch (e) { hlaska(`Stažení se nepovedlo: ${e.message}`, true); }
}

async function smaz(s) {
  if (!confirm(`Smazat mapu „${s.nazev}“ z týmové tabulky? Nejde to vrátit.`)) return;
  try {
    await ul.smazSablonu(s.id);
    if (s.id === stav.meta.id) { stav.meta.id = null; stav.ulozeno = false; aktualizujListu(); }
    hlaska('Mapa smazána.');
    await nactiSablony();
  } catch (e) { hlaska(e.message, true); }
}

// ---- záložka Nová mapa
const PODKLADY = {
  liberty: { popis: 'Barevná mapa, výchozí', zeme: '#f8f4f0', more: '#a0c8f0', les: '#d6e8c8', silnice: '#f1b65c' },
  positron: { popis: 'Světle šedá, tlumená', zeme: '#f2f3f0', more: '#c2c8ca', les: '#e6eae2', silnice: '#ffffff' },
  bright: { popis: 'Výrazná, hodně detailů', zeme: '#f5f0e5', more: '#8cc0e8', les: '#b9dca0', silnice: '#f08a3c' },
};

function svgMapky(b, { sirka = 240, vyska = 110, vyskaPx = null, silnice = null, les = null, kraje = null } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 240 ${vyska}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.style.width = typeof sirka === 'number' ? `${sirka}px` : sirka;
  if (vyskaPx) { svg.style.height = `${vyskaPx}px`; svg.setAttribute('preserveAspectRatio', 'xMidYMid slice'); }
  const tvar = (tag, a) => { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(a)) el.setAttribute(k, v); svg.append(el); };
  const y = (v) => Math.round(v * vyska / 110);
  tvar('rect', { width: 240, height: vyska, fill: b.more });
  tvar('path', { d: `M0 ${vyska} L0 ${y(66)} C22 ${y(58)} 34 ${y(42)} 58 ${y(40)} C80 ${y(38)} 92 ${y(22)} 118 ${y(26)} C140 ${y(30)} 150 ${y(14)} 176 ${y(18)} C198 ${y(22)} 214 ${y(36)} 240 ${y(30)} L240 ${vyska} Z`, fill: b.zeme });
  if (les) tvar('path', { d: `M150 ${y(50)} C170 ${y(46)} 190 ${y(56)} 220 ${y(50)} L222 ${y(66)} C196 ${y(74)} 168 ${y(66)} 150 ${y(70)} Z`, fill: les });
  if (silnice) tvar('path', { d: `M20 ${vyska} C40 ${y(90)} 70 ${y(84)} 96 ${y(70)} C130 ${y(64)} 150 ${y(80)} 190 ${y(66)} M140 ${vyska} C150 ${y(90)} 170 ${y(80)} 210 ${y(76)}`, fill: 'none', stroke: silnice, 'stroke-width': 2 });
  if (kraje) tvar('path', { d: `M60 ${y(44)} C66 ${y(60)} 76 ${y(70)} 72 ${y(92)} M130 ${y(28)} C138 ${y(48)} 150 ${y(58)} 146 ${y(84)} M196 ${y(26)} C204 ${y(44)} 214 ${y(56)} 212 ${y(80)}`, fill: 'none', stroke: kraje, 'stroke-width': 1.3, 'stroke-dasharray': '4 3' });
  tvar('path', { d: `M0 ${y(88)} C40 ${y(80)} 70 ${y(96)} 112 ${y(82)} C150 ${y(70)} 196 ${y(88)} 240 ${y(74)}`, fill: 'none', stroke: b.hranice || '#9e9cab', 'stroke-width': 1.8 });
  return svg;
}

function obsahNova() {
  const n = mapyUI.nova;
  const vyber = (klic, hodnota) => { n[klic] = hodnota; vykresliMapy(); };
  const schemata = [...Object.entries(SCHEMATA).map(([k, s]) => ({ k, nazev: s.nazev, popis: s.popis, zeme: s.pevnina, more: s.voda, hranice: s.hranice })),
    { k: 'puvodni', nazev: 'Původní barvy', popis: 'Barvy podkladu bez úprav', ...PODKLADY[n.zaklad], hranice: '#9e9cab' }];
  const zvolene = schemata.find((s) => s.k === n.schema) || schemata[0];
  const podklad = PODKLADY[n.zaklad];
  const barvyNahledu = n.schema === 'puvodni' ? { ...podklad, hranice: '#9e9cab' } : zvolene;
  return h('div', { class: 'nova-mapa' },
    h('div', { class: 'nova-volby' },
      h('h2', { class: 'krok' }, '1 · Podklad'),
      h('div', { class: 'dlazdice-podkladu' }, Object.entries(ZAKLADY).map(([k, z]) => h('button', {
        class: `dlazdice${n.zaklad === k ? ' zvolena' : ''}`, 'aria-pressed': String(n.zaklad === k), onclick: () => vyber('zaklad', k),
      }, svgMapky({ ...PODKLADY[k], hranice: '#9e9cab' }, { sirka: '100%', silnice: PODKLADY[k].silnice, les: PODKLADY[k].les }),
      h('span', { class: 'texty' }, h('strong', {}, z.nazev), h('span', {}, PODKLADY[k]?.popis || z.popis))))),
      h('h2', { class: 'krok' }, '2 · Barvy'),
      h('div', { class: 'dlazdice-schemat' }, schemata.map((s) => h('button', {
        class: `dlazdice radkova${n.schema === s.k ? ' zvolena' : ''}`, 'aria-pressed': String(n.schema === s.k), onclick: () => vyber('schema', s.k),
      }, svgMapky(s, { sirka: 58, vyskaPx: 44 }), h('span', { class: 'texty' }, h('strong', {}, s.nazev), h('span', {}, s.popis))))),
      h('h2', { class: 'krok' }, '3 · Obsah'),
      h('label', { class: 'volba-ctverec' },
        h('input', { type: 'checkbox', checked: n.cisty, disabled: n.schema === 'puvodni', onchange: (e) => vyber('cisty', e.target.checked) }),
        h('span', { class: 'texty' },
          h('strong', {}, 'Čistý podklad'),
          h('span', {}, n.schema === 'puvodni'
            ? 'S původními barvami mapa ukáže všechny vrstvy podkladu.'
            : 'Jen voda, hranice, sídla a státy. Bez něj mapa ukáže i silnice, lesy a budovy – vypneš je pak na kartě Vrstvy.')))),
    h('aside', { class: 'nova-souhrn' },
      h('div', { class: 'nadpisek' }, 'Výsledek'),
      h('div', { class: 'velky-nahled' }, svgMapky(barvyNahledu, {
        sirka: '100%', vyska: 170,
        silnice: !n.cisty || n.schema === 'puvodni' ? (n.schema === 'puvodni' ? podklad.silnice : smichej(barvyNahledu.hranice, barvyNahledu.zeme, 0.5)) : null,
      })),
      h('dl', {},
        h('dt', {}, 'Podklad'), h('dd', {}, ZAKLADY[n.zaklad].nazev),
        h('dt', {}, 'Barvy'), h('dd', {}, zvolene.nazev),
        h('dt', {}, 'Obsah'), h('dd', {}, n.cisty && n.schema !== 'puvodni' ? 'Čistý podklad' : 'Všechny vrstvy'),
        h('dt', {}, 'Popisky'), h('dd', { class: 'slabe' }, 'vždy česky')),
      h('div', { class: 'souhrn-pata' },
        !stav.ulozeno ? h('div', { class: 'upozorneni' }, 'Otevřená mapa má neuložené změny. Před vytvořením nové se zeptám, jestli o ně chceš přijít.') : null,
        h('button', { class: 'tl tl-modre velke', onclick: vytvorNovou }, 'Vytvořit mapu'),
        h('button', { class: 'tl velke', onclick: () => vyberSoubor(nahrajSoubor) }, 'Začít ze souboru style.json'))));
}

async function vytvorNovou() {
  if (!stav.ulozeno && !confirm('Otevřená mapa má neuložené změny. Opravdu začít novou a změny zahodit?')) return;
  const n = mapyUI.nova;
  await novaMapa(n.zaklad, n.schema, n.schema !== 'puvodni' && n.cisty);
  zavriMapy();
  hlaska('Nová mapa je připravená. Až ji upravíš, ulož ji tlačítkem Uložit.');
}

function otevriSablonu(s) {
  if (s.id !== stav.meta.id && !stav.ulozeno && !confirm('Otevřená mapa má neuložené změny. Opravdu otevřít jinou a změny zahodit?')) return;
  if (!s.nastaveni) { hlaska('Mapa nemá platné nastavení.', true); return; }
  historie = []; budouci = [];
  stav.meta = { ...novaMeta(s.nazev), id: s.id, popis: s.popis || '', autor: s.autor || '', upravil: s.upravil || '', vytvoreno: s.vytvoreno || null, upraveno: s.upraveno || null };
  stav.recept = doplnRecept(kopie(s.nastaveni));
  stav.ulozeno = true;
  zavriMapy();
  poZmene();
  hlaska(`Otevřena mapa „${s.nazev}“`);
}

// ---- malé okno (přejmenování, uložení)
function maleOkno(nadpis, obsah, tlacitka, { trida = '' } = {}) {
  const zavoj = $('#male-okno');
  const zavri = () => { zavoj.hidden = true; zavoj.replaceChildren(); document.removeEventListener('keydown', esc, true); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); zavri(); } };
  const tl = tlacitka.map((t) => h('button', {
    class: `tl velke${t.hlavni ? ' tl-modre' : ''}${t.vpravo ? ' vpravo' : ''}${t.slabe ? ' tl-slabe' : ''}`,
    onclick: async (e) => {
      const b = e.currentTarget;
      if (!t.fn) { zavri(); return; }
      b.disabled = true;
      const vysledek = await t.fn();
      b.disabled = false;
      if (vysledek !== false) zavri();
    },
  }, t.text));
  zavoj.replaceChildren(h('section', { class: `okno male ${trida}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': nadpis },
    h('h1', {}, nadpis), ...obsah, h('div', { class: 'okno-tlacitka' }, tl)));
  zavoj.hidden = false;
  document.addEventListener('keydown', esc, true);
  return zavri;
}

// Malý obrázek z aktuálního výřezu mapy (JPEG ~320×200), vejde se do buňky tabulky.
function vyfotNahled() {
  if (!mapa) return Promise.resolve(null);
  return new Promise((hotovo) => {
    const foto = () => {
      // Zkušební data do náhledu nepatří – na okamžik je skryjeme.
      const data = (mapa.getStyle()?.layers || []).filter((l) => l.id.startsWith('zkusebni_') && l.layout?.visibility !== 'none').map((l) => l.id);
      data.forEach((id) => mapa.setLayoutProperty(id, 'visibility', 'none'));
      mapa.once('render', () => {
        try {
          const c = mapa.getCanvas();
          const W = 320, H = 200;
          const out = document.createElement('canvas');
          out.width = W; out.height = H;
          const k = Math.max(W / c.width, H / c.height);
          out.getContext('2d').drawImage(c, (W - c.width * k) / 2, (H - c.height * k) / 2, c.width * k, c.height * k);
          let q = 0.8;
          let url = out.toDataURL('image/jpeg', q);
          while (url.length > 40000 && q > 0.35) { q -= 0.15; url = out.toDataURL('image/jpeg', q); }
          hotovo(url.length > 45000 ? null : url);
        } catch (e) { console.warn('Náhled se nepodařilo vyfotit', e); hotovo(null); }
        data.forEach((id) => { if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', 'visible'); });
      });
      mapa.triggerRepaint();
    };
    if (mapa.loaded()) foto();
    else { let hotovoUz = false; const jednou = () => { if (!hotovoUz) { hotovoUz = true; foto(); } }; mapa.once('idle', jednou); setTimeout(jednou, 5000); }
  });
}

function otevriUlozeni() {
  const nova = !stav.meta.id;
  const potrebaJmena = !ul.jmeno();
  const nazev = h('input', { id: 'ulozit-nazev', class: 'pole velke', value: stav.meta.nazev === 'Nová mapa' && nova ? '' : (stav.meta.nazev || ''), placeholder: 'Např. Teplý papír – kraje fialově' });
  const popis = h('textarea', { id: 'ulozit-popis', class: 'pole velke', rows: 3, placeholder: 'K čemu se mapa hodí' }, stav.meta.popis || '');
  const jmeno = potrebaJmena ? h('input', { id: 'ulozit-jmeno', class: 'pole velke', placeholder: 'Tvoje jméno' }) : null;
  let nahled = null;
  const ramecek = h('div', { class: 'nahled-ulozeni' }, h('span', { class: 'slabe' }, 'Fotím náhled…'));
  const fotit = async () => {
    ramecek.replaceChildren(h('span', { class: 'slabe' }, 'Fotím náhled…'));
    nahled = await vyfotNahled();
    ramecek.replaceChildren(nahled ? h('img', { src: nahled, alt: 'Náhled mapy' }) : h('span', { class: 'slabe' }, 'Náhled se nepovedl, mapa se uloží bez něj.'));
  };
  fotit();
  const kdo = [
    !nova && stav.meta.autor ? `Vytvořil ${stav.meta.autor}${stav.meta.vytvoreno ? `, ${datum(stav.meta.vytvoreno)}` : ''}` : null,
    !nova && stav.meta.upravil ? `naposledy upravil ${stav.meta.upravil}${stav.meta.upraveno ? `, ${datum(stav.meta.upraveno)}` : ''}` : null,
  ].filter(Boolean).join(' · ');
  const uloz = (jakoNovou) => async () => {
    if (!nazev.value.trim()) { nazev.focus(); hlaska('Mapu pojmenuj.', true); return false; }
    if (jmeno) {
      if (!jmeno.value.trim()) { jmeno.focus(); hlaska('Napiš svoje jméno, ukáže se u map.', true); return false; }
      ul.nastavJmeno(jmeno.value);
    }
    return ulozit(jakoNovou, { nazev: nazev.value.trim(), popis: popis.value.trim(), nahled });
  };
  maleOkno(nova ? 'Uložit novou mapu' : 'Uložit mapu', [
    h('div', { class: 'ulozeni-mrizka' },
      h('div', { class: 'ulozeni-nahled' },
        ramecek,
        h('span', { class: 'slabe' }, 'Náhled z aktuálního výřezu mapy'),
        h('button', { class: 'tl', onclick: fotit }, 'Vyfotit znovu')),
      h('div', { class: 'ulozeni-pole' },
        h('label', { class: 'popisek', for: 'ulozit-nazev' }, 'Název'), nazev,
        h('label', { class: 'popisek', for: 'ulozit-popis' }, 'Popis'), popis)),
    jmeno ? h('div', { class: 'kdo-uklada' },
      h('label', { class: 'popisek', for: 'ulozit-jmeno' }, 'Kdo ukládá?'), jmeno,
      h('span', { class: 'slabe' }, 'Ptám se jen poprvé, jméno se ukáže u map. Změnit ho jde v Nastavení.')) : null,
    h('div', { class: 'info-ulozeni' },
      kdo ? h('div', {}, kdo) : null,
      h('div', {}, potrebaJmena ? 'Mapa se uloží do týmové tabulky.' : `Uložíš jako ${ul.jmeno()} do ${zdrojSablon === 'prohlizec' ? 'tohoto prohlížeče' : 'týmové tabulky'}.`)),
  ], nova
    ? [{ text: 'Uložit', hlavni: true, fn: uloz(true) }, { text: 'Zrušit', vpravo: true, slabe: true }]
    : [{ text: 'Uložit změny', hlavni: true, fn: uloz(false) }, { text: 'Uložit jako novou mapu', fn: uloz(true) }, { text: 'Zrušit', vpravo: true, slabe: true }],
  { trida: 'okno-ulozeni' });
  setTimeout(() => (nova ? nazev : $('#male-okno .tl-modre'))?.focus(), 30);
}

async function ulozit(jakoNovou, { nazev, popis, nahled }) {
  const meta = { ...stav.meta, nazev, popis };
  if (jakoNovou || !meta.id) {
    meta.id = ul.noveId(nazev);
    meta.vytvoreno = null;
    meta.autor = '';
    if (jakoNovou && stav.meta.id && nazev === stav.meta.nazev) meta.nazev = `${nazev} (kopie)`;
  }
  try {
    const s = await ul.ulozSablonu({
      id: meta.id, nazev: meta.nazev, popis: meta.popis, autor: meta.autor, vytvoreno: meta.vytvoreno,
      zaklad: stav.recept.zaklad, nastaveni: stav.recept, nahled: nahled || '',
    });
    stav.meta = { ...meta, autor: s.autor, upravil: s.upravil, vytvoreno: s.vytvoreno, upraveno: s.upraveno };
    stav.ulozeno = true;
    poZmene(false);
    hlaska(ul.jeNapojeno() ? 'Mapa je uložená v týmové tabulce.' : 'Mapa je uložená jen v tomto prohlížeči.');
    nactiSablony();
    return true;
  } catch (e) {
    hlaska(`Uložení se nepovedlo: ${e.message}`, true);
    return false;
  }
}

// ---- úvodní obrazovka: bez týmového hesla se dál nepokračuje
function zobrazUvod(zprava = '') {
  zavriMapy();
  const uvod = $('#uvod');
  const n = ul.napojeni();
  const bezAdresy = !n.url;
  const adresa = bezAdresy ? h('input', { id: 'uvod-adresa', class: 'pole velke', placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off' }) : null;
  const heslo = h('input', { id: 'uvod-heslo', class: 'pole velke heslo', type: 'password', autocomplete: 'current-password' });
  const chyba = h('div', { class: 'uvod-chyba', role: 'alert' }, zprava);
  const tlacitko = h('button', { class: 'tl tl-modre velke', type: 'submit' }, 'Vstoupit');
  const formular = h('form', {
    class: 'uvod-karta', 'aria-label': 'Přihlášení k týmovým mapám',
    onsubmit: async (e) => {
      e.preventDefault();
      const url = bezAdresy ? adresa.value.trim() : n.url;
      if (bezAdresy && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { chyba.textContent = 'Adresa tabulky má začínat https://script.google.com/…'; adresa.focus(); return; }
      if (!heslo.value) { chyba.textContent = 'Zadej týmové heslo.'; heslo.focus(); return; }
      tlacitko.disabled = true; tlacitko.textContent = 'Ověřuji…'; chyba.textContent = '';
      try {
        const pocet = await ul.overNapojeni(url, heslo.value);
        ul.ulozNapojeni({ url, heslo: heslo.value });
        uvod.hidden = true; uvod.replaceChildren();
        document.body.classList.remove('zamceno');
        hlaska(`Týmové mapy připojené (${pocet}).`);
        sablony = null;
        nactiSablony();
      } catch (err) {
        chyba.textContent = err.spatneHeslo ? 'Heslo nesedí. Zkus to znovu.' : `Tabulka neodpověděla: ${err.message}`;
        heslo.select();
      }
      tlacitko.disabled = false; tlacitko.textContent = 'Vstoupit';
    },
  },
  h('div', { class: 'uvod-znacka' }, 'Mapový editor'),
  h('h1', {}, 'Týmové mapy ČT'),
  h('p', {}, 'Zadej týmové heslo. Tento prohlížeč si ho zapamatuje, příště se editor otevře rovnou.'),
  bezAdresy ? [h('label', { class: 'popisek', for: 'uvod-adresa' }, 'Adresa týmové tabulky'), adresa] : null,
  h('label', { class: 'popisek', for: 'uvod-heslo' }, 'Týmové heslo'), heslo,
  chyba, tlacitko,
  h('p', { class: 'uvod-pata' }, 'Heslo ti dá kdokoli z týmu. Kdo otevře týmový odkaz, tuhle obrazovku vůbec neuvidí.'));
  uvod.replaceChildren(formular);
  uvod.hidden = false;
  document.body.classList.add('zamceno');
  setTimeout(() => (adresa || heslo).focus(), 30);
}

async function nahrajSoubor(text, jmeno) {
  let j;
  try { j = JSON.parse(text); } catch { hlaska('Soubor není platný JSON.', true); return; }
  if (j.typ === 'mapovy-editor-sablony' && Array.isArray(j.sablony)) {
    if (!confirm(`Nahrát ${j.sablony.length} map${ul.jeNapojeno() ? ' do týmové tabulky' : ' do tohoto prohlížeče'}? Mapy se stejným id se přepíšou.`)) return;
    try {
      const n = await ul.ulozVice(j.sablony);
      hlaska(`Nahráno map: ${n}`);
      await nactiSablony();
    } catch (e) { hlaska(`Nahrání se nepovedlo: ${e.message}`, true); }
    return;
  }
  if (j.version === 8 && Array.isArray(j.layers)) {
    if (!stav.ulozeno && !confirm('Otevřená mapa má neuložené změny. Opravdu ji nahradit nahraným stylem?')) return;
    const n = (j.name || '').toLowerCase();
    const zaklad = n.includes('positron') ? 'positron' : n.includes('bright') ? 'bright' : 'liberty';
    const r = await receptZeStylu(j, zaklad);
    historie = []; budouci = [];
    stav.meta = novaMeta(j.name || jmeno.replace(/\.json$/i, ''));
    stav.recept = r;
    stav.ulozeno = false;
    zavriMapy();
    poZmene();
    hlaska(`Styl převeden na novou mapu (podklad ${ZAKLADY[zaklad].nazev}). Ulož ji tlačítkem Uložit.`);
    return;
  }
  hlaska('Tomuhle souboru nerozumím – čekám zálohu map nebo style.json.', true);
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
    const caryVrstvy = vrstvy.filter((l) => l.type === 'line');
    const carky = caryVrstvy.length && r.vl === 'line-color'
      ? h('div', { class: 'radek' }, ...vyberCarkovani(stav.recept.vrstvy[caryVrstvy[0].id]?.paint && 'line-dasharray' in stav.recept.vrstvy[caryVrstvy[0].id].paint
        ? stav.recept.vrstvy[caryVrstvy[0].id].paint['line-dasharray'] : undefined,
      (v) => zmena(() => caryVrstvy.filter((l) => l.id !== 'boundary_disputed').forEach((l) => nastavCarkovani(l.id, v)))))
      : null;
    return h('div', { class: 'barva-polozka' }, vzorek,
      h('div', { class: 'popis' }, r.nazev, carky,
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
const CARKOVANI = [
  ['', 'Výchozí'], ['plna', 'Plná'], ['4,2', 'Čárkovaná'], ['8,3', 'Dlouhé čárky'], ['2,2', 'Krátké čárky'],
  ['0,2', 'Tečkovaná – kulaté tečky'], ['1,2', 'Tečkovaná – hranaté tečky'], ['4,2,1,2', 'Čerchovaná'],
  ['4,2,1,2,1,2', 'Dvojitě čerchovaná'], ['6,2,2,2', 'Dlouhá a krátká čárka'], ['0,2,4,2', 'Tečka a čárka'], ['vlastni', 'Vlastní vzor…'],
];

// Výběr stylu čáry: plná, čárkovaná, tečkovaná, kombinovaná nebo vlastní vzor.
// aktualni: pole čísel, null = plná, undefined = výchozí. zapis(hodnota) – stejné kódování.
function vyberCarkovani(aktualni, zapis, { sVychozi = true } = {}) {
  const klic = aktualni === undefined ? '' : aktualni === null ? 'plna' : aktualni.join(',');
  const znamy = CARKOVANI.some(([v]) => v === klic);
  const vlastniPole = h('input', {
    type: 'text', class: 'vzor-car', placeholder: 'např. 5 2 1 2', value: znamy ? '' : (aktualni || []).join(' '),
    title: 'Délky čárek a mezer v násobcích šířky čáry, oddělené mezerou',
    onchange: (e) => {
      const cisla = e.target.value.trim().split(/[\s,;]+/).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => Number.isFinite(x) && x >= 0);
      if (cisla.length >= 2) zapis(cisla); else hlaska('Zadej aspoň dvě čísla: délku čárky a mezery.', true);
    },
  });
  const vyber = h('select', {
    onchange: (e) => {
      const v = e.target.value;
      if (v === 'vlastni') { vlastniPole.hidden = false; vlastniPole.focus(); return; }
      zapis(v === '' ? undefined : v === 'plna' ? null : v.split(',').map(Number));
    },
  }, CARKOVANI.filter(([v]) => sVychozi || v !== '').map(([v, t]) => h('option', { value: v, selected: znamy ? v === klic : v === 'vlastni' }, t)));
  vlastniPole.hidden = znamy;
  return [vyber, vlastniPole];
}

// Zápis stylu čáry do vrstvy (tečky potřebují zakulacené konce).
function nastavCarkovani(id, v) {
  if (v === undefined) {
    zrusNastaveni(id, 'paint', 'line-dasharray');
    zrusNastaveni(id, 'layout', 'line-cap');
    return;
  }
  nastav(id, 'paint', 'line-dasharray', v);
  if (v && v[0] === 0) nastav(id, 'layout', 'line-cap', 'round');
  else zrusNastaveni(id, 'layout', 'line-cap');
}

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
    const dash = u.paint && 'line-dasharray' in u.paint ? u.paint['line-dasharray'] : undefined;
    prvky.push(h('div', { class: 'radek' }, h('label', {}, 'Styl čáry'),
      ...vyberCarkovani(dash, (v) => zmena(() => nastavCarkovani(l.id, v)))));
    prvky.push(h('div', { class: 'poznamka' }, 'Vlastní vzor: délky čárek a mezer v násobcích šířky čáry, např. „6 2 1 2“. Nula znamená tečku.'));
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

// ---- Maska
const maskaUI = { staty: null, hledatStat: '', stat: '', regiony: null, hledatRegion: '' };

async function nactiJsonDat(cesta) {
  const r = await fetch(cesta);
  if (!r.ok) throw new Error(`Nepodařilo se načíst ${cesta}`);
  return r.json();
}

async function priblizNaMasku() {
  try {
    const polys = await polygonyMasky(stav.recept.maska);
    if (!polys.length || !mapa) return;
    const [x1, y1, x2, y2] = hraniceGeometrie(polys);
    mapa.fitBounds([[x1, y1], [x2, y2]], { padding: 40, duration: 600 });
  } catch (e) { hlaska(e.message, true); }
}

function pridejOblast(o) {
  zmena((s) => {
    if (s.recept.maska.oblasti.some((x) => x.typ === o.typ && x.id === o.id)) return;
    s.recept.maska.oblasti.push(o);
  });
  setTimeout(priblizNaMasku, 300);
}

function seznamVolby(polozky, hledat, naVyber) {
  const q = hledat.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const bezDiakr = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const vysledek = polozky.filter((x) => !q || bezDiakr(x.text).includes(q)).slice(0, q ? 40 : 12);
  return h('div', { class: 'seznam-voleb' },
    vysledek.map((x) => h('button', { class: 'volba', onclick: () => naVyber(x) }, x.text, x.pozn ? h('small', {}, x.pozn) : null)),
    !vysledek.length ? h('div', { class: 'poznamka' }, 'Nic nenalezeno.') : null);
}

function panelMaska() {
  const m = stav.recept.maska;
  if (!maskaUI.staty) {
    nactiJsonDat('data/oblasti/staty.json').then((x) => { maskaUI.staty = x; if (karta === 'maska') vykresliPanel(); })
      .catch((e) => hlaska(e.message, true));
  }
  const staty = maskaUI.staty || [];
  const nastavMasku = (fn, prekreslit = true) => zmena((s) => fn(s.recept.maska), { klic: prekreslit ? null : 'maska', prekreslit });

  const hledatStat = h('input', {
    class: 'pole', placeholder: 'Hledat stát…', value: maskaUI.hledatStat,
    oninput: (e) => { maskaUI.hledatStat = e.target.value; obnovStaty(); },
  });
  const statyBox = h('div');
  const obnovStaty = () => statyBox.replaceChildren(seznamVolby(
    staty.map((x) => ({ text: x.nazev, pozn: x.nazev !== x.en ? x.en : '', data: x })), maskaUI.hledatStat,
    (v) => pridejOblast({ typ: 'stat', id: v.data.id, nazev: v.data.nazev }),
  ));
  obnovStaty();

  const vyberStatu = h('select', {
    class: 'pole', onchange: (e) => {
      maskaUI.stat = e.target.value; maskaUI.regiony = null; maskaUI.hledatRegion = '';
      if (maskaUI.stat) {
        nactiJsonDat(`data/oblasti/regiony/${maskaUI.stat}.json`).then((x) => {
          maskaUI.regiony = x.features.map((f) => f.properties).sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
          vykresliPanel();
        }).catch((er) => hlaska(er.message, true));
      }
      vykresliPanel();
    },
  }, h('option', { value: '' }, '— vyber stát —'),
  staty.filter((x) => x.regiony).map((x) => h('option', { value: x.id, selected: x.id === maskaUI.stat }, `${x.nazev} (${x.regiony})`)));
  const nazevStatu = staty.find((x) => x.id === maskaUI.stat)?.nazev || '';
  const hledatRegion = h('input', {
    class: 'pole', placeholder: 'Hledat region…', value: maskaUI.hledatRegion,
    oninput: (e) => { maskaUI.hledatRegion = e.target.value; obnovRegiony(); },
  });
  const regionyBox = h('div');
  const obnovRegiony = () => regionyBox.replaceChildren(maskaUI.regiony ? seznamVolby(
    maskaUI.regiony.map((x) => ({ text: x.nazev, pozn: x.typ, data: x })), maskaUI.hledatRegion,
    (v) => pridejOblast({ typ: 'region', stat: maskaUI.stat, id: v.data.id, nazev: `${v.data.nazev} (${nazevStatu})` }),
  ) : maskaUI.stat ? h('p', { class: 'poznamka' }, 'Načítám…') : '');
  obnovRegiony();

  return [
    h('h2', {}, 'Ořezová maska'),
    h('div', { class: 'poznamka' }, 'Mapa se ukáže jen ve vybraných oblastech, okolí zakryje maska. Popisky mimo oblast se skryjí. Data ve Flourishi leží nad podkladem, takže je maska neořízne.'),
    m.oblasti.length
      ? h('div', { class: 'vybrane-oblasti' }, m.oblasti.map((o, i) => h('span', { class: 'stitek' }, o.nazev || o.id,
        h('button', { title: 'Odebrat', onclick: () => zmena((s) => { s.recept.maska.oblasti.splice(i, 1); }) }, '×'))))
      : h('p', { class: 'poznamka' }, 'Zatím není vybraná žádná oblast – maska je vypnutá.'),
    m.oblasti.length ? h('div', { class: 'tlacitka' },
      h('button', { class: 'tl tl-male', onclick: priblizNaMasku }, 'Přiblížit na oblast'),
      h('button', { class: 'tl tl-male tl-nebezpecne', onclick: () => zmena((s) => { s.recept.maska.oblasti = []; }) }, 'Zrušit masku')) : null,
    h('h2', {}, 'Přidat stát'),
    hledatStat, statyBox,
    h('h2', {}, 'Přidat kraj nebo region'),
    vyberStatu,
    maskaUI.stat ? hledatRegion : null,
    regionyBox,
    h('div', { class: 'poznamka' }, 'Můžeš vybrat víc oblastí najednou, třeba dva kraje nebo Česko a Slovensko. Hranice: Natural Earth, názvy regionů jsou většinou v místním jazyce nebo anglicky.'),
    h('h2', {}, 'Vzhled masky'),
    h('div', { class: 'radek' }, h('span', { class: 'popis' }, 'Barva okolí'),
      vzorekBarvy(m.barva, (e) => otevriVybirac(e.currentTarget, m.barva, (b, klic) => zmena((s) => { s.recept.maska.barva = b; }, { klic, prekreslit: false })))),
    posuvnik('Krytí okolí', m.kryti, {
      min: 0, max: 1, krok: 0.05, format: (x) => `${Math.round(x * 100)} %`, klic: 'maska-kryti',
      nastav: (x) => { stav.recept.maska.kryti = x; },
    }),
    h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: m.skrytPopisky, onchange: (e) => nastavMasku((x) => { x.skrytPopisky = e.target.checked; }) }),
      'Skrýt popisky mimo oblast'),
    h('h2', {}, 'Obrys oblasti'),
    h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: m.obrys.zap, onchange: (e) => nastavMasku((x) => { x.obrys.zap = e.target.checked; }) }),
      'Zobrazit obrys'),
    m.obrys.zap ? [
      h('div', { class: 'radek' }, h('span', { class: 'popis' }, 'Barva obrysu'),
        vzorekBarvy(m.obrys.barva, (e) => otevriVybirac(e.currentTarget, m.obrys.barva, (b, klic) => zmena((s) => { s.recept.maska.obrys.barva = b; }, { klic, prekreslit: false })))),
      posuvnik('Šířka obrysu', m.obrys.sirka, {
        min: 0.25, max: 6, krok: 0.25, format: (x) => `${cislo(x)} px`, klic: 'maska-sirka',
        nastav: (x) => { stav.recept.maska.obrys.sirka = x; },
      }),
      h('div', { class: 'radek' }, h('label', {}, 'Styl čáry'),
        ...vyberCarkovani(m.obrys.carky, (v) => nastavMasku((x) => { x.obrys.carky = v ?? null; }), { sVychozi: false })),
    ] : null,
  ];
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
    h('h2', {}, 'Zobrazit jen vybrané názvy'),
    h('label', { class: 'prepinac' },
      h('input', {
        type: 'checkbox', checked: pop.jenVybrane, onchange: (e) => {
          zmena((s) => { s.recept.popisky.jenVybrane = e.target.checked; });
          if (e.target.checked && !vyberovyRezim) nastavVyberovyRezim(true);
        },
      }),
      'Ukázat jen názvy, na které kliknu'),
    pop.jenVybrane ? [
      h('div', { class: 'poznamka' }, vyberovyRezim
        ? 'Klikáním na názvy v mapě je zapínáš a vypínáš. Nevybrané jsou teď bledé, aby se na ně dalo kliknout – ve staženém stylu nebudou vůbec.'
        : 'Zapni „Vybírat názvy kliknutím v mapě“ a klikej na názvy, které chceš ukázat.'),
      pop.vybraneNazvy.length
        ? h('div', { class: 'vybrane-oblasti' }, pop.vybraneNazvy.map((n) => h('span', { class: 'stitek' }, n,
          h('button', { title: 'Skrýt', onclick: () => zmena((s) => { s.recept.popisky.vybraneNazvy = s.recept.popisky.vybraneNazvy.filter((x) => x !== n); }) }, '×'))))
        : h('p', { class: 'poznamka' }, 'Zatím není vybraný žádný název – mapa bude bez popisků.'),
      pop.vybraneNazvy.length ? h('div', { class: 'tlacitka' },
        h('button', { class: 'tl tl-male tl-nebezpecne', onclick: () => zmena((s) => { s.recept.popisky.vybraneNazvy = []; }) }, 'Vymazat výběr')) : null,
    ] : null,
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
  const jmeno = h('input', {
    class: 'pole', placeholder: 'Tvoje jméno (ukazuje se u map)', value: ul.jmeno(),
    onchange: (e) => { ul.nastavJmeno(e.target.value); hlaska('Jméno uloženo.'); },
  });
  return [
    h('h2', {}, 'Mapa'),
    h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: stav.recept.mapa.glob, onchange: (e) => zmena((s) => { s.recept.mapa.glob = e.target.checked; }) }),
      'Zobrazit jako glóbus'),
    h('div', { class: 'poznamka' }, 'Glóbus se při oddálení neopakuje. Ve Flourishi funguje jen s MapLibre od verze 5.'),
    h('h2', {}, 'Týmové mapy'),
    h('div', { class: 'radek' }, h('label', {}, 'Tvoje jméno')), jmeno,
    h('div', { class: 'tlacitka' },
      h('button', {
        class: 'tl tl-modre', onclick: async () => {
          const odkaz = ul.tymovyOdkaz();
          try { await navigator.clipboard.writeText(odkaz); hlaska('Odkaz zkopírovaný. Pošli ho jen kolegům – kdo ho má, dostane se k mapám.'); }
          catch { prompt('Zkopíruj odkaz pro kolegy:', odkaz); }
        },
      }, 'Zkopírovat odkaz pro kolegy'),
      h('button', {
        class: 'tl', onclick: () => {
          if (!confirm('Odhlásit tento prohlížeč z týmových map? Pak bude potřeba znovu zadat heslo.')) return;
          ul.zapomenHeslo();
          zobrazUvod();
        },
      }, 'Odhlásit')),
    h('div', { class: 'poznamka' }, 'Kdo otevře odkaz pro kolegy, má editor rovnou připojený – nic nevyplňuje. Odkaz obsahuje týmové heslo, posílej ho jen do týmového chatu.'),
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

const tymovyOdkaz = ul.prectiTymovyOdkaz();
document.querySelectorAll('.karty button').forEach((b) => b.addEventListener('click', () => { karta = b.dataset.karta; vykresliPanel(); }));
$('#nazev-sablony').addEventListener('input', (e) => zmena((s) => { s.meta.nazev = e.target.value; }, { klic: 'nazev', prekreslit: false }));
$('#mapy').addEventListener('click', () => otevriMapy());
$('#stav-tabulky').addEventListener('click', () => nactiSablony());
$('#zpet').addEventListener('click', () => zpet(1));
$('#historie').addEventListener('click', (e) => otevriHistorii(e.currentTarget));
$('#znovu').addEventListener('click', znovu);
$('#ulozit').addEventListener('click', otevriUlozeni);
$('#stahnout').addEventListener('click', stahniStyl);
$('#okno-map').addEventListener('click', zavriMapy);
const otevrenoOkno = () => !$('#uvod').hidden || !$('#male-okno').hidden;
document.addEventListener('keydown', (e) => {
  if (!$('#uvod').hidden) return;
  if (e.key === 'Escape' && mapyUI.otevreno && $('#male-okno').hidden) {
    if (mapyUI.menu) { mapyUI.menu = null; vykresliMapy(); } else zavriMapy();
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  const klavesa = e.key.toLowerCase();
  if (klavesa === 's' && !otevrenoOkno()) { e.preventDefault(); otevriUlozeni(); return; }
  if (klavesa === 'o' && !otevrenoOkno()) { e.preventDefault(); otevriMapy(); return; }
  if (e.target.matches('input[type=text], input[type=search], input:not([type]), textarea') || mapyUI.otevreno || otevrenoOkno()) return;
  if (klavesa === 'z' && !e.shiftKey) { e.preventDefault(); zpet(1); }
  if (klavesa === 'y' || (klavesa === 'z' && e.shiftKey)) { e.preventDefault(); znovu(); }
});

aktualizujListu();
if (!ulozeny?.recept) {
  novaMapa('liberty', 'svetla', false);
} else {
  vykresliPanel();
  aktualizujMapu();
}
if (!ul.jeNapojeno()) {
  nastavKontrolku('chyba', 'Nepřipojeno');
  zobrazUvod();
} else {
  nactiSablony().then(() => { if (tymovyOdkaz && sablony) hlaska(`Týmové mapy připojené (${sablony.length}).`); });
}
