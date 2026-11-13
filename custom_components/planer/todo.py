"""To-do-Listen in Home Assistant: eine pro Person plus „Gemeinsam“.

So erscheinen die Aufgaben auch in der HA-App, in To-do-Karten und für Assist
(„Füge Brot zur Liste Planer Corin hinzu“). Was dort angelegt wird, landet im Eingang
bzw. am Fälligkeitstag. Zusatzfelder (Top 3, Wiederholung) gibt es nur im Panel.
"""

from __future__ import annotations

from datetime import date, datetime

from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity, TodoListEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, GEMEINSAM
from .daten import Planer


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    planer: Planer = hass.data[DOMAIN]["planer"]
    listen = [PlanerListe(planer, p["id"], p["name"]) for p in planer.personen]
    listen.append(PlanerListe(planer, GEMEINSAM, "Gemeinsam"))
    async_add_entities(listen)


class PlanerListe(TodoListEntity):
    _attr_has_entity_name = False
    _attr_should_poll = False
    _attr_icon = "mdi:calendar-check"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
        | TodoListEntityFeature.SET_DUE_DATETIME_ON_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(self, planer: Planer, person: str, name: str) -> None:
        self._planer = planer
        self._person = person
        self._attr_name = f"Planer {name}"
        self._attr_unique_id = f"planer_{person}"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._planer.zuhoeren(self.async_write_ha_state))

    @property
    def todo_items(self) -> list[TodoItem]:
        eigene = [a for a in self._planer.aufgaben.values() if a.get("person") == self._person]
        eigene.sort(key=lambda a: (a.get("status") != "offen", a.get("datum") or "9999", a.get("top") or 9, a.get("reihenfolge") or 0))
        return [self._item(a) for a in eigene]

    @staticmethod
    def _item(a: dict) -> TodoItem:
        due: date | datetime | None = None
        if a.get("datum"):
            d = date.fromisoformat(a["datum"])
            if a.get("uhrzeit"):
                h, m = (int(x) for x in a["uhrzeit"].split(":"))
                due = datetime(d.year, d.month, d.day, h, m, tzinfo=dt_util.get_default_time_zone())
            else:
                due = d
        return TodoItem(
            uid=a["id"],
            summary=a.get("titel"),
            status=TodoItemStatus.COMPLETED if a.get("status") == "erledigt" else TodoItemStatus.NEEDS_ACTION,
            due=due,
            description="\n".join(
                filter(None, [a.get("notiz") or ""] + [f"{'☑' if t['erledigt'] else '☐'} {t['text']}" for t in a.get("teilaufgaben") or []])
            ) or None,
        )

    @staticmethod
    def _felder(item: TodoItem) -> dict:
        roh: dict = {}
        if item.summary is not None:
            roh["titel"] = item.summary
        if item.description is not None:
            # Teilaufgaben werden nur angezeigt; beim Zurückschreiben bleiben sie im Planer
            roh["notiz"] = "\n".join(z for z in item.description.split("\n") if not z.startswith(("☑ ", "☐ "))).strip()
        if isinstance(item.due, datetime):
            lokal = dt_util.as_local(item.due)
            roh.update(datum=lokal.date().isoformat(), uhrzeit=lokal.strftime("%H:%M"))
        elif isinstance(item.due, date):
            roh.update(datum=item.due.isoformat(), uhrzeit=None)
        return roh

    async def async_create_todo_item(self, item: TodoItem) -> None:
        roh = self._felder(item)
        roh["person"] = self._person
        await self._planer.speichern(roh, None)

    async def async_update_todo_item(self, item: TodoItem) -> None:
        alt = self._planer.aufgaben.get(item.uid or "")
        if alt is None:
            return
        roh = self._felder(item)
        if item.due is None and alt.get("datum"):
            roh.update(datum=None, uhrzeit=None)
        roh["id"] = alt["id"]
        await self._planer.speichern(roh, None)
        erledigt = item.status == TodoItemStatus.COMPLETED
        if erledigt != (alt.get("status") == "erledigt"):
            await self._planer.erledigen(alt["id"], erledigt, None)

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            await self._planer.loeschen(uid, None)
