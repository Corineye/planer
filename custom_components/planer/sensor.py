"""Planer-Sensoren für Automationen: Schicht heute/morgen, nächste Schicht, offene und überfällige Aufgaben.

Welche Sensoren es gibt, legt man in den Planer-Einstellungen fest (allgemein["sensoren"]): Name, Art und
Person. Der Name bestimmt die Entitäts-ID beim ersten Anlegen (z. B. „Corin Schicht heute“ → sensor.corin_schicht_heute).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .const import DOMAIN, GEMEINSAM
from .daten import Planer

ARTEN = {"schicht_heute", "schicht_morgen", "naechste_schicht", "offene_aufgaben", "ueberfaellig"}
ICONS = {
    "schicht_heute": "mdi:briefcase-clock", "schicht_morgen": "mdi:briefcase-arrow-right",
    "naechste_schicht": "mdi:calendar-clock", "offene_aufgaben": "mdi:checkbox-marked-circle-outline",
    "ueberfaellig": "mdi:alert-circle-outline",
}


def _zeit(tag: date, hhmm: str | None) -> datetime | None:
    if not hhmm:
        return None
    h, m = (int(x) for x in hhmm.split(":"))
    return datetime(tag.year, tag.month, tag.day, h, m, tzinfo=dt_util.get_default_time_zone())


def schicht_am(planer: Planer, person: str, tag: date) -> dict[str, Any] | None:
    plan = planer.schichtplan(person)
    art_id = plan["tage"].get(tag.isoformat())
    art = next((a for a in plan["arten"] if a["id"] == art_id), None) if art_id else None
    if not art:
        return None
    beginn, ende = _zeit(tag, art.get("von")), _zeit(tag, art.get("bis"))
    if beginn and ende and ende <= beginn:
        ende += timedelta(days=1)  # Nachtschicht
    return {"name": art["name"], "kurz": art.get("kurz"), "farbe": art.get("farbe"), "von": art.get("von"),
            "bis": art.get("bis"), "beginn": beginn, "ende": ende, "arbeit": bool(beginn)}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    planer: Planer = hass.data[DOMAIN]["planer"]
    aktiv: dict[str, PlanerSensor] = {}

    @callback
    def abgleichen() -> None:
        soll = {s["id"]: s for s in planer.allgemein.get("sensoren") or []}
        neu = [PlanerSensor(planer, s) for sid, s in soll.items() if sid not in aktiv]
        for sid in [x for x in aktiv if x not in soll]:
            ent = aktiv.pop(sid)
            reg = er.async_get(hass)
            if ent.entity_id and reg.async_get(ent.entity_id):
                reg.async_remove(ent.entity_id)
            else:
                hass.async_create_task(ent.async_remove())
        for sid, s in soll.items():
            if sid in aktiv:
                aktiv[sid].konfig(s)
        for e in neu:
            aktiv[e.sid] = e
        if neu:
            async_add_entities(neu)

    hass.data[DOMAIN]["sensoren_abgleichen"] = abgleichen
    abgleichen()


class PlanerSensor(SensorEntity):
    _attr_has_entity_name = False
    _attr_should_poll = False

    def __init__(self, planer: Planer, s: dict[str, Any]) -> None:
        self._planer = planer
        self.sid = s["id"]
        self._attr_unique_id = f"planer_sensor_{s['id']}"
        self.konfig(s, schreiben=False)

    def konfig(self, s: dict[str, Any], schreiben: bool = True) -> None:
        self._art, self._person = s["art"], s["person"]
        self._attr_name = s["name"]
        self._attr_icon = ICONS.get(self._art)
        self._attr_device_class = SensorDeviceClass.TIMESTAMP if self._art == "naechste_schicht" else None
        self._attr_native_unit_of_measurement = "Aufgaben" if self._art in ("offene_aufgaben", "ueberfaellig") else None
        if schreiben and self.hass:
            self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._planer.zuhoeren(self.async_write_ha_state))
        # Tageswechsel und Schichtbeginn: jede Minute zur vollen Minute neu bewerten (billig, nur Lesen)
        self.async_on_remove(async_track_time_change(self.hass, self._minute, second=5))

    @callback
    def _minute(self, _now: datetime) -> None:
        self.async_write_ha_state()

    def _werte(self) -> tuple[Any, dict[str, Any]]:
        heute = dt_util.now().date()
        if self._art in ("schicht_heute", "schicht_morgen"):
            s = schicht_am(self._planer, self._person, heute + timedelta(days=0 if self._art == "schicht_heute" else 1))
            if not s:
                return "Keine", {"arbeit": False}
            attrs = {k: v for k, v in s.items() if k not in ("beginn", "ende")}
            attrs["beginn"] = s["beginn"].isoformat() if s["beginn"] else None
            attrs["ende"] = s["ende"].isoformat() if s["ende"] else None
            return s["name"], attrs
        if self._art == "naechste_schicht":
            jetzt = dt_util.now()
            for i in range(-1, 90):
                s = schicht_am(self._planer, self._person, heute + timedelta(days=i))
                if s and s["beginn"] and s["beginn"] > jetzt:
                    return s["beginn"], {"name": s["name"], "kurz": s["kurz"], "ende": s["ende"].isoformat() if s["ende"] else None}
            return None, {}
        eigene = [a for a in self._planer.aufgaben.values()
                  if a.get("status") == "offen" and a.get("person") in (self._person, GEMEINSAM)]
        ueber = [a for a in eigene if a.get("datum") and a["datum"] < heute.isoformat()]
        if self._art == "ueberfaellig":
            return len(ueber), {"titel": [a["titel"] for a in ueber][:20]}
        heute_offen = [a for a in eigene if a.get("datum") and a["datum"] <= heute.isoformat()]
        return len(heute_offen), {"ueberfaellig": len(ueber), "titel": [a["titel"] for a in heute_offen][:20]}

    @property
    def native_value(self) -> Any:
        return self._werte()[0]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {**self._werte()[1], "person": self._planer.name(self._person) if self._person != GEMEINSAM else "Gemeinsam"}
