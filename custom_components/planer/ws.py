"""Websocket-Befehle für das Panel. Jeder Befehl läuft mit den Rechten des angemeldeten Benutzers."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .daten import Planer

ID = vol.All(str, vol.Length(min=1, max=40))


def _planer(hass: HomeAssistant) -> Planer:
    return hass.data[DOMAIN]["planer"]


@callback
def async_registrieren(hass: HomeAssistant) -> None:
    daten = hass.data.setdefault(DOMAIN, {})
    if daten.get("ws"):
        return
    for befehl in (ws_lesen, ws_abonnieren, ws_speichern, ws_erledigen, ws_loeschen, ws_einstellung):
        websocket_api.async_register_command(hass, befehl)
    daten["ws"] = True


def _fehler(connection: websocket_api.ActiveConnection, msg_id: int, err: Exception) -> None:
    code = "unauthorized" if isinstance(err, PermissionError) else "not_found" if isinstance(err, KeyError) else "invalid"
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
            "einstellungen": p.einstellungen if user.is_admin else {},
            "aufgaben": p.fuer(user.id),
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
    {vol.Required("type"): f"{DOMAIN}/einstellung", vol.Required("person"): ID, vol.Required("andere_sehen"): bool}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_einstellung(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    await _planer(hass).einstellung(msg["person"], msg["andere_sehen"])
    connection.send_result(msg["id"], {"ok": True})
