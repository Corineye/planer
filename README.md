# Planer

Home-Assistant-Integration für Tagesplan, Top 3, Eingang und wiederkehrende Aufgaben, für mehrere Personen.
Installation über HACS (Typ **Integration**). In die `configuration.yaml` muss nichts.

## Installation

1. HACS › Benutzerdefinierte Repositories › `https://github.com/Corineye/planer`, Typ **Integration**.
2. „Planer“ herunterladen, Home Assistant neu starten.
3. Einstellungen › Geräte & Dienste › Integration hinzufügen › **Planer**.
4. In der Seitenleiste erscheint „Planer“.

## Was es gibt (v0.5)

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

## Daten

Gespeichert in `.storage/planer.daten` (im HA-Backup enthalten).

## Geplant

Bring!-Einkaufsliste, Assist-Sätze, Verknüpfung mit der Filament-Werkstatt.
