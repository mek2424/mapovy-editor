// Karta Úpravy: vlastní obdoba mapshaper.org ovládaná myší.
// Data přicházejí z databáze GeoJSONů, ze souboru nebo z mapy (vlastní data, maska),
// dají se zjednodušit, sloučit, spojit a vyčistit a jdou zpátky na mapu nebo do souboru.
// Těžké výpočty dělá knihovna mapshaper v samostatném vlákně (mapshaper-vlakno.js).
//
// Každá úprava jde přes zmena() editoru, takže ji vrátí tlačítko Zpět i Historie.
// Stav karty je neměnný: každá úprava vytvoří nový objekt, historie si drží jen odkazy.

import {
  nazevPrvku, idPrvku, hranice, pocetBodu, teziste, bodVPolygonu, velikost, pocet, prvku,
  druhGeometrie, kmlNaGeojson, bezDiakritiky, proBody, plocha,
} from './geodata.js';

// Databáze GeoJSONů z OSM (úložiště mek2424/mapova-data, GitHub Pages).
export const ADRESA_DATABAZE = 'https://mek2424.github.io/mapova-data/';
const BARVY_VRSTEV = ['#7b126c', '#339297', '#df373c', '#32af5a', '#f06f53', '#00b6ba', '#c33363', '#ffb34f'];
const VYBER = '#001464';
const KLIC_NEDAVNE = 'mapovy-editor:upravy-nedavne';
// Maska z Úprav se ukládá i do týmové tabulky, kde má buňka limit 50 000 znaků.
const LIMIT_MASKY = 30000;

