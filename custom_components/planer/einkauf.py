"""Einkaufslisten: jede To-do-Liste in Home Assistant (zum Beispiel Bring!) direkt im Planer.

Der Planer speichert keine Artikel selbst. Er liest und schreibt die Liste über die
Standard-Dienste todo.get_items, todo.add_item, todo.update_item und todo.remove_item.
So bleibt alles mit der Bring!-App synchron.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import Context, HomeAssistant
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN


def alle_listen(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Alle To-do-Listen außer den eigenen Planer-Listen, Bring!-Listen zuerst."""
    reg = er.async_get(hass)
    raus = []
    for st in hass.states.async_all("todo"):
        eintrag = reg.async_get(st.entity_id)
        plattform = eintrag.platform if eintrag else ""
        if plattform == DOMAIN:
            continue
        raus.append({
            "id": st.entity_id,
            "name": st.attributes.get("friendly_name") or st.entity_id,
            "bring": plattform == "bring",
        })
    raus.sort(key=lambda x: (not x["bring"], x["name"].lower()))
    return raus


def gewaehlte_listen(hass: HomeAssistant, einstellung: list[str] | None) -> list[dict[str, Any]]:
    """Eingestellte Listen; ohne Einstellung automatisch alle Bring!-Listen."""
    alle = alle_listen(hass)
    if einstellung is None:
        return [x for x in alle if x["bring"]]
    nach_id = {x["id"]: x for x in alle}
    return [nach_id[i] for i in einstellung if i in nach_id]


async def artikel(hass: HomeAssistant, liste: str, context: Context) -> list[dict[str, Any]]:
    antwort = await hass.services.async_call(
        "todo", "get_items", {"entity_id": liste}, blocking=True, return_response=True, context=context,
    )
    roh = (antwort or {}).get(liste, {}).get("items", [])
    return [
        {
            "uid": a.get("uid"),
            "text": a.get("summary", ""),
            "beschreibung": a.get("description") or "",
            "erledigt": a.get("status") == "completed",
        }
        for a in roh
    ]


async def aktion(hass: HomeAssistant, liste: str, art: str, werte: dict[str, Any], context: Context) -> None:
    ziel = {"entity_id": liste}
    if art == "hinzufuegen":
        daten = {"item": str(werte.get("text", "")).strip()[:200]}
        if not daten["item"]:
            raise ValueError("Bitte einen Artikel eingeben.")
        if werte.get("beschreibung"):
            daten["description"] = str(werte["beschreibung"]).strip()[:200]
        await hass.services.async_call("todo", "add_item", daten, target=ziel, blocking=True, context=context)
    elif art in ("erledigt", "offen"):
        await hass.services.async_call(
            "todo", "update_item",
            {"item": werte["uid"], "status": "completed" if art == "erledigt" else "needs_action"},
            target=ziel, blocking=True, context=context,
        )
    elif art == "loeschen":
        await hass.services.async_call("todo", "remove_item", {"item": [werte["uid"]]}, target=ziel, blocking=True, context=context)
    else:
        raise ValueError(f"Unbekannte Aktion {art}")
