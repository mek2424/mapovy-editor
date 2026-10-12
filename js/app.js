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

const VYCHOZI_NAHLED = { sada: 'zadna', kryti: 0.4, skala: 'anomalie', barvaBodu: '#001464', popiskyNadDaty: true };
const novaMeta = (nazev = 'Nová mapa') => ({ id: null, nazev, popis: '', autor: '', upravil: '', vytvoreno: null, upraveno: null });
let stav = {
  meta: novaMeta(),
  recept: prazdnyRecept('liberty'),
  nahled: { ...VYCHOZI_NAHLED },
  ulozeno: true,
};
// Editor začíná na výchozí mapě bez zkušebních dat. Jen neuložené změny z minula se obnoví.
const rozpracovano = ul.nactiRozpracovane();
const ulozeny = rozpracovano?.recept && rozpracovano.ulozeno === false ? rozpracovano : null;
if (ulozeny) {
  stav = { ...stav, ...ulozeny, recept: doplnRecept(ulozeny.recept), nahled: { ...VYCHOZI_NAHLED, ...ulozeny.nahled, sada: 'zadna' } };
}

let historie = [];
let budouci = [];
let posledniKlic = null;
let posledniCas = 0;
let posledniStyl = null;
let karta = 'vrstvy';
const otevreneSkupiny = new Set(['pozadi', 'voda', 'hranice', 'popisky_mist']);
const otevreneVrstvy = new Set();
let vyberovyRezim = false;
let vybranyNazev = null;
let mapa = null;
let ovladaniGlobu = null;

// Tlačítko glóbusu v ovládání mapy (pod +/−).
class OvladaniGlobu {
  onAdd() {
    this.tl = h('button', {
      type: 'button', class: 'tl-globus',
      onclick: () => zmena((s) => { s.recept.mapa.glob = !s.recept.mapa.glob; }),
    });
    this.tl.innerHTML = '<svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="8.5"/><ellipse cx="11" cy="11" rx="3.8" ry="8.5"/><path d="M2.5 11 H19.5"/></svg>';
    this.el = h('div', { class: 'maplibregl-ctrl maplibregl-ctrl-group' }, this.tl);
    this.obnov();
    return this.el;
  }
  onRemove() { this.el.remove(); }
  obnov() {
    if (!this.tl) return;
    const zap = !!stav.recept.mapa.glob;
    this.tl.classList.toggle('zapnuto', zap);
    this.tl.setAttribute('aria-pressed', String(zap));
    this.tl.setAttribute('aria-label', 'Zobrazit jako glóbus');
    this.tl.title = zap
      ? 'Glóbus je zapnutý – kliknutím vypnout. Ve Flourishi funguje jen s MapLibre od verze 5.'
      : 'Zobrazit jako glóbus (svět se při oddálení neopakuje)';
  }
}

// Snímek pro „Zpět“: otevřená mapa i náhled dat. Díky tomu jde vrátit i otevření jiné mapy.
const snimek = () => JSON.stringify({ meta: stav.meta, recept: stav.recept, nahled: stav.nahled });

// Uloženo = obsah mapy se shoduje s verzí, která se naposledy uložila nebo otevřela.
// Náhled dat k mapě nepatří, takže jeho změna mapu „neuložit“ nemůže.
const obsahMapy = (meta = stav.meta, recept = stav.recept) => JSON.stringify({ nazev: meta.nazev, popis: meta.popis, recept });
const ulozeneVerze = new Map();
function oznacUlozeno() {
  ulozeneVerze.set(stav.meta.id || '', obsahMapy());
  stav.ulozeno = true;
}
const spoctiUlozeno = () => { stav.ulozeno = ulozeneVerze.get(stav.meta.id || '') === obsahMapy(); };

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
  poZmene(prekreslit);
}

// Panel se kreslí až z hotového stylu, jinak by ukazoval staré hodnoty.
let prekreslitPoStylu = false;
function poZmene(prekreslit = true) {
  spoctiUlozeno();
  ul.ulozRozpracovane(stav);
  aktualizujListu();
  ovladaniGlobu?.obnov();
  if (prekreslit) prekreslitPoStylu = true;
  naplanujMapu();
}

// Otevře v editoru jinou mapu jako jeden krok historie – Zpět vrátí tu předchozí.
function otevriVEditoru(meta, recept, { ulozena = true } = {}) {
  meta = { ...meta, otevreno: Date.now() };
  if (ulozena) ulozeneVerze.set(meta.id || '', obsahMapy(meta, recept));
  zmena((s) => { s.meta = meta; s.recept = recept; });
}

function nactiSnimek(retezec) {
  const s = JSON.parse(retezec);
  stav.meta = s.meta;
  stav.recept = doplnRecept(s.recept);
  if (s.nahled) stav.nahled = s.nahled;
}
function zpet(kroku = 1) {
  if (!historie.length) return;
  for (let i = 0; i < kroku && historie.length; i++) {
    budouci.push({ s: snimek(), cas: Date.now() });
    nactiSnimek(historie.pop().s);
  }
  posledniKlic = null;
  poZmene();
}
function znovu() {
  if (!budouci.length) return;
  historie.push({ s: snimek(), cas: Date.now() });
  nactiSnimek(budouci.pop().s);
  posledniKlic = null;
  poZmene();
}

// Krátký popis kroku: co se změnilo mezi dvěma stavy.
function popisKroku(predtim, potom) {
  const a = JSON.parse(predtim); const b = JSON.parse(potom);
  if ((a.meta.id || '') !== (b.meta.id || '') || a.meta.otevreno !== b.meta.otevreno) {
    return `otevření mapy „${b.meta.nazev || 'Nová mapa'}“`;
  }
  const zmeny = [];
  if (a.meta.nazev !== b.meta.nazev) zmeny.push('název mapy');
  if (a.recept.zaklad !== b.recept.zaklad) zmeny.push('podklad');
  if (a.recept.vzhled?.schema !== b.recept.vzhled?.schema) zmeny.push('barevné schéma');
  if (a.nahled && b.nahled && JSON.stringify(a.nahled) !== JSON.stringify(b.nahled)) zmeny.push('náhled dat');
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

// Plovoucí nabídka u tlačítka (historie, účet, přidání vrstvy…). obsah(zavri) vrací prvky.
function otevriPopup(kotva, obsah, { zarovnat = 'vlevo' } = {}) {
  const box = $('#vybirac');
  if (vybiracZavri) { const byl = box.dataset.kotva === kotva.id && kotva.id; vybiracZavri(false); if (byl) return; }
  box.dataset.kotva = kotva.id || '';
  box.classList.add('popup');
  const venku = (e) => { if (!box.contains(e.target) && e.target !== kotva && !kotva.contains(e.target)) zavri(); };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); zavri(); } };
  function zavri() {
    box.hidden = true; box.classList.remove('popup'); box.dataset.kotva = '';
    document.removeEventListener('mousedown', venku); document.removeEventListener('keydown', esc, true);
    vybiracZavri = null;
  }
  box.replaceChildren(...[obsah(zavri)].flat(Infinity).filter((x) => x != null && x !== false));
  box.hidden = false;
  const r = kotva.getBoundingClientRect();
  const sirka = box.offsetWidth;
  const x = zarovnat === 'vpravo' ? r.right - sirka : r.left;
  box.style.left = `${Math.max(8, Math.min(x, innerWidth - sirka - 8))}px`;
  box.style.top = `${Math.max(8, Math.min(r.bottom + 6, innerHeight - box.offsetHeight - 8))}px`;
  setTimeout(() => { document.addEventListener('mousedown', venku); document.addEventListener('keydown', esc, true); });
  vybiracZavri = zavri;
  return zavri;
}

