"""Speicher und Regeln des Planers: Aufgaben, Personen, Sichtbarkeit.

Alles liegt in .storage/planer.daten (über den HA-Store, im Backup enthalten).
Eine Aufgabe gehört einer Person (HA-Benutzer-ID) oder ist „gemeinsam“.
Wer was sieht: eigene + gemeinsame Aufgaben immer; die der anderen nur, wenn ein Admin das für die Person erlaubt.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import GEMEINSAM, MAX_AUFGABEN, SPEICHER_SCHLUESSEL, SPEICHER_VERSION
from .wiederholung import fortschreiben, gueltig

UHRZEIT = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MAX_VERLAUF = 60


def _datum(wert: Any) -> str | None:
    if not wert:
        return None
    try:
        return date.fromisoformat(str(wert)[:10]).isoformat()
    except ValueError:
        return None


def _text(wert: Any, laenge: int) -> str:
    return str(wert or "").strip()[:laenge]


class Planer:
    """Hält die Daten im Speicher und meldet Änderungen an Panel und todo-Listen."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store = Store(hass, SPEICHER_VERSION, SPEICHER_SCHLUESSEL)
        self.aufgaben: dict[str, dict[str, Any]] = {}
        self.einstellungen: dict[str, dict[str, Any]] = {}
        self._zuhoerer: list[Callable[[], None]] = []
        self.personen: list[dict[str, str]] = []

    async def async_laden(self) -> None:
        daten = await self._store.async_load() or {}
        self.aufgaben = daten.get("aufgaben", {})
        self.einstellungen = daten.get("einstellungen", {})
        await self.async_personen()

    async def async_personen(self) -> list[dict[str, str]]:
        """Alle echten, aktiven HA-Benutzer (keine Systemkonten)."""
        benutzer = await self.hass.auth.async_get_users()
        self.personen = sorted(
            (
                {"id": b.id, "name": b.name or "Ohne Namen"}
                for b in benutzer
                if b.is_active and not b.system_generated
            ),
            key=lambda p: p["name"].lower(),
        )
        return self.personen

    def name(self, person: str | None) -> str:
        if person == GEMEINSAM:
            return "Gemeinsam"
        for p in self.personen:
            if p["id"] == person:
                return p["name"]
        return "Unbekannt"

    def person_finden(self, wert: str | None) -> str | None:
        """Vorname, voller Name, Benutzer-ID oder „gemeinsam“ → gespeicherter Wert."""
        if not wert:
            return None
        w = wert.strip().lower()
        if w in (GEMEINSAM, "beide", "alle"):
            return GEMEINSAM
        for p in self.personen:
            if w in (p["id"].lower(), p["name"].lower(), p["name"].split(" ")[0].lower()):
                return p["id"]
        return None

    # --- Sichtbarkeit -------------------------------------------------------------------------

    def sieht_andere(self, benutzer_id: str | None) -> bool:
        return bool(self.einstellungen.get(benutzer_id or "", {}).get("andere_sehen", True))

    def sichtbar(self, aufgabe: dict[str, Any], benutzer_id: str | None) -> bool:
        if benutzer_id is None:
            return True
        p = aufgabe.get("person")
        return p in (benutzer_id, GEMEINSAM) or self.sieht_andere(benutzer_id)

    def fuer(self, benutzer_id: str | None) -> list[dict[str, Any]]:
        return [a for a in self.aufgaben.values() if self.sichtbar(a, benutzer_id)]

    # --- Ändern -------------------------------------------------------------------------------

    @callback
    def zuhoeren(self, fn: Callable[[], None]) -> Callable[[], None]:
        self._zuhoerer.append(fn)
        return lambda: self._zuhoerer.remove(fn) if fn in self._zuhoerer else None

    async def _sichern(self) -> None:
        await self._store.async_save({"aufgaben": self.aufgaben, "einstellungen": self.einstellungen})
        for fn in list(self._zuhoerer):
            fn()

    def _bereinigen(self, roh: dict[str, Any], alt: dict[str, Any] | None, benutzer_id: str | None) -> dict[str, Any]:
        a: dict[str, Any] = dict(alt or {})
        jetzt = dt_util.now().isoformat(timespec="seconds")
        if "titel" in roh:
            a["titel"] = _text(roh["titel"], 200) or "Ohne Titel"
        if "notiz" in roh:
            a["notiz"] = _text(roh["notiz"], 4000)
        if "bereich" in roh:
            a["bereich"] = _text(roh["bereich"], 40).lstrip("#").lower()
        if "person" in roh:
            p = roh["person"]
            a["person"] = p if p == GEMEINSAM or any(x["id"] == p for x in self.personen) else (benutzer_id or GEMEINSAM)
        if "datum" in roh:
            neu = _datum(roh["datum"])
            if alt and alt.get("datum") and neu and neu > alt["datum"] and alt.get("status") == "offen":
                a["verschoben"] = int(alt.get("verschoben") or 0) + 1
            a["datum"] = neu
        if "uhrzeit" in roh:
            u = str(roh["uhrzeit"] or "")[:5]
            a["uhrzeit"] = u if UHRZEIT.match(u) else None
        if "dauer" in roh:
            try:
                a["dauer"] = max(5, min(720, int(roh["dauer"]))) if roh["dauer"] else None
            except (TypeError, ValueError):
                a["dauer"] = None
        if "top" in roh:
            try:
                t = int(roh["top"]) if roh["top"] else None
            except (TypeError, ValueError):
                t = None
            a["top"] = t if t in (1, 2, 3) else None
        if "wiederholung" in roh:
            a["wiederholung"] = gueltig(roh["wiederholung"])
        if "erinnerungen" in roh:
            a["erinnerungen"] = sorted({int(m) for m in roh["erinnerungen"] or [] if str(m).isdigit() and int(m) <= 43200})
        if "reihenfolge" in roh:
            try:
                a["reihenfolge"] = float(roh["reihenfolge"])
            except (TypeError, ValueError):
                pass
        if not alt:
            a.setdefault("titel", "Ohne Titel")
            a.setdefault("person", benutzer_id or GEMEINSAM)
            a.update(
                id=uuid.uuid4().hex[:12],
                status="offen",
                erstellt=jetzt,
                erstellt_von=benutzer_id,
                verschoben=0,
            )
            for feld in ("notiz", "bereich"):
                a.setdefault(feld, "")
            for feld in ("datum", "uhrzeit", "dauer", "top", "wiederholung"):
                a.setdefault(feld, None)
            a.setdefault("erinnerungen", [])
            a.setdefault("reihenfolge", dt_util.utcnow().timestamp())
        a["geaendert"] = jetzt
        return a

    def _top_freimachen(self, a: dict[str, Any]) -> None:
        """Es gibt pro Person und Tag nur je einen Rang 1, 2, 3: wer den Rang schon hat, verliert ihn."""
        if not a.get("top") or not a.get("datum"):
            return
        for b in self.aufgaben.values():
            if (
                b["id"] != a["id"]
                and b.get("top") == a["top"]
                and b.get("datum") == a["datum"]
                and b.get("person") == a.get("person")
                and b.get("status") == "offen"
            ):
                b["top"] = None

    async def speichern(self, roh: dict[str, Any], benutzer_id: str | None) -> dict[str, Any]:
        alt = self.aufgaben.get(roh.get("id") or "")
        if alt is None and len(self.aufgaben) >= MAX_AUFGABEN:
            raise ValueError("Zu viele Aufgaben gespeichert. Bitte erledigte löschen.")
        if alt is not None and not self.sichtbar(alt, benutzer_id):
            raise PermissionError("Diese Aufgabe gehört einer anderen Person.")
        a = self._bereinigen(roh, alt, benutzer_id)
        self.aufgaben[a["id"]] = a
        self._top_freimachen(a)
        await self._sichern()
        return a

    async def erledigen(self, aufgabe_id: str, erledigt: bool, benutzer_id: str | None) -> dict[str, Any]:
        a = self.aufgaben.get(aufgabe_id)
        if a is None:
            raise KeyError("Aufgabe nicht gefunden.")
        if not self.sichtbar(a, benutzer_id):
            raise PermissionError("Diese Aufgabe gehört einer anderen Person.")
        jetzt = dt_util.now()
        heute = jetzt.date()
        if erledigt and a.get("wiederholung"):
            basis = date.fromisoformat(a["datum"]) if a.get("datum") else heute
            verlauf = (a.get("verlauf") or []) + [heute.isoformat()]
            a["verlauf"] = verlauf[-MAX_VERLAUF:]
            weiter = fortschreiben(a["wiederholung"], basis, heute)
            if weiter is not None:
                a.update(datum=weiter.isoformat(), status="offen", top=None, verschoben=0, erledigt_am=None)
            else:
                a.update(status="erledigt", erledigt_am=jetzt.isoformat(timespec="seconds"))
        elif erledigt:
            a.update(status="erledigt", erledigt_am=jetzt.isoformat(timespec="seconds"))
        else:
            a.update(status="offen", erledigt_am=None)
        a["geaendert"] = jetzt.isoformat(timespec="seconds")
        await self._sichern()
        return a

    async def loeschen(self, aufgabe_id: str, benutzer_id: str | None) -> None:
        a = self.aufgaben.get(aufgabe_id)
        if a is None:
            return
        if not self.sichtbar(a, benutzer_id):
            raise PermissionError("Diese Aufgabe gehört einer anderen Person.")
        del self.aufgaben[aufgabe_id]
        await self._sichern()

    async def einstellung(self, person: str, andere_sehen: bool) -> None:
        self.einstellungen.setdefault(person, {})["andere_sehen"] = bool(andere_sehen)
        await self._sichern()
