"""Planer: Tagesplan, Top 3, Eingang und Wiederholungen als Seite in der Seitenleiste.

Die Integration speichert Aufgaben in Home Assistant (.storage/planer.daten), legt pro Person eine
To-do-Liste an und stellt das Panel aus frontend/ bereit. In die configuration.yaml muss nichts.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import voluptuous as vol

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, GEMEINSAM, PANEL_PFAD, URL_BASIS
from .daten import Planer
from .ws import async_registrieren

ORDNER = Path(__file__).parent / "frontend"
PLATTFORMEN = [Platform.TODO]

DIENST_HINZUFUEGEN = vol.Schema(
    {
        vol.Required("titel"): cv.string,
        vol.Optional("datum"): cv.date,
        vol.Optional("uhrzeit"): cv.time,
        vol.Optional("person"): cv.string,
        vol.Optional("top"): vol.All(vol.Coerce(int), vol.Range(min=1, max=3)),
        vol.Optional("notiz"): cv.string,
        vol.Optional("bereich"): cv.string,
    }
)


def _version() -> str:
    try:
        return json.loads((Path(__file__).parent / "manifest.json").read_text())["version"]
    except (OSError, ValueError, KeyError):
        return "0"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    daten = hass.data.setdefault(DOMAIN, {})
    planer = Planer(hass)
    await planer.async_laden()
    daten["planer"] = planer

    if not daten.get("pfad"):
        await hass.http.async_register_static_paths([StaticPathConfig(URL_BASIS, str(ORDNER), False)])
        daten["pfad"] = True
    async_registrieren(hass)

    async def hinzufuegen(call: ServiceCall) -> ServiceResponse:
        person = planer.person_finden(call.data.get("person"))
        if call.data.get("person") and person is None:
            raise ServiceValidationError(f"Person „{call.data['person']}“ gibt es im Planer nicht.")
        roh = {
            "titel": call.data["titel"],
            "notiz": call.data.get("notiz", ""),
            "bereich": call.data.get("bereich", ""),
            "datum": call.data["datum"].isoformat() if isinstance(call.data.get("datum"), date) else None,
            "uhrzeit": call.data["uhrzeit"].strftime("%H:%M") if call.data.get("uhrzeit") else None,
            "top": call.data.get("top"),
            "person": person or call.context.user_id or GEMEINSAM,
        }
        a = await planer.speichern(roh, call.context.user_id)
        return {"id": a["id"]}

    hass.services.async_register(
        DOMAIN, "hinzufuegen", hinzufuegen, schema=DIENST_HINZUFUEGEN, supports_response=SupportsResponse.OPTIONAL
    )

    version = await hass.async_add_executor_job(_version)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_PFAD,
        webcomponent_name="planer-panel",
        sidebar_title="Planer",
        sidebar_icon="mdi:calendar-check",
        module_url=f"{URL_BASIS}/planer.js?v={version}",
        require_admin=False,
        config={"version": version},
    )
    await hass.config_entries.async_forward_entry_setups(entry, PLATTFORMEN)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    frontend.async_remove_panel(hass, PANEL_PFAD, warn_if_unknown=False)
    hass.services.async_remove(DOMAIN, "hinzufuegen")
    return await hass.config_entries.async_unload_platforms(entry, PLATTFORMEN)
