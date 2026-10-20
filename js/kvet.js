// Květ barev: výběr barvy, který „rozkvete“ (knihovna Blossom Color Picker, MIT)
// spojený s nástroji editoru – paleta ČT, odstíny vybrané barvy, ladící barvy,
// vlastní hex a kontrast vůči podkladu.
//
// Okvětní lístky mění obsah podle režimu (Paleta ČT · Odstíny · Ladí · Spektrum),
// oblouk vpravo nastavuje světlost vybrané barvy. Lístek z palety ČT vrací vždy
// přesný odstín palety (knihovna počítá v HSL a jinak by hodnotu o kousek posunula).

import { BlossomColorPicker, hexToHsl, lightnessToSliderValue } from './vendor/blossom-color-picker.js';
import { PALETA_CT, odstiny, ladici, hex, smichej, rozeber, kontrast } from './barvy.js';

export const REZIMY = [
  ['ct', 'Paleta ČT'],
  ['odstiny', 'Odstíny'],
  ['ladi', 'Ladí'],
  ['spektrum', 'Spektrum'],
];

// Lístky pro režim. Vrací seznam hex barev; první kruh knihovna skládá ze světlých,
// vnější z tmavých, takže paleta ČT je venku a její pastely uvnitř.
export function barvyRezimu(rezim, zaklad) {
  if (rezim === 'ct') return [...PALETA_CT, ...PALETA_CT.map((b) => smichej(b, '#ffffff', 0.6))];
  if (rezim === 'odstiny') {
    const o = odstiny(zaklad);
    return unikatni([zaklad, ...o.svetlejsi, ...o.tmavsi, ...o.tlumene, ...o.papirove]);
  }
  if (rezim === 'ladi') {
    const l = ladici(zaklad).map((x) => x.barva);
    return unikatni([zaklad, ...l, ...l.map((b) => smichej(b, '#ffffff', 0.55))]);
  }
  return null; // spektrum = výchozí barvy knihovny
}
const unikatni = (seznam) => [...new Set(seznam.map((b) => hex(b)).filter(Boolean))];

const vzdalenost = (a, b) => {
  const x = rozeber(a); const y = rozeber(b);
  return x && y ? Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b) : Infinity;
};

// Hodnota pro knihovnu z hex barvy (odstín, sytost, světlost na oblouku).
function hodnotaZHex(b) {
  const { h, s, l } = hexToHsl(b);
  return { hue: h, saturation: lightnessToSliderValue(l), lightness: l, originalSaturation: s, alpha: 100, layer: 'outer' };
}

// Vloží květ do prvku a nechá ho rozkvést. naVyber(hex) se volá při každé změně
// (i při tažení oblouku), naZavreni() když se květ sbalí (klik mimo, na střed, Esc).
// Vrací { nastavBarvu(hex), nastavRezim(rezim), zavri(), znic(), kontejner() }.
export function vytvorKvet(prvek, { barva, rezim = 'ct', naVyber, naZavreni, velikostStredu = 30 }) {
  let aktualni = hex(barva) || '#001464';
  let listky = barvyRezimu(rezim, aktualni);
  let potlacit = false;
  const picker = new BlossomColorPicker(prvek, {
    colors: listky || undefined,
    defaultValue: hodnotaZHex(aktualni),
    initialExpanded: false,
    collapsible: true,
    showCoreColor: true,
    adaptivePositioning: true,
    sliderPosition: 'right',
    petalSize: 32,
    coreSize: velikostStredu,
    animationDuration: 280,
    onCollapse: () => naZavreni?.(),
    onChange: (c) => {
      if (potlacit) return;
      let vysledek = c.hex.toLowerCase();
      // Přichycení na přesnou barvu lístku (palety ČT apod.), když se jen kliklo.
      const nejblizsi = (listky || []).reduce((nej, b) => {
        const d = vzdalenost(b, vysledek);
        return d < nej.d ? { b, d } : nej;
      }, { b: null, d: Infinity });
      if (nejblizsi.d < 7) vysledek = nejblizsi.b;
      aktualni = vysledek;
      naVyber(vysledek);
    },
  });
  // Změna zvenku (hex, ladící barva…) jen přesune výběr v květu, naVyber se nevolá.
  const nastavBarvu = (b) => {
    const x = hex(b);
    if (!x) return;
    aktualni = x;
    potlacit = true;
    picker.setValue(hodnotaZHex(x));
    potlacit = false;
  };
  return {
    nastavBarvu,
    nastavRezim(novy, zaklad = aktualni) {
      listky = barvyRezimu(novy, zaklad);
      potlacit = true;
      picker.setOptions({ colors: listky || undefined });
      picker.setValue(hodnotaZHex(aktualni));
      potlacit = false;
    },
    zavri() { picker.collapse(); },
    znic() { picker.destroy(); },
    kontejner: () => prvek.querySelector('.bcp-container'),
    rozkvet: () => picker.expand(),
  };
}

export { kontrast };
