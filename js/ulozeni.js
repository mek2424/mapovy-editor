// Ukládání šablon: sdílená Google tabulka (přes skript s týmovým heslem),
// a dokud není napojená, tak jen v tomto prohlížeči.

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
  return cti(KLIC_NASTAVENI, { url: '', heslo: '', autor: '' });
}
export function ulozNapojeni(n) { pis(KLIC_NASTAVENI, n); }
export const jeNapojeno = () => { const n = napojeni(); return !!(n.url && n.heslo); };

async function volej(akce, data = {}) {
  const n = napojeni();
  // text/plain, aby prohlížeč neposílal předběžný dotaz, který skripty Google neumí.
  const r = await fetch(n.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ akce, heslo: n.heslo, ...data }),
  });
  if (!r.ok) throw new Error(`Tabulka neodpověděla (${r.status})`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.chyba || 'Neznámá chyba tabulky');
  return j;
}

export async function vyzkousejNapojeni() {
  const j = await volej('seznam');
  return j.sablony.length;
}

export async function seznamSablon() {
  if (jeNapojeno()) {
    const j = await volej('seznam');
    return { zdroj: 'tabulka', sablony: j.sablony };
  }
  return { zdroj: 'prohlizec', sablony: cti(KLIC_MISTNI, []) };
}

export async function ulozSablonu(s) {
  const ted = new Date().toISOString().slice(0, 19);
  const sablona = { ...s, upraveno: ted, vytvoreno: s.vytvoreno || ted, autor: s.autor || napojeni().autor || '' };
  if (jeNapojeno()) {
    await volej('uloz', { sablona });
    return sablona;
  }
  const vse = cti(KLIC_MISTNI, []).filter((x) => x.id !== sablona.id);
  vse.push(sablona);
  if (!pis(KLIC_MISTNI, vse)) throw new Error('Prohlížeč nedovolil šablonu uložit');
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
  const zaklad = (nazev || 'sablona').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sablona';
  return `${zaklad}-${Date.now().toString(36)}`;
}
