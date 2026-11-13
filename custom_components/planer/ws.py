"""Websocket-Befehle für das Panel. Jeder Befehl läuft mit den Rechten des angemeldeten Benutzers."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.util import dt as dt_util

from . import einkauf, kalender

from .const import DOMAIN
from .daten import Planer

ID = vol.All(str, vol.Length(min=1, max=40))


def _planer(hass: HomeAssistant) -> Planer:
    return hass.data[DOMAIN]["planer"]


def _kalender_fuer(hass: HomeAssistant, benutzer_id: str) -> list[dict[str, Any]]:
    """Kalender, die die Person sieht, mit „schreiben“ = darf dort eintragen."""
    e = _planer(hass).einst(benutzer_id)
    raus = []
    for k in kalender.liste(hass):
        if e["kalender_sehen"] is not None and k["id"] not in e["kalender_sehen"]:
            continue
        darf = k["anlegen"] and (e["kalender_schreiben"] is None or k["id"] in e["kalender_schreiben"])
        raus.append({**k, "schreiben": darf, "loeschen": k["loeschen"] and darf})
    return raus


@callback
def async_registrieren(hass: HomeAssistant) -> None:
    daten = hass.data.setdefault(DOMAIN, {})
    if daten.get("ws"):
        return
    for befehl in (
        ws_lesen, ws_abonnieren, ws_speichern, ws_erledigen, ws_loeschen, ws_einstellung,
        ws_termine, ws_termin_anlegen, ws_termin_loeschen, ws_woche, ws_allgemein,
        ws_einkauf, ws_einkauf_aktion,
    ):
        websocket_api.async_register_command(hass, befehl)
    daten["ws"] = True


def _fehler(connection: websocket_api.ActiveConnection, msg_id: int, err: Exception) -> None:
    code = "unauthorized" if isinstance(err, PermissionError) else "not_found" if isinstance(err, KeyError) else "failed"
    connection.send_error(msg_id, code, str(err).strip("'"))


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/lesen"})
@websocket_api.async_response
async def ws_lesen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    p = _planer(hass)
    personen = await p.async_personen()
    user = connection.user
    connection.send_result(
        msg["id"],
        {
            "ich": user.id,
            "admin": user.is_admin,
            "personen": personen,
            "andere_sehen": p.sieht_andere(user.id),
            "einst": p.einst(user.id),
            "einstellungen": {x["id"]: p.einst(x["id"]) for x in personen} if user.is_admin else {},
            "alle_benutzer": p.alle_benutzer if user.is_admin else [],
            "alle_kalender": kalender.liste(hass) if user.is_admin else [],
            "handys": hass.data[DOMAIN]["erinnerungen"].handys() if user.is_admin else [],
            "kalender": _kalender_fuer(hass, user.id),
            "aufgaben": p.fuer(user.id),
            "wochen": p.wochen.get(user.id, {}),
            "gemeinsam_kalender": p.allgemein.get("gemeinsam_kalender"),
            "farben": p.allgemein.get("farben", {}),
            "einkauf_listen": einkauf.gewaehlte_listen(hass, p.allgemein.get("einkauf_listen")),
            "einkauf_eingestellt": p.allgemein.get("einkauf_listen"),
            "alle_todo": einkauf.alle_listen(hass) if user.is_admin else [],
        },
    )


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/abonnieren"})
@callback
def ws_abonnieren(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Meldet dem Panel jede Änderung (auch von anderen Geräten), damit es neu liest."""

    @callback
    def geaendert() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], {"geaendert": True}))

    connection.subscriptions[msg["id"]] = _planer(hass).zuhoeren(geaendert)
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/speichern", vol.Required("aufgabe"): dict}
)
@websocket_api.async_response
async def ws_speichern(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        a = await _planer(hass).speichern(msg["aufgabe"], connection.user.id)
    except (ValueError, PermissionError) as err:
        _fehler(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], a)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/erledigen", vol.Required("aufgabe_id"): ID, vol.Optional("erledigt", default=True): bool}
)
@websocket_api.async_response
async def ws_erledigen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        a = await _planer(hass).erledigen(msg["aufgabe_id"], msg["erledigt"], connection.user.id)
    except (KeyError, PermissionError) as err:
        _fehler(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], a)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/loeschen", vol.Required("aufgabe_id"): ID})
