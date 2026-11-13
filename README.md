# Planer

Home-Assistant-Integration für Tagesplan, Top 3, Eingang und wiederkehrende Aufgaben, für mehrere Personen.
Installation über HACS (Typ **Integration**). In die `configuration.yaml` muss nichts.

## Installation

1. HACS › Benutzerdefinierte Repositories › `https://github.com/Corineye/planer`, Typ **Integration**.
2. „Planer“ herunterladen, Home Assistant neu starten.
3. Einstellungen › Geräte & Dienste › Integration hinzufügen › **Planer**.
4. In der Seitenleiste erscheint „Planer“.

## Was es gibt (v0.1)

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

## Daten

Gespeichert in `.storage/planer.daten` (im HA-Backup enthalten).

## Geplant

Google-Kalender (lesen + Termine anlegen), Erinnerungen aufs Handy, Bring!-Einkaufsliste, Wochenansicht mit Wochenzielen.
