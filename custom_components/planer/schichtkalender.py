"""Schichten in einen Kalender übertragen (z. B. Google „Corin Arbeit“).

Abgleich statt Einzelbefehle: Für einen Zeitraum wird ausgerechnet, welche Schicht-Termine es geben soll,
und mit den vorhandenen Planer-Terminen im Kalender verglichen. Nur Unterschiede werden gelöscht oder angelegt.
Planer-Termine erkennt man an der Markierung in der Beschreibung. Andere Termine bleiben unberührt.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later
from homeassistant.util import dt as dt_util

from . import kalender

_LOGGER = logging.getLogger(__name__)

MARKE = "planer-schicht"
BESCHREIBUNG = f"Aus dem Schichtplan im Planer ({MARKE})"
VORLAUF_TAGE = 7  # so weit zurück wird noch abgeglichen
NACHLAUF_TAGE = 400  # so weit in die Zukunft


def ist_schicht_termin(t: dict[str, Any]) -> bool:
    return MARKE in (t.get("beschreibung") or "")


def ziel_kalender(hass: HomeAssistant, planer, person: str) -> str | None:
    """Eingestellter Kalender, sonst automatisch „<Vorname> Arbeit“, falls es ihn gibt und man eintragen kann."""
    wahl = planer.einst(person).get("schicht_kalender")
    if wahl == "":
        return None
    beschreibbar = {k["id"]: k for k in kalender.liste(hass) if k["anlegen"] and k["loeschen"]}
    if wahl:
        return wahl if wahl in beschreibbar else None
    vorname = planer.name(person).split(" ")[0].lower()
    for k in beschreibbar.values():
        if k["name"].strip().lower() == f"{vorname} arbeit":
            return k["id"]
    return None


def _soll(plan: dict[str, Any], von: date, bis: date) -> dict[str, dict[str, Any]]:
    arten = {a["id"]: a for a in plan.get("arten", [])}
    soll = {}
    for tag, aid in plan.get("tage", {}).items():
        try:
            d = date.fromisoformat(tag)
        except ValueError:
            continue
        a = arten.get(aid)
        if not a or not (von <= d <= bis) or not a.get("kalender", bool(a.get("von") and a.get("bis"))):
            continue
        if a.get("von") and a.get("bis"):
            ende_tag = d + timedelta(days=1) if a["bis"] <= a["von"] else d
            soll[tag] = {"titel": a["name"], "ganztag": False, "start": f"{tag}T{a['von']}", "ende": f"{ende_tag.isoformat()}T{a['bis']}"}
        else:
            soll[tag] = {"titel": a["name"], "ganztag": True, "start": tag, "ende": tag}
    return soll


class Schichtkalender:
    """Gleicht Schichtpläne nach Änderungen gebündelt mit den Kalendern ab."""

    def __init__(self, hass: HomeAssistant, planer) -> None:
        self.hass = hass
        self.planer = planer
        self._sperre = asyncio.Lock()
        self._warten: dict[str, Any] = {}

    @callback
    def vormerken(self, person: str, sekunden: float = 4) -> None:
        """Abgleich kurz nach der letzten Änderung (viele Stempel hintereinander = ein Abgleich)."""
        if ab := self._warten.pop(person, None):
            ab()

        @callback
        def _los(_now) -> None:
            self._warten.pop(person, None)
            self.hass.async_create_background_task(self.abgleichen(person), f"planer_schichten_{person}")

        self._warten[person] = async_call_later(self.hass, sekunden, _los)

    @callback
    def stoppen(self) -> None:
        for ab in self._warten.values():
            ab()
        self._warten.clear()

    async def abgleichen(self, person: str) -> None:
        async with self._sperre:
            kid = ziel_kalender(self.hass, self.planer, person)
            if not kid:
                return
            heute = dt_util.now().date()
            von, bis = heute - timedelta(days=VORLAUF_TAGE), heute + timedelta(days=NACHLAUF_TAGE)
            soll = _soll(self.planer.schichtplan(person), von, bis)
            start = dt_util.start_of_local_day(von)
            ende = dt_util.start_of_local_day(bis + timedelta(days=2))
            try:
                vorhanden = [t for t in await kalender.termine(self.hass, [kid], start, ende) if ist_schicht_termin(t)]
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Planer: Schichten in %s nicht lesbar: %s", kid, err)
                return
            behalten: set[str] = set()
            for t in vorhanden:
                tag = t["start"][:10]
                s = soll.get(tag)
                gleich = (
                    s is not None
                    and tag not in behalten
                    and s["titel"] == t["titel"]
                    and s["ganztag"] == t["ganztag"]
                    and (s["ganztag"] or (t["start"][:16] == s["start"] and t["ende"][:16] == s["ende"]))
                )
                if gleich:
                    behalten.add(tag)
                    continue
                try:
                    await kalender.loeschen(self.hass, kid, t["uid"], t.get("recurrence_id"), False)
                except Exception as err:  # noqa: BLE001
                    _LOGGER.warning("Planer: Schicht-Termin %s nicht gelöscht: %s", t["start"], err)
            for tag, s in sorted(soll.items()):
                if tag in behalten:
                    continue
                try:
                    await kalender.anlegen(self.hass, kid, {**s, "beschreibung": BESCHREIBUNG})
                except Exception as err:  # noqa: BLE001
                    _LOGGER.warning("Planer: Schicht %s nicht eingetragen: %s", tag, err)

