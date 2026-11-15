# Planer

Home-Assistant-Integration für Tagesplan, Top 3, Eingang und wiederkehrende Aufgaben, für mehrere Personen.
Installation über HACS (Typ **Integration**). In die `configuration.yaml` muss nichts.

## Installation

1. HACS › Benutzerdefinierte Repositories › `https://github.com/Corineye/planer`, Typ **Integration**.
2. „Planer“ herunterladen, Home Assistant neu starten.
3. Einstellungen › Geräte & Dienste › Integration hinzufügen › **Planer**.
4. In der Seitenleiste erscheint „Planer“.

## Was es gibt (v0.8.1)

- **Heute** mit Top 3 (je Rang 1–3, nie mehr als drei), weiteren Aufgaben, Überfälligem und „Heute erledigt“.
- **Demnächst** (nach Tagen gruppiert) und **Eingang** (alles ohne Datum).
- **Schnelleingabe**: `morgen 15 Uhr !1 PETG bestellen #werkstatt @linda` oder `Müll rausbringen jeden Montag`.
  Erkennt heute/morgen/übermorgen, Wochentage, `24.12.`, `in 3 Tagen`, Uhrzeiten, `!1`–`!3`, `#bereich`,
  `@person`/`@gemeinsam` und Wiederholungen (täglich, jeden Montag, jeden Mo und Do, alle 2 Wochen, monatlich, jährlich).
- **Wiederholungen**: Abhaken setzt die Aufgabe auf den nächsten Termin (verpasste Termine werden übersprungen), optional mit Enddatum.
- **Mehrere Personen**: Jeder HA-Benutzer ist eine Person. Aufgaben gehören einer Person oder sind „Gemeinsam“.
  Unter „Einstellungen“ (nur Admin) legst du fest, wer zusätzlich die Aufgaben der anderen sieht.
- **To-do-Listen** in HA: `todo.planer_<name>` pro Person und `todo.planer_gemeinsam`. Damit funktionieren
  HA-App, To-do-Karten und Assist („Füge Brot zu Planer Gemeinsam hinzu“).
- **Dienst** `planer.hinzufuegen` für Automationen.
- **Bedienung**: Am Handy wischen (rechts = erledigt, links = morgen), jede Geste auch als Knopf.
  Taste `N` springt in die Schnelleingabe. Bildschirmleser bekommen Ansagen, alles ist per Tastatur erreichbar.

- **Kalender** (v0.2): Termine aller in HA eingebundenen Kalender (z. B. Google) in der Spalte „Kalender heute“
  und in „Demnächst“, dazu „Frei bis 22 Uhr“. Neue Termine über „Termin“ eintragen (auch ganztägig und wiederkehrend),
  Termine ansehen und löschen. Pro Person: welche Kalender sie sieht, wo sie eintragen darf, Standard-Kalender.
- **Erinnerungen** (v0.2): Push über die HA-App für Aufgaben mit Datum und für Termine ausgewählter Kalender.
  Standard 30 Min., 3 Std., 1 Tag vorher, pro Aufgabe änderbar, eigene Werte möglich. Knöpfe „Erledigt“ und „In 1 Stunde“.
  Handy pro Person unter „Einstellungen“ wählen. Aufgaben ohne Uhrzeit zählen ab 9:00 Uhr.

- **Woche** (v0.3): sieben Tage mit Terminen und Aufgaben, bis zu drei Wochenziele zum Abhaken, Wochen vor- und
  zurückblättern. Aufgaben am PC auf einen Tag ziehen, auch aus dem Eingang; am Handy und mit Tastatur über „Öffnen“ und Datum.
- **Gemeinsame Termine** (v0.3): In den Einstellungen einen Kalender für gemeinsame Termine wählen (z. B. „Linda und Corin“).
  Beim Termin „Gemeinsam“ wählen oder `@gemeinsam` tippen, dann landet er dort.

- **Teilaufgaben** (v0.4): Checkliste in jeder Aufgabe, Fortschritt (z. B. 1/3) und „Nächster Schritt“ in der Liste.
  Bei wiederkehrenden Aufgaben werden die Teilaufgaben beim nächsten Termin wieder geöffnet.
- **Bereiche mit Farben** (v0.4): Arbeit, Lernen, Haushalt, Werkstatt, Privat … mit Farbstreifen und Filter.
  Farben unter „Einstellungen“ änderbar, neue Bereiche einfach mit `#name`.
- **Nächstes zuerst** (v0.4): Listen sind nach Fälligkeit sortiert (Datum, dann Uhrzeit, dann Top-Rang);
  die nächste Aufgabe ist in „Heute“ mit „Als Nächstes“ markiert.
- **Mehr Wiederholungen** (v0.4): werktags, am Wochenende, alle n Tage/Wochen/Monate/Jahre, mit Enddatum.

