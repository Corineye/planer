"""Nächtliche Sicherung der Planer-Daten als JSON-Datei in <config>/planer_sicherungen/."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .daten import Planer

_LOGGER = logging.getLogger(__name__)

ORDNER = "planer_sicherungen"
BEHALTEN = 14
NAME = re.compile(r"^planer-(\d{4}-\d{2}-\d{2}|vorher-\d{8}-\d{6})\.json$")
TAGES_NAME = re.compile(r"^planer-\d{4}-\d{2}-\d{2}\.json$")


class Sicherung:
    """Schreibt jede Nacht um 03:30 und beim Start (falls die heutige fehlt) eine Kopie."""

    def __init__(self, hass: HomeAssistant, planer: Planer) -> None:
        self.hass = hass
        self.planer = planer
        self._ende = None

    @property
    def ordner(self) -> Path:
        return Path(self.hass.config.path(ORDNER))

    async def async_start(self) -> None:
        self._ende = async_track_time_change(self.hass, self._nachts, hour=3, minute=30, second=0)
        heute = self.ordner / f"planer-{dt_util.now().date().isoformat()}.json"
        try:
            if not await self.hass.async_add_executor_job(heute.exists):
                await self.sichern()
        except OSError as err:
            _LOGGER.error("Sicherung beim Start fehlgeschlagen: %s", err)

    @callback
    def async_stop(self) -> None:
        if self._ende:
            self._ende()
            self._ende = None

    async def _nachts(self, _jetzt: datetime) -> None:
        try:
            await self.sichern()
        except OSError as err:
            _LOGGER.error("Nächtliche Sicherung fehlgeschlagen: %s", err)

    async def sichern(self, name: str | None = None) -> str:
        inhalt = json.dumps(self.planer.alles(), ensure_ascii=False, indent=1)
        name = name or f"planer-{dt_util.now().date().isoformat()}.json"
        await self.hass.async_add_executor_job(self._schreiben, name, inhalt)
        return name

    def _schreiben(self, name: str, inhalt: str) -> None:
        self.ordner.mkdir(parents=True, exist_ok=True)
        ziel = self.ordner / name
        tmp = ziel.with_suffix(".tmp")
        tmp.write_text(inhalt, encoding="utf-8")
        tmp.replace(ziel)
        tages = sorted(p for p in self.ordner.iterdir() if TAGES_NAME.fullmatch(p.name))
        for alt in tages[:-BEHALTEN]:
            alt.unlink(missing_ok=True)
        vorher = sorted(p for p in self.ordner.iterdir() if p.name.startswith("planer-vorher-") and NAME.fullmatch(p.name))
        for alt in vorher[:-BEHALTEN]:
            alt.unlink(missing_ok=True)

    async def liste(self) -> list[dict[str, Any]]:
        return await self.hass.async_add_executor_job(self._liste)

    def _liste(self) -> list[dict[str, Any]]:
        if not self.ordner.is_dir():
            return []
        raus = []
        for p in self.ordner.iterdir():
            if NAME.fullmatch(p.name):
                st = p.stat()
                raus.append({"name": p.name, "groesse": st.st_size, "zeit": datetime.fromtimestamp(st.st_mtime, dt_util.get_default_time_zone()).isoformat(timespec="seconds"), "vorher": "vorher" in p.name})
        return sorted(raus, key=lambda x: x["zeit"], reverse=True)

    async def wiederherstellen(self, name: str) -> None:
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise ValueError("Ungültiger Dateiname")
        datei = self.ordner / name
        text = await self.hass.async_add_executor_job(self._lesen, datei)
        try:
            daten = json.loads(text)
        except ValueError as err:
            raise ValueError("Die Sicherung ist keine gültige Datei") from err
        if not isinstance(daten, dict) or not all(isinstance(daten.get(k, {}), dict) for k in ("aufgaben", "notizen", "einstellungen", "wochen", "allgemein", "schichten")):
            raise ValueError("Die Sicherung hat ein unbekanntes Format")
        await self.sichern(f"planer-vorher-{dt_util.now().strftime('%Y%m%d-%H%M%S')}.json")
        await self.planer.ersetzen(daten)

    @staticmethod
    def _lesen(datei: Path) -> str:
        if not datei.is_file() or datei.is_symlink():
            raise ValueError("Sicherung nicht gefunden")
        return datei.read_text(encoding="utf-8")
