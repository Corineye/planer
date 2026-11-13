"""Kalender: Termine aus allen calendar.*-Entitäten lesen, neue Termine anlegen und löschen.

Läuft über die eingebaute Kalender-Komponente von HA, also genau wie die Kalenderseite von HA.
Google Kalender, lokale Kalender und CalDAV funktionieren gleich. Ein eigener Google-Zugang ist nicht nötig.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.components.calendar import (
    DATA_COMPONENT,
    WEBSOCKET_EVENT_SCHEMA,
    CalendarEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util


def liste(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Alle Kalender mit Name und was sie können."""
    ergebnis = []
    for st in hass.states.async_all("calendar"):
        f = int(st.attributes.get("supported_features") or 0)
        ergebnis.append(
            {
                "id": st.entity_id,
                "name": st.attributes.get("friendly_name") or st.entity_id,
                "anlegen": bool(f & CalendarEntityFeature.CREATE_EVENT),
                "loeschen": bool(f & CalendarEntityFeature.DELETE_EVENT),
            }
        )
    return sorted(ergebnis, key=lambda k: k["name"].lower())


def _entity(hass: HomeAssistant, entity_id: str):
    comp = hass.data.get(DATA_COMPONENT)
    entity = comp.get_entity(entity_id) if comp else None
    if entity is None:
        raise HomeAssistantError(f"Kalender {entity_id} gibt es nicht.")
    return entity


def _wert(d: date | datetime) -> str:
    return dt_util.as_local(d).isoformat(timespec="minutes") if isinstance(d, datetime) else d.isoformat()


async def termine(hass: HomeAssistant, ids: list[str], start: datetime, ende: datetime) -> list[dict[str, Any]]:
    """Termine im Zeitraum aus mehreren Kalendern, nach Beginn sortiert. Ein defekter Kalender stoppt die anderen nicht."""
    alle: list[dict[str, Any]] = []
    for kid in ids:
        try:
            entity = _entity(hass, kid)
            events = await entity.async_get_events(hass, start, ende)
        except Exception:  # noqa: BLE001 – ein Kalender ohne Verbindung soll den Planer nicht leer machen
            continue
        for ev in events:
            alle.append(
                {
                    "kalender": kid,
                    "uid": ev.uid,
                    "recurrence_id": ev.recurrence_id,
                    "titel": ev.summary,
                    "beschreibung": ev.description or "",
                    "ort": ev.location or "",
                    "start": _wert(ev.start),
                    "ende": _wert(ev.end),
                    "ganztag": not isinstance(ev.start, datetime),
                    "wiederholt": bool(ev.rrule or ev.recurrence_id),
                }
            )
    alle.sort(key=lambda t: (t["start"][:10], not t["ganztag"], t["start"]))
    return alle


async def anlegen(hass: HomeAssistant, kid: str, roh: dict[str, Any]) -> None:
    entity = _entity(hass, kid)
    if not int(entity.supported_features or 0) & CalendarEntityFeature.CREATE_EVENT:
        raise HomeAssistantError("In diesen Kalender kann man keine Termine eintragen.")
    if roh.get("ganztag"):
        start = date.fromisoformat(roh["start"][:10])
        ende = date.fromisoformat((roh.get("ende") or roh["start"])[:10])
        if ende <= start:
            ende = start + timedelta(days=1)
        else:
            ende = ende + timedelta(days=1)  # Kalender zählen das Ende ganztägiger Termine exklusiv
    else:
        tz = dt_util.get_default_time_zone()
        start = datetime.fromisoformat(roh["start"]).replace(tzinfo=tz)
        ende = datetime.fromisoformat(roh.get("ende") or roh["start"]).replace(tzinfo=tz)
        if ende <= start:
            ende = start + timedelta(hours=1)
    ev: dict[str, Any] = {"dtstart": start, "dtend": ende, "summary": str(roh.get("titel") or "Termin")[:200]}
    if roh.get("beschreibung"):
        ev["description"] = str(roh["beschreibung"])[:4000]
    if roh.get("ort"):
        ev["location"] = str(roh["ort"])[:200]
    if roh.get("rrule"):
        ev["rrule"] = str(roh["rrule"])
    await entity.async_create_event(**WEBSOCKET_EVENT_SCHEMA(ev))


async def loeschen(hass: HomeAssistant, kid: str, uid: str, recurrence_id: str | None, alle_folgenden: bool) -> None:
    entity = _entity(hass, kid)
    if not int(entity.supported_features or 0) & CalendarEntityFeature.DELETE_EVENT:
        raise HomeAssistantError("In diesem Kalender kann man keine Termine löschen.")
    await entity.async_delete_event(
        uid, recurrence_id=recurrence_id or None, recurrence_range="THISANDFUTURE" if alle_folgenden and recurrence_id else None
    )
