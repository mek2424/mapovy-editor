// Barevná schémata ČT: jedním klikem přebarví celý podklad.
// Každá barva podkladu se převede podle své světlosti do odstínů schématu,
// takže zůstane zachovaný rozdíl mezi obrysem silnice a její výplní, lesem a loukou atd.
import { rozeber, smichej, naHex } from './barvy.js';
import { skupina } from './vrstvy.js';

export const SCHEMATA = {
  svetla: {
    nazev: 'ČT světlá', popis: 'Šedomodrá pevnina, modré moře',
    pevnina: '#f3f4f8', voda: '#d9e0ee', vodaText: '#5c6899', hranice: '#8f99bd', kraje: '#001464',
    text: '#001464', staty: '#5c6899', obrys: '#f8f9fb', zelen: '#32af5a', silnice: '#b9c0d8', budovy: '#e3e6ef',
  },
  papir: {
    nazev: 'ČT teplý papír', popis: 'Krémová pevnina, tlumené moře',
    pevnina: '#f6f3ec', voda: '#d3dde9', vodaText: '#666d93', hranice: '#a3a1ad', kraje: '#001464',
    text: '#001464', staty: '#666d93', obrys: '#fbf9f5', zelen: '#32af5a', silnice: '#cfc8b8', budovy: '#e9e4d8',
  },
  bile_more: {
    nazev: 'ČT bílé moře', popis: 'Modrošedá pevnina, bílé moře a hranice',
    pevnina: '#e3e7f2', voda: '#ffffff', vodaText: '#6873a3', hranice: '#ffffff', kraje: '#001464',
    text: '#001464', staty: '#6873a3', obrys: '#eef0f7', zelen: '#339297', silnice: '#c3cadf', budovy: '#d6dbea',
  },
  kontrastni: {
    nazev: 'ČT kontrastní', popis: 'Bílá pevnina, modré hranice a pobřeží – pod poloprůhledná data',
    pevnina: '#ffffff', voda: '#e7e9ee', vodaText: '#001464', hranice: '#001464', kraje: '#001464',
    text: '#001464', staty: '#001464', obrys: '#ffffff', zelen: '#339297', silnice: '#c9cde0', budovy: '#eceef4',
    pobrezi: true, sirkaObrysu: 1.8,
  },
  tmava: {
    nazev: 'ČT tmavá', popis: 'Tmavě modrá pevnina, bílé popisky',
    pevnina: '#182b7c', voda: '#001464', vodaText: '#a3aedb', hranice: '#5263ab', kraje: '#a3aedb',
    text: '#ffffff', staty: '#a3aedb', obrys: '#0a1c6c', zelen: '#339297', silnice: '#2c3f92', budovy: '#22358a',
    tmava: true,
  },
  pulnocni: {
    nazev: 'ČT půlnoční', popis: 'Skoro černá pevnina, bílé moře (vzor Copernicus)',
    pevnina: '#0c1440', voda: '#ffffff', vodaText: '#5c6899', hranice: '#3a4a8f', kraje: '#7d8ac4',
    text: '#ffffff', staty: '#c9d0ee', obrys: '#0c1440', zelen: '#339297', silnice: '#1e2a66', budovy: '#162160',
    tmava: true,
  },
};

const jas = (barva) => {
  const c = rozeber(barva);
  if (!c) return 0.5;
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
};

// Projde hodnotu (i výraz) a každou barvu nahradí výsledkem funkce.
function prebarviHodnotu(v, fn) {
  if (typeof v === 'string') return rozeber(v) ? fn(v) : v;
  if (Array.isArray(v)) {
    if (v[0] === 'get' || v[0] === 'literal') return v;
    return v.map((x) => prebarviHodnotu(x, fn));
  }
  return v;
}

// Světlost původní barvy → poloha mezi tmavším a světlejším odstínem schématu.
function rampa(tmavsi, svetlejsi) {
  return (b) => {
    const c = rozeber(b);
    const nova = smichej(tmavsi, svetlejsi, Math.max(0, Math.min(1, jas(b))));
    if (c && c.a < 1) {
      const n = rozeber(nova);
      return `rgba(${Math.round(n.r)},${Math.round(n.g)},${Math.round(n.b)},${c.a})`;
    }
    return nova;
  };
}