export function vytvorUpravy(ctx) {
  const { h, hlaska } = ctx;

  // ------------------------------------------------------------ stav
  // u = { vrstvy: [vrstva], aktivni: id, popis } – jde do historie (Zpět)
  // vrstva = { id, nazev, puvod, zaklad, mira, aktualni, barva, skryta, info, topologie }
  let u = { vrstvy: [], aktivni: null, popis: '' };
  // Jen pro rozhraní, do historie nejde.
  const ui = {
    vyber: new Set(), nastroj: 'klik', pohled: 'hlavni', porovnat: false, prace: null,
    hledat: '', miraNahled: null, nahled: null, sloucit: { zpusob: 'vybrane', sloupec: '', nazev: '', id: '', ponechat: false, mezery: true },
    pridat: null, cisteni: null, jenIdNazev: true,
  };

  const aktivni = () => u.vrstvy.find((v) => v.id === u.aktivni) || null;
  const novyId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const volnaBarva = () => BARVY_VRSTEV.find((b) => !u.vrstvy.some((v) => v.barva === b)) || BARVY_VRSTEV[u.vrstvy.length % BARVY_VRSTEV.length];

  // Jediná cesta ke změně stavu karty – jeden krok historie.
  function zmen(novy, popis) {
    ctx.zmena(() => { u = { ...novy, popis }; });
    ulozDoProhlizece();
  }
  const prekresli = () => { ctx.vykresliPanel(); ctx.naplanujMapu(); };

  // ------------------------------------------------------------ vlákno s mapshaperem
  let vlakno = null; let citac = 0;
  const cekajici = new Map();
  function mapshaper(prikaz, vstupy) {
    if (!vlakno) {
      const adresa = new URL('./mapshaper-vlakno.js', import.meta.url);
      if (window.MAPSHAPER_ZDROJ) adresa.searchParams.set('zdroj', window.MAPSHAPER_ZDROJ);
      vlakno = new Worker(adresa);
      vlakno.onmessage = (e) => {
        const c = cekajici.get(e.data.id);
        if (!c) return;
        cekajici.delete(e.data.id);
        if (e.data.chyba) c.chyba(new Error(prelozChybu(e.data.chyba))); else c.ok(e.data.vystupy);
      };
      vlakno.onerror = (e) => {
        for (const c of cekajici.values()) c.chyba(new Error(`Knihovnu mapshaper se nepodařilo načíst (${e.message || 'chyba sítě'}).`));
        cekajici.clear();
        vlakno = null;
      };
    }
    return new Promise((ok, chyba) => {
      const id = ++citac;
      cekajici.set(id, { ok, chyba });
      vlakno.postMessage({ id, prikaz, vstupy });
    });
  }
  function prelozChybu(t) {
    if (/Unable to determine (the )?source projection|missing projection/i.test(t)) return 'soubor nemá určený souřadnicový systém (chybí .prj)';
    if (/Unsupported|not supported/i.test(t)) return `nepodporovaný formát (${t})`;
    return t;
  }
  const textGeojsonu = new WeakMap();
  const naText = (fc) => { let t = textGeojsonu.get(fc); if (!t) { t = JSON.stringify(fc); textGeojsonu.set(fc, t); } return t; };
  // mapshaper u dat bez sloupců vrací GeometryCollection – vždy z toho udělat kolekci prvků.
  const zTextu = (t) => {
    const j = JSON.parse(t);
    if (j.type === 'FeatureCollection') { textGeojsonu.set(j, t); return j; }
    const geometrie = j.type === 'GeometryCollection' ? j.geometries : j.type === 'Feature' ? [j.geometry] : [j];
    return { type: 'FeatureCollection', features: geometrie.map((g) => ({ type: 'Feature', properties: {}, geometry: g || null })) };
  };

  // Krok s ukazatelem práce v panelu. Chyby skončí hláškou.
  async function pracuj(popis, fn) {
    if (ui.prace) return null;
    ui.prace = popis;
    ctx.vykresliPanel();
    try {
      return await fn();
    } catch (e) {
      console.error(e);
      hlaska(`${popis.replace(/…$/, '')} se nepovedlo: ${e.message}`, true);
      return null;
    } finally {
      ui.prace = null;
      ctx.vykresliPanel();
    }
  }

  // ------------------------------------------------------------ vrstvy
  // Zjednodušení se počítá vždy ze „základu“ (plná podrobnost), takže posuvník jde vrátit.
  async function sestavVrstvu(v) {
    let aktualni = v.zaklad;
    if (v.mira > 0 && v.zaklad.features.length) {
      const zachovat = Math.max(0.1, 100 - v.mira);
      const vystup = await mapshaper(
        `-i vstup.json${v.topologie === false ? ' no-topology' : ''} -simplify ${zachovat}% keep-shapes -o vystup.json format=geojson geojson-type=FeatureCollection`,
        { 'vstup.json': naText(v.zaklad) },
      );
      aktualni = zTextu(vystup['vystup.json']);
      // mapshaper vynechá prvky bez geometrie – vrátit je, ať sedí pořadí s výběrem.
      if (aktualni.features.length !== v.zaklad.features.length) aktualni = v.zaklad;
    }
    const info = {
      prvku: v.zaklad.features.length,
      bodyZaklad: v.info?.bodyZaklad ?? pocetBodu(v.zaklad),
      body: pocetBodu(aktualni),
      velikostZaklad: naText(v.zaklad).length,
      velikost: naText(aktualni).length,
      druh: druhGeometrie(v.zaklad),
    };
    if (v.info?.zakladFc !== v.zaklad) info.bodyZaklad = pocetBodu(v.zaklad);
    info.zakladFc = v.zaklad;
    return { ...v, aktualni, info };
  }

  // Úprava základu aktivní vrstvy (sloučení, vyčištění…) a nové zjednodušení.
  async function novyZaklad(v, zaklad, zmeny = {}) {
    return sestavVrstvu({ ...v, ...zmeny, zaklad });
  }

  function cistyGeojson(fc, { jmeno = '' } = {}) {
    const features = (fc.features || []).filter((f) => f && f.geometry).map((f) => ({ type: 'Feature', properties: { ...(f.properties || {}) }, geometry: f.geometry }));
    if (!features.length) throw new Error(`${jmeno ? `${jmeno}: ` : ''}žádné prvky s geometrií`);
    return { type: 'FeatureCollection', features };
  }

  async function pridejVrstvy(nove, popis) {
    const hotove = [];
    for (const n of nove) {
      hotove.push(await sestavVrstvu({
        id: novyId(), nazev: n.nazev, puvod: n.puvod, zaklad: cistyGeojson(n.fc, { jmeno: n.nazev }), mira: 0,
        barva: n.barva || BARVY_VRSTEV[(u.vrstvy.length + hotove.length) % BARVY_VRSTEV.length], skryta: false,
        databaze: n.databaze || false, topologie: true,
      }));
    }
    ui.vyber.clear(); ui.pohled = 'hlavni'; ui.nahled = null;
    zmen({ vrstvy: [...u.vrstvy, ...hotove], aktivni: hotove.at(-1).id }, popis);
    priblizNa(hotove.at(-1));
    return hotove;
  }

  function nahradVrstvu(nova, popis, { vyber = null } = {}) {
    ui.vyber = new Set(vyber || []);
    ui.nahled = null;
    zmen({ ...u, vrstvy: u.vrstvy.map((v) => (v.id === nova.id ? nova : v)) }, popis);
  }

  function priblizNa(v, indexy = null) {
    const mapa = ctx.mapa();
    if (!mapa || !v) return;
    const prvky = indexy ? [...indexy].map((i) => v.aktualni.features[i]).filter(Boolean) : v.aktualni.features;
    const b = hranice(prvky);
    if (b) mapa.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 12, duration: 600 });
  }

  // ------------------------------------------------------------ uložení v prohlížeči (IndexedDB)
  // Rozpracované vrstvy přežijí obnovení stránky. Do týmové tabulky se nikdy nedostanou.
  let ukladaci = null;
  function db() {
    return new Promise((ok, chyba) => {
      const r = indexedDB.open('mapovy-editor-upravy', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('stav');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => chyba(r.error);
    });
  }
  function ulozDoProhlizece() {
    clearTimeout(ukladaci);
    ukladaci = setTimeout(async () => {
      try {
        const d = await db();
        const data = { aktivni: u.aktivni, vrstvy: u.vrstvy.map(({ aktualni, info, ...v }) => ({ ...v, zaklad: naText(v.zaklad) })) };
        d.transaction('stav', 'readwrite').objectStore('stav').put(data, 'upravy');
      } catch (e) { console.warn('Úpravy se nepodařilo uložit v prohlížeči', e); }
    }, 800);
  }
  async function nactiZProhlizece() {
    try {
      const d = await db();
      const data = await new Promise((ok, chyba) => {
        const r = d.transaction('stav').objectStore('stav').get('upravy');
        r.onsuccess = () => ok(r.result); r.onerror = () => chyba(r.error);
      });
      if (!data?.vrstvy?.length || u.vrstvy.length) return;
      const vrstvy = [];
      for (const v of data.vrstvy) vrstvy.push(await sestavVrstvu({ ...v, zaklad: zTextu(v.zaklad) }));
      u = { vrstvy, aktivni: data.aktivni, popis: '' };
      prekresli();
    } catch (e) { console.warn('Uložené úpravy se nepodařilo načíst', e); }
  }

  // ------------------------------------------------------------ databáze GeoJSONů
  let databaze = null; // { uzemi: [...], zalozni: bool }
  async function nactiDatabazi() {
    if (databaze) return databaze;
    try {
      const r = await fetch(`${ADRESA_DATABAZE}index.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      databaze = { ...d, zalozni: false };
    } catch {
      // Databáze z OSM ještě není hotová: hrubší hranice Natural Earth, které editor už má.
      const staty = await (await fetch('data/oblasti/staty.json')).json();
      staty.sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
      // Natural Earth má pod stejným českým názvem i zámořská území – rozlišit anglickým názvem.
      const pocetNazvu = {};
      for (const s of staty) pocetNazvu[s.nazev] = (pocetNazvu[s.nazev] || 0) + 1;
      databaze = {
        zalozni: true,
        uzemi: [
          { kod: 'SVET', nazev: 'Svět – všechny státy', vrstvy: [{ klic: 'ne:svet', nazev: 'Státy', skupina: 'Správní členění' }] },
          ...staty.map((s) => ({
            kod: s.id, nazev: pocetNazvu[s.nazev] > 1 ? `${s.nazev} (${s.en})` : s.nazev, hledat: s.en,
            pozn: s.regiony ? '1. úroveň' : '',
            vrstvy: [
              { klic: `ne:stat:${s.id}`, nazev: 'Obrys státu', skupina: 'Správní členění' },
              s.regiony ? { klic: `ne:regiony:${s.id}`, nazev: '1. úroveň', prvku: s.regiony, skupina: 'Správní členění' } : null,
            ].filter(Boolean),
          })),
        ],
      };
    }
    return databaze;
  }

  async function nactiZDatabaze(uzemi, vrstva, plna) {
    const k = vrstva.klic || '';
    if (k === 'ne:svet') {
      const staty = await (await fetch('data/oblasti/staty.json')).json();
      const prvky = [];
      for (let i = 0; i < staty.length; i += 24) {
        const davka = await Promise.all(staty.slice(i, i + 24).map(async (s) => {
          try { const f = await (await fetch(`data/oblasti/stat/${s.id}.json`)).json(); return { ...f, properties: { id: s.id, nazev: s.nazev } }; } catch { return null; }
        }));
        prvky.push(...davka.filter(Boolean));
      }
      return { type: 'FeatureCollection', features: prvky };
    }
    if (k.startsWith('ne:stat:')) {
      const f = await (await fetch(`data/oblasti/stat/${uzemi.kod}.json`)).json();
      return { type: 'FeatureCollection', features: [{ ...f, properties: { id: uzemi.kod, nazev: uzemi.nazev } }] };
    }
    if (k.startsWith('ne:regiony:')) {
      const fc = await (await fetch(`data/oblasti/regiony/${uzemi.kod}.json`)).json();
      return { type: 'FeatureCollection', features: fc.features.map((f) => ({ ...f, properties: { id: f.properties.id, nazev: f.properties.nazev } })) };
    }
    const soubor = (plna && vrstva.soubory?.plna) || vrstva.soubory?.zjednodusena || vrstva.soubor;
    const r = await fetch(new URL(soubor, ADRESA_DATABAZE));
    if (!r.ok) throw new Error(`soubor ${soubor} se nepodařilo stáhnout (${r.status})`);
    const text = await r.text();
    const j = JSON.parse(text);
    if (j.type === 'Topology') {
      const vystup = await mapshaper('-i vstup.json -o format=geojson geojson-type=FeatureCollection', { 'vstup.json': text });
      return zTextu(Object.values(vystup)[0]);
    }
    return j;
  }

  const nedavne = () => { try { return JSON.parse(localStorage.getItem(KLIC_NEDAVNE) || '[]'); } catch { return []; } };
  function zapamatujNedavne(polozka) {
    const s = [polozka, ...nedavne().filter((x) => x.klic !== polozka.klic || x.uzemi !== polozka.uzemi)].slice(0, 5);
    try { localStorage.setItem(KLIC_NEDAVNE, JSON.stringify(s)); } catch { /* nevadí */ }
  }

  async function pridejZDatabaze(vyber, plna) {
    return pracuj('Stahuji data…', async () => {
      const nove = [];
      for (const { uzemi, vrstva } of vyber) {
        const fc = await nactiZDatabaze(uzemi, vrstva, plna);
        nove.push({ nazev: `${vrstva.nazev} · ${uzemi.nazev}`, puvod: databaze?.zalozni ? 'Natural Earth' : `databáze · ${plna ? 'plná' : 'zjednodušená'}`, fc, databaze: true });
        zapamatujNedavne({ uzemi: uzemi.kod, klic: vrstva.klic, nazev: `${uzemi.nazev} · ${vrstva.nazev}` });
      }
      await pridejVrstvy(nove, nove.length > 1 ? `přidání ${nove.length} vrstev z databáze` : `přidání vrstvy ${nove[0].nazev}`);
      hlaska(nove.length > 1 ? `Přidáno ${nove.length} vrstev.` : `Přidáno: ${nove[0].nazev} (${prvku(nove[0].fc.features.length)}).`);
    });
  }

  // ------------------------------------------------------------ soubory
  const pripona = (n) => (n.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const bezPripony = (n) => n.replace(/\.[a-z0-9]+$/i, '');

  async function prectiSoubory(soubory) {
    const vysledek = [];
    const shp = new Map();
    for (const s of soubory) {
      const p = pripona(s.name);
      if (['shp', 'dbf', 'prj', 'cpg', 'shx'].includes(p)) {
        const k = bezPripony(s.name);
        shp.set(k, [...(shp.get(k) || []), s]);
      } else if (p === 'zip') {
        vysledek.push(...await zMapshaperu(s.name, { [s.name]: await s.arrayBuffer() }, s.name, true));
      } else if (p === 'kml') {
        vysledek.push({ nazev: bezPripony(s.name), fc: kmlNaGeojson(await s.text()) });
      } else if (p === 'kmz') {
        throw new Error(`${s.name}: KMZ zatím neumím – v Google Earth ho ulož jako KML`);
      } else if (['csv', 'tsv', 'txt'].includes(p)) {
        vysledek.push({ nazev: bezPripony(s.name), fc: ctx.prectiSoubor(await s.text(), s.name) });
      } else {
        const text = await s.text();
        const t = text.replace(/^﻿/, '').trim();
        if (t.startsWith('{') && /"type"\s*:\s*"Topology"/.test(t.slice(0, 2000))) {
          vysledek.push(...await zMapshaperu(s.name, { 'vstup.json': t }, 'vstup.json', false));
        } else {
          vysledek.push({ nazev: bezPripony(s.name), fc: ctx.prectiSoubor(t, s.name) });
        }
      }
    }
    for (const [k, casti] of shp) {
      if (!casti.some((s) => pripona(s.name) === 'shp')) throw new Error(`${k}: chybí soubor .shp`);
      const vstupy = {};
      for (const s of casti) vstupy[`${k}.${pripona(s.name)}`] = await s.arrayBuffer();
      vysledek.push(...await zMapshaperu(k, vstupy, `${k}.shp`, true));
    }
    return vysledek;
  }

  // Shapefile a TopoJSON převede mapshaper. Shapefile v S-JTSK přepočítá do WGS 84.
  async function zMapshaperu(jmeno, vstupy, vstup, prevest) {
    let vystup;
    try {
      vystup = await mapshaper(`-i ${vstup} encoding=utf8${prevest ? ' -proj wgs84' : ''} -o format=geojson geojson-type=FeatureCollection`, vstupy);
    } catch (e) {
      if (!prevest) throw e;
      vystup = await mapshaper(`-i ${vstup} -o format=geojson geojson-type=FeatureCollection`, vstupy);
      hlaska(`${jmeno}: soubor nemá určený souřadnicový systém, beru ho jako zeměpisné souřadnice (WGS 84).`);
    }
    return Object.entries(vystup).map(([n, t]) => ({ nazev: bezPripony(n) === 'vstup' ? bezPripony(jmeno) : bezPripony(n), fc: zTextu(t) }));
  }

  async function pridejSoubory(soubory) {
    if (!soubory?.length) return;
    zavriPridat();
    await pracuj('Načítám soubor…', async () => {
      const nove = (await prectiSoubory([...soubory])).map((x) => ({ ...x, puvod: 'soubor' }));
      if (!nove.length) throw new Error('v souboru nejsou žádná data');
      for (const n of nove) {
        const b = hranice(n.fc.features);
        if (b && (Math.abs(b[0]) > 360 || Math.abs(b[3]) > 360)) throw new Error(`${n.nazev}: souřadnice nejsou zeměpisné a nepodařilo se je přepočítat`);
      }
      await pridejVrstvy(nove, `nahrání ${nove.map((n) => n.nazev).join(', ')}`);
      hlaska(`Nahráno: ${nove.map((n) => `${n.nazev} (${prvku(n.fc.features.length)})`).join(', ')}.`);
    });
  }

  // ------------------------------------------------------------ z mapy
  async function prevzitData() {
    const d = ctx.vlastniData();
    if (!d) { hlaska('Na mapě nejsou žádná vlastní data.', true); return; }
    ctx.prepniKartu('upravy');
    await pracuj('Přebírám data…', () => pridejVrstvy([{ nazev: d.nazev || 'Vlastní data', puvod: 'z karty Data', fc: d.geojson }], 'převzetí vlastních dat'));
  }
  async function prevzitMasku() {
    const m = ctx.stav().recept.maska;
    if (!m.oblasti.length) { hlaska('Maska nemá žádné oblasti.', true); return; }
    ctx.prepniKartu('upravy');
    await pracuj('Přebírám masku…', async () => {
      const features = [];
      for (const o of m.oblasti) features.push({ type: 'Feature', properties: { id: o.id || '', nazev: o.nazev || o.id || '' }, geometry: await ctx.geometrieOblasti(o) });
      await pridejVrstvy([{ nazev: 'Maska', puvod: 'z karty Maska', fc: { type: 'FeatureCollection', features } }], 'převzetí masky');
    });
  }

  // ------------------------------------------------------------ výběr
  function nastavVyber(indexy, { pridat = false, prepnout = false } = {}) {
    const novy = pridat || prepnout ? new Set(ui.vyber) : new Set();
    for (const i of indexy) {
      if (prepnout && novy.has(i)) novy.delete(i); else novy.add(i);
    }
    ui.vyber = novy;
    ui.nahled = null;
    if (ui.pohled === 'sloucit') pripravNahledSlouceni();
    aplikujVyber();
    ctx.vykresliPanel();
  }

  // ------------------------------------------------------------ mapa
  const ZDROJ = 'upravy_data';
  const VRSTVY_MAPY = ['upravy_plochy', 'upravy_obrys', 'upravy_cary', 'upravy_body'];
  const klicPrvku = (poradi, i) => poradi * 10000000 + i;
  let zobrazeni = { vrstvy: null, aktivni: null, url: null };
  let porovnani = { fc: null, url: null };
  let nahledUrl = { fc: null, url: null };
  const blobUrl = (data) => URL.createObjectURL(new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: 'application/json' }));

  function datovaUrl() {
    if (zobrazeni.vrstvy === u.vrstvy && zobrazeni.aktivni === u.aktivni) return zobrazeni.url;
    const features = [];
    u.vrstvy.forEach((v, poradi) => {
      if (v.skryta) return;
      const akt = v.id === u.aktivni;
      v.aktualni.features.forEach((f, i) => {
        if (!f.geometry) return;
        features.push({ type: 'Feature', geometry: f.geometry, properties: { _k: klicPrvku(poradi, i), _i: i, _v: v.id, _akt: akt, _barva: v.barva, _nazev: nazevPrvku(f.properties), _id: idPrvku(f.properties) } });
      });
    });
    const stara = zobrazeni.url;
    zobrazeni = { vrstvy: u.vrstvy, aktivni: u.aktivni, url: blobUrl({ type: 'FeatureCollection', features }) };
    if (stara) setTimeout(() => URL.revokeObjectURL(stara), 5000);
    return zobrazeni.url;
  }
  function urlPro(drzak, fc) {
    if (drzak.fc === fc) return drzak.url;
    if (drzak.url) { const s = drzak.url; setTimeout(() => URL.revokeObjectURL(s), 5000); }
    drzak.fc = fc; drzak.url = fc ? blobUrl(fc) : null;
    return drzak.url;
  }

  // Přidá vrstvy karty do stylu náhledu (jen když je karta otevřená). Data jdou přes
  // adresu blob:, takže porovnání stylů při každé změně neprochází celé souřadnice.
  function pridejDoStylu(styl) {
    if (ctx.karta() !== 'upravy' || !u.vrstvy.length) return styl;
    styl.sources[ZDROJ] = { type: 'geojson', data: datovaUrl(), promoteId: '_k' };
    const vybran = ['boolean', ['feature-state', 'vybran'], false];
    const nad = ['boolean', ['feature-state', 'nad'], false];
    const akt = ['==', ['get', '_akt'], true];
    const plochy = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
    const cary = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
    const body = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
    styl.layers.push(
      {
        id: 'upravy_plochy', type: 'fill', source: ZDROJ, filter: plochy,
        paint: {
          'fill-color': ['case', vybran, VYBER, ['get', '_barva']],
          // Při náhledu sloučení výběr zesvětlí, aby byl vidět čárkovaný obrys výsledku.
          'fill-opacity': ['case', vybran, ui.nahled ? 0.12 : 0.5, nad, 0.35, akt, 0.18, 0.07],
        },
      },
      {
        id: 'upravy_obrys', type: 'line', source: ZDROJ, filter: plochy,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['case', vybran, VYBER, ['get', '_barva']],
          'line-width': ['case', vybran, ui.nahled ? 0.8 : 2.2, nad, 2, akt, 1, 0.6],
          'line-opacity': ['case', akt, 1, 0.5],
        },
      },
      {
        id: 'upravy_cary', type: 'line', source: ZDROJ, filter: cary,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['case', vybran, VYBER, ['get', '_barva']], 'line-width': ['case', vybran, 4, nad, 3.5, 2.2], 'line-opacity': ['case', akt, 1, 0.5] },
      },
      {
        id: 'upravy_body', type: 'circle', source: ZDROJ, filter: body,
        paint: {
          'circle-color': ['case', vybran, VYBER, ['get', '_barva']], 'circle-radius': ['case', vybran, 7, nad, 7, 5],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5, 'circle-opacity': ['case', akt, 1, 0.5],
        },
      },
    );
    const v = aktivni();
    if (ui.porovnat && v && v.mira > 0 && !v.skryta) {
      styl.sources.upravy_porovnani = { type: 'geojson', data: urlPro(porovnani, v.zaklad) };
      styl.layers.push({ id: 'upravy_porovnani', type: 'line', source: 'upravy_porovnani', paint: { 'line-color': '#df373c', 'line-width': 1, 'line-dasharray': [2, 2] } });
    }
    if (ui.nahled) {
      styl.sources.upravy_nahled = { type: 'geojson', data: urlPro(nahledUrl, ui.nahled) };
      styl.layers.push(
        { id: 'upravy_nahled_plocha', type: 'fill', source: 'upravy_nahled', paint: { 'fill-color': ['coalesce', ['get', '_barva'], VYBER], 'fill-opacity': 0.35 } },
        { id: 'upravy_nahled', type: 'line', source: 'upravy_nahled', paint: { 'line-color': VYBER, 'line-width': 3.5, 'line-dasharray': [2, 1.2] } },
      );
    }
    return styl;
  }

  function aplikujVyber() {
    const mapa = ctx.mapa();
    if (!mapa?.getSource(ZDROJ)) return;
    mapa.removeFeatureState({ source: ZDROJ });
    const poradi = u.vrstvy.findIndex((v) => v.id === u.aktivni);
    if (poradi < 0) return;
    for (const i of ui.vyber) mapa.setFeatureState({ source: ZDROJ, id: klicPrvku(poradi, i) }, { vybran: true });
  }

  // ---- ovládání na mapě: nástroje výběru, popisek pod kurzorem, obdélník a laso
  let lista = null; let popisek = null; let kresleni = null; let nadPrvkem = null;
  function pripojMapu(mapa) {
    const kontejner = mapa.getContainer().parentElement;
    lista = h('div', { class: 'upravy-nastroje', role: 'toolbar', 'aria-label': 'Nástroje výběru', hidden: true });
    popisek = h('div', { class: 'upravy-popisek', hidden: true });
    const platno = h('canvas', { class: 'upravy-kresleni', hidden: true });
    kontejner.append(lista, popisek, platno);
    kresleni = { platno, body: null };

    mapa.on('sourcedata', (e) => { if (e.sourceId === ZDROJ && e.isSourceLoaded && e.sourceDataType !== 'metadata') aplikujVyber(); });
    mapa.on('mousemove', (e) => {
      if (ctx.karta() !== 'upravy' || kresleni.body) return;
      const f = prvekPod(e.point);
      if (nadPrvkem != null && (!f || f.id !== nadPrvkem)) mapa.setFeatureState({ source: ZDROJ, id: nadPrvkem }, { nad: false });
      if (!f) { popisek.hidden = true; nadPrvkem = null; mapa.getCanvas().style.cursor = ''; return; }
      nadPrvkem = f.id;
      mapa.setFeatureState({ source: ZDROJ, id: f.id }, { nad: true });
      mapa.getCanvas().style.cursor = 'pointer';
      popisek.replaceChildren(
        h('strong', {}, f.properties._nazev || `Prvek ${f.properties._i + 1}`),
        f.properties._id ? h('span', {}, `id ${f.properties._id}`) : null,
        h('small', {}, ui.vyber.has(f.properties._i) ? 'Vybráno · Shift + klik odebere' : 'Klik vybere · Shift + klik přidá'),
      );
      popisek.style.left = `${e.point.x + 14}px`;
      popisek.style.top = `${e.point.y + 14}px`;
      popisek.hidden = false;
    });
    mapa.on('mouseout', () => { popisek.hidden = true; });
    mapa.on('click', (e) => {
      if (ctx.karta() !== 'upravy' || ui.nastroj !== 'klik') return;
      const f = prvekPod(e.point);
      const shift = e.originalEvent.shiftKey || e.originalEvent.ctrlKey || e.originalEvent.metaKey;
      if (!f) { if (!shift && ui.vyber.size) nastavVyber([]); return; }
      nastavVyber([f.properties._i], { prepnout: shift });
    });
    // Obdélník (nástroj nebo Shift + tažení) a laso.
    const canvas = mapa.getCanvasContainer();
    canvas.addEventListener('mousedown', (e) => {
      if (ctx.karta() !== 'upravy' || e.button !== 0 || !aktivni()) return;
      const rezim = ui.nastroj === 'klik' ? (e.shiftKey ? 'obdelnik' : null) : ui.nastroj;
      if (!rezim) return;
      e.preventDefault(); e.stopPropagation();
      mapa.dragPan.disable();
      const r = mapa.getCanvas().getBoundingClientRect();
      const bod = (ev) => [ev.clientX - r.left, ev.clientY - r.top];
      kresleni.body = [bod(e)]; kresleni.rezim = rezim; kresleni.pridat = e.shiftKey || e.ctrlKey || e.metaKey;
      platno.width = r.width; platno.height = r.height; platno.hidden = false;
      const pohyb = (ev) => { const b = bod(ev); if (rezim === 'laso') kresleni.body.push(b); else kresleni.body[1] = b; nakresli(); };
      const konec = (ev) => {
        document.removeEventListener('mousemove', pohyb); document.removeEventListener('mouseup', konec);
        mapa.dragPan.enable();
        platno.hidden = true;
        const body = kresleni.body; kresleni.body = null;
        const posun = body[1] ? Math.hypot(body[1][0] - body[0][0], body[1][1] - body[0][1]) : 0;
        if (rezim === 'obdelnik' && posun < 4 && ui.nastroj === 'klik') {
          // Shift + klik bez tažení: přidat nebo odebrat jeden prvek.
          const f = prvekPod({ x: body[0][0], y: body[0][1] });
          if (f) nastavVyber([f.properties._i], { prepnout: true });
        } else if (rezim === 'obdelnik' && body[1]) vyberObdelnikem(body[0], body[1], kresleni.pridat || ev.shiftKey);
        if (rezim === 'laso' && body.length > 3) vyberLasem(body, kresleni.pridat || ev.shiftKey);
      };
      document.addEventListener('mousemove', pohyb); document.addEventListener('mouseup', konec);
    }, true);
    mapa.boxZoom.disable();
  }
  function nakresli() {
    const { platno, body, rezim } = kresleni;
    const c = platno.getContext('2d');
    c.clearRect(0, 0, platno.width, platno.height);
    c.strokeStyle = VYBER; c.fillStyle = 'rgba(0, 20, 100, 0.08)'; c.lineWidth = 1.5; c.setLineDash([5, 4]);
    c.beginPath();
    if (rezim === 'obdelnik' && body[1]) c.rect(body[0][0], body[0][1], body[1][0] - body[0][0], body[1][1] - body[0][1]);
    else body.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath(); c.fill(); c.stroke();
  }
  const vrstvyAktivni = () => VRSTVY_MAPY.filter((id) => ctx.mapa()?.getLayer(id));
  function prvekPod(bod) {
    const mapa = ctx.mapa();
    if (!mapa || !aktivni()) return null;
    const r = 3;
    const f = mapa.queryRenderedFeatures([[bod.x - r, bod.y - r], [bod.x + r, bod.y + r]], { layers: vrstvyAktivni() })
      .filter((x) => x.properties._v === u.aktivni);
    return f[0] || null;
  }
  function vyberObdelnikem(a, b, pridat) {
    const mapa = ctx.mapa();
    const f = mapa.queryRenderedFeatures([[Math.min(a[0], b[0]), Math.min(a[1], b[1])], [Math.max(a[0], b[0]), Math.max(a[1], b[1])]], { layers: vrstvyAktivni() })
      .filter((x) => x.properties._v === u.aktivni);
    nastavVyber(new Set(f.map((x) => x.properties._i)), { pridat });
  }
  function vyberLasem(body, pridat) {
    const mapa = ctx.mapa(); const v = aktivni();
    const indexy = [];
    v.aktualni.features.forEach((f, i) => {
      const t = teziste(f.geometry);
      if (!t) return;
      const p = mapa.project(t);
      if (bodVPolygonu([p.x, p.y], body)) indexy.push(i);
    });
    nastavVyber(indexy, { pridat });
  }

  function obnovListu() {
    if (!lista) return;
    const zap = ctx.karta() === 'upravy' && u.vrstvy.length > 0;
    lista.hidden = !zap;
    if (!zap) { popisek.hidden = true; return; }
    const v = aktivni();
    const nastroj = (k, text, titulek) => h('button', {
      type: 'button', 'aria-pressed': String(ui.nastroj === k), class: ui.nastroj === k ? 'zapnuto' : '', title: titulek,
      onclick: () => { ui.nastroj = k; obnovListu(); ctx.mapa().getCanvas().style.cursor = k === 'klik' ? '' : 'crosshair'; },
    }, text);
    lista.replaceChildren(
      nastroj('klik', 'Klik', 'Klik vybere prvek, Shift + klik přidá nebo odebere, Shift + tažení vybere obdélníkem. Mapou jde normálně posouvat.'),
      nastroj('obdelnik', 'Obdélník', 'Tažením vyber všechny prvky v obdélníku (Shift přidá k výběru). Mapou posuneš v režimu Klik.'),
      nastroj('laso', 'Laso', 'Obtáhni prvky – vyberou se ty, jejichž střed je uvnitř (Shift přidá k výběru).'),
      h('span', { class: 'oddelovac', 'aria-hidden': 'true' }),
      h('button', {
        type: 'button', 'aria-pressed': String(ui.porovnat && !!(v && v.mira > 0)), class: ui.porovnat && v && v.mira > 0 ? 'zapnuto' : '', disabled: !(v && v.mira > 0),
        title: v && v.mira > 0 ? 'Červená čárkovaná čára ukáže původní tvar před zjednodušením' : 'Porovnání má smysl až po zjednodušení',
        onclick: () => { ui.porovnat = !ui.porovnat; obnovListu(); ctx.naplanujMapu(); },
      }, 'Porovnat s původní'),
      h('button', { type: 'button', onclick: () => priblizNa(aktivni(), ui.vyber.size ? ui.vyber : null) }, ui.vyber.size ? 'Přiblížit na výběr' : 'Přiblížit na vrstvu'),
    );
    ctx.mapa().getCanvas().style.cursor = ui.nastroj === 'klik' ? '' : 'crosshair';
  }

  // ------------------------------------------------------------ úpravy
  async function zjednodus(mira) {
    const v = aktivni();
    if (!v) return;
    await pracuj('Zjednodušuji…', async () => {
      const nova = await sestavVrstvu({ ...v, mira });
      ui.miraNahled = null;
      nahradVrstvu(nova, mira ? `zjednodušení ${v.nazev} na ${100 - mira} %` : `zrušení zjednodušení ${v.nazev}`, { vyber: ui.vyber });
    });
  }

  async function pripravNahledSlouceni() {
    const v = aktivni();
    ui.nahled = null;
    if (!v) return;
    const s = ui.sloucit;
    try {
      if (s.zpusob === 'vybrane') {
        if (ui.vyber.size < 2) { ctx.naplanujMapu(); return; }
        ui.nahled = await sloucene(v, [...ui.vyber], s.mezery);
      } else if (s.sloupec) {
        // Každá skupina v náhledu jinou barvou, ať je vidět, co se s čím spojí.
        const fc = await slouceneSloupcem(v, s.sloupec, s.mezery);
        ui.nahled = { ...fc, features: fc.features.map((f, i) => ({ ...f, properties: { ...f.properties, _barva: BARVY_VRSTEV[i % BARVY_VRSTEV.length] } })) };
      }
    } catch (e) { console.warn(e); }
    ctx.naplanujMapu();
    ctx.vykresliPanel();
  }

  // Sloučení se počítá nad zjednodušenými tvary (rychlé) jen pro náhled, nad plnými pro výsledek.
  async function sloucene(v, indexy, mezery, { plne = false } = {}) {
    const zdroj = plne ? v.zaklad : v.aktualni;
    const fc = { type: 'FeatureCollection', features: indexy.map((i) => zdroj.features[i]).filter((f) => f?.geometry) };
    const vystup = await mapshaper(`-i vstup.json -dissolve2${mezery ? ' gap-fill-area=10km2' : ''} -o vystup.json format=geojson geojson-type=FeatureCollection`, { 'vstup.json': JSON.stringify(fc) });
    return zTextu(vystup['vystup.json']);
  }
  async function slouceneSloupcem(v, sloupec, mezery, { plne = false } = {}) {
    const zdroj = plne ? v.zaklad : v.aktualni;
    // Hodnoty sloupce přes mapshaper projdou jako text v pomocném sloupci (název může mít mezery).
    const fc = { type: 'FeatureCollection', features: zdroj.features.filter((f) => f.geometry).map((f) => ({ ...f, properties: { _skupina: f.properties?.[sloupec] == null ? '' : String(f.properties[sloupec]) } })) };
    const vystup = await mapshaper(`-i vstup.json -dissolve2 _skupina${mezery ? ' gap-fill-area=10km2' : ''} -o vystup.json format=geojson geojson-type=FeatureCollection`, { 'vstup.json': JSON.stringify(fc) });
    return zTextu(vystup['vystup.json']);
  }

  async function provedSlouceni() {
    const v = aktivni(); const s = ui.sloucit;
    await pracuj('Slučuji…', async () => {
      if (s.zpusob === 'vybrane') {
        const indexy = [...ui.vyber].sort((a, b) => a - b);
        if (indexy.length < 2) throw new Error('vyber aspoň dva prvky');
        const vysledek = await sloucene(v, indexy, s.mezery, { plne: true });
        const prvni = v.zaklad.features[indexy[0]];
        const props = { ...(prvni.properties || {}), id: s.id || idPrvku(prvni.properties) || '', nazev: s.nazev || nazevPrvku(prvni.properties) };
        const slouceny = { type: 'Feature', properties: props, geometry: vysledek.features[0]?.geometry };
        if (!slouceny.geometry) throw new Error('výsledek je prázdný');
        const vynechat = new Set(s.ponechat ? [] : indexy);
        const features = [];
        let novyIndex = -1;
        v.zaklad.features.forEach((f, i) => {
          if (i === indexy[0] && !s.ponechat) { novyIndex = features.length; features.push(slouceny); }
          if (!vynechat.has(i)) features.push(f);
        });
        if (s.ponechat) { novyIndex = features.length; features.push(slouceny); }
        const nova = await novyZaklad(v, { type: 'FeatureCollection', features });
        ui.pohled = 'hlavni';
        nahradVrstvu(nova, `sloučení ${indexy.length} prvků do „${props.nazev}“`, { vyber: [novyIndex] });
        hlaska(`Sloučeno do „${props.nazev}“: ${prvku(indexy.length)}.`, false, { akce: { text: 'Vrátit', fn: () => ctx.zpet(1) } });
      } else {
        if (!s.sloupec) throw new Error('vyber sloupec');
        const vysledek = await slouceneSloupcem(v, s.sloupec, s.mezery, { plne: true });
        const features = vysledek.features.map((f) => ({ type: 'Feature', properties: { id: f.properties._skupina, nazev: f.properties._skupina, [s.sloupec]: f.properties._skupina }, geometry: f.geometry }));
        const nazev = `${v.nazev} podle ${s.sloupec}`;
        const nova = await sestavVrstvu({ id: novyId(), nazev, puvod: `sloučení podle ${s.sloupec}`, zaklad: { type: 'FeatureCollection', features }, mira: v.mira, barva: volnaBarva(), skryta: false, topologie: true });
        ui.pohled = 'hlavni'; ui.vyber.clear(); ui.nahled = null;
        zmen({ vrstvy: [...u.vrstvy, nova], aktivni: nova.id }, `sloučení podle sloupce ${s.sloupec}`);
        hlaska(`Vznikla nová vrstva „${nazev}“ (${prvku(features.length)}). Původní zůstala beze změny.`);
      }
    });
  }

  // Změnil čištěním prvek tvar? Drobné přichycení bodů nepočítáme – jen jiný počet bodů
  // nebo změnu plochy o víc než 0,01 % (zaplněná mezera, odstraněný překryv).
  function jinyTvar(a, b) {
    let na = 0; let nb = 0;
    proBody(a, () => { na++; }); proBody(b, () => { nb++; });
    if (na !== nb) return true;
    const pa = plocha(a); const pb = plocha(b);
    return Math.abs(pa - pb) > Math.max(Math.abs(pa), 1e-12) * 1e-4;
  }

  async function vycisti() {
    const v = aktivni();
    await pracuj('Čistím…', async () => {
      // Porovnává se s průchodem mapshaperem bez čištění – ten sám mění pořadí bodů v kruzích.
      const [vystup, beze] = await Promise.all([
        mapshaper('-i vstup.json -clean allow-empty -o vystup.json format=geojson geojson-type=FeatureCollection', { 'vstup.json': naText(v.zaklad) }),
        mapshaper('-i vstup.json -o vystup.json format=geojson geojson-type=FeatureCollection', { 'vstup.json': naText(v.zaklad) }),
      ]);
      const cista = zTextu(vystup['vystup.json']);
      const puvodni = zTextu(beze['vystup.json']);
      // Prvky, které po vyčištění zmizely (prázdné), se odeberou. Změněné si zapamatujeme.
      const zmenene = []; let prazdnych = 0;
      const features = [];
      cista.features.forEach((f, i) => {
        if (!f.geometry) { prazdnych++; return; }
        if (jinyTvar(f.geometry, puvodni.features[i]?.geometry)) zmenene.push(features.length);
        features.push({ ...f, properties: v.zaklad.features[i]?.properties || f.properties });
      });
      if (!zmenene.length && !prazdnych) { hlaska('Vrstva je v pořádku – nebylo co čistit.'); return; }
      const nova = await novyZaklad(v, { type: 'FeatureCollection', features });
      nahradVrstvu(nova, `vyčištění ${v.nazev}`);
      const casti = [];
      if (zmenene.length) casti.push(`opraveno ${prvku(zmenene.length)} (překryvy, mezery mezi sousedy, chybné tvary)`);
      if (prazdnych) casti.push(`odebrané prázdné prvky: ${pocet(prazdnych)}`);
      hlaska(`Vyčištěno: ${casti.join(', ')}.`, false, {
        akce: [
          zmenene.length ? { text: 'Ukázat místa', fn: () => { nastavVyber(zmenene); priblizNa(aktivni(), zmenene); } } : null,
          { text: 'Vrátit', fn: () => ctx.zpet(1) },
        ].filter(Boolean),
      });
    });
  }

  async function ponechatVybrane(ponechat) {
    const v = aktivni();
    const pocetVyb = ui.vyber.size;
    if (!pocetVyb) return;
    await pracuj(ponechat ? 'Ořezávám…' : 'Mažu…', async () => {
      const features = v.zaklad.features.filter((_, i) => ui.vyber.has(i) === ponechat);
      if (!features.length) throw new Error('ve vrstvě by nezůstal žádný prvek');
      const nova = await novyZaklad(v, { type: 'FeatureCollection', features });
      nahradVrstvu(nova, ponechat ? `ponechání ${pocetVyb} vybraných prvků` : `smazání ${pocetVyb} prvků`);
      hlaska(ponechat ? `Ve vrstvě zůstalo ${prvku(pocetVyb)}.` : `Smazáno ${prvku(pocetVyb)}.`, false, { akce: { text: 'Vrátit', fn: () => ctx.zpet(1) } });
    });
  }

  async function spojVrstvy(ids) {
    const vybrane = u.vrstvy.filter((v) => ids.includes(v.id));
    if (vybrane.length < 2) return;
    await pracuj('Spojuji vrstvy…', async () => {
      const features = vybrane.flatMap((v) => v.zaklad.features.map((f) => ({ ...f, properties: { ...f.properties } })));
      const nazev = vybrane.map((v) => v.nazev).join(' + ');
      const nova = await sestavVrstvu({ id: novyId(), nazev, puvod: 'spojení vrstev', zaklad: { type: 'FeatureCollection', features }, mira: 0, barva: vybrane[0].barva, skryta: false, topologie: true });
      ui.vyber.clear();
      zmen({ vrstvy: [...u.vrstvy.filter((v) => !ids.includes(v.id)), nova], aktivni: nova.id }, `spojení ${vybrane.length} vrstev`);
      hlaska(`Vrstvy spojené do jedné (${prvku(features.length)}).`, false, { akce: { text: 'Vrátit', fn: () => ctx.zpet(1) } });
    });
  }

  function upravVlastnosti(i, klic, hodnota) {
    const v = aktivni();
    const zmen1 = (fc) => ({ ...fc, features: fc.features.map((f, j) => (j === i ? { ...f, properties: { ...f.properties, [klic]: hodnota } } : f)) });
    const nova = { ...v, zaklad: zmen1(v.zaklad), aktualni: v.aktualni === v.zaklad ? null : zmen1(v.aktualni) };
    if (!nova.aktualni) nova.aktualni = nova.zaklad;
    nova.info = { ...v.info, zakladFc: nova.zaklad };
    nahradVrstvu(nova, `úprava sloupce ${klic}`, { vyber: ui.vyber });
  }

  function upravVrstvu(id, zmeny, popis) {
    zmen({ ...u, vrstvy: u.vrstvy.map((v) => (v.id === id ? { ...v, ...zmeny } : v)) }, popis);
  }
  function odeberVrstvu(id) {
    const v = u.vrstvy.find((x) => x.id === id);
    const vrstvy = u.vrstvy.filter((x) => x.id !== id);
    ui.vyber.clear(); ui.nahled = null;
    zmen({ vrstvy, aktivni: u.aktivni === id ? (vrstvy.at(-1)?.id || null) : u.aktivni }, `odebrání vrstvy ${v?.nazev || ''}`);
    hlaska(`Vrstva „${v?.nazev}“ odebrána.`, false, { akce: { text: 'Vrátit', fn: () => ctx.zpet(1) } });
  }

  // ------------------------------------------------------------ výstup
  // Co se posílá: vybrané prvky, nebo celá vrstva, když není nic vybráno.
  function vystupniData({ jenIdNazev = false } = {}) {
    const v = aktivni();
    const prvky = ui.vyber.size ? v.aktualni.features.filter((_, i) => ui.vyber.has(i)) : v.aktualni.features;
    return {
      type: 'FeatureCollection',
      features: prvky.map((f) => ({
        type: 'Feature',
        properties: jenIdNazev ? { id: idPrvku(f.properties), nazev: nazevPrvku(f.properties) } : f.properties,
        geometry: f.geometry,
      })),
    };
  }

  function poslatJakoData(pridat) {
    const v = aktivni();
    const fc = vystupniData();
    const dosavadni = ctx.vlastniData();
    const data = pridat && dosavadni ? { type: 'FeatureCollection', features: [...dosavadni.geojson.features, ...fc.features] } : fc;
    ctx.nastavVlastniData(pridat && dosavadni ? `${dosavadni.nazev} + ${v.nazev}` : v.nazev, data);
    ctx.zmena((s) => { s.nahled.sada = 'vlastni'; s.nahled.vlastniBarvit = s.nahled.vlastniBarvit || 'jedna'; });
    hlaska(`${pridat ? 'Přidáno k datům na mapě' : 'Na mapě jako zkušební data'}: ${prvku(fc.features.length)}.`, false, {
      akce: { text: 'Otevřít kartu Data', fn: () => ctx.prepniKartu('data') },
    });
  }

  async function poslatJakoMasku() {
    const v = aktivni();
    const fc = vystupniData();
    const plochy = fc.features.filter((f) => /Polygon/.test(f.geometry?.type || ''));
    if (!plochy.length) { hlaska('Maska potřebuje plochy – vrstva má jen body nebo čáry.', true); return; }
    await pracuj('Připravuji masku…', async () => {
      // Maska se ukládá do mapy, proto se zjednoduší tak, aby se vešla do týmové tabulky.
      const text = JSON.stringify({ type: 'FeatureCollection', features: plochy.map((f) => ({ type: 'Feature', properties: { nazev: nazevPrvku(f.properties), id: idPrvku(f.properties) }, geometry: f.geometry })) });
      let vysledek = null; let zjednoduseno = false;
      for (const zachovat of [100, 50, 25, 12, 6, 3, 1.5, 0.7, 0.3]) {
        const prikaz = `-i vstup.json${zachovat < 100 ? ` -simplify ${zachovat}% keep-shapes` : ''} -o vystup.json format=geojson geojson-type=FeatureCollection precision=0.0001`;
        const fc2 = zTextu((await mapshaper(prikaz, { 'vstup.json': text }))['vystup.json']);
        vysledek = fc2;
        zjednoduseno = zachovat < 100;
        if (JSON.stringify(fc2).length <= LIMIT_MASKY) break;
      }
      const oblasti = vysledek.features.filter((f) => f.geometry).map((f) => ({ typ: 'vlastni', id: f.properties.id || '', nazev: f.properties.nazev || v.nazev, geometrie: f.geometry }));
      ctx.zmena((s) => { s.recept.maska.oblasti = oblasti; });
      hlaska(`Maska nastavená (${pocet(oblasti.length)} ${oblasti.length === 1 ? 'oblast' : 'oblastí'})${zjednoduseno ? ', kvůli uložení do mapy zjednodušená' : ''}.`, false, {
        akce: { text: 'Otevřít kartu Maska', fn: () => ctx.prepniKartu('maska') },
      });
    });
  }

  function stahniBlob(jmeno, obsah, typ) {
    const blob = obsah instanceof Blob ? obsah : new Blob([obsah], { type: typ });
    const a = h('a', { href: URL.createObjectURL(blob), download: jmeno });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const jmenoSouboru = (t) => bezDiakritiky(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'data';

  async function stahni(format) {
    const v = aktivni();
    const fc = vystupniData({ jenIdNazev: ui.jenIdNazev });
    const jmeno = jmenoSouboru(v.nazev) + (ui.vyber.size ? '-vyber' : '');
    if (format === 'geojson') { stahniBlob(`${jmeno}.geojson`, JSON.stringify(fc), 'application/geo+json'); return; }
    await pracuj('Připravuji soubor…', async () => {
      const prikaz = {
        topojson: `-i ${jmeno}.json -o ${jmeno}.topojson format=topojson`,
        shp: `-i ${jmeno}.json -o ${jmeno}.zip format=shapefile`,
        csv: `-i ${jmeno}.json -o ${jmeno}.csv format=csv`,
      }[format];
      const vystup = await mapshaper(prikaz, { [`${jmeno}.json`]: JSON.stringify(fc) });
      for (const [n, obsah] of Object.entries(vystup)) stahniBlob(n, obsah, format === 'csv' ? 'text/csv' : 'application/octet-stream');
    });
  }

  // ------------------------------------------------------------ panel
  function panel() {
    obnovListu();
    const prace = ui.prace ? h('div', { class: 'upravy-prace', role: 'status' }, h('span', { class: 'tocitko', 'aria-hidden': 'true' }), ui.prace) : null;
    if (!u.vrstvy.length) return [prace, prazdnyPanel()];
    const v = aktivni();
    return [
      prace,
      blokVrstev(),
      v && ui.pohled === 'sloucit' ? blokSlouceni(v) : v ? [blokVyberu(v), blokZjednoduseni(v), blokAkci(v)] : null,
      v ? blokVystupu(v) : null,
    ];
  }

  function zonaPretazeni(obsah, trida = '') {
    const zona = h('div', {
      class: `upravy-zona ${trida}`, tabindex: '0', role: 'button',
      onclick: () => vyberSoubory(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vyberSoubory(); } },
      ondragover: (e) => { e.preventDefault(); zona.classList.add('nad'); },
      ondragleave: () => zona.classList.remove('nad'),
      ondrop: (e) => { e.preventDefault(); zona.classList.remove('nad'); pridejSoubory(e.dataTransfer.files); },
    }, obsah);
    return zona;
  }
  function vyberSoubory() {
    const vstup = h('input', { type: 'file', multiple: true, accept: '.json,.geojson,.topojson,.zip,.shp,.dbf,.prj,.cpg,.shx,.kml,.csv,.tsv,.txt', hidden: true });
    vstup.addEventListener('change', () => { pridejSoubory(vstup.files); vstup.remove(); });
    document.body.append(vstup);
    vstup.click();
  }
  const FORMATY = 'GeoJSON · TopoJSON · Shapefile (zip nebo .shp + .dbf + .prj) · KML · CSV se souřadnicemi';

  function prazdnyPanel() {
    const ned = nedavne();
    return [
      h('h2', {}, 'Úpravy dat'),
      h('p', { class: 'upravy-uvod' }, 'Hranice států, krajů, obcí nebo vlastní soubory. Zjednodušíš je, sloučíš a pošleš na mapu nebo stáhneš pro Flourish.'),
      h('button', { class: 'tl tl-modre velke upravy-pridat', onclick: () => otevriPridat() }, '+ Přidat data'),
      zonaPretazeni([h('strong', {}, 'Nebo sem přetáhni soubor'), h('small', {}, FORMATY)]),
      ctx.vlastniData() || ctx.stav().recept.maska.oblasti.length ? [
        h('h2', {}, 'Z mapy'),
        h('div', { class: 'tlacitka' },
          ctx.vlastniData() ? h('button', { class: 'tl', onclick: prevzitData }, 'Vlastní data z karty Data') : null,
          ctx.stav().recept.maska.oblasti.length ? h('button', { class: 'tl', onclick: prevzitMasku }, 'Oblasti masky') : null),
      ] : null,
      ned.length ? [
        h('h2', {}, 'Naposledy použité'),
        h('div', { class: 'upravy-nedavne' }, ned.map((n) => h('button', {
          class: 'volba', onclick: async () => {
            const d = await nactiDatabazi();
            const uz = d.uzemi.find((x) => x.kod === n.uzemi); const vr = uz?.vrstvy.find((x) => x.klic === n.klic);
            if (uz && vr) pridejZDatabaze([{ uzemi: uz, vrstva: vr }], false); else hlaska('Tahle data už v databázi nejsou.', true);
          },
        }, n.nazev, h('small', {}, 'databáze')))),
      ] : null,
    ];
  }

  function blokVrstev() {
    return [
      h('div', { class: 'upravy-hlavicka' }, h('h2', {}, 'Vrstvy'), h('button', { class: 'tl tl-male', onclick: () => otevriPridat() }, '+ Přidat data')),
      h('div', { class: 'upravy-vrstvy' }, u.vrstvy.map((v) => {
        const akt = v.id === u.aktivni;
        return h('div', { class: `upravy-vrstva${akt ? ' aktivni' : ''}${v.skryta ? ' skryta' : ''}` },
          ctx.vzorekBarvy(v.barva, (e) => ctx.otevriVybirac(e.currentTarget, v.barva, (b) => upravVrstvu(v.id, { barva: b }, 'barva vrstvy')), 'Barva vrstvy na mapě (jen v kartě Úpravy)'),
          h('button', {
            class: 'jmeno', 'aria-pressed': String(akt), title: akt ? 'Aktivní vrstva – s ní pracují nástroje' : 'Pracovat s touto vrstvou',
            onclick: () => { if (!akt) { ui.vyber.clear(); ui.nahled = null; ui.pohled = 'hlavni'; zmen({ ...u, aktivni: v.id }, `přepnutí na vrstvu ${v.nazev}`); } },
          }, h('span', {}, v.nazev), h('small', {}, `${v.puvod} · ${prvku(v.info.prvku)} · ${v.info.druh}${v.mira ? ` · zjednodušeno na ${100 - v.mira} %` : ''}`)),
          h('button', {
            class: 'tl-ikona-mala', 'aria-label': v.skryta ? 'Zobrazit vrstvu' : 'Skrýt vrstvu', title: v.skryta ? 'Zobrazit' : 'Skrýt',
            onclick: () => upravVrstvu(v.id, { skryta: !v.skryta }, v.skryta ? 'zobrazení vrstvy' : 'skrytí vrstvy'),
          }, oko(!v.skryta)),
          h('button', { class: 'tl-ikona-mala', 'aria-label': 'Další akce s vrstvou', 'aria-haspopup': 'menu', onclick: (e) => menuVrstvy(e.currentTarget, v) }, '⋯'),
        );
      })),
    ];
  }
  function oko(otevrene) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.setAttribute('viewBox', '0 0 18 18'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = otevrene
      ? '<path d="M1.5 9 C4 4.5 14 4.5 16.5 9 C14 13.5 4 13.5 1.5 9 Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="9" cy="9" r="2.3" fill="currentColor"/>'
      : '<path d="M1.5 9 C4 4.5 14 4.5 16.5 9 C14 13.5 4 13.5 1.5 9 Z" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.5"/><path d="M3 15 L15 3" stroke="currentColor" stroke-width="1.6"/>';
    return s;
  }
  function menuVrstvy(kotva, v) {
    ctx.otevriPopup(kotva, (zavri) => h('div', { class: 'menu', role: 'menu' },
      ctx.polozkaMenu('Přejmenovat…', () => {
        zavri();
        const nazev = prompt('Nový název vrstvy:', v.nazev);
        if (nazev && nazev.trim() && nazev !== v.nazev) upravVrstvu(v.id, { nazev: nazev.trim() }, 'přejmenování vrstvy');
      }),
      ctx.polozkaMenu('Přiblížit na vrstvu', () => { zavri(); priblizNa(v); }),
      ctx.polozkaMenu('Duplikovat', () => {
        zavri();
        const kopie = { ...v, id: novyId(), nazev: `${v.nazev} (kopie)`, barva: volnaBarva() };
        zmen({ vrstvy: [...u.vrstvy, kopie], aktivni: kopie.id }, 'duplikace vrstvy');
      }),
      u.vrstvy.length > 1 ? ctx.polozkaMenu('Spojit s jinou vrstvou…', () => { zavri(); otevriSpojeni(v); }) : null,
      ctx.polozkaMenu('Odebrat vrstvu', () => { zavri(); odeberVrstvu(v.id); }, { nebezpecne: true }),
    ), { zarovnat: 'vpravo' });
  }

  function blokVyberu(v) {
    const n = ui.vyber.size;
    const nazvy = [...ui.vyber].slice(0, 12).map((i) => ({ i, t: nazevPrvku(v.aktualni.features[i]?.properties) || `Prvek ${i + 1}` }));
    const hledat = h('input', {
      class: 'pole', type: 'search', placeholder: `Najít prvek podle názvu (${prvku(v.info.prvku)})…`, value: ui.hledat, 'aria-label': 'Najít prvek podle názvu',
      oninput: (e) => { ui.hledat = e.target.value; obnovNalezene(); },
    });
    const nalezeneBox = h('div');
    function obnovNalezene() {
      const q = bezDiakritiky(ui.hledat.trim());
      if (!q) { nalezeneBox.replaceChildren(); return; }
      const nalezene = [];
      for (let i = 0; i < v.aktualni.features.length && nalezene.length < 8; i++) {
        const p = v.aktualni.features[i].properties;
        if (bezDiakritiky(`${nazevPrvku(p)} ${idPrvku(p)}`).includes(q)) nalezene.push(i);
      }
      nalezeneBox.replaceChildren(h('div', { class: 'seznam-voleb' },
        nalezene.map((i) => h('button', {
          class: 'volba', onclick: () => { nastavVyber([i], { pridat: true }); priblizNa(v, [i]); },
        }, nazevPrvku(v.aktualni.features[i].properties) || `Prvek ${i + 1}`, h('small', {}, ui.vyber.has(i) ? 'vybráno' : idPrvku(v.aktualni.features[i].properties)))),
        nalezene.length ? null : h('div', { class: 'poznamka' }, 'Nic nenalezeno.')));
    }
    obnovNalezene();
    const jeden = n === 1 ? [...ui.vyber][0] : null;
    return [
      h('div', { class: 'upravy-hlavicka' },
        h('h2', {}, 'Výběr'),
        h('span', { class: 'upravy-pocet' }, n ? prvku(n) : 'nic'),
        h('span', { class: 'mezera' }),
        h('button', { class: 'odkaz-tl', onclick: () => nastavVyber(v.aktualni.features.map((_, i) => i)) }, 'Vše'),
        h('button', { class: 'odkaz-tl', disabled: !n, onclick: () => nastavVyber(v.aktualni.features.map((_, i) => i).filter((i) => !ui.vyber.has(i))) }, 'Obrátit'),
        h('button', { class: 'odkaz-tl', disabled: !n, onclick: () => nastavVyber([]) }, 'Zrušit')),
      n ? h('div', { class: 'upravy-stitky' },
        nazvy.map(({ i, t }) => h('span', { class: 'upravy-stitek' }, t,
          h('button', { 'aria-label': `Odebrat ${t} z výběru`, onclick: () => nastavVyber([i], { prepnout: true }) }, '×'))),
        n > 12 ? h('span', { class: 'upravy-stitek dalsi' }, `a dalších ${pocet(n - 12)}`) : null)
        : h('p', { class: 'poznamka' }, 'Klikni na prvek v mapě. Shift + klik přidá další, Shift + tažení vybere obdélníkem.'),
      hledat, nalezeneBox,
      jeden != null ? blokVlastnosti(v, jeden) : null,
    ];
  }

  function blokVlastnosti(v, i) {
    const p = v.zaklad.features[i]?.properties || {};
    const klicNazvu = 'nazev' in p || !Object.keys(p).length ? 'nazev' : (Object.keys(p).find((k) => p[k] === nazevPrvku(p)) || 'nazev');
    const klicId = 'id' in p || !Object.keys(p).length ? 'id' : (Object.keys(p).find((k) => String(p[k]) === idPrvku(p)) || 'id');
    const pole = (popis, klic) => h('label', { class: 'upravy-pole' }, popis,
      h('input', { class: 'pole', value: p[klic] ?? '', onchange: (e) => upravVlastnosti(i, klic, e.target.value) }));
    const dalsi = Object.entries(p).filter(([k]) => k !== klicNazvu && k !== klicId && !k.startsWith('_')).slice(0, 8);
    return h('div', { class: 'upravy-vlastnosti' },
      pole(`Název (${klicNazvu})`, klicNazvu),
      pole(`Kód (${klicId})`, klicId),
      dalsi.length ? h('dl', {}, dalsi.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, String(val ?? ''))])) : null);
  }

  function blokZjednoduseni(v) {
    const mira = ui.miraNahled ?? v.mira;
    const vystup = h('span', { class: 'hodnota' }, `${mira} %`);
    const druhBez = v.info.druh === 'body';
    return [
      h('h2', {}, 'Zjednodušit'),
      druhBez ? h('p', { class: 'poznamka' }, 'Body se zjednodušit nedají.') : [
        h('div', { class: 'radek' },
          h('label', { for: 'upravy-mira' }, 'Míra zjednodušení'),
          h('input', {
            id: 'upravy-mira', type: 'range', min: 0, max: 99, step: 1, value: mira, disabled: !!ui.prace,
            oninput: (e) => { ui.miraNahled = +e.target.value; vystup.textContent = `${ui.miraNahled} %`; },
            onchange: (e) => zjednodus(+e.target.value),
          }),
          vystup),
        h('div', { class: 'upravy-cisla' },
          h('div', {}, h('small', {}, 'Velikost souboru'), h('strong', {}, v.mira ? `${velikost(v.info.velikostZaklad)} → ${velikost(v.info.velikost)}` : velikost(v.info.velikost))),
          h('div', {}, h('small', {}, 'Počet bodů'), h('strong', {}, v.mira ? `${pocet(v.info.body)} (${Math.max(1, Math.round((v.info.body / Math.max(1, v.info.bodyZaklad)) * 100))} %)` : pocet(v.info.body)))),
        h('label', { class: 'prepinac' },
          h('input', {
            type: 'checkbox', checked: v.topologie !== false,
            onchange: async (e) => {
              const t = e.target.checked;
              await pracuj('Zjednodušuji…', async () => nahradVrstvu(await sestavVrstvu({ ...v, topologie: t }), t ? 'společné hranice sousedů' : 'zjednodušení bez společných hranic', { vyber: ui.vyber }));
            },
          }),
          'Hranice sousedů zůstanou společné (bez mezer)'),
        h('p', { class: 'poznamka' }, 'Posuvník ukáže výsledek po puštění. Zjednodušuje se vždy z plné podrobnosti, takže jde kdykoli vrátit. Malé ostrovy nezmizí.'),
      ],
    ];
  }

  function blokAkci(v) {
    const n = ui.vyber.size;
    const tl = (text, fn, { hlavni = false, vypnuto = false, titulek = '' } = {}) => h('button', {
      class: `tl upravy-akce${hlavni ? ' hlavni' : ''}`, disabled: vypnuto || !!ui.prace, title: titulek, onclick: fn,
    }, text);
    const plochy = /plochy|smíšené/.test(v.info.druh);
    return [
      h('h2', {}, 'Upravit'),
      h('div', { class: 'upravy-mrizka' },
        tl('Sloučit vybrané', () => otevriSlouceni('vybrane'), { hlavni: true, vypnuto: n < 2 || !plochy, titulek: n < 2 ? 'Vyber aspoň dva prvky' : 'Spojí vybrané plochy do jedné (dissolve)' }),
        tl('Sloučit podle sloupce…', () => otevriSlouceni('sloupec'), { vypnuto: !plochy, titulek: 'Prvky se stejnou hodnotou ve sloupci se spojí (např. obce podle okresu)' }),
        tl('Spojit vrstvy…', () => otevriSpojeni(v), { vypnuto: u.vrstvy.length < 2, titulek: u.vrstvy.length < 2 ? 'Potřebuješ aspoň dvě vrstvy' : 'Spojí prvky několika vrstev do jedné (merge)' }),
        tl('Vyčistit', vycisti, { vypnuto: !plochy, titulek: 'Opraví překryvy, mezery mezi sousedy a chybné tvary (clean)' }),
        tl('Ponechat jen vybrané', () => ponechatVybrane(true), { vypnuto: !n, titulek: n ? '' : 'Nejdřív něco vyber' }),
        tl('Smazat vybrané', () => ponechatVybrane(false), { vypnuto: !n, titulek: n ? '' : 'Nejdřív něco vyber' })),
    ];
  }

  function sloupceVrstvy(v) {
    const pocty = new Map();
    for (const f of v.zaklad.features.slice(0, 5000)) for (const k of Object.keys(f.properties || {})) if (!k.startsWith('_')) pocty.set(k, (pocty.get(k) || 0) + 1);
    return [...pocty.keys()].map((k) => {
      const hodnoty = new Set(v.zaklad.features.map((f) => String(f.properties?.[k] ?? '')));
      return { k, ruznych: hodnoty.size };
    }).filter((s) => s.ruznych < v.zaklad.features.length || v.zaklad.features.length < 2);
  }

  function otevriSlouceni(zpusob) {
    const v = aktivni();
    const prvni = [...ui.vyber].sort((a, b) => a - b)[0];
    const p = prvni != null ? v.zaklad.features[prvni]?.properties || {} : {};
    ui.sloucit = { ...ui.sloucit, zpusob, nazev: zpusob === 'vybrane' ? nazevPrvku(p) : '', id: zpusob === 'vybrane' ? idPrvku(p) : '', sloupec: zpusob === 'sloupec' ? (ui.sloucit.sloupec || sloupceVrstvy(v)[0]?.k || '') : ui.sloucit.sloupec };
    ui.pohled = 'sloucit';
    ctx.vykresliPanel();
    pripravNahledSlouceni();
  }

  function blokSlouceni(v) {
    const s = ui.sloucit;
    const n = ui.vyber.size;
    const sloupce = sloupceVrstvy(v);
    const nastav = (zmeny, prepocitat = false) => { Object.assign(ui.sloucit, zmeny); if (prepocitat) pripravNahledSlouceni(); else ctx.vykresliPanel(); };
    const volba = (k, nadpis, popis) => h('label', { class: `upravy-volba${s.zpusob === k ? ' zvolena' : ''}` },
      h('input', { type: 'radio', name: 'zpusob-slouceni', checked: s.zpusob === k, onchange: () => nastav({ zpusob: k }, true) }),
      h('span', {}, h('strong', {}, nadpis), h('small', {}, popis)));
    const nazvyVyberu = [...ui.vyber].slice(0, 6).map((i) => nazevPrvku(v.zaklad.features[i]?.properties)).filter(Boolean).join(', ');
    return [
      h('button', { class: 'odkaz-tl zpet-tl', onclick: () => { ui.pohled = 'hlavni'; ui.nahled = null; prekresli(); } }, `‹ Zpět na vrstvu ${v.nazev}`),
      h('h2', {}, 'Sloučit prvky'),
      h('div', { class: 'upravy-volby', role: 'radiogroup', 'aria-label': 'Co sloučit' },
        volba('vybrane', 'Vybrané do jednoho', n >= 2 ? `${prvku(n)}: ${nazvyVyberu}${n > 6 ? '…' : ''}` : 'Nejdřív vyber v mapě aspoň dva prvky (Shift + klik).'),
        volba('sloupec', 'Podle sloupce', 'Prvky se stejnou hodnotou se spojí, vznikne nová vrstva.')),
      s.zpusob === 'vybrane' ? [
        h('label', { class: 'upravy-pole' }, 'Název nového prvku (nazev)', h('input', { class: 'pole', value: s.nazev, oninput: (e) => { s.nazev = e.target.value; } })),
        h('label', { class: 'upravy-pole' }, 'Kód (id)', h('input', { class: 'pole', value: s.id, placeholder: 'např. brno-okoli', oninput: (e) => { s.id = e.target.value; } })),
        h('label', { class: 'prepinac' }, h('input', { type: 'checkbox', checked: s.ponechat, onchange: (e) => { s.ponechat = e.target.checked; } }), 'Původní prvky ponechat (sloučený přidat navíc)'),
      ] : [
        sloupce.length ? h('label', { class: 'upravy-pole' }, 'Sloupec',
          h('select', { class: 'pole', onchange: (e) => nastav({ sloupec: e.target.value }, true) },
            sloupce.map((c) => h('option', { value: c.k, selected: c.k === s.sloupec }, `${c.k} (${pocet(c.ruznych)} různých hodnot)`))))
          : h('p', { class: 'poznamka' }, 'Vrstva nemá sloupec, podle kterého by šlo slučovat – každý prvek má jinou hodnotu.'),
      ],
      h('label', { class: 'prepinac' }, h('input', { type: 'checkbox', checked: s.mezery, onchange: (e) => nastav({ mezery: e.target.checked }, true) }), 'Zaplnit drobné mezery uvnitř (do 10 km²)'),
      h('div', { class: 'tlacitka' },
        h('button', { class: 'tl tl-modre velke', disabled: !!ui.prace || (s.zpusob === 'vybrane' ? n < 2 : !s.sloupec), onclick: provedSlouceni }, 'Sloučit'),
        h('button', { class: 'tl velke', onclick: () => { ui.pohled = 'hlavni'; ui.nahled = null; prekresli(); } }, 'Zrušit')),
      h('p', { class: 'poznamka' }, ui.nahled ? 'Na mapě vidíš výsledek předem (čárkovaný obrys). Po sloučení jde všechno vrátit tlačítkem Zpět.' : 'Náhled výsledku se ukáže na mapě čárkovaně.'),
    ];
  }

  function otevriSpojeni(v) {
    const zvolene = new Set([v.id]);
    ctx.maleOkno('Spojit vrstvy', [
      h('p', { class: 'poznamka' }, 'Prvky vybraných vrstev se spojí do jedné nové vrstvy (merge). Tvary se nemění, jen se ocitnou v jednom souboru.'),
      h('div', { class: 'upravy-volby' }, u.vrstvy.map((x) => h('label', { class: 'upravy-volba' },
        h('input', { type: 'checkbox', checked: zvolene.has(x.id), onchange: (e) => { if (e.target.checked) zvolene.add(x.id); else zvolene.delete(x.id); } }),
        h('span', {}, h('strong', {}, x.nazev), h('small', {}, `${prvku(x.info.prvku)} · ${x.info.druh}`))))),
    ], [
      { text: 'Spojit', hlavni: true, fn: () => { if (zvolene.size < 2) { hlaska('Vyber aspoň dvě vrstvy.', true); return false; } spojVrstvy([...zvolene]); return true; } },
      { text: 'Zrušit', slabe: true },
    ]);
  }

  function blokVystupu(v) {
    const n = ui.vyber.size;
    const co = n ? `${pocet(n)} ${n === 1 ? 'vybraný prvek' : n <= 4 ? 'vybrané prvky' : 'vybraných prvků'}` : `celou vrstvu (${prvku(v.info.prvku)})`;
    return h('div', { class: 'upravy-pata' },
      h('button', { class: 'tl tl-modre velke', 'aria-haspopup': 'menu', disabled: !!ui.prace, onclick: (e) => menuPoslat(e.currentTarget, co) }, 'Poslat na mapu ▾'),
      h('button', { class: 'tl velke', 'aria-haspopup': 'menu', disabled: !!ui.prace, onclick: (e) => menuStahnout(e.currentTarget, co) }, 'Stáhnout ▾'));
  }
  const polozka = (znacka, nazev, popis, fn) => h('button', { class: 'upravy-polozka', role: 'menuitem', onclick: fn },
    h('span', { class: 'znak', 'aria-hidden': 'true' }, znacka), h('span', {}, h('strong', {}, nazev), h('small', {}, popis)));
  function menuPoslat(kotva, co) {
    ctx.otevriPopup(kotva, (zavri) => [
      h('h3', {}, `Poslat ${co}`),
      h('div', { class: 'menu', role: 'menu' },
        polozka('D', 'Jako zkušební data', 'Na kartě Data, obarvené jednou barvou, kategoriemi nebo škálou. Nahradí dosavadní vlastní data.', () => { zavri(); poslatJakoData(false); }),
        ctx.vlastniData() ? polozka('+', 'Přidat k datům na mapě', 'Ponechá vlastní data, která už na mapě jsou, a přidá tato.', () => { zavri(); poslatJakoData(true); }) : null,
        polozka('M', 'Jako masku', 'Mapa se ořízne nebo zvýrazní na tyto oblasti. Maska je součástí stylu, proto se v případě potřeby zjednoduší.', () => { zavri(); poslatJakoMasku(); })),
    ]);
  }
  function menuStahnout(kotva, co) {
    ctx.otevriPopup(kotva, (zavri) => [
      h('h3', {}, `Stáhnout ${co}`),
      h('div', { class: 'menu', role: 'menu' },
        polozka('G', 'GeoJSON', 'Pro Flourish a většinu nástrojů.', () => { zavri(); stahni('geojson'); }),
        polozka('T', 'TopoJSON', 'Menší soubor, sousedé sdílejí hranice.', () => { zavri(); stahni('topojson'); }),
        polozka('S', 'Shapefile (zip)', 'Pro ArcGIS a QGIS.', () => { zavri(); stahni('shp'); }),
        polozka('C', 'CSV', 'Jen tabulka sloupců, bez tvarů.', () => { zavri(); stahni('csv'); })),
      h('label', { class: 'prepinac' }, h('input', { type: 'checkbox', checked: ui.jenIdNazev, onchange: (e) => { ui.jenIdNazev = e.target.checked; } }), 'Jen sloupce id a nazev'),
    ], { zarovnat: 'vpravo' });
  }

  // ------------------------------------------------------------ okno Přidat data
  function zavriPridat() {
    const z = document.querySelector('#male-okno');
    if (ui.pridat) { ui.pridat = null; z.hidden = true; z.replaceChildren(); document.removeEventListener('keydown', escPridat, true); }
  }
  function escPridat(e) { if (e.key === 'Escape') { e.stopPropagation(); zavriPridat(); } }

  async function otevriPridat(zalozka = 'databaze') {
    ui.pridat = { zalozka, hledat: '', uzemi: 'CZE', zvolene: new Set(), plna: false };
    document.addEventListener('keydown', escPridat, true);
    vykresliPridat();
    try { await nactiDatabazi(); } catch (e) { hlaska(`Databázi se nepodařilo načíst: ${e.message}`, true); }
    if (ui.pridat) {
      if (!databaze?.uzemi.some((x) => x.kod === ui.pridat.uzemi)) ui.pridat.uzemi = databaze?.uzemi[0]?.kod;
      vykresliPridat();
    }
  }

  function vykresliPridat() {
    const p = ui.pridat;
    if (!p) return;
    const z = document.querySelector('#male-okno');
    const zalozka = (k, t) => h('button', { role: 'tab', 'aria-selected': String(p.zalozka === k), class: `upravy-zalozka${p.zalozka === k ? ' aktivni' : ''}`, onclick: () => { p.zalozka = k; vykresliPridat(); } }, t);
    let telo; let pata = null;
    if (p.zalozka === 'databaze') {
      if (!databaze) telo = h('div', { class: 'upravy-okno-telo' }, h('p', { class: 'prazdne' }, 'Načítám seznam dat…'));
      else {
        const q = bezDiakritiky(p.hledat.trim());
        const uzemi = databaze.uzemi.filter((x) => !q || bezDiakritiky(`${x.nazev} ${x.hledat || ''} ${x.kod}`).includes(q));
        const zvolene = databaze.uzemi.find((x) => x.kod === p.uzemi);
        const skupiny = new Map();
        for (const vr of zvolene?.vrstvy || []) skupiny.set(vr.skupina || 'Ostatní', [...(skupiny.get(vr.skupina || 'Ostatní') || []), vr]);
        const hledat = h('input', { class: 'pole velke', type: 'search', placeholder: 'Hledat zemi nebo celek…', value: p.hledat, 'aria-label': 'Hledat území', oninput: (e) => { p.hledat = e.target.value; obnovUzemi(); } });
        const seznam = h('div', { class: 'upravy-uzemi' });
        const obnovUzemi = () => {
          const q2 = bezDiakritiky(p.hledat.trim());
          seznam.replaceChildren(...databaze.uzemi.filter((x) => !q2 || bezDiakritiky(`${x.nazev} ${x.hledat || ''} ${x.kod}`).includes(q2)).slice(0, 300).map((x) => h('button', {
            class: `volba${x.kod === p.uzemi ? ' zvolena' : ''}`, onclick: () => { p.uzemi = x.kod; vykresliPridat(); },
          }, x.nazev, h('small', { class: x.pozn === 'nejpodrobnější' ? 'zelene' : '' }, x.pozn || ''))));
        };
        obnovUzemi();
        telo = h('div', { class: 'upravy-okno-telo dve' },
          h('div', { class: 'upravy-okno-levy' }, hledat, seznam),
          h('div', { class: 'upravy-okno-pravy' },
            databaze.zalozni ? h('div', { class: 'upozorneni' }, 'Databáze z OpenStreetMap ještě není připravená. Zatím nabízím hrubší hranice Natural Earth, které editor používá pro masku.') : null,
            zvolene ? [
              h('div', { class: 'upravy-uzemi-hlava' }, h('h3', {}, zvolene.nazev), h('span', {}, 'vyber jednu nebo více vrstev')),
              [...skupiny].map(([nazev, vrstvy]) => h('div', { class: 'upravy-skupina' },
                h('div', { class: 'nadpisek' }, nazev),
                h('div', { class: 'upravy-dlazdice' }, vrstvy.map((vr) => {
                  const klic = `${zvolene.kod}|${vr.klic}`;
                  return h('label', { class: `upravy-dlazdice-vrstva${p.zvolene.has(klic) ? ' zvolena' : ''}`, title: vr.popis || '' },
                    h('input', { type: 'checkbox', checked: p.zvolene.has(klic), onchange: (e) => { if (e.target.checked) p.zvolene.add(klic); else p.zvolene.delete(klic); vykresliPridat(); } }),
                    h('span', {}, vr.nazev, vr.prvku || vr.velikost ? h('small', {}, [
                      vr.prvku ? prvku(vr.prvku) : null,
                      vr.velikost ? velikost(p.plna && vr.velikost.plna ? vr.velikost.plna : vr.velikost.zjednodusena) : null,
                      p.plna && vr.soubory && !vr.soubory.plna ? 'plná není, jen zjednodušená' : null,
                    ].filter(Boolean).join(' · ')) : null));
                })))),
              databaze.zalozni ? null : h('div', { class: 'upravy-podrobnost' },
                h('span', {}, 'Podrobnost'),
                h('div', { class: 'upravy-prepinac', role: 'radiogroup', 'aria-label': 'Podrobnost' },
                  h('button', { role: 'radio', 'aria-checked': String(!p.plna), class: !p.plna ? 'zvolena' : '', onclick: () => { p.plna = false; vykresliPridat(); } }, 'Zjednodušená · rychlá'),
                  h('button', { role: 'radio', 'aria-checked': String(p.plna), class: p.plna ? 'zvolena' : '', onclick: () => { p.plna = true; vykresliPridat(); } }, 'Plná · větší soubor'))),
            ] : h('p', { class: 'poznamka' }, uzemi.length ? 'Vyber území vlevo.' : 'Nic nenalezeno.')));
        const vybrane = [...p.zvolene].map((k) => {
          const [kod, klic] = k.split('|');
          const uz = databaze.uzemi.find((x) => x.kod === kod);
          return { uzemi: uz, vrstva: uz?.vrstvy.find((x) => x.klic === klic) };
        }).filter((x) => x.vrstva);
        pata = h('div', { class: 'upravy-okno-pata' },
          h('div', { class: 'poznamka' }, databaze.zalozni ? 'Hranice: Natural Earth (volné dílo).' : 'Data © přispěvatelé OpenStreetMap (ODbL). Sporná území upravená podle pravidel redakce.'),
          h('button', { class: 'tl velke', onclick: zavriPridat }, 'Zrušit'),
          h('button', {
            class: 'tl tl-modre velke', disabled: !vybrane.length,
            onclick: () => { const plna = p.plna; zavriPridat(); pridejZDatabaze(vybrane, plna); },
          }, vybrane.length > 1 ? `Přidat ${vybrane.length} vrstvy` : 'Přidat vrstvu'));
      }
    } else if (p.zalozka === 'soubor') {
      telo = h('div', { class: 'upravy-okno-telo' },
        zonaPretazeni([h('strong', {}, 'Přetáhni sem soubor nebo klikni a vyber ho'), h('small', {}, FORMATY)], 'velka'),
        h('p', { class: 'poznamka' }, 'Shapefile můžeš nahrát jako zip, nebo vybrat .shp, .dbf a .prj najednou. Souřadnice v S-JTSK se přepočítají do zeměpisných. Soubory zůstávají jen v tomto prohlížeči.'));
    } else {
      const d = ctx.vlastniData(); const m = ctx.stav().recept.maska;
      telo = h('div', { class: 'upravy-okno-telo' },
        h('div', { class: 'upravy-volby' },
          h('button', { class: 'upravy-volba velka', disabled: !d, onclick: () => { zavriPridat(); prevzitData(); } },
            h('span', {}, h('strong', {}, 'Vlastní data z karty Data'), h('small', {}, d ? `${d.nazev} · ${prvku(d.geojson.features.length)}` : 'Na mapě teď žádná vlastní data nejsou.'))),
          h('button', { class: 'upravy-volba velka', disabled: !m.oblasti.length, onclick: () => { zavriPridat(); prevzitMasku(); } },
            h('span', {}, h('strong', {}, 'Oblasti ořezové masky'), h('small', {}, m.oblasti.length ? m.oblasti.map((o) => o.nazev || o.id).join(', ') : 'Maska teď nemá žádné oblasti.')))));
    }
    z.replaceChildren(h('section', { class: 'okno upravy-okno', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Přidat data' },
      h('div', { class: 'upravy-okno-hlava' }, h('h1', {}, 'Přidat data'), h('button', { class: 'zavrit', 'aria-label': 'Zavřít', onclick: zavriPridat }, '✕')),
      h('div', { class: 'upravy-zalozky', role: 'tablist' }, zalozka('databaze', 'Z databáze'), zalozka('soubor', 'Ze souboru'), zalozka('mapa', 'Z mapy (data, maska)')),
      telo, pata));
    z.hidden = false;
    z.onclick = (e) => { if (e.target === z) zavriPridat(); };
  }

  // Soubor přetažený kamkoli na mapu při otevřené kartě.
  function pripojPretazeni(el) {
    el.addEventListener('dragover', (e) => { if (ctx.karta() === 'upravy' && e.dataTransfer?.types.includes('Files')) { e.preventDefault(); el.classList.add('upravy-pretazeni'); } });
    el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('upravy-pretazeni'); });
    el.addEventListener('drop', (e) => { el.classList.remove('upravy-pretazeni'); if (ctx.karta() === 'upravy' && e.dataTransfer?.files.length) { e.preventDefault(); pridejSoubory(e.dataTransfer.files); } });
  }

  // ------------------------------------------------------------ historie
  const snimek = () => u;
  function obnov(stary) {
    if (!stary || stary === u) return;
    u = stary;
    ui.vyber.clear(); ui.nahled = null;
    if (!aktivni()) ui.pohled = 'hlavni';
    ulozDoProhlizece();
  }
  const popisSnimku = (a, b) => (a !== b ? (b?.popis || 'úprava dat') : null);

  nactiZProhlizece();

  return {
    panel, pridejDoStylu, pripojMapu, pripojPretazeni, obnovListu, snimek, obnov, popisSnimku,
    prevzitData, prevzitMasku, maVrstvy: () => u.vrstvy.length > 0,
    _ladeni: { stav: () => u, ui, mapshaper },
  };
}