- **Kalender-Reiter** (v0.4.1): Monatsansicht und Wochenansicht zum Umschalten.
- **Hashtags** (v0.4.1): beliebig viele `#tags` pro Aufgabe, filterbar; das erste ist der Bereich.
- **Einkauf** (v0.5): Bring!-Listen (oder jede andere To-do-Liste in HA) im Reiter „Einkauf“. Artikel
  hinzufügen (`Milch, 2 Liter`), abhaken, löschen. Alles läuft über die HA-Dienste und ist sofort in der Bring!-App.
  Welche Listen erscheinen, stellt ein Admin unter Einstellungen › Einkaufslisten ein (Standard: alle Bring!-Listen).
- **Design** (v0.5): Liquid-Glass-Stil nach Apple-Vorbild, hell und dunkel nach Gerät, schwebende Tab-Leiste am Handy.

- **Zeitraster** (v0.6): Woche (heute oben, dann die nächsten 7 Tage) und Tages-Pop-up (Tag im Monat antippen)
  mit Stundenzeilen wie im Google-Kalender, ganztägige Termine oben, Blöcke nach Dauer. Bereich pro Person
  unter Einstellungen („Kalender-Raster ab/bis“).
- **Heute als Zeitleiste** (v0.6): Termine und Aufgaben mit Uhrzeit im Tagesverlauf mit „Jetzt“-Markierung.
- **Aufgaben-Reiter** (v0.6, vorher „Eingang“): alle offenen Aufgaben, gruppiert nach Überfällig, Heute, Demnächst, Ohne Datum.
  Überfälliges rot mit „Alle auf heute“.
- **Gesten und Rückgängig** (v0.6): rechts wischen = erledigt, links = verschieben (Morgen, Montag, Datum …).
  Nach Erledigen, Verschieben und Löschen erscheint „Rückgängig“. Auch in Einkauf (rechts gekauft, links löschen).
- **Suche** (v0.6): Lupe oder Taste `/` durchsucht Aufgaben, Termine und Einkauf.
- **Termin-Details** (v0.6): Beschreibung bleibt im Fenster, ab 3 Zeilen „Mehr lesen“, Links anklickbar, Ort öffnet Google Maps.
- **Eine Eingabeleiste** (v0.6): in jedem Reiter gleich und an derselben Stelle; in Einkauf landet der Text auf der Einkaufsliste.
- **Automatisch speichern** (v0.6): Änderungen in einer bestehenden Aufgabe (auch Notiz) werden sofort gespeichert, „Fertig“ schließt nur. Details öffnen ohne Tastatur.
- **Animationen** (v0.6): Pop-ups gleiten sanft auf und zu, Ansichten blenden ein, Abhaken mit kleiner Animation.

- **Woche kompakt** (v0.7): heute und die nächsten 7 Tage als Karten mit Terminen und Aufgaben als Chips.
  Antippen öffnet den Tag mit Stundenraster als Pop-up.
- **Termin ziehen** (v0.7): Im Tages-Pop-up ein Zeitfenster ziehen (PC) oder auf eine freie Stunde tippen (Handy),
  dann Titel eingeben und als Termin oder Aufgabe speichern. „Weitere Optionen“ öffnet das volle Formular.
- **Pop-ups** (v0.7): schließen beim Klick außerhalb.
- **Erinnerungen** (v0.7): Zeitpunkte direkt antippen (30 Min., 3 Std., 1 Tag …); neue Aufgaben haben keine Erinnerung, bis du eine wählst.
- **Kleinigkeiten** (v0.7): Eingabeleiste auch in Einkauf, gewählte „Wann“-Option farbig, Top 3 nur sichtbar, wenn es Top-Aufgaben gibt.

- **Heute neu** (v0.8): Der Reiter „Aufgaben“ ist in Heute aufgegangen. Links stehen Überfällig, Top 3, alle Aufgaben von heute
  (auch mit Uhrzeit und ohne Datum) und Demnächst. Rechts ist die Zeitleiste, die sich scrollen lässt und 14 Tage vorausreicht.
- **Kalender auswählen** (v0.8): Im Kalender oben über „Kalender“ wählt jede Person selbst, welche Kalender sie sieht.
- **Hashtags beim Bearbeiten** (v0.8): `#tag` im Titel wird auch nachträglich zu Bereich bzw. Hashtag.
- **Pop-ups** (v0.8): blitzen beim Schließen nicht mehr auf.
- **Zeitleiste** (v0.8.1): Datumsköpfe blenden die Einträge beim Scrollen weich aus. Unter Einstellungen pro Person
  in der Spalte „Zeitleiste“ wählen, welche Kalender dort erscheinen.
- **Aufgaben farbig** (v0.8.1): Aufgaben im Kalender sind in der Farbe ihres Bereichs hinterlegt (sonst blau) und haben einen kleinen Kreis.

## Daten

Gespeichert in `.storage/planer.daten` (im HA-Backup enthalten).

## Geplant

Assist-Sätze, Verknüpfung mit der Filament-Werkstatt.