const pevne = (barva) => () => barva;

// Vrátí seznam změn [id, vlastnost, hodnota] pro všechny vrstvy stylu.
export function zmenySchematu(styl, s) {
  const zmeny = [];
  const P = s.pevnina;
  const svetlaPevnina = s.tmava ? smichej(P, '#ffffff', 0.12) : smichej(P, '#ffffff', 0.6);
  for (const l of styl.layers) {
    const g = skupina(l);
    const p = l.paint || {};
    const nastav = (vl, fn) => { if (p[vl] != null || vl === 'background-color') zmeny.push([l.id, vl, prebarviHodnotu(p[vl] ?? '#000000', fn)]); };
    switch (g) {
      case 'pozadi': nastav('background-color', pevne(P)); break;
      case 'voda':
        if (l.id === 'pobrezi') { nastav('line-color', pevne(s.text)); break; }
        if (l.type === 'fill') nastav('fill-color', pevne(s.voda));
        else nastav('line-color', pevne(s.voda === '#ffffff' ? smichej(s.vodaText, '#ffffff', 0.55) : smichej(s.voda, s.vodaText, 0.25)));
        break;
      case 'pokryv':
        nastav('fill-color', rampa(smichej(P, s.zelen, s.tmava ? 0.35 : 0.3), smichej(P, s.zelen, 0.06)));
        nastav('fill-outline-color', pevne(smichej(P, s.zelen, 0.25)));
        nastav('line-color', pevne(smichej(P, s.zelen, 0.25)));
        break;
      case 'hranice':
        if (l.id === 'kraje_hranice') nastav('line-color', pevne(s.kraje));
        else if (l.id === 'boundary_3') nastav('line-color', pevne(smichej(s.hranice, P, 0.35)));
        else nastav('line-color', pevne(s.hranice));
        break;
      case 'silnice':
        nastav('line-color', rampa(s.silnice, svetlaPevnina));
        nastav('fill-color', pevne(smichej(P, s.silnice, 0.3)));
        nastav('fill-outline-color', pevne(s.silnice));
        break;
      case 'zeleznice': nastav('line-color', pevne(smichej(s.hranice, P, 0.25))); break;
      case 'letiste':
      case 'budovy':
        nastav('fill-color', pevne(s.budovy));
        nastav('fill-outline-color', pevne(smichej(s.budovy, s.text, 0.12)));
        nastav('fill-extrusion-color', pevne(s.budovy));
        nastav('line-color', pevne(s.budovy));
        break;
      case 'body_sidel':
        nastav('circle-color', pevne(s.text));
        nastav('circle-stroke-color', pevne(s.obrys));
        break;
      case 'relief':
        if (s.tmava) zmeny.push([l.id, 'raster-opacity', 0.15]);
        break;
      default: break;
    }
    if (l.type === 'symbol' && l.layout?.['text-field']) {
      let text = s.text;
      if (/^label_country|label_state|label_other/.test(l.id) || l.id === 'kraje_nazvy') text = s.staty;
      if (g === 'popisky_vody') text = s.vodaText;
      if (g === 'popisky_silnic' || g === 'body_zajmu') text = smichej(s.text, P, 0.35);
      zmeny.push([l.id, 'text-color', text]);
      zmeny.push([l.id, 'text-halo-color', s.obrys]);
      if (s.sirkaObrysu) zmeny.push([l.id, 'text-halo-width', s.sirkaObrysu]);
    }
  }
  return zmeny;
}

// Vrstvy, které zůstanou při „čistém podkladu“.
export const CISTY_PODKLAD = new Set([
  'background', 'water', 'pobrezi', 'boundary_2', 'boundary_disputed', 'kraje_hranice', 'kraje_nazvy',
  'label_village', 'label_town', 'label_city', 'label_city_capital', 'label_country_1', 'label_country_2', 'label_country_3',
  'bod_village', 'bod_town', 'bod_city', 'bod_city_capital',
]);

export { naHex };
