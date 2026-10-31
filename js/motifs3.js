/* Malbuch – detailreiche Motive im Stil von Zeichentrickserien der 90er.
   Eigene, KI-erzeugte Strichzeichnungen (keine Figuren aus bestehenden Serien), umgewandelt in die
   transparente Kontur-Ebene (motifs/*.png, 1200x1600). Sie stehen in ihrer Kategorie jeweils vorne. */
(function () {
  'use strict';
  const D = window.MALBUCH_DATA;
  const fant = D.categories.find((c) => c.id === 'fantasie'); if (fant) fant.icon = '🐉';
  const at = D.categories.findIndex((c) => c.id === 'vorlagen');
  D.categories.splice(at, 0,
    { id: 'superhelden', name: 'Superhelden', icon: '🦸' },
    { id: 'einhoerner', name: 'Einhörner', icon: '🦄' },
    { id: 'weltraum', name: 'Weltraum', icon: '🚀' },
    { id: 'ballerina', name: 'Ballerina', icon: '🩰' });
  // IDs der ersten 6 bleiben gleich (gespeicherte Bilder verweisen darauf)
  const list = [
    ['neu-baer', 'tiere', 'Herzbärchen', 'tiere-baer'],
    ['neu-zaubermaedchen', 'feen', 'Zaubermädchen', 'feen-zaubermaedchen'],
    ['neu-drache', 'fantasie', 'Kleiner Drache', 'fantasie-drache'],
    ['neu-feengarten', 'natur', 'Feengarten', 'natur-feengarten'],
    ['neu-zug', 'fahrzeuge', 'Spielzeug-Zug', 'fahrzeuge-zug'],
    ['neu-winter', 'jahreszeiten', 'Schneemann bauen', 'jahreszeiten-winter'],
    ['held-heldin', 'superhelden', 'Fliegende Heldin', 'superhelden-heldin'],
    ['held-junge', 'superhelden', 'Held auf dem Dach', 'superhelden-held'],
    ['held-katze', 'superhelden', 'Super-Kätzchen', 'superhelden-katze'],
    ['einhorn-regenbogen', 'einhoerner', 'Regenbogen-Einhorn', 'einhoerner-regenbogen'],
    ['einhorn-baby', 'einhoerner', 'Baby-Einhorn', 'einhoerner-baby'],
    ['einhorn-maedchen', 'einhoerner', 'Mädchen mit Einhorn', 'einhoerner-maedchen'],
    ['weltraum-astronaut', 'weltraum', 'Kleiner Astronaut', 'weltraum-astronaut'],
    ['weltraum-alien', 'weltraum', 'Freundliches Alien', 'weltraum-alien'],
    ['ballett-maedchen', 'ballerina', 'Ballerina', 'ballerina-maedchen'],
    ['ballett-hase', 'ballerina', 'Hasen-Ballerina', 'ballerina-hase']
  ].map(([id, cat, name, file]) => ({ id, cat, name, png: 'motifs/' + file + '.png' }));
  D.motifs.unshift(...list);
})();
