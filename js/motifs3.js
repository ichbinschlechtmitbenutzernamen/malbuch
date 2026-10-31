/* Malbuch – Test-Runde: detailreichere Motive im Stil von Zeichentrickserien der 90er.
   Eigene, KI-erzeugte Strichzeichnungen (keine Figuren aus bestehenden Serien), umgewandelt in die
   transparente Kontur-Ebene (motifs/*.png, 1200x1600). Kategorie ist vorläufig. */
(function () {
  'use strict';
  const D = window.MALBUCH_DATA;
  D.categories.unshift({ id: 'neu', name: 'Neue Motive (Test)', icon: '✨' });
  [
    ['neu-baer', 'Herzbärchen', 'tiere-baer'],
    ['neu-zaubermaedchen', 'Zaubermädchen', 'feen-zaubermaedchen'],
    ['neu-drache', 'Kleiner Drache', 'fantasie-drache'],
    ['neu-feengarten', 'Feengarten', 'natur-feengarten'],
    ['neu-zug', 'Spielzeug-Zug', 'fahrzeuge-zug'],
    ['neu-winter', 'Schneemann bauen', 'jahreszeiten-winter']
  ].forEach(([id, name, file]) => D.motifs.push({ id, cat: 'neu', name, png: 'motifs/' + file + '.png' }));
})();
