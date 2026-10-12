# Mapový editor

Editor podkladových map (styly MapLibre / OpenFreeMap) s českými popisky pro grafiky ve Flourishi.

Běží na https://mek2424.github.io/mapovy-editor/

## Co umí

- živý náhled mapy se zkušebními daty (anomálie teploty, body),
- podklady Liberty, Positron a Bright, popisky vždy česky,
- všechny vrstvy podkladu ve skupinách, zapínání po skupinách i jednotlivě,
- barvy z palety ČT, odvozené odstíny, ladicí barvy a kontrola kontrastu,
- písmo, velikost, odsazení a umístění popisků, skrývání a posouvání jednotlivých názvů,
- vlastní vrstvy: hranice a názvy krajů ČR, pobřežní čára, barevné body sídel,
- šablony ve sdílené Google tabulce (nebo v prohlížeči), nahrání libovolného style.json,
- stažení hotového `style.json` s kontrolou platnosti.

## Soubory

- `index.html`, `css/`, `js/` – editor (bez sestavování, čisté moduly JavaScriptu)
- `data/` – podkladové styly OpenFreeMap s českými popisky, hranice a názvy krajů (Natural Earth)
- `apps-script/Kod.gs` – skript ke Google tabulce šablon, návod je v jeho úvodu

Šablony samotné v úložišti nejsou, ukládají se do soukromé tabulky.

## Licence dat

Mapová data © OpenStreetMap (ODbL) přes OpenFreeMap – atribuce musí v mapě zůstat.
Hranice krajů: Natural Earth (volné dílo).