const polozkaMenu = (text, fn, { nebezpecne = false, zapnuto = null, popis = null } = {}) => h('button', {
  class: `polozka-menu${nebezpecne ? ' nebezpecne' : ''}`, role: 'menuitem', onclick: fn,
  'aria-checked': zapnuto == null ? null : String(zapnuto),
}, zapnuto == null ? null : h('span', { class: `zaskrtnuti${zapnuto ? ' zapnuto' : ''}`, 'aria-hidden': 'true' }),
h('span', { class: 'texty' }, text, popis ? h('small', {}, popis) : null));

function otevriHistorii(kotva) {
  const polozky = [];
  let dalsi = snimek();
  for (let i = historie.length - 1; i >= 0 && polozky.length < 40; i--) {
    const k = historie[i];
    const pocet = historie.length - i;
    const sekund = Math.round((Date.now() - k.cas) / 1000);
    const kdy = sekund < 60 ? `před ${sekund} s` : sekund < 3600 ? `před ${Math.round(sekund / 60)} min` : new Date(k.cas).toLocaleTimeString('cs');
    polozky.push({ pocet, text: `Vrátit: ${popisKroku(k.s, dalsi)}`, kdy });
    dalsi = k.s;
  }
  otevriPopup(kotva, (zavri) => [
    h('h3', {}, `Historie úprav (${historie.length})`),
    polozky.length
      ? h('div', { class: 'seznam-voleb' }, polozky.map((p) => h('button', { class: 'volba', onclick: () => { zavri(); zpet(p.pocet); } }, p.text, h('small', {}, p.kdy))))
      : h('p', { class: 'poznamka' }, 'Zatím žádné úpravy.'),
    h('div', { class: 'poznamka' }, 'Kliknutím se vrátíš do stavu před danou úpravou – i před otevřením jiné mapy. Vrácené kroky obnovíš tlačítkem ↷.'),
  ]);
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
    ovladaniGlobu = new OvladaniGlobu();
    mapa.addControl(ovladaniGlobu, 'top-right');
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
function otevriVybirac(kotva, aktualni, poVyberu, { pozadi = null, navic = null } = {}) {
  if (vybiracZavri) vybiracZavri(false);
  const box = $('#vybirac');
  box.classList.remove('popup');
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
    if (s) { s.style.background = zvolena; s.classList.remove('vyraz'); }
    vykresli();
  };
  const vzorek = (b, titulek) => h('button', {
    class: `vzorek${hex(b) === zvolena ? ' zvolena' : ''}`, title: titulek || b, onclick: () => vyber(b),
  }, h('span', { style: `background:${b}` }));

  function vykresli() {
    const o = odstiny(zvolena);
    const k = pozadi ? kontrast(zvolena, pozadi) : null;
    box.replaceChildren(...[
      ...(navic || []),
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

// Černé puntíky u názvů sídel (ikona circle_11_black z podkladu, přebarvit nejde).
const PUNTIKY = [['label_city_capital', 'Hlavní města'], ['label_city', 'Města'], ['label_town', 'Menší města'], ['label_village', 'Obce']];
const jePuntikova = (id) => PUNTIKY.some(([p]) => p === id);
function maPuntik(id) {
  const ic = vrstvaStylu(id)?.layout?.['icon-image'];
  return ic != null && ic !== '';
}
// zap: puntík jako v podkladu (u hodně přiblížené mapy zmizí), vyp: puntík nikde.
function nastavPuntik(recept, id, zap) {
  const u = (recept.vrstvy[id] = recept.vrstvy[id] || {});
  if (zap) {
    if (u.layout && u.layout['icon-image'] === null) delete u.layout['icon-image'];
  } else {
    u.layout = { ...(u.layout || {}), 'icon-image': null };
  }
}
// Vždy = puntík i při velkém přiblížení (podklad ho jinak od určitého přiblížení schová).
const puntikVzdy = (recept, id) => recept.vrstvy[id]?.layout?.['icon-image'] === 'circle_11_black';
function nastavPuntikVzdy(recept, id, vzdy) {
  const u = (recept.vrstvy[id] = recept.vrstvy[id] || {});
  if (vzdy) u.layout = { ...(u.layout || {}), 'icon-image': 'circle_11_black' };
  else if (u.layout && 'icon-image' in u.layout) {
    delete u.layout['icon-image'];
    if (!Object.keys(u.layout).length) delete u.layout;
  }
}
const idBodu = (popisek) => `bod_${popisek.slice(6)}`;
const maBod = (recept, popisek) => recept.pridane.some((p) => p.vrstva.id === idBodu(popisek));

// Značka u názvů sídel: černý puntík z podkladu, barevný bod (vlastní vrstva), nebo žádná.
function znackySidel() {
  const r = stav.recept;
  const druhy = PUNTIKY.filter(([id]) => vrstvaStylu(id));
  const barevne = druhy.some(([id]) => maBod(r, id));
  const typ = barevne ? 'barevny' : druhy.some(([id]) => maPuntik(id)) ? 'cerny' : 'zadny';
  const zapnute = druhy.map(([id]) => (typ === 'barevny' ? maBod(r, id) : typ === 'cerny' ? maPuntik(id) : false));
  const vybrane = druhy.filter((_, i) => zapnute[i]).map(([id]) => id);
  const vzdy = typ === 'cerny' && vybrane.length > 0 && vybrane.every((id) => puntikVzdy(r, id));
  return { druhy, typ, zapnute, vzdy };
}

function nastavTypZnacek(typ) {
  const { druhy, typ: puvodni } = znackySidel();
  if (typ === puvodni) return;
  const sch = SCHEMATA[schemaMapy()];
  zmena((s) => {
    const r = s.recept;
    for (const [id] of druhy) if (maBod(r, id)) odeberVlastniZ(r, idBodu(id));
    if (typ === 'barevny') {
      pridejBodyDo(r, posledniStyl, sch?.text || '#001464', sch?.obrys || '#ffffff');
    } else {
      for (const [id] of druhy) nastavPuntik(r, id, typ === 'cerny');
    }
  });
}

function prepniDruhSidel(id, zap) {
  const { typ, vzdy } = znackySidel();
  zmena((s) => {
    const r = s.recept;
    if (typ === 'barevny') {
      if (zap) {
        const vzor = r.pridane.find((p) => p.vrstva.id.startsWith('bod_'))?.vrstva.paint || {};
        pridejBodyDo(r, posledniStyl, vzor['circle-color'] || '#001464', vzor['circle-stroke-color'] || '#ffffff', [id]);
      } else {
        odeberVlastniZ(r, idBodu(id));
        nastavPuntik(r, id, false);
      }
    } else {
      nastavPuntik(r, id, zap);
      if (zap && vzdy) nastavPuntikVzdy(r, id, true);
    }
  });
}

function nastavPuntikyVzdy(vzdy) {
  const { druhy, zapnute } = znackySidel();
  zmena((s) => druhy.forEach(([id], i) => { if (zapnute[i]) nastavPuntikVzdy(s.recept, id, vzdy); }));
}

// Přidání vlastní vrstvy přímo do receptu (bez kroku pro „Zpět“).
function pridejVlastniDo(recept, styl, klic) {
  const v = VLASTNI[klic];
  if (recept.pridane.some((p) => p.vrstva.id === v.vrstva.id)) return;
  const ids = styl.layers.map((l) => l.id);
  const za = v.za.find((x) => ids.includes(x)) || null;
  recept.pridane.push({ za, vrstva: kopie(v.vrstva) });
  delete recept.vrstvy[v.vrstva.id];
}

function pridejBodyDo(recept, styl, barva = '#001464', obrys = '#ffffff', jen = null) {
  for (const [popisek, druh, r, minzoom] of BODY_SIDEL) {
    if (jen && !jen.includes(popisek)) continue;
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
const odeberVlastni = (id) => zmena((s) => odeberVlastniZ(s.recept, id));

// Barevné schéma ČT na recept. styl = sestavený styl téhož receptu bez barevných úprav.
// zachovatZnacky: u rozpracované mapy se značky sídel jen přebarví, nepřidávají se.
function aplikujSchemaNa(recept, styl, klic, cisty, { zachovatZnacky = false } = {}) {
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
  if (zachovatZnacky) {
    const body = recept.pridane.filter((x) => x.vrstva.id.startsWith('bod_'));
    body.forEach((x) => Object.assign(x.vrstva.paint, { 'circle-color': sch.text, 'circle-stroke-color': sch.obrys }));
    // Černý puntík na tmavé mapě není vidět – nahradí ho barevný bod u stejných druhů sídel.
    if (sch.tmava && !body.length) {
      const sPuntikem = BODY_SIDEL.map(([p]) => p).filter((p) => {
        const l = styl.layers.find((x) => x.id === p);
        return l && l.layout?.['icon-image'] != null && l.layout['icon-image'] !== '';
      });
      if (sPuntikem.length) pridejBodyDo(recept, styl, sch.text, sch.obrys, sPuntikem);
    }
  } else if (sch.tmava) pridejBodyDo(recept, styl, sch.text, sch.obrys);
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

// ---------------------------------------------------------------- vzhled mapy (podklad a schéma)

// Barevné vlastnosti a vlastnosti, které nastavuje schéma.
const jeBarva = (vl) => /-color$/.test(vl);
const VLASTNOSTI_SCHEMATU = new Set(['raster-opacity', 'text-halo-width']);

// Recept bez barevných úprav – z něj se počítá, jak by vrstvy obarvilo schéma.
function bezBarev(recept) {
  const r = kopie(doplnRecept(recept));
  for (const u of Object.values(r.vrstvy)) {
    if (!u?.paint) continue;
    for (const vl of Object.keys(u.paint)) if (jeBarva(vl) || VLASTNOSTI_SCHEMATU.has(vl)) delete u.paint[vl];
    if (!Object.keys(u.paint).length) delete u.paint;
  }
  return r;
}

async function hodnotySchematu(recept, schema) {
  if (!SCHEMATA[schema]) return new Map();
  const styl = await sestavStyl(bezBarev(recept));
  return new Map(zmenySchematu(styl, SCHEMATA[schema]).map(([id, vl, v]) => [`${id}|${vl}`, JSON.stringify(v)]));
}

// Rozdělí úpravy barev na ty ze schématu a ruční. Starší mapy schéma nemají zapsané –
// odhadne se podle toho, se kterým schématem se shoduje nejvíc barev.
async function rozdelBarvy(recept) {
  const polozky = [];
  for (const [id, u] of Object.entries(recept.vrstvy || {})) {
    for (const [vl, v] of Object.entries(u?.paint || {})) if (jeBarva(vl) || VLASTNOSTI_SCHEMATU.has(vl)) polozky.push([id, vl, v]);
  }
  const shody = (m) => polozky.filter(([id, vl, v]) => m.get(`${id}|${vl}`) === JSON.stringify(v));
  let schema = recept.vzhled?.schema;
  let mapa = null;
  if (schema == null) {
    if (!polozky.length) schema = 'puvodni';
    else {
      let nej = 0;
      for (const k of Object.keys(SCHEMATA)) {
        const m = await hodnotySchematu(recept, k);
        const n = shody(m).length;
        if (n > nej) { nej = n; schema = k; mapa = m; }
      }
      if (nej < Math.max(5, polozky.length * 0.3)) { schema = null; mapa = null; }
    }
  }
  if (schema && SCHEMATA[schema] && !mapa) mapa = await hodnotySchematu(recept, schema);
  const zeSchematu = new Set(mapa ? shody(mapa).map(([id, vl]) => `${id}|${vl}`) : []);
  const rucni = polozky.filter(([id, vl]) => jeBarva(vl) && !zeSchematu.has(`${id}|${vl}`));
  return { schema, zeSchematu, rucni };
}

// Nový recept s jiným podkladem nebo schématem. Viditelnost, šířky, písma, značky,
// názvy, maska a vlastní vrstvy zůstávají. ponechat = ruční barvy se nepřepíšou.
async function prebarviRecept(recept, zaklad, schema, ponechat) {
  const { zeSchematu, rucni } = await rozdelBarvy(recept);
  const r = kopie(doplnRecept(recept));
  r.zaklad = zaklad;
  for (const [id, u] of Object.entries(r.vrstvy)) {
    if (u.paint) {
      for (const vl of Object.keys(u.paint)) {
        if (zeSchematu.has(`${id}|${vl}`) || (!ponechat && jeBarva(vl))) delete u.paint[vl];
      }
      if (!Object.keys(u.paint).length) delete u.paint;
    }
    if (!Object.keys(u).length) delete r.vrstvy[id];
  }
  if (SCHEMATA[schema]) {
    const styl = await sestavStyl(bezBarev(r));
    aplikujSchemaNa(r, styl, schema, false, { zachovatZnacky: true });
  }
  if (ponechat) {
    for (const [id, vl, v] of rucni) {
      const u = (r.vrstvy[id] = r.vrstvy[id] || {});
      u.paint = { ...(u.paint || {}), [vl]: kopie(v) };
    }
  }
  r.vzhled = { schema: SCHEMATA[schema] ? schema : 'puvodni' };
  return r;
}

// Schéma otevřené mapy pro popisky v panelu (u starších map se odhaduje na pozadí).
const odhadSchematu = { klic: null, schema: undefined };
function schemaMapy() {
  const r = stav.recept;
  if (r.vzhled?.schema) return r.vzhled.schema;
  const klic = JSON.stringify([r.zaklad, r.vrstvy]);
  if (odhadSchematu.klic !== klic) {
    odhadSchematu.klic = klic;
    odhadSchematu.schema = undefined;
    rozdelBarvy(r).then(({ schema }) => {
      if (odhadSchematu.klic !== klic) return;
      odhadSchematu.schema = schema;
      if (karta === 'vrstvy') vykresliPanel();
    }).catch((e) => console.warn('Schéma se nepodařilo odhadnout', e));
  }
  return odhadSchematu.schema;
}
const nazevSchematu = (k) => (SCHEMATA[k]?.nazev || (k === 'puvodni' ? 'Původní barvy' : k === undefined ? '…' : 'Vlastní barvy'));

// Výchozí mapa: podklad Liberty, všechny vrstvy zapnuté, celé v barvách ČT světlá.
async function vychoziMapa() {
  const recept = await receptNoveMapy('liberty', 'svetla', false);
  stav.meta = novaMeta();
  stav.recept = recept;
  oznacUlozeno();
  poZmene();
}

async function receptNoveMapy(zaklad, schema, cisty) {
  const recept = prazdnyRecept(zaklad);
  if (SCHEMATA[schema]) {
    const styl = await sestavStyl(recept);
    aplikujSchemaNa(recept, styl, schema, cisty);
  }
  recept.vzhled = { schema: SCHEMATA[schema] ? schema : 'puvodni' };
  return recept;
}

// ---------------------------------------------------------------- panely

function vykresliPanel() {
  document.querySelectorAll('.karty button').forEach((b) => b.classList.toggle('aktivni', b.dataset.karta === karta));
  const obsah = $('#obsah-panelu');
  const scroll = obsah.scrollTop;
  const fn = { vrstvy: panelVrstvy, nazvy: panelNazvy, maska: panelMaska, data: panelData }[karta] || panelVrstvy;
  obsah.replaceChildren(...[fn()].flat(Infinity).filter((x) => x != null && x !== false));
  obsah.scrollTop = scroll;
  vykresliVyberNazvu();
}

function aktualizujListu() {
  const n = $('#nazev-sablony');
  if (document.activeElement !== n) n.value = stav.meta.nazev || '';
  const st = $('#stav-ulozeni');
  st.textContent = stav.ulozeno ? (stav.meta.id ? 'uloženo' : '') : 'neuložené změny';
  const ucet = $('#ucet-jmeno');
  if (ucet) ucet.textContent = ul.jmeno() || 'Bez jména';
  const pismeno = $('#ucet-pismeno');
  if (pismeno) pismeno.textContent = (ul.jmeno() || '?').trim().charAt(0).toUpperCase();
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
  nova: { zaklad: 'liberty', schema: 'svetla', cisty: false },
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
  vzhledUI.otevreno = false;
  $('#okno-map').hidden = true;
  $('#okno-map').replaceChildren();
}

// ---- okno Vzhled mapy: jiný podklad nebo schéma pro otevřenou mapu
const vzhledUI = { otevreno: false, zaklad: 'liberty', schema: null, ponechat: false, rozbor: null, puvodni: null };

async function otevriVzhled() {
  if (mapyUI.otevreno) zavriMapy();
  const schema = schemaMapy() ?? null;
  Object.assign(vzhledUI, { otevreno: true, zaklad: stav.recept.zaklad, schema, ponechat: false, rozbor: null, puvodni: { zaklad: stav.recept.zaklad, schema } });
  $('#okno-map').hidden = false;
  vykresliVzhled();
  try {
    const recept = stav.recept;
    const rozbor = await rozdelBarvy(recept);
    if (!vzhledUI.otevreno || recept !== stav.recept) return;
    vzhledUI.rozbor = rozbor;
    if (vzhledUI.puvodni.schema == null && rozbor.schema) {
      vzhledUI.puvodni.schema = rozbor.schema;
      if (vzhledUI.schema == null) vzhledUI.schema = rozbor.schema;
    }
    vykresliVzhled();
  } catch (e) { hlaska(`Barvy mapy se nepodařilo rozebrat: ${e.message}`, true); }
}

function vykresliVzhled() {
  if (!vzhledUI.otevreno) return;
  const n = vzhledUI;
  const vyber = (klic, hodnota) => { n[klic] = hodnota; vykresliVzhled(); };
  const rucni = n.rozbor?.rucni.length ?? null;
  const zmenaSchematu = n.schema != null && n.schema !== n.puvodni.schema;
  const zmenaPodkladu = n.zaklad !== n.puvodni.zaklad;
  const neco = zmenaSchematu || zmenaPodkladu || (n.schema != null && n.rozbor && !n.ponechat && rucni > 0);
  const vrstva = (id, vl) => { const v = vrstvaStylu(id)?.paint?.[vl]; return typeof v === 'string' ? v : null; };
  const ted = { zeme: barvaPevniny(), more: vrstva('water', 'fill-color') || '#a0c8f0', hranice: vrstva('boundary_2', 'line-color') || '#9e9cab' };
  const nove = n.schema == null ? ted : barvyVolby(n);
  const prepise = n.schema == null
    ? 'Nic – změní se jen podklad, barvy zůstanou, jak jsou.'
    : `Barvy vrstev podkladu podle schématu ${nazevSchematu(n.schema)}${rucni ? (n.ponechat ? '. Tvoje ruční barvy zůstanou.' : `, včetně ručně upravených barev (${rucni}).`) : '.'}`;
  const okenko = h('section', { class: 'okno okno-map okno-vzhled', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Vzhled mapy', onclick: (e) => e.stopPropagation() },
    h('header', { class: 'okno-hlava jednoducha' },
      h('h1', {}, 'Vzhled mapy'),
      h('span', { class: 'nazev-v-hlave' }, stav.meta.nazev || 'Nová mapa'),
      h('div', { class: 'okno-hlava-vpravo' }, h('button', { class: 'zavrit', 'aria-label': 'Zavřít', onclick: zavriMapy }, '×'))),
    h('div', { class: 'nova-mapa' },
      h('div', { class: 'nova-volby' }, volbyVzhledu(n, vyber, { cislovat: false, aktualni: n.puvodni })),
      h('aside', { class: 'nova-souhrn' },
        h('div', { class: 'nadpisek' }, 'Změna'),
        h('div', { class: 'ted-nove' },
          h('figure', {}, svgMapky(ted, { sirka: '100%', vyska: 80 }), h('figcaption', {}, 'Teď')),
          h('span', { class: 'sipka-zmeny', 'aria-hidden': 'true' }, '→'),
          h('figure', { class: 'nove' }, svgMapky(nove, { sirka: '100%', vyska: 80 }), h('figcaption', {}, n.schema == null ? 'Stejné barvy' : nazevSchematu(n.schema)))),
        h('dl', { class: 'co-se-stane' },
          h('dt', {}, 'Přepíše se'), h('dd', {}, prepise),
          h('dt', {}, 'Zůstane'), h('dd', {}, 'Zapnuté a vypnuté vrstvy, šířky, písma, značky sídel, upravené názvy, maska a vlastní vrstvy.')),
        n.schema != null ? h('label', { class: `volba-ctverec${!rucni ? ' vypnuto' : ''}` },
          h('input', { type: 'checkbox', checked: n.ponechat, disabled: !rucni, onchange: (e) => vyber('ponechat', e.target.checked) }),
          h('span', { class: 'texty' },
            h('strong', {}, 'Ponechat moje ruční barvy'),
            h('span', {}, rucni == null ? 'Zjišťuji, které barvy jsou ruční…'
              : rucni ? `Schéma přebarví jen vrstvy, na které jsi nesáhl. Ručně upravených barev: ${rucni}.`
                : 'Mapa nemá žádné ručně upravené barvy.'))) : null,
        h('div', { class: 'souhrn-pata' },
          h('div', { class: 'slabe' }, 'Celá změna jde vrátit jedním krokem Zpět.'),
          h('button', { class: 'tl tl-modre velke', disabled: !neco, onclick: (e) => pouzijVzhled(e.currentTarget) }, 'Použít na tuto mapu'),
          h('button', { class: 'tl velke', onclick: zavriMapy }, 'Zrušit')))));
  $('#okno-map').replaceChildren(okenko);
}

async function pouzijVzhled(tl) {
  tl.disabled = true;
  tl.textContent = 'Přebarvuji…';
  try {
    const { zaklad, schema, ponechat } = vzhledUI;
    let r;
    if (schema == null) { r = kopie(stav.recept); r.zaklad = zaklad; } else r = await prebarviRecept(stav.recept, zaklad, schema, ponechat);
    zmena((s) => { s.recept = r; });
    zavriMapy();
    hlaska(`Vzhled mapy: ${ZAKLADY[zaklad].nazev} · ${schema == null ? 'barvy beze změny' : nazevSchematu(schema)}.`, false, { akce: { text: 'Vrátit', fn: () => zpet(1) } });
  } catch (e) {
    hlaska(`Vzhled se nepodařilo změnit: ${e.message}`, true);
    tl.disabled = false;
    tl.textContent = 'Použít na tuto mapu';
  }
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

// Akce s týmovou tabulkou nejdou vrátit přes historii editoru – vrací je tlačítko v hlášce.
const vratit = (popis, fn) => ({
  text: 'Vrátit',
  fn: async () => {
    try { await fn(); hlaska(popis); } catch (e) { hlaska(`Vrácení se nepovedlo: ${e.message}`, true); }
    await nactiSablony();
  },
});

async function duplikuj(s) {
  try {
    const kopieMapy = await ul.ulozSablonu({ ...s, id: ul.noveId(s.nazev), nazev: `${s.nazev} (kopie)`, vytvoreno: null, autor: '', upravil: '' });
    hlaska(`Vytvořena kopie mapy „${s.nazev}“.`, false, { akce: vratit('Kopie je pryč.', () => ul.smazSablonu(kopieMapy.id)) });
    await nactiSablony();
  } catch (e) { hlaska(`Kopie se nepovedla: ${e.message}`, true); }
}

// Přepíše název a popis otevřené mapy, aniž by se kvůli tomu tvářila neuloženě.
function nastavMetuOtevrene(id, nazev, popis) {
  if (id !== stav.meta.id) return;
  const bylaUlozena = stav.ulozeno;
  stav.meta = { ...stav.meta, nazev, popis };
  if (bylaUlozena) oznacUlozeno();
  poZmene(false);
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
        nastavMetuOtevrene(s.id, nazev.value.trim(), popis.value.trim());
        hlaska('Mapa přejmenovaná.', false, {
          akce: vratit('Původní název je zpátky.', async () => {
            await ul.ulozSablonu(s);
            nastavMetuOtevrene(s.id, s.nazev, s.popis || '');
          }),
        });
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
  try {
    await ul.smazSablonu(s.id);
    const bylaOtevrena = s.id === stav.meta.id;
    if (bylaOtevrena) { stav.meta = { ...stav.meta, id: null }; poZmene(false); }
    hlaska(`Mapa „${s.nazev}“ smazána z tabulky.`, false, {
      akce: vratit('Mapa je zpátky v tabulce.', async () => {
        await ul.ulozSablonu(s);
        if (bylaOtevrena && !stav.meta.id) { stav.meta = { ...stav.meta, id: s.id }; poZmene(false); }
      }),
    });
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

// Volba podkladu a barev – stejné dlaždice pro novou mapu i pro změnu vzhledu otevřené mapy.
const seznamSchemat = (zaklad) => [
  ...Object.entries(SCHEMATA).map(([k, s]) => ({ k, nazev: s.nazev, popis: s.popis, zeme: s.pevnina, more: s.voda, hranice: s.hranice })),
  { k: 'puvodni', nazev: 'Původní barvy', popis: 'Barvy podkladu bez úprav', ...PODKLADY[zaklad], hranice: '#9e9cab' },
];
const barvyVolby = (n) => (n.schema === 'puvodni' ? { ...PODKLADY[n.zaklad], hranice: '#9e9cab' } : seznamSchemat(n.zaklad).find((s) => s.k === n.schema) || seznamSchemat(n.zaklad)[0]);

function volbyVzhledu(n, vyber, { cislovat = true, aktualni = null } = {}) {
  const ted = (k, klic) => (aktualni && aktualni[klic] === k ? h('span', { class: 'ted' }, 'teď') : null);
  return [
    h('h2', { class: 'krok' }, cislovat ? '1 · Podklad' : 'Podklad'),
    h('div', { class: 'dlazdice-podkladu' }, Object.entries(ZAKLADY).map(([k, z]) => h('button', {
      class: `dlazdice${n.zaklad === k ? ' zvolena' : ''}`, 'aria-pressed': String(n.zaklad === k), onclick: () => vyber('zaklad', k),
    }, svgMapky({ ...PODKLADY[k], hranice: '#9e9cab' }, { sirka: '100%', silnice: PODKLADY[k].silnice, les: PODKLADY[k].les }),
    h('span', { class: 'texty' }, h('strong', {}, z.nazev, ted(k, 'zaklad')), h('span', {}, PODKLADY[k]?.popis || z.popis))))),
    h('h2', { class: 'krok' }, cislovat ? '2 · Barvy' : 'Barvy'),
    h('div', { class: 'dlazdice-schemat' }, seznamSchemat(n.zaklad).map((s) => h('button', {
      class: `dlazdice radkova${n.schema === s.k ? ' zvolena' : ''}`, 'aria-pressed': String(n.schema === s.k), onclick: () => vyber('schema', s.k),
    }, svgMapky(s, { sirka: 58, vyskaPx: 44 }), h('span', { class: 'texty' }, h('strong', {}, s.nazev, ted(s.k, 'schema')), h('span', {}, s.popis))))),
  ];
}

function obsahNova() {
  const n = mapyUI.nova;
  const vyber = (klic, hodnota) => { n[klic] = hodnota; vykresliMapy(); };
  const zvolene = barvyVolby(n);
  const podklad = PODKLADY[n.zaklad];
  const barvyNahledu = zvolene;
  return h('div', { class: 'nova-mapa' },
    h('div', { class: 'nova-volby' },
      volbyVzhledu(n, vyber),
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
        h('dt', {}, 'Barvy'), h('dd', {}, n.schema === 'puvodni' ? 'Původní barvy' : zvolene.nazev),
        h('dt', {}, 'Obsah'), h('dd', {}, n.cisty && n.schema !== 'puvodni' ? 'Čistý podklad' : 'Všechny vrstvy'),
        h('dt', {}, 'Popisky'), h('dd', { class: 'slabe' }, 'vždy česky')),
      h('div', { class: 'souhrn-pata' },
        !stav.ulozeno ? h('div', { class: 'upozorneni' }, 'Otevřená mapa má neuložené změny. Nezahodí se – vrátíš se k ní tlačítkem Zpět.') : null,
        h('button', { class: 'tl tl-modre velke', onclick: vytvorNovou }, 'Vytvořit mapu'),
        h('button', { class: 'tl velke', onclick: () => vyberSoubor(nahrajSoubor) }, 'Začít ze souboru style.json'))));
}

const zpetKPredchozi = () => ({ text: 'Zpět k předchozí', fn: () => zpet(1) });

async function vytvorNovou() {
  const n = mapyUI.nova;
  const recept = await receptNoveMapy(n.zaklad, n.schema, n.schema !== 'puvodni' && n.cisty);
  otevriVEditoru(novaMeta(), recept);
  zavriMapy();
  hlaska('Nová mapa je připravená. Až ji upravíš, ulož ji tlačítkem Uložit.', false, { akce: zpetKPredchozi() });
}

function otevriSablonu(s) {
  if (!s.nastaveni) { hlaska('Mapa nemá platné nastavení.', true); return; }
  if (s.id === stav.meta.id && stav.ulozeno) { zavriMapy(); return; }
  otevriVEditoru(
    { ...novaMeta(s.nazev), id: s.id, popis: s.popis || '', autor: s.autor || '', upravil: s.upravil || '', vytvoreno: s.vytvoreno || null, upraveno: s.upraveno || null },
    doplnRecept(kopie(s.nastaveni)));
  zavriMapy();
  hlaska(`Otevřena mapa „${s.nazev}“.`, false, { akce: zpetKPredchozi() });
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
      h('span', { class: 'slabe' }, 'Ptám se jen poprvé, jméno se ukáže u map. Změnit ho jde vpravo nahoře v liště.')) : null,
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
  const puvodniMeta = stav.meta;
  const prepsana = !jakoNovou && stav.meta.id ? (sablony || []).find((x) => x.id === meta.id) : null;
  try {
    const s = await ul.ulozSablonu({
      id: meta.id, nazev: meta.nazev, popis: meta.popis, autor: meta.autor, vytvoreno: meta.vytvoreno,
      zaklad: stav.recept.zaklad, nastaveni: stav.recept, nahled: nahled || '',
    });
    stav.meta = { ...meta, autor: s.autor, upravil: s.upravil, vytvoreno: s.vytvoreno, upraveno: s.upraveno };
    oznacUlozeno();
    poZmene(false);
    // Vrácení: přepsaná mapa dostane zpátky předchozí verzi, nová mapa z tabulky zmizí.
    const akce = prepsana
      ? vratit('V tabulce je zpátky předchozí verze. Tvoje úpravy zůstaly v editoru neuložené.', async () => {
        await ul.ulozSablonu(prepsana);
        ulozeneVerze.set(prepsana.id, obsahMapy({ nazev: prepsana.nazev, popis: prepsana.popis || '' }, doplnRecept(kopie(prepsana.nastaveni))));
        poZmene(false);
      })
      : vratit('Mapa z tabulky zmizela, v editoru zůstala.', async () => {
        await ul.smazSablonu(s.id);
        if (stav.meta.id === s.id) { stav.meta = { ...puvodniMeta }; poZmene(false); }
      });
    hlaska(ul.jeNapojeno() ? 'Mapa je uložená v týmové tabulce.' : 'Mapa je uložená jen v tomto prohlížeči.', false, { akce });
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
    if (!confirm(`Nahrát ${j.sablony.length} map${ul.jeNapojeno() ? ' do týmové tabulky' : ' do tohoto prohlížeče'}? Mapy se stejným id se přepíšou (jde to vrátit).`)) return;
    try {
      const ids = new Set(j.sablony.map((s) => s.id));
      const prepsane = (sablony || []).filter((s) => ids.has(s.id));
      const nove = [...ids].filter((id) => !prepsane.some((s) => s.id === id));
      const n = await ul.ulozVice(j.sablony);
      hlaska(`Nahráno map: ${n}${prepsane.length ? `, z toho přepsaných ${prepsane.length}` : ''}.`, false, {
        akce: vratit('Tabulka je jako před nahráním.', async () => {
          if (prepsane.length) await ul.ulozVice(prepsane);
          for (const id of nove) await ul.smazSablonu(id);
        }),
      });
      await nactiSablony();
    } catch (e) { hlaska(`Nahrání se nepovedlo: ${e.message}`, true); }
    return;
  }
  if (j.version === 8 && Array.isArray(j.layers)) {
    const n = (j.name || '').toLowerCase();
    const zaklad = n.includes('positron') ? 'positron' : n.includes('bright') ? 'bright' : 'liberty';
    const r = await receptZeStylu(j, zaklad);
    otevriVEditoru(novaMeta(j.name || jmeno.replace(/\.json$/i, '')), r, { ulozena: false });
    zavriMapy();
    hlaska(`Styl převeden na novou mapu (podklad ${ZAKLADY[zaklad].nazev}). Ulož ji tlačítkem Uložit.`, false, { akce: zpetKPredchozi() });
    return;
  }
  hlaska('Tomuhle souboru nerozumím – čekám zálohu map nebo style.json.', true);
}

// ---- Vrstvy: vzhled mapy, rychlé barvy celých skupin, jednotlivé vrstvy
const RYCHLE = [
  { nazev: 'Pevnina', vyber: (l) => l.type === 'background', vl: 'background-color' },
  { nazev: 'Moře a jezera', vyber: (l) => l['source-layer'] === 'water' && l.type === 'fill', vl: 'fill-color' },
  { nazev: 'Řeky a potoky', vyber: (l) => l['source-layer'] === 'waterway' && l.type === 'line', vl: 'line-color' },
  { nazev: 'Hranice států', vyber: (l) => ['boundary_2', 'boundary_disputed'].includes(l.id), vl: 'line-color' },
  { nazev: 'Hranice krajů', vyber: (l) => l.id === 'kraje_hranice' || l.id === 'boundary_3', vl: 'line-color' },
  { nazev: 'Názvy sídel', vyber: (l) => /^label_(city|town|village|other)/.test(l.id), vl: 'text-color' },
  { nazev: 'Názvy států', vyber: (l) => /^label_country/.test(l.id), vl: 'text-color' },
  { nazev: 'Obrys všech popisků', vyber: (l) => l.type === 'symbol' && !!l.layout?.['text-field'], vl: 'text-halo-color' },
  { nazev: 'Pobřežní čára', vyber: (l) => l.id === 'pobrezi', vl: 'line-color' },
  { nazev: 'Názvy krajů a regionů', vyber: (l) => l.id === 'kraje_nazvy' || l.id === 'label_state', vl: 'text-color' },
  { nazev: 'Názvy vodstva', vyber: (l) => skupina(l) === 'popisky_vody', vl: 'text-color' },
  { nazev: 'Body sídel', vyber: (l) => l.type === 'circle' && l['source-layer'] === 'place', vl: 'circle-color' },
];
const RYCHLYCH_NAHORE = 8;
let vsechnyRychle = false;

const nazevCarkovani = (dash) => {
  if (dash === undefined) return null;
  if (dash === null) return 'plná';
  return (CARKOVANI.find(([v]) => v === dash.join(','))?.[1] || 'vlastní vzor').toLowerCase();
};

function dlazdiceRychle(r) {
  const vrstvy = posledniStyl.layers.filter(r.vyber);
  if (!vrstvy.length) return null;
  const viditelne = vrstvy.filter(jeViditelna);
  const hodnota = (viditelne[0] || vrstvy[0]).paint?.[r.vl];
  const jednotna = vrstvy.every((l) => JSON.stringify(l.paint?.[r.vl]) === JSON.stringify(hodnota));
  const cary = r.vl === 'line-color' ? vrstvy.filter((l) => l.type === 'line' && l.id !== 'boundary_disputed') : [];
  const dashU = cary.length ? stav.recept.vrstvy[cary[0].id]?.paint : null;
  const dash = dashU && 'line-dasharray' in dashU ? dashU['line-dasharray'] : undefined;
  const pozn = [
    typeof hodnota === 'string' ? hodnota : 'mění se s přiblížením',
    cary.length ? nazevCarkovani(dash) : null,
    !jednotna ? 'vrstvy se liší' : null,
    !viditelne.length ? 'skryté' : null,
  ].filter(Boolean).join(' · ');
  const navic = cary.length ? [
    h('h3', {}, `Styl čáry – ${r.nazev.toLowerCase()}`),
    h('div', { class: 'radek' }, ...vyberCarkovani(dash, (v) => zmena(() => cary.forEach((l) => nastavCarkovani(l.id, v))))),
  ] : null;
  return h('button', {
    class: `rychla${viditelne.length ? '' : ' skryta'}`, title: `Změnit barvu: ${r.nazev}`,
    onclick: (e) => otevriVybirac(e.currentTarget, typeof hodnota === 'string' ? hodnota : '#001464',
      (b, klic) => zmena(() => vrstvy.forEach((l) => nastav(l.id, 'paint', r.vl, b)), { klic, prekreslit: false }),
      { pozadi: r.vl === 'text-color' ? barvaPevniny() : null, navic }),
  },
  h('span', { class: `vzorek-velky${typeof hodnota === 'string' ? '' : ' vyraz'}`, style: typeof hodnota === 'string' ? `background:${hodnota}` : '' }),
  h('span', { class: 'texty' }, h('span', { class: 'jmeno' }, r.nazev), h('span', { class: 'pozn' }, pozn)));
}

function radekVzhledu() {
  const barva = (id, vl, vychozi) => { const v = vrstvaStylu(id)?.paint?.[vl]; return typeof v === 'string' ? v : vychozi; };
  const b = { zeme: barvaPevniny(), more: barva('water', 'fill-color', '#a0c8f0'), hranice: barva('boundary_2', 'line-color', '#9e9cab') };
  return h('div', { class: 'vzhled-mapy' },
    svgMapky(b, { sirka: 52, vyskaPx: 40 }),
    h('div', { class: 'texty' },
      h('span', { class: 'slabe' }, 'Vzhled mapy'),
      h('strong', {}, `${ZAKLADY[stav.recept.zaklad]?.nazev || stav.recept.zaklad} · ${nazevSchematu(schemaMapy())}`)),
    h('button', { class: 'tl tl-obrys', onclick: otevriVzhled }, 'Změnit…'));
}

function menuPridatVrstvu(kotva) {
  const pridana = new Set(stav.recept.pridane.map((p) => p.vrstva.id));
  otevriPopup(kotva, (zavri) => [
    h('h3', {}, 'Vlastní vrstvy'),
    h('div', { class: 'menu', role: 'menu' }, Object.entries(VLASTNI).map(([k, v]) => polozkaMenu(v.nazev, () => {
      zavri();
      if (pridana.has(v.vrstva.id)) odeberVlastni(v.vrstva.id); else pridejVlastni(k);
    }, { zapnuto: pridana.has(v.vrstva.id) }))),
    h('div', { class: 'poznamka' }, 'Zaškrtnuté vrstvy jsou v mapě, dalším kliknutím je odebereš. Barevné body sídel jsou na kartě Názvy.'),
  ]);
}

function menuVrstev(kotva) {
  otevriPopup(kotva, (zavri) => h('div', { class: 'menu', role: 'menu' },
    polozkaMenu('Zapnout všechny vrstvy', () => { zavri(); zmena(() => posledniStyl.layers.forEach((l) => { upravy(l.id).skryta = false; })); }),
    polozkaMenu('Vypnout vše kromě pevniny', () => { zavri(); zmena(() => posledniStyl.layers.forEach((l) => { if (l.type !== 'background') upravy(l.id).skryta = true; })); }),
    polozkaMenu('Sbalit všechny skupiny', () => { zavri(); otevreneSkupiny.clear(); otevreneVrstvy.clear(); vykresliPanel(); })),
  { zarovnat: 'vpravo' });
}

function panelVrstvy() {
  if (!posledniStyl) return h('p', { class: 'poznamka' }, 'Načítám…');
  const pridanaIds = new Set(stav.recept.pridane.map((p) => p.vrstva.id));
  const podleSkupin = new Map(SKUPINY.map(([k]) => [k, []]));
  for (const l of posledniStyl.layers) podleSkupin.get(skupina(l))?.push(l);
  const rychle = RYCHLE.map(dlazdiceRychle).filter(Boolean);

  return [
    radekVzhledu(),
    h('div', { class: 'nadpis-sekce' }, h('h2', {}, 'Rychlé barvy'), h('span', { class: 'slabe' }, 'celé skupiny najednou')),
    h('div', { class: 'rychle-barvy' }, vsechnyRychle ? rychle : rychle.slice(0, RYCHLYCH_NAHORE)),
    rychle.length > RYCHLYCH_NAHORE ? h('button', {
      class: 'odkaz-tl', 'aria-expanded': String(vsechnyRychle), onclick: () => { vsechnyRychle = !vsechnyRychle; vykresliPanel(); },
    }, vsechnyRychle ? 'Méně ▴' : `Další ${rychle.length - RYCHLYCH_NAHORE} ▾`) : null,
    h('div', { class: 'nadpis-sekce' },
      h('h2', {}, 'Vrstvy ', h('span', { class: 'pocet' }, String(posledniStyl.layers.length))),
      h('button', { class: 'tl tl-male', id: 'pridat-vrstvu', 'aria-haspopup': 'menu', onclick: (e) => menuPridatVrstvu(e.currentTarget) }, '+ Přidat vrstvu'),
      h('button', { class: 'tl tl-male tl-tecky', id: 'akce-vrstev', 'aria-label': 'Další akce s vrstvami', 'aria-haspopup': 'menu', onclick: (e) => menuVrstev(e.currentTarget) }, h('span'), h('span'), h('span'))),
    SKUPINY.map(([k, nazev]) => {
      const vrstvy = podleSkupin.get(k);
      if (!vrstvy.length) return null;
      const vid = vrstvy.filter(jeViditelna).length;
      const zaskrt = h('input', { type: 'checkbox', checked: vid === vrstvy.length, 'aria-label': `Zobrazit skupinu ${nazev}`, onclick: (e) => e.stopPropagation(),
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
    if (jePuntikova(l.id)) {
      prvky.push(h('div', { class: 'poznamka' }, 'Puntík nebo barevný bod u názvů sídel nastavíš na kartě Názvy.'));
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

// ---- Názvy: značky u sídel a jednotlivé názvy
function blokZnacek() {
  const { druhy, typ, zapnute, vzdy } = znackySidel();
  if (!druhy.length) return h('p', { class: 'poznamka' }, 'Tento podklad nemá vrstvy názvů sídel.');
  const volba = (klic, text, ukazka) => h('button', {
    class: `volba-znacky${typ === klic ? ' zvolena' : ''}`, role: 'radio', 'aria-checked': String(typ === klic),
    onclick: () => nastavTypZnacek(klic),
  }, h('span', { class: `ukazka-znacky ${ukazka}`, 'aria-hidden': 'true' }), text);
  const prvniBod = posledniStyl.layers.find((l) => l.id.startsWith('bod_'));
  const bodyIds = posledniStyl.layers.filter((l) => l.id.startsWith('bod_')).map((l) => l.id);
  const barvaBodu = (vl, popis) => {
    const v = prvniBod?.paint?.[vl];
    return h('div', { class: 'radek' }, h('span', { class: 'popis' }, popis),
      vzorekBarvy(v ?? '#001464', (e) => otevriVybirac(e.currentTarget, typeof v === 'string' ? v : '#001464',
        (b, klic) => zmena(() => bodyIds.forEach((id) => nastav(id, 'paint', vl, b)), { klic, prekreslit: false }))));
  };
  return [
    h('div', { class: 'volby-znacky', role: 'radiogroup', 'aria-label': 'Značka u názvu sídla' },
      volba('cerny', 'Černý puntík', 'cerny'), volba('barevny', 'Barevný bod', 'barevny'), volba('zadny', 'Žádná', 'zadna')),
    typ !== 'zadny' ? [
      h('div', { class: 'cipy-puntiku' }, druhy.map(([id, nazev], i) => h('label', { class: `cip-puntiku${zapnute[i] ? ' zapnuto' : ''}` },
        h('input', { type: 'checkbox', checked: zapnute[i], onchange: (e) => prepniDruhSidel(id, e.target.checked) }), nazev))),
      typ === 'cerny' ? h('label', { class: 'volba-ctverec mala' },
        h('input', { type: 'checkbox', checked: vzdy, onchange: (e) => nastavPuntikyVzdy(e.target.checked) }),
        h('span', { class: 'texty' }, h('strong', {}, 'Vždy – i při velkém přiblížení'),
          h('span', {}, 'Jinak puntík při přiblížení zmizí jako v podkladu.'))) : null,
      typ === 'barevny' ? [barvaBodu('circle-color', 'Barva bodů'), barvaBodu('circle-stroke-color', 'Obrys bodů'),
        h('div', { class: 'poznamka' }, 'Velikost bodů nastavíš na kartě Vrstvy ve skupině bodů sídel.')] : null,
      h('div', { class: 'poznamka' }, 'Značka platí pro zaškrtnuté druhy sídel, ostatní jsou bez značky. Černý puntík přebarvit nejde – na barvu je barevný bod.'),
    ] : h('div', { class: 'poznamka' }, 'Názvy sídel jsou bez puntíků i bodů.'),
  ];
}

function panelNazvy() {
  if (!posledniStyl) return h('p', { class: 'poznamka' }, 'Načítám…');
  const pop = stav.recept.popisky;
  const upravene = [
    ...Object.entries(pop.posuny).map(([n, p]) => ({ n, co: `posunutý (${cislo(p[0])}; ${cislo(p[1])} em)`, vratit: (s) => { delete s.recept.popisky.posuny[n]; } })),
    ...pop.skryteNazvy.map((n) => ({ n, co: 'skrytý', vratit: (s) => { s.recept.popisky.skryteNazvy = s.recept.popisky.skryteNazvy.filter((x) => x !== n); } })),
  ].sort((a, b) => a.n.localeCompare(b.n, 'cs'));
  return [
    h('h2', {}, 'Body u sídel'),
    blokZnacek(),
    h('h2', {}, 'Jednotlivé názvy'),
    h('button', {
      class: `tl velke tl-sirsi${vyberovyRezim ? ' tl-modre' : ''}`, 'aria-pressed': String(vyberovyRezim),
      onclick: () => { nastavVyberovyRezim(!vyberovyRezim); vykresliPanel(); },
    }, vyberovyRezim ? 'Vybírám názvy v mapě – hotovo' : 'Vybírat názvy kliknutím v mapě'),
    h('div', { class: 'poznamka' }, 'Klikni na název v mapě a můžeš ho skrýt nebo posunout. Hodí se, když název zakrývá data.'),
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
        : 'Zapni výběr v mapě a klikej na názvy, které chceš ukázat.'),
      pop.vybraneNazvy.length
        ? h('div', { class: 'vybrane-oblasti' }, pop.vybraneNazvy.map((n) => h('span', { class: 'stitek' }, n,
          h('button', { title: 'Skrýt', 'aria-label': `Skrýt ${n}`, onclick: () => zmena((s) => { s.recept.popisky.vybraneNazvy = s.recept.popisky.vybraneNazvy.filter((x) => x !== n); }) }, '×'))))
        : h('p', { class: 'poznamka' }, 'Zatím není vybraný žádný název – mapa bude bez popisků.'),
    ] : null,
    h('div', { class: 'nadpis-sekce' },
      h('h2', {}, 'Upravené názvy ', h('span', { class: 'pocet' }, String(upravene.length))),
      upravene.length > 1 ? h('button', {
        class: 'odkaz-tl', onclick: () => zmena((s) => { s.recept.popisky.posuny = {}; s.recept.popisky.skryteNazvy = []; }),
      }, 'Vrátit všechny') : null),
    upravene.length
      ? h('div', { class: 'seznam-upravenych' }, upravene.map((u) => h('div', { class: 'upraveny' },
        h('span', { class: 'jmeno' }, u.n), h('span', { class: 'co' }, u.co),
        h('button', { class: 'tl tl-male', onclick: () => zmena(u.vratit) }, 'Vrátit'))))
      : h('p', { class: 'poznamka' }, 'Žádný název není skrytý ani posunutý.'),
    h('div', { class: 'poznamka' }, 'Písmo, velikost a barvu celé skupiny názvů nastavíš na kartě Vrstvy po rozkliknutí vrstvy.'),
  ];
}

// ---- Data: zkušební data v náhledu (do stylu se nedostanou; změny jdou vrátit tlačítkem Zpět)
function panelData() {
  const n = stav.nahled;
  const zmenNahled = (fn, prekreslit = true, klic = null) => zmena((s) => fn(s.nahled), { prekreslit, klic });
  const typ = DATA[n.sada]?.typ;
  return [
    h('div', { class: 'info-blok' }, 'Jen náhled pro kontrolu čitelnosti. Do staženého stylu se nedostane.'),
    h('h2', {}, 'Zkušební data'),
    h('div', { class: 'dlazdice-dat', role: 'radiogroup', 'aria-label': 'Zkušební data' },
      Object.entries(DATA).filter(([k]) => k !== 'vlastni' || vlastniData()).map(([k, d]) => h('button', {
        class: `volba-dat${k === n.sada ? ' zvolena' : ''}`, role: 'radio', 'aria-checked': String(k === n.sada),
        onclick: () => { if (k !== n.sada) zmenNahled((x) => { x.sada = k; }); },
      }, d.nazev))),
    n.sada !== 'zadna' ? posuvnik('Krytí dat', n.kryti, {
      min: 0.05, max: 1, krok: 0.05, format: (x) => `${Math.round(x * 100)} %`, klic: 'data-kryti',
      nastav: (x) => { stav.nahled.kryti = x; },
    }) : null,
    (typ === 'plochy' || n.sada === 'body_skala') ? h('div', { class: 'radek' }, h('label', {}, 'Barevná škála'),
      h('select', { onchange: (e) => zmenNahled((x) => { x.skala = e.target.value; }) },
        Object.entries(SKALY).map(([k, s]) => h('option', { value: k, selected: k === n.skala }, s.nazev)))) : null,
    (n.sada === 'body_modre' || (n.sada === 'vlastni' && (n.vlastniBarvit || 'jedna') === 'jedna')) ? h('div', { class: 'radek' }, h('span', { class: 'popis' }, 'Barva'),
      vzorekBarvy(n.barvaBodu, (e) => otevriVybirac(e.currentTarget, n.barvaBodu, (b, klic) => zmenNahled((x) => { x.barvaBodu = b; }, false, klic)))) : null,
    h('label', { class: 'prepinac' },
      h('input', { type: 'checkbox', checked: n.popiskyNadDaty, onchange: (e) => zmenNahled((x) => { x.popiskyNadDaty = e.target.checked; }) }),
      'Popisky nad daty'),
    h('div', { class: 'poznamka' }, 'Ve Flourishi o tom rozhoduje nastavení šablony „Draw them above the data“ – styl je na obojí připravený.'),
    h('h2', {}, 'Vlastní data'),
    h('button', { class: 'nahrat-data', onclick: () => vyberSoubor(nahrajData, '.csv,.tsv,.txt,.json,.geojson') }, 'Nahrát CSV nebo GeoJSON'),
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
    h('div', { class: 'poznamka' }, 'Škály Reds, Blues a Oranges odpovídají předlohám ColorBrewer, ze kterých vychází Flourish. Vlastní data zůstávají jen v tomto prohlížeči.'),
  ];
}

async function nahrajData(text, jmeno) {
  try {
    const g = prectiSoubor(text, jmeno);
    nastavVlastniData(jmeno, g);
    zmena((s) => {
      s.nahled.sada = 'vlastni';
      s.nahled.vlastniBarvit = s.nahled.vlastniBarvit || 'jedna';
    });
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

// ---- Menu se jménem v liště: jméno u map, odkaz pro kolegy, odhlášení
function otevriMenuUctu(kotva) {
  otevriPopup(kotva, (zavri) => {
    const jmeno = h('input', {
      id: 'menu-jmeno', class: 'pole velke', placeholder: 'Tvoje jméno', value: ul.jmeno(),
      onchange: (e) => { ul.nastavJmeno(e.target.value); aktualizujListu(); hlaska('Jméno uloženo.'); },
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
    });
    return [
      h('label', { class: 'popisek', for: 'menu-jmeno' }, 'Tvoje jméno u map'), jmeno,
      h('div', { class: 'poznamka' }, 'Ukáže se u map, které vytvoříš nebo uložíš.'),
      h('div', { class: 'menu', role: 'menu' },
        ul.jeNapojeno() ? polozkaMenu('Zkopírovat odkaz pro kolegy', async () => {
          zavri();
          const odkaz = ul.tymovyOdkaz();
          try { await navigator.clipboard.writeText(odkaz); hlaska('Odkaz zkopírovaný. Pošli ho jen kolegům – obsahuje týmové heslo.'); }
          catch { prompt('Zkopíruj odkaz pro kolegy:', odkaz); }
        }, { popis: 'Kdo ho otevře, má editor rovnou připojený.' }) : null,
        polozkaMenu('Odhlásit tento prohlížeč…', () => {
          zavri();
          if (!confirm('Odhlásit tento prohlížeč z týmových map? Pak bude potřeba znovu zadat heslo.')) return;
          ul.zapomenHeslo();
          zobrazUvod();
        }, { nebezpecne: true })),
      h('div', { class: 'poznamka o-editoru' }, 'Podklad: OpenFreeMap, data © OpenStreetMap (licence ODbL) – atribuce musí v mapě zůstat. Hranice krajů: Natural Earth (volné dílo).'),
    ];
  }, { zarovnat: 'vpravo' });
  setTimeout(() => $('#menu-jmeno')?.focus(), 30);
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
// akce: { text, fn } – tlačítko v hlášce, typicky „Vrátit“. Hláška s akcí vydrží déle.
function hlaska(text, chyba = false, { akce = null } = {}) {
  const el = $('#hlaska');
  const skryj = () => el.classList.remove('videt');
  el.replaceChildren(h('span', {}, text), akce ? h('button', {
    class: 'hlaska-akce', onclick: async (e) => { e.currentTarget.disabled = true; skryj(); await akce.fn(); },
  }, akce.text) : null);
  el.classList.toggle('chyba', chyba);
  el.classList.toggle('s-akci', !!akce);
  el.classList.add('videt');
  clearTimeout(hlaskaCasovac);
  hlaskaCasovac = setTimeout(skryj, akce ? 10000 : chyba ? 6000 : 3500);
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
$('#ucet').addEventListener('click', (e) => otevriMenuUctu(e.currentTarget));
$('#okno-map').addEventListener('click', zavriMapy);
const otevrenoOkno = () => !$('#uvod').hidden || !$('#male-okno').hidden || vzhledUI.otevreno;
document.addEventListener('keydown', (e) => {
  if (!$('#uvod').hidden) return;
  if (e.key === 'Escape' && (mapyUI.otevreno || vzhledUI.otevreno) && $('#male-okno').hidden && $('#vybirac').hidden) {
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
if (!ulozeny) {
  vychoziMapa();
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
