# Malbuch – Web-App (PWA) fürs iPad

Kostenlos, ohne Werbung, ohne Abo, ohne Internetverbindung im Betrieb. Alle Bilder bleiben auf dem iPad (IndexedDB).

## Dateien
- `index.html` – App-Gerüst
- `css/app.css` – Layout (Quer- und Hochformat)
- `js/app.js` – Malen, Werkzeuge, Füll-Eimer, Zoom/Drehen, Rückgängig, Speichern, Galerie, Eltern-Sperre, PDF
- `js/motifs.js` – Grund-Motive, 8 Stempel, Kategorien und Zeichen-Hilfen
- `js/motifs2.js` – weitere Motive (Version 1.1) inkl. Kategorie „Prinzessinnen & Feen“; zusammen 60 eigene Motive (6 Kategorien × 10)
- `js/import.js` – eigene Vorlagen importieren (Bild oder PDF), Linien-Erkennung mit Reglern
- `vendor/jspdf.umd.min.js` – jsPDF 4.2.1 (lokal, kein CDN, MIT-Lizenz)
- `vendor/pdfjs/` – pdf.js 6.4.299 (Legacy-Build, lokal, Apache-2.0-Lizenz, siehe `vendor/pdfjs/LICENSE`; Schriften und WASM-Decoder mit eigenen Lizenzdateien)
- `sw.js` – Service Worker (Offline-Cache)
- `manifest.webmanifest`, `icons/` – App-Symbol und Startbildschirm-Daten

## Lokal testen
    cd malbuch && python3 -m http.server 8765
    # dann http://localhost:8765 öffnen

## Veröffentlichen mit GitHub Pages (kostenlos)
1. Kostenloses Konto auf github.com anlegen.
2. Neues **öffentliches** Repository anlegen, z. B. `malbuch`.
3. Den Inhalt dieses Ordners hochladen („Add file → Upload files“), sodass `index.html` direkt im Hauptordner liegt.
4. Repository → Settings → Pages → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
5. Nach 1–2 Minuten ist die App unter `https://<benutzername>.github.io/malbuch/` erreichbar.
6. Auf dem iPad in **Safari** öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.
7. Die App einmal vom Home-Bildschirm starten, solange WLAN da ist. Danach läuft sie offline.

## Updates
Nach Änderungen in `sw.js` die Zeile `const CACHE = 'malbuch-v1.4.0'` hochzählen. Sonst behält das iPad die alte Version im Cache.

## Hinweise
- Die Bilder der Home-Bildschirm-App sind von Safari getrennt gespeichert. Wird das App-Symbol gelöscht, sind auch die Bilder weg. Wichtige Bilder vorher als PDF sichern.
- Eltern-Sperre (Rechenaufgabe) schützt: PDF-Export, Bilder löschen, Einstellungen.
- Eltern-Sperre schützt außerdem: Vorlagen importieren und Vorlagen löschen.

## Eigene Vorlagen (Version 1.1)
1. Kategorie **„Meine Vorlagen“** → Kachel **„➕ Vorlage importieren“** → Rechenaufgabe lösen.
2. Foto, Bild (PNG/JPG/HEIC) oder PDF auswählen. Bei PDFs mit ◀ ▶ die Seite wählen.
3. Mit **„Linien erkennen“** einstellen, was als schwarze Linie gilt (Vorschau zeigt nur die Linien, Hintergrund wird durchsichtig).
   **„Linien dicker machen“** schließt kleine Lücken, damit der Füll-Eimer nicht ausläuft. **„Kleine Flecken entfernen“** löscht Staub/Punkte.
4. Name eingeben → **Speichern**. Die Vorlage liegt nur auf diesem iPad (IndexedDB), nichts wird hochgeladen.
- Am besten klappen klare, schwarze Linienbilder (Ausmalbilder, eigene Zeichnungen, gescannte Seiten). Fotos von Papier vorher gerade und hell aufnehmen.
- Bitte nur Vorlagen verwenden, die man privat nutzen darf (z. B. selbst gezeichnet oder frei lizenziert). Die App bringt keine fremden Bilder mit.

## Version 1.2
- Apple Pencil bedient jetzt alle Knöpfe, Farben, Farbrad, Regler, Stempel, Galerie, Dialoge und das Eltern-Tastenfeld (eigene Pencil-Tipp-Erkennung über Pointer-Events, weil iPadOS bei Pencil-Tipps oft kein `click` auslöst).
- Test-Kategorie **„Neue Motive (Test)“** (`js/motifs3.js`, Bilder in `motifs/`): 6 detailreiche, eigene Strichzeichnungen im Stil von Zeichentrickserien der 90er (KI-erzeugt, keine Figuren aus bestehenden Serien), umgewandelt in die transparente Kontur-Ebene (1200×1600).

## Version 1.3
- 10 neue detailreiche Motive (eigene Figuren) in neuen Kategorien: Superhelden 🦸 (3), Einhörner 🦄 (3), Weltraum 🚀 (2), Ballerina 🩰 (2).
- Die 6 Test-Motive stehen jetzt vorne in ihren normalen Kategorien (Tiere, Feen, Fantasie, Natur, Fahrzeuge, Jahreszeiten); die Kategorie „Neue Motive (Test)" ist entfernt. Fantasie hat jetzt das Symbol 🐉.
- Insgesamt 76 Motive (60 gezeichnete + 16 Bild-Motive). Lange Linien am Bildrand werden bei der Umwandlung bis zum Rand verlängert, damit Gebäude etc. eigene Flächen bilden.

## Version 1.4
- Neue Kategorie **Mandalas** 🌀 (5): Blumen-Mandala und Herz-Mandala (einfach, große Flächen), Schmetterling und Mond & Sterne (mittel), Ornament (detailreich, für Ältere).
- Neue Kategorie **Landschaften** 🏞️ (5): Bauernhof, Am Strand, Bergsee, Waldbach, Unterwasserwelt.
- Insgesamt 86 Motive (60 gezeichnete + 26 Bild-Motive).
