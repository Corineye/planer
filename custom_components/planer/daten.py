"""Speicher und Regeln des Planers: Aufgaben, Personen, Sichtbarkeit.

Alles liegt in .storage/planer.daten (über den HA-Store, im Backup enthalten).
Eine Aufgabe gehört einer Person (HA-Benutzer-ID) oder ist „gemeinsam“.
Wer was sieht: eigene + gemeinsame Aufgaben immer; die der anderen nur, wenn ein Admin das für die Person erlaubt.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from datetime import date
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import GEMEINSAM, MAX_AUFGABEN, SPEICHER_SCHLUESSEL, SPEICHER_VERSION
from .wiederholung import fortschreiben, gueltig

STANDARD_ERINNERUNGEN = [30, 180, 1440]
UHRZEIT = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
MAX_VERLAUF = 60


def _datum(wert: Any) -> str | None:
    if not wert:
        return None
    try:
        return date.fromisoformat(str(wert)[:10]).isoformat()
    except ValueError:
        return None


def _text(wert: Any, laenge: int) -> str:
    return str(wert or "").strip()[:laenge]


class Planer:
    """Hält die Daten im Speicher und meldet Änderungen an Panel und todo-Listen."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store = Store(hass, SPEICHER_VERSION, SPEICHER_SCHLUESSEL)
        self.aufgaben: dict[str, dict[str, Any]] = {}
        self.einstellungen: dict[str, dict[str, Any]] = {}
        self.wochen: dict[str, dict[str, dict[str, Any]]] = {}  # Person → Kalenderwoche (2026-W47) → Ziele, Notiz
        self.allgemein: dict[str, Any] = {}
        self._zuhoerer: list[Callable[[], None]] = []
        self.personen: list[dict[str, str]] = []
        self.alle_benutzer: list[dict[str, Any]] = []

    async def async_laden(self) -> None:
        daten = await self._store.async_load() or {}
        self.aufgaben = daten.get("aufgaben", {})
        self.einstellungen = daten.get("einstellungen", {})
        self.wochen = daten.get("wochen", {})
        self.allgemein = daten.get("allgemein", {})
        await self.async_personen()

    async def async_personen(self) -> list[dict[str, str]]:
        """Alle echten, aktiven HA-Benutzer (keine Systemkonten)."""
        benutzer = await self.hass.auth.async_get_users()
        ausgeblendet = set(self.allgemein.get("ausgeblendet", []))
        echte = sorted(
            (
                {"id": b.id, "name": b.name or "Ohne Namen", "admin": b.is_admin}
                for b in benutzer
                if b.is_active and not b.system_generated
            ),
            key=lambda p: p["name"].lower(),
        )
        self.alle_benutzer = [{**b, "ausgeblendet": b["id"] in ausgeblendet} for b in echte]
        self.personen = [b for b in echte if b["id"] not in ausgeblendet]
        return self.personen

    def name(self, person: str | None) -> str:
        if person == GEMEINSAM:
            return "Gemeinsam"
        for p in self.personen:
            if p["id"] == person:
                return p["name"]
        return "Unbekannt"

    def person_finden(self, wert: str | None) -> str | None:
        """Vorname, voller Name, Benutzer-ID oder „gemeinsam“ → gespeicherter Wert."""
        if not wert:
            return None
        w = wert.strip().lower()
        if w in (GEMEINSAM, "beide", "alle"):
            return GEMEINSAM
        for p in self.personen:
            if w in (p["id"].lower(), p["name"].lower(), p["name"].split(" ")[0].lower()):
                return p["id"]
        return None

    # --- Sichtbarkeit -------------------------------------------------------------------------

    def sieht_andere(self, benutzer_id: str | None) -> bool:
        return bool(self.einst(benutzer_id)["andere_sehen"])

    def einst(self, benutzer_id: str | None) -> dict[str, Any]:
        """Einstellungen einer Person mit Standardwerten."""
        e = self.einstellungen.get(benutzer_id or "", {})
        return {
            "andere_sehen": e.get("andere_sehen", True),
            "kalender_sehen": e.get("kalender_sehen"),  # None = alle
            "kalender_schreiben": e.get("kalender_schreiben"),  # None = alle, in die man schreiben kann
            "kalender_erinnern": e.get("kalender_erinnern", []),
            "handy": e.get("handy"),
            "standard_kalender": e.get("standard_kalender"),
            "erinnerungen": e.get("erinnerungen", STANDARD_ERINNERUNGEN),
        }

    def sichtbar(self, aufgabe: dict[str, Any], benutzer_id: str | None) -> bool:
        if benutzer_id is None:
            return True
        p = aufgabe.get("person")
        return p in (benutzer_id, GEMEINSAM) or self.sieht_andere(benutzer_id)

    def fuer(self, benutzer_id: str | None) -> list[dict[str, Any]]:
        return [a for a in self.aufgaben.values() if self.sichtbar(a, benutzer_id)]

    # --- Ändern -------------------------------------------------------------------------------

    @callback
    def zuhoeren(self, fn: Callable[[], None]) -> Callable[[], None]:
        self._zuhoerer.append(fn)
        return lambda: self._zuhoerer.remove(fn) if fn in self._zuhoerer else None

    async def _sichern(self) -> None:
        await self._store.async_save(
            {"aufgaben": self.aufgaben, "einstellungen": self.einstellungen, "wochen": self.wochen, "allgemein": self.allgemein}
        )
        for fn in list(self._zuhoerer):
            fn()

    def _bereinigen(self, roh: dict[str, Any], alt: dict[str, Any] | None, benutzer_id: str | None) -> dict[str, Any]:
        a: dict[str, Any] = dict(alt or {})
        jetzt = dt_util.now().isoformat(timespec="seconds")
        if "titel" in roh:
            a["titel"] = _text(roh["titel"], 200) or "Ohne Titel"
        if "notiz" in roh:
            a["notiz"] = _text(roh["notiz"], 4000)
        if "bereich" in roh:
            a["bereich"] = _text(roh["bereich"], 40).lstrip("#").lower()
        if "person" in roh:
            p = roh["person"]
            a["person"] = p if p == GEMEINSAM or any(x["id"] == p for x in self.personen) else (benutzer_id or GEMEINSAM)
        if "datum" in roh:
            neu = _datum(roh["datum"])
            if alt and alt.get("datum") and neu and neu > alt["datum"] and alt.get("status") == "offen":
                a["verschoben"] = int(alt.get("verschoben") or 0) + 1
            a["datum"] = neu
        if "uhrzeit" in roh:
            u = str(roh["uhrzeit"] or "")[:5]
            a["uhrzeit"] = u if UHRZEIT.match(u) else None
        if "dauer" in roh:
            try:
                a["dauer"] = max(5, min(720, int(roh["dauer"]))) if roh["dauer"] else None
            except (TypeError, ValueError):
                a["dauer"] = None
        if "top" in roh:
            try:
                t = int(roh["top"]) if roh["top"] else None
            except (TypeError, ValueError):
                t = None
            a["top"] = t if t in (1, 2, 3) else None
        if "wiederholung" in roh:
            a["wiederholung"] = gueltig(roh["wiederholung"])
        if "erinnerungen" in roh:
            # None = Standard der Person, [] = keine Erinnerung
            e = roh["erinnerungen"]
            a["erinnerungen"] = None if e is None else sorted({int(m) for m in e if str(m).isdigit() and int(m) <= 43200})
        if "teilaufgaben" in roh:
            teile = []
            for t in (roh["teilaufgaben"] or [])[:50]:
                if isinstance(t, dict) and _text(t.get("text"), 200):
                    teile.append(
                        {
                            "id": _text(t.get("id"), 12) or uuid.uuid4().hex[:8],
                            "text": _text(t.get("text"), 200),
                            "erledigt": bool(t.get("erledigt")),
                        }
                    )
            a["teilaufgaben"] = teile
        if "reihenfolge" in roh:
            try:
                a["reihenfolge"] = float(roh["reihenfolge"])
            except (TypeError, ValueError):
                pass
        if not alt:
            a.setdefault("titel", "Ohne Titel")
            a.setdefault("person", benutzer_id or GEMEINSAM)
            a.update(
                id=uuid.uuid4().hex[:12],
                status="offen",
                erstellt=jetzt,
                erstellt_von=benutzer_id,
                verschoben=0,
            )
            for feld in ("notiz", "bereich"):
                a.setdefault(feld, "")
            for feld in ("datum", "uhrzeit", "dauer", "top", "wiederholung"):
                a.setdefault(feld, None)
            a.setdefault("erinnerungen", None)
            a.setdefault("teilaufgaben", [])
            a.setdefault("reihenfolge", dt_util.utcnow().timestamp())
        a["geaendert"] = jetzt
        return a

    def _top_freimachen(self, a: dict[str, Any]) -> None:
        """Es gibt pro Person und Tag nur je einen Rang 1, 2, 3: wer den Rang schon hat, verliert ihn."""
        if not a.get("top") or not a.get("datum"):
            return
        for b in self.aufgaben.values():
            if (
                b["id"] != a["id"]
                and b.get("top") == a["top"]
                and b.get("datum") == a["datum"]
                and b.get("person") == a.get("person")
                and b.get("status") == "offen"
            ):
                b["top"] = None

    async def speichern(self, roh: dict[str, Any], benutzer_id: str | None) -> dict[str, Any]:
        alt = self.aufgaben.get(roh.get("id") or "")
        if alt is None and len(self.aufgaben) >= MAX_AUFGABEN:
            raise ValueError("Zu viele Aufgaben gespeichert. Bitte erledigte löschen.")
        if alt is not None and not self.sichtbar(alt, benutzer_id):
            raise PermissionError("Diese Aufgabe gehört einer anderen Person.")
        a = self._bereinigen(roh, alt, benutzer_id)
        self.aufgaben[a["id"]] = a
        self._top_freimachen(a)
        await self._sichern()
        return a

    async def erledigen(self, aufgabe_id: str, erledigt: bool, benutzer_id: str | None) -> dict[str, Any]:
        a = self.aufgaben.get(aufgabe_id)
        if a is None:
            raise KeyError("Aufgabe nicht gefunden.")
        if not self.sichtbar(a, benutzer_id):
            raise PermissionError("Diese Aufgabe gehört einer anderen Person.")
        jetzt = dt_util.now()
        heute = jetzt.date()
        if erledigt and a.get("wiederholung"):
            basis = date.fromisoformat(a["datum"]) if a.get("datum") else heute
            verlauf = (a.get("verlauf") or []) + [heute.isoformat()]
            a["verlauf"] = verlauf[-MAX_VERLAUF:]
            weiter = fortschreiben(a["wiederholung"], basis, heute)
            if weiter is not None:
                a.update(datum=weiter.isoformat(), status="offen", top=None, verschoben=0, erledigt_am=None)
                for t in a.get("teilaufgaben") or []:
                    t["erledigt"] = False
            else:
                a.update(status="erledigt", erledigt_am=jetzt.isoformat(timespec="seconds"))
        elif erledigt:
            a.update(status="erledigt", erledigt_am=jetzt.isoformat(timespec="seconds"))
        else:
            a.update(status="offen", erledigt_am=None)
        a["geaendert"] = jetzt.isoformat(timespec="seconds")
        await self._sichern()
        return a

    async def loeschen(self, aufgabe_id: str, benutzer_id: str | None) -> None:
        a = self.aufgaben.get(aufgabe_id)
        if a is None:
            return
        if not self.sichtbar(a, benutzer_id):
            raise PermissionError("Diese Aufgabe gehört einer anderen Person.")
        del self.aufgaben[aufgabe_id]
        await self._sichern()

    async def woche(self, person: str, kw: str, ziele: list[dict[str, Any]], notiz: str) -> dict[str, Any]:
        if not re.match(r"^\d{4}-W\d{2}$", kw):
            raise ValueError("Kalenderwoche ungültig")
        sauber = [
            {"text": _text(z.get("text"), 200), "erledigt": bool(z.get("erledigt"))}
            for z in ziele[:3]
            if isinstance(z, dict) and _text(z.get("text"), 200)
        ]
        eintrag = {"ziele": sauber, "notiz": _text(notiz, 4000)}
        self.wochen.setdefault(person, {})[kw] = eintrag
        await self._sichern()
        return eintrag

    async def allgemein_setzen(self, werte: dict[str, Any]) -> None:
        if "farben" in werte and isinstance(werte["farben"], dict):
            self.allgemein["farben"] = {
                _text(k, 40).lower(): str(v)[:7]
                for k, v in list(werte["farben"].items())[:40]
                if re.match(r"^#[0-9a-fA-F]{6}$", str(v))
            }
        if "gemeinsam_kalender" in werte:
            v = werte["gemeinsam_kalender"]
            self.allgemein["gemeinsam_kalender"] = str(v) if v and str(v).startswith("calendar.") else None
        if "ausgeblendet" in werte and isinstance(werte["ausgeblendet"], list):
            self.allgemein["ausgeblendet"] = [str(x) for x in werte["ausgeblendet"]][:100]
            await self.async_personen()
        await self._sichern()

    async def einstellung(self, person: str, werte: dict[str, Any]) -> None:
        e = self.einstellungen.setdefault(person, {})
        if "andere_sehen" in werte:
            e["andere_sehen"] = bool(werte["andere_sehen"])
        for feld in ("kalender_sehen", "kalender_schreiben", "kalender_erinnern"):
            if feld in werte:
                v = werte[feld]
                e[feld] = None if v is None else [str(x) for x in v if str(x).startswith("calendar.")]
        if "standard_kalender" in werte:
            e["standard_kalender"] = str(werte["standard_kalender"]) if werte["standard_kalender"] else None
        if "handy" in werte:
            e["handy"] = str(werte["handy"]) if werte["handy"] else None
        if "erinnerungen" in werte:
            e["erinnerungen"] = sorted({int(m) for m in werte["erinnerungen"] or [] if str(m).isdigit() and int(m) <= 43200})
        await self._sichern()
