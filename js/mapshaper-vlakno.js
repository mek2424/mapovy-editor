// Samostatné vlákno pro mapshaper: těžké výpočty (zjednodušení, sloučení, vyčištění,
// převody formátů) běží mimo hlavní stránku, takže editor při práci nezamrzne.
// Knihovna se načítá z CDN (jsDelivr, balíček mapshaper na npm), verze je pevná.
const VERZE = '0.7.90';
// Pro testy jde zdroj knihovny změnit parametrem ?zdroj=… v adrese vlákna.
const ZDROJ = new URL(self.location.href).searchParams.get('zdroj') || `https://cdn.jsdelivr.net/npm/mapshaper@${VERZE}/www/`;

// mapshaper v prohlížeči hledá pomocné moduly ve window.modules a prohlížeč pozná podle
// window.document. Ve vlákně stránka není, stačí mu ale prázdný zástupce.
self.window = self;
self.document = self.document || {};
let pripraveno = null;
function priprav() {
  if (!pripraveno) {
    pripraveno = new Promise((ok, chyba) => {
      try {
        importScripts(`${ZDROJ}modules.js`, `${ZDROJ}mapshaper.js`);
        ok();
      } catch (e) { chyba(e); }
    });
  }
  return pripraveno;
}

// zprava: { id, prikaz, vstupy: { 'nazev.ext': text | ArrayBuffer } }
// odpověď: { id, vystupy: { 'nazev.ext': text | ArrayBuffer }, zprava } nebo { id, chyba }
self.onmessage = async (e) => {
  const { id, prikaz, vstupy } = e.data;
  try {
    await priprav();
    const vystupy = await self.mapshaper.applyCommands(prikaz, vstupy || {});
    const vysledek = {};
    const prenos = [];
    for (const [jmeno, obsah] of Object.entries(vystupy || {})) {
      if (/\.(json|geojson|topojson|csv|txt|prj|cpg|kml|svg)$/i.test(jmeno)) {
        vysledek[jmeno] = typeof obsah === 'string' ? obsah : new TextDecoder().decode(obsah);
      } else {
        const buf = obsah instanceof ArrayBuffer ? obsah : obsah.buffer.slice(obsah.byteOffset, obsah.byteOffset + obsah.byteLength);
        vysledek[jmeno] = buf;
        prenos.push(buf);
      }
    }
    self.postMessage({ id, vystupy: vysledek }, prenos);
  } catch (chyba) {
    self.postMessage({ id, chyba: String(chyba?.message || chyba) });
  }
};
