"""Erinnerungen aufs Handy für Aufgaben mit Datum und für Kalendertermine.

- Jede Minute wird geprüft, welche Erinnerungen seit dem letzten Lauf fällig wurden (nach einem
  Neustart werden bis zu 30 Minuten nachgeholt).
- Aufgaben: eigene Erinnerungen oder der Standard der Person. Ohne Uhrzeit gilt 9:00 Uhr am Fälligkeitstag.
  Gemeinsame Aufgaben erinnern alle Personen mit Handy.
- Termine: aus den Kalendern, die bei der Person unter „Erinnerungen für“ ausgewählt sind, mit ihrem Standard.
  Ganztägige Termine gelten ab 9:00 Uhr.
- Die Nachricht geht über die HA-App (notify.mobile_app_…) mit den Knöpfen „Erledigt“ und „In 1 Stunde“.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from . import kalender
from .const import GEMEINSAM
from .daten import Planer

_LOGGER = logging.getLogger(__name__)
GANZTAG_UHR = time(9, 0)
NACHHOLEN = timedelta(minutes=30)
ERLEDIGT = "PLANER_ERLEDIGT_"
SPAETER = "PLANER_SPAETER_"


def abstand_text(minuten: int) -> str:
    if minuten == 0:
        return "jetzt"
    if minuten % 1440 == 0:
        t = minuten // 1440
        return "morgen" if t == 1 else f"in {t} Tagen"
    if minuten % 60 == 0:
        return f"in {minuten // 60} Std."
    return f"in {minuten} Min."


class Erinnerungen:
    def __init__(self, hass: HomeAssistant, planer: Planer) -> None:
        self.hass = hass
        self.planer = planer
        self._store = Store(hass, 1, "planer.erinnerungen")
        self._zustand: dict[str, Any] = {}
        self._termine: dict[str, list[dict[str, Any]]] = {}
        self._termine_stand: datetime | None = None
        self._abmelden: list = []

    async def async_start(self) -> None:
        self._zustand = await self._store.async_load() or {}
        self._zustand.setdefault("gesendet", {})
        self._zustand.setdefault("spaeter", [])
        self._abmelden.append(async_track_time_change(self.hass, self._lauf, second=0))
        self._abmelden.append(self.hass.bus.async_listen("mobile_app_notification_action", self._aktion))

    @callback
    def async_stop(self) -> None:
        for ab in self._abmelden:
            ab()
        self._abmelden.clear()

    # --- Wer bekommt was --------------------------------------------------------------------

    def _handys(self, person: str | None) -> list[str]:
        if person == GEMEINSAM:
            ziele = [self.planer.einst(p["id"])["handy"] for p in self.planer.personen]
        else:
            ziele = [self.planer.einst(person)["handy"]]
        return [z for z in dict.fromkeys(ziele) if z]

    def _abstaende(self, person: str | None, eigene: list[int] | None) -> list[int]:
        if eigene is not None:
            return eigene
        if person == GEMEINSAM:
            # gemeinsam: Standard der ersten Person mit Handy, sonst allgemeiner Standard
            for p in self.planer.personen:
                if self.planer.einst(p["id"])["handy"]:
                    return self.planer.einst(p["id"])["erinnerungen"]
        return self.planer.einst(person)["erinnerungen"]

    # --- Fällige Erinnerungen ---------------------------------------------------------------

    def _aufgaben_faellig(self, von: datetime, bis: datetime) -> list[dict[str, Any]]:
        tz = dt_util.get_default_time_zone()
        raus = []
        for a in self.planer.aufgaben.values():
            if a.get("status") != "offen" or not a.get("datum"):
                continue
            d = date.fromisoformat(a["datum"])
            uhr = time.fromisoformat(a["uhrzeit"]) if a.get("uhrzeit") else GANZTAG_UHR
            beginn = datetime.combine(d, uhr, tz)
            for m in self._abstaende(a.get("person"), a.get("erinnerungen")):
                zeit = beginn - timedelta(minutes=m)
                if von < zeit <= bis:
                    wann = f"{a['uhrzeit']} Uhr" if a.get("uhrzeit") and m < 1440 else abstand_text(m) if m else "heute"
                    raus.append(
                        {
                            "schluessel": f"a|{a['id']}|{a['datum']}|{m}",
                            "titel": a["titel"],
                            "text": f"Fällig {wann}" + (f" · {a['uhrzeit']} Uhr" if a.get("uhrzeit") and m >= 1440 else ""),
                            "handys": self._handys(a.get("person")),
                            "aufgabe": a["id"],
                        }
                    )
        return raus

    async def _termine_laden(self, jetzt: datetime) -> None:
        if self._termine_stand and jetzt - self._termine_stand < timedelta(minutes=10):
            return
        self._termine_stand = jetzt
        ids = sorted({k for p in self.planer.personen for k in self.planer.einst(p["id"])["kalender_erinnern"]})
        start = jetzt - timedelta(hours=1)
        liste = await kalender.termine(self.hass, ids, start, jetzt + timedelta(days=8)) if ids else []
        self._termine = {}
        for t in liste:
            self._termine.setdefault(t["kalender"], []).append(t)

    def _termine_faellig(self, von: datetime, bis: datetime) -> list[dict[str, Any]]:
        tz = dt_util.get_default_time_zone()
        raus = []
        for p in self.planer.personen:
            e = self.planer.einst(p["id"])
            if not e["handy"]:
                continue
            for kid in e["kalender_erinnern"]:
                for t in self._termine.get(kid, []):
                    beginn = (
                        datetime.combine(date.fromisoformat(t["start"][:10]), GANZTAG_UHR, tz)
                        if t["ganztag"]
                        else dt_util.as_local(datetime.fromisoformat(t["start"]))
                    )
                    for m in e["erinnerungen"]:
                        zeit = beginn - timedelta(minutes=m)
                        if von < zeit <= bis:
                            uhr = "ganztägig" if t["ganztag"] else beginn.strftime("%H:%M Uhr")
                            raus.append(
                                {
                                    "schluessel": f"t|{p['id']}|{kid}|{t['uid']}|{t['start']}|{m}",
                                    "titel": t["titel"],
                                    "text": f"Termin {abstand_text(m)} · {uhr}" + (f" · {t['ort']}" if t["ort"] else ""),
                                    "handys": [e["handy"]],
                                    "aufgabe": None,
                                }
                            )
        return raus

    async def _lauf(self, jetzt: datetime) -> None:
        jetzt = dt_util.as_local(jetzt)
        try:
            letzter = datetime.fromisoformat(self._zustand["letzter"]) if self._zustand.get("letzter") else jetzt - timedelta(minutes=1)
        except ValueError:
            letzter = jetzt - timedelta(minutes=1)
        von = max(letzter, jetzt - NACHHOLEN)
        await self._termine_laden(jetzt)
        faellig = self._aufgaben_faellig(von, jetzt) + self._termine_faellig(von, jetzt)
        # zurückgestellte Erinnerungen
        bleiben = []
        for s in self._zustand["spaeter"]:
            if datetime.fromisoformat(s["zeit"]) <= jetzt:
                faellig.append({**s, "schluessel": s["schluessel"] + "|s" + s["zeit"]})
            else:
                bleiben.append(s)
        self._zustand["spaeter"] = bleiben
        gesendet = self._zustand["gesendet"]
        for f in faellig:
            if f["schluessel"] in gesendet:
                continue
            gesendet[f["schluessel"]] = jetzt.isoformat(timespec="seconds")
            await self._senden(f)
        grenze = (jetzt - timedelta(days=10)).isoformat()
        self._zustand["gesendet"] = {k: v for k, v in gesendet.items() if v > grenze}
        self._zustand["letzter"] = jetzt.isoformat(timespec="seconds")
        offen = self._zustand.setdefault("offen", {})
        if len(offen) > 200:
            self._zustand["offen"] = dict(list(offen.items())[-200:])
        await self._store.async_save(self._zustand)

    async def _senden(self, f: dict[str, Any]) -> None:
        kennung = f["schluessel"].replace("|", "_")[-60:]
        self._zustand.setdefault("offen", {})[kennung] = {k: f[k] for k in ("schluessel", "titel", "text", "handys", "aufgabe")}
        aktionen = [{"action": f"{SPAETER}{kennung}", "title": "In 1 Stunde"}]
        if f.get("aufgabe"):
            aktionen.insert(0, {"action": f"{ERLEDIGT}{f['aufgabe']}", "title": "Erledigt"})
        for handy in f["handys"]:
            if not self.hass.services.has_service("notify", handy):
                _LOGGER.warning("Planer: Handy-Dienst notify.%s gibt es nicht", handy)
                continue
            await self.hass.services.async_call(
                "notify",
                handy,
                {
                    "title": f["titel"],
                    "message": f["text"],
                    "data": {"tag": kennung, "group": "planer", "clickAction": "/planer", "url": "/planer", "actions": aktionen},
                },
                blocking=False,
            )

    async def _aktion(self, event: Event) -> None:
        aktion = str(event.data.get("action") or "")
        if aktion.startswith(ERLEDIGT):
            aufgabe = aktion.removeprefix(ERLEDIGT)
            if aufgabe in self.planer.aufgaben:
                await self.planer.erledigen(aufgabe, True, None)
        elif aktion.startswith(SPAETER):
            kennung = aktion.removeprefix(SPAETER)
            f = (self._zustand.get("offen") or {}).get(kennung)
            if f:
                zeit = dt_util.now() + timedelta(hours=1)
                self._zustand["spaeter"].append({**f, "zeit": zeit.isoformat(timespec="seconds"), "text": f["text"] + " (erneut)"})
                await self._store.async_save(self._zustand)

    def handys(self) -> list[dict[str, str]]:
        """Alle Handys mit HA-App (notify.mobile_app_…) für die Auswahl in den Einstellungen."""
        dienste = self.hass.services.async_services().get("notify", {})
        return [
            {"id": d, "name": d.removeprefix("mobile_app_").replace("_", " ").title()}
            for d in sorted(dienste)
            if d.startswith("mobile_app_")
        ]
