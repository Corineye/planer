"""Automatische Aufgaben: Wechselt eine Entität in einen bestimmten Zustand, legt der Planer eine Aufgabe an.

Die Regeln stehen in den allgemeinen Einstellungen (allgemein["regeln"]) und werden in den
Planer-Einstellungen gepflegt. Optional wird die Aufgabe wieder erledigt, wenn die Entität in einen
zweiten Zustand wechselt (z. B. Schalter wieder aus).
"""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.util import dt as dt_util

from .const import GEMEINSAM
from .daten import Planer

_LOGGER = logging.getLogger(__name__)


class Automatik:
    def __init__(self, hass: HomeAssistant, planer: Planer) -> None:
        self.hass = hass
        self.planer = planer
        self._ende = None

    @property
    def regeln(self) -> list[dict[str, Any]]:
        return [r for r in self.planer.allgemein.get("regeln") or [] if r.get("aktiv", True)]

    @callback
    def neu_laden(self) -> None:
        self.stoppen()
        ids = sorted({r["entitaet"] for r in self.regeln})
        if ids:
            self._ende = async_track_state_change_event(self.hass, ids, self._wechsel)

    @callback
    def stoppen(self) -> None:
        if self._ende:
            self._ende()
            self._ende = None

    @callback
    def _wechsel(self, event: Event[EventStateChangedData]) -> None:
        alt, neu = event.data.get("old_state"), event.data.get("new_state")
        if neu is None or alt is None or alt.state == neu.state:
            return
        for r in self.regeln:
            if r["entitaet"] != event.data["entity_id"]:
                continue
            if neu.state == r["zu"]:
                self.hass.async_create_task(self._anlegen(r))
            elif r.get("erledigen_bei") and neu.state == r["erledigen_bei"]:
                self.hass.async_create_task(self._erledigen(r))

    def _offene(self, regel_id: str) -> list[dict[str, Any]]:
        return [a for a in self.planer.aufgaben.values() if a.get("regel") == regel_id and a.get("status") == "offen"]

    async def _anlegen(self, r: dict[str, Any]) -> None:
        if self._offene(r["id"]):
            return  # schon eine offene Aufgabe aus dieser Regel
        try:
            a = await self.planer.speichern({
                "titel": r["titel"],
                "bereich": r.get("bereich") or "",
                "datum": dt_util.now().date().isoformat(),
                "person": r.get("person") or GEMEINSAM,
            }, None)
            a["regel"] = r["id"]
            await self.planer._sichern()
        except (ValueError, PermissionError) as err:
            _LOGGER.warning("Automatische Aufgabe „%s“ nicht angelegt: %s", r["titel"], err)

    async def _erledigen(self, r: dict[str, Any]) -> None:
        for a in self._offene(r["id"]):
            try:
                await self.planer.erledigen(a["id"], True, None)
            except (KeyError, PermissionError) as err:
                _LOGGER.warning("Automatische Aufgabe nicht erledigt: %s", err)
