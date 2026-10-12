// Ukládání map: týmová Google tabulka přes skript s týmovým heslem.
// Heslo a adresa se pamatují v prohlížeči; přinést je umí i týmový odkaz (#tym=…).

import { ADRESA_TABULKY } from './nastaveni.js';

const KLIC_NASTAVENI = 'mapovy-editor:napojeni';
const KLIC_MISTNI = 'mapovy-editor:sablony';
const KLIC_ROZPRACOVANO = 'mapovy-editor:rozpracovano';

function cti(klic, vychozi) {
  try {
    const v = localStorage.getItem(klic);
    return v ? JSON.parse(v) : vychozi;
  } catch { return vychozi; }
}
function pis(klic, hodnota) {
  try { localStorage.setItem(klic, JSON.stringify(hodnota)); return true; } catch { return false; }
}

export function napojeni() {
  const n = cti(KLIC_NASTAVENI, {}) || {};
  return { url: n.url || ADRESA_TABULKY || '', heslo: n.heslo || '', autor: n.autor || '' };
}
export function ulozNapojeni(zmeny) {
  pis(KLIC_NASTAVENI, { ...cti(KLIC_NASTAVENI, {}), ...zmeny });
}
export const jeNapojeno = () => { const n = napojeni(); return !!(n.url && n.heslo); };
export const jmeno = () => napojeni().autor;
export const nastavJmeno = (autor) => ulozNapojeni({ autor: (autor || '').trim() });
export const zapomenHeslo = () => ulozNapojeni({ heslo: '' });

// ---- týmový odkaz: #tym=<base64url(JSON {u, h})>

const naB64 = (t) => btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const zB64 = (t) => decodeURIComponent(escape(atob(t.replace(/-/g, '+').replace(/_/g, '/'))));

export function tymovyOdkaz() {
  const n = napojeni();
  const data = { h: n.heslo };
  if (n.url !== ADRESA_TABULKY) data.u = n.url;
  return `${location.origin}${location.pathname}#tym=${naB64(JSON.stringify(data))}`;
}

// Přečte týmový odkaz z adresy, uloží ho a z adresy ho smaže. Vrací true, když tam byl.
export function prectiTymovyOdkaz() {
  const m = location.hash.match(/(?:^#|&)tym=([A-Za-z0-9_-]+)/);
  if (!m) return false;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const d = JSON.parse(zB64(m[1]));
    if (!d.h) return false;
    ulozNapojeni({ heslo: d.h, ...(d.u ? { url: d.u } : {}) });
    return true;
  } catch { return false; }
}

// ---- volání skriptu

async function volej(akce, data = {}, n = napojeni()) {
  if (!n.url) throw new Error('Editor nezná adresu týmové tabulky.');
  // text/plain, aby prohlížeč neposílal předběžný dotaz, který skripty Google neumí.
  const r = await fetch(n.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ akce, heslo: n.heslo, ...data }),
  });
  if (!r.ok) throw new Error(`Tabulka neodpověděla (${r.status})`);
  const j = await r.json();
  if (!j.ok) {
    const e = new Error(j.chyba || 'Neznámá chyba tabulky');
    e.spatneHeslo = /heslo/i.test(j.chyba || '');
    throw e;
  }
  return j;
}

// Ověří adresu a heslo bez uložení; vrátí počet map v tabulce.
export async function overNapojeni(url, heslo) {
  const j = await volej('seznam', {}, { url, heslo });
  return j.sablony.length;
}

export async function seznamSablon() {
  if (jeNapojeno()) {
    const j = await volej('seznam');
    return { zdroj: 'tabulka', sablony: j.sablony };
  }
  return { zdroj: 'prohlizec', sablony: cti(KLIC_MISTNI, []) };
}

// autor = kdo mapu vytvořil (u nové mapy ten, kdo ukládá), upravil = kdo ji uložil naposledy.
export async function ulozSablonu(s) {
  const ted = new Date().toISOString().slice(0, 19);
  const kdo = jmeno();
  const sablona = { ...s, upraveno: ted, vytvoreno: s.vytvoreno || ted, autor: s.autor || kdo, upravil: kdo };
  if (jeNapojeno()) {
    await volej('uloz', { sablona });
    return sablona;
  }
  const vse = cti(KLIC_MISTNI, []).filter((x) => x.id !== sablona.id);
  vse.push(sablona);
  if (!pis(KLIC_MISTNI, vse)) throw new Error('Prohlížeč nedovolil mapu uložit');
  return sablona;
}

export async function ulozVice(sablony) {
  if (jeNapojeno()) {
    const j = await volej('uloz-vice', { sablony });
    return j.pocet;
  }
  const ids = new Set(sablony.map((s) => s.id));
  const vse = cti(KLIC_MISTNI, []).filter((x) => !ids.has(x.id)).concat(sablony);
  pis(KLIC_MISTNI, vse);
  return sablony.length;
}

export async function smazSablonu(id) {
  if (jeNapojeno()) { await volej('smaz', { id }); return; }
  pis(KLIC_MISTNI, cti(KLIC_MISTNI, []).filter((x) => x.id !== id));
}

export const ulozRozpracovane = (stav) => pis(KLIC_ROZPRACOVANO, stav);
export const nactiRozpracovane = () => cti(KLIC_ROZPRACOVANO, null);

export function noveId(nazev) {
  const zaklad = (nazev || 'mapa').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mapa';
  return `${zaklad}-${Date.now().toString(36)}`;
}