@websocket_api.async_response
async def ws_loeschen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        await _planer(hass).loeschen(msg["aufgabe_id"], connection.user.id)
    except PermissionError as err:
        _fehler(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/einstellung", vol.Required("person"): ID, vol.Required("werte"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_einstellung(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _planer(hass).einstellung(msg["person"], msg["werte"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/termine", vol.Required("start"): str, vol.Required("ende"): str}
)
@websocket_api.async_response
async def ws_termine(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Termine aller Kalender, die die Person sieht. start/ende als Datum (JJJJ-MM-TT), lokale Zeit."""
    tz = dt_util.get_default_time_zone()
    try:
        start = dt_util.start_of_local_day(dt_util.parse_date(msg["start"]))
        ende = dt_util.start_of_local_day(dt_util.parse_date(msg["ende"])).astimezone(tz)
    except (TypeError, ValueError):
        connection.send_error(msg["id"], "invalid", "Datum ungültig")
        return
    ids = [k["id"] for k in _kalender_fuer(hass, connection.user.id)]
    connection.send_result(msg["id"], await kalender.termine(hass, ids, start, ende))


def _darf(hass: HomeAssistant, benutzer_id: str, kid: str, art: str) -> bool:
    return any(k["id"] == kid and k[art] for k in _kalender_fuer(hass, benutzer_id))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/termin_anlegen",
        vol.Required("kalender"): str,
        vol.Required("termin"): dict,
    }
)
@websocket_api.async_response
async def ws_termin_anlegen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if not _darf(hass, connection.user.id, msg["kalender"], "schreiben"):
        connection.send_error(msg["id"], "unauthorized", "In diesen Kalender darfst du nicht eintragen.")
        return
    try:
        await kalender.anlegen(hass, msg["kalender"], msg["termin"])
    except (HomeAssistantError, vol.Invalid, ValueError, KeyError) as err:
        _fehler(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/termin_loeschen",
        vol.Required("kalender"): str,
        vol.Required("uid"): str,
        vol.Optional("recurrence_id"): vol.Any(None, str),
        vol.Optional("alle_folgenden", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_termin_loeschen(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    if not _darf(hass, connection.user.id, msg["kalender"], "loeschen"):
        connection.send_error(msg["id"], "unauthorized", "In diesem Kalender darfst du nicht löschen.")
        return
    try:
        await kalender.loeschen(hass, msg["kalender"], msg["uid"], msg.get("recurrence_id"), msg["alle_folgenden"])
    except (HomeAssistantError, ValueError) as err:
        _fehler(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/woche",
        vol.Required("kw"): str,
        vol.Required("ziele"): list,
        vol.Optional("notiz", default=""): str,
    }
)
@websocket_api.async_response
async def ws_woche(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Wochenziele (höchstens drei) und Notiz der angemeldeten Person für eine Kalenderwoche."""
    try:
        e = await _planer(hass).woche(connection.user.id, msg["kw"], msg["ziele"], msg["notiz"])
    except ValueError as err:
        _fehler(connection, msg["id"], err)
        return
    connection.send_result(msg["id"], e)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/allgemein", vol.Required("werte"): dict})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_allgemein(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _planer(hass).allgemein_setzen(msg["werte"])
    connection.send_result(msg["id"], {"ok": True})


def _einkauf_erlaubt(hass: HomeAssistant, liste: str) -> None:
    p = _planer(hass)
    if liste not in {x["id"] for x in einkauf.gewaehlte_listen(hass, p.allgemein.get("einkauf_listen"))}:
        raise PermissionError("Diese Liste ist im Planer nicht freigegeben.")


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/einkauf", vol.Required("liste"): str})
@websocket_api.async_response
async def ws_einkauf(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        _einkauf_erlaubt(hass, msg["liste"])
        connection.send_result(msg["id"], await einkauf.artikel(hass, msg["liste"], connection.context(msg)))
    except (PermissionError, KeyError, ValueError, HomeAssistantError) as err:
        _fehler(connection, msg["id"], err)


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/einkauf_aktion",
    vol.Required("liste"): str,
    vol.Required("art"): vol.In(["hinzufuegen", "erledigt", "offen", "loeschen"]),
    vol.Optional("text"): str,
    vol.Optional("beschreibung"): str,
    vol.Optional("uid"): str,
})
@websocket_api.async_response
async def ws_einkauf_aktion(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    try:
        _einkauf_erlaubt(hass, msg["liste"])
        await einkauf.aktion(hass, msg["liste"], msg["art"], msg, connection.context(msg))
        connection.send_result(msg["id"], {"ok": True})
    except (PermissionError, KeyError, ValueError, HomeAssistantError) as err:
        _fehler(connection, msg["id"], err)
