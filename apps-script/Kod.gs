/**
 * Skript ke Google tabulce „Mapový editor – šablony“.
 * Editor z GitHub Pages přes něj čte a ukládá šablony map.
 *
 * Nastavení (jednou):
 *  1. V tabulce: Rozšíření → Apps Script, sem vložit tento kód a uložit.
 *  2. Nastavení projektu (ozubené kolo) → Vlastnosti skriptu → Přidat:
 *     název HESLO, hodnota = týmové heslo.
 *  3. Nasadit → Nové nasazení → typ Webová aplikace,
 *     Spustit jako: Já, Kdo má přístup: Kdokoli → Nasadit, povolit přístup.
 *  4. Adresu webové aplikace (končí /exec) vložit do editoru v Nastavení.
 *
 * Heslo je jen ve vlastnostech skriptu, v kódu ani na GitHubu není.
 */

const SLOUPCE = ['id', 'nazev', 'popis', 'zaklad', 'nastaveni', 'autor', 'vytvoreno', 'upraveno'];
const MAX_BUNKA = 49000;

function doGet() {
  return ContentService.createTextOutput('Mapový editor – úložiště šablon běží.');
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const heslo = PropertiesService.getScriptProperties().getProperty('HESLO');
    if (!heslo) return odpoved({ ok: false, chyba: 'Ve skriptu není nastavené heslo (vlastnost HESLO).' });
    if (p.heslo !== heslo) return odpoved({ ok: false, chyba: 'Špatné heslo.' });

    if (p.akce === 'seznam') return odpoved({ ok: true, sablony: nactiVse() });

    const zamek = LockService.getScriptLock();
    zamek.waitLock(20000);
    try {
      if (p.akce === 'uloz') { uloz(p.sablona); return odpoved({ ok: true }); }
      if (p.akce === 'uloz-vice') { (p.sablony || []).forEach(uloz); return odpoved({ ok: true, pocet: (p.sablony || []).length }); }
      if (p.akce === 'smaz') { smaz(p.id); return odpoved({ ok: true }); }
    } finally {
      zamek.releaseLock();
    }
    return odpoved({ ok: false, chyba: 'Neznámá akce.' });
  } catch (chyba) {
    return odpoved({ ok: false, chyba: String(chyba) });
  }
}

function list() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(SLOUPCE);
  return sh;
}

function nactiVse() {
  const sh = list();
  const radky = sh.getDataRange().getDisplayValues();
  const hlavicka = radky.shift();
  return radky.filter(function (r) { return r[0]; }).map(function (r) {
    const o = {};
    hlavicka.forEach(function (k, i) { o[k] = r[i]; });
    try { o.nastaveni = JSON.parse(o.nastaveni); } catch (e) { o.nastaveni = null; }
    return o;
  });
}

function uloz(s) {
  if (!s || !s.id) throw new Error('Šablona nemá id.');
  const sh = list();
  const radek = SLOUPCE.map(function (k) {
    const v = k === 'nastaveni' ? JSON.stringify(s.nastaveni) : (s[k] == null ? '' : String(s[k]));
    if (v.length > MAX_BUNKA) throw new Error('Šablona je příliš velká pro jednu buňku tabulky.');
    return v;
  });
  const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().map(function (r) { return String(r[0]); });
  const i = ids.indexOf(String(s.id));
  const cil = i >= 1 ? sh.getRange(i + 1, 1, 1, SLOUPCE.length) : sh.getRange(sh.getLastRow() + 1, 1, 1, SLOUPCE.length);
  cil.setNumberFormat('@');
  cil.setValues([radek]);
}

function smaz(id) {
  const sh = list();
  const ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().map(function (r) { return String(r[0]); });
  const i = ids.indexOf(String(id));
  if (i >= 1) sh.deleteRow(i + 1);
}

function odpoved(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
