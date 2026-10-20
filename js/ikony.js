// Ikony Font Awesome Free 6.7.2 (css/vendor/fontawesome, ikony CC BY 4.0, písmo SIL OFL 1.1).
// ikona('scissors') → <i class="fa-solid fa-scissors">, ikona('clone', 'regular') → fa-regular.
export function ikona(nazev, styl = 'solid', trida = '') {
  const i = document.createElement('i');
  i.className = `fa-${styl} fa-${nazev} ikona${trida ? ` ${trida}` : ''}`;
  i.setAttribute('aria-hidden', 'true');
  return i;
}
