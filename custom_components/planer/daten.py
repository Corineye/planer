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

from .const import GEMEINSAM, MAX_AUFGABEN, MAX_NOTIZEN, SPEICHER_SCHLUESSEL, SPEICHER_VERSION
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
        self.notizen: dict[str, dict[str, Any]] = {}
        self.einstellungen: dict[str, dict[str, Any]] = {}
        self.wochen: dict[str, dict[str, dict[str, Any]]] = {}  # Person → Kalenderwoche (2026-W47) → Ziele, Notiz
        self.allgemein: dict[str, Any] = {}
        self.schichten: dict[str, dict[str, Any]] = {}  # Person → {"arten": [...], "tage": {Datum: Art-ID}}
        self._zuhoerer: list[Callable[[], None]] = []
        self.personen: list[dict[str, str]] = []
        self.alle_benutzer: list[dict[str, Any]] = []

    async def async_laden(self) -> None:
        daten = await self._store.async_load() or {}
        self.aufgaben = daten.get("aufgaben", {})
        self.notizen = daten.get("notizen", {})
        self.einstellungen = daten.get("einstellungen", {})
        self.wochen = daten.get("wochen", {})
        self.allgemein = daten.get("allgemein", {})
        self.schichten = daten.get("schichten", {})
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
            "kalender_aus": e.get("kalender_aus", []),
            "kalender_zeitleiste": e.get("kalender_zeitleiste"),  # None = alle in der Zeitleiste  # von der Person selbst ausgeblendet
            "handy": e.get("handy"),
            "standard_kalender": e.get("standard_kalender"),
            "erinnerungen": e.get("erinnerungen", STANDARD_ERINNERUNGEN),
            "aufgaben_sortierung": e.get("aufgaben_sortierung", "faellig"),
            "ausgeblendete_tags": e.get("ausgeblendete_tags", []),
            "tag_von": e.get("tag_von", 7),
            "tag_bis": e.get("tag_bis", 22),
            # Schichten: None = Kalender „<Vorname> Arbeit“ automatisch, "" = nicht übertragen
            "schicht_kalender": e.get("schicht_kalender"),
            # "" = keine Erinnerung, "vorabend" = am Vortag zur Uhrzeit schicht_push_uhr, Zahl = Minuten vor Beginn
            "schicht_push": e.get("schicht_push", ""),
            "schicht_push_uhr": e.get("schicht_push_uhr", "20:00"),
        }

    def sichtbar(self, aufgabe: dict[str, Any], benutzer_id: str | None) -> bool:
        if benutzer_id is None:
            return True
        p = aufgabe.get("person")
        return p in (benutzer_id, GEMEINSAM) or self.sieht_andere(benutzer_id)

    def fuer(self, benutzer_id: str | None) -> list[dict[str, Any]]:
        return [a for a in self.aufgaben.values() if self.sichtbar(a, benutzer_id)]

    def notizen_fuer(self, benutzer_id: str | None) -> list[dict[str, Any]]:
        return [n for n in self.notizen.values() if self.sichtbar(n, benutzer_id)]

    # --- Ändern -------------------------------------------------------------------------------

    @callback
    def zuhoeren(self, fn: Callable[[], None]) -> Callable[[], None]:
        self._zuhoerer.append(fn)
        return lambda: self._zuhoerer.remove(fn) if fn in self._zuhoerer else None

    def alles(self) -> dict[str, Any]:
        return {"aufgaben": self.aufgaben, "notizen": self.notizen, "einstellungen": self.einstellungen, "wochen": self.wochen, "allgemein": self.allgemein,
                "schichten": self.schichten}

    async def ersetzen(self, daten: dict[str, Any]) -> None:
        """Ersetzt den ganzen Bestand (Wiederherstellen aus einer Sicherung) und meldet es allen Geräten."""
        self.aufgaben = daten.get("aufgaben", {})
        self.notizen = daten.get("notizen", {})
        self.einstellungen = daten.get("einstellungen", {})
        self.wochen = daten.get("wochen", {})
        self.allgemein = daten.get("allgemein", {})
        self.schichten = daten.get("schichten", {})
        await self.async_personen()
        await self._sichern()

    async def _sichern(self) -> None:
        await self._store.async_save(self.alles())
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
        if "tags" in roh:
            teile = roh["tags"] if isinstance(roh["tags"], list) else re.split(r"[\s,]+", str(roh["tags"] or ""))
            a["tags"] = list(dict.fromkeys(t for t in (_text(x, 30).lstrip("#").lower() for x in teile) if t))[:10]
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
            a.setdefault("tags", [])
            for feld in ("datum", "uhrzeit", "dauer", "top", "wiederholung"):
                a.setdefault(feld, None)
            a.setdefault("erinnerungen", [])
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

    async def erledigen(
        self, aufgabe_id: str, erledigt: bool, benutzer_id: str | None, rueckgaengig: dict[str, Any] | None = None
    ) -> dict[str, Any]:
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
            # Rückgängig bei Wiederholungen: Datum, Rang und Verlauf wie vor dem Abhaken
            if rueckgaengig is not None:
                if "datum" in rueckgaengig:
                    d = rueckgaengig["datum"]
                    a["datum"] = date.fromisoformat(d).isoformat() if d else None
                if "top" in rueckgaengig:
                    t = rueckgaengig["top"]
                    a["top"] = t if t in (1, 2, 3) else None
                    if a["top"]:
                        self._top_freimachen(a)
                if a.get("wiederholung") and (a.get("verlauf") or [])[-1:] == [heute.isoformat()]:
                    a["verlauf"] = a["verlauf"][:-1]
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

    async def notiz_speichern(self, roh: dict[str, Any], benutzer_id: str | None) -> dict[str, Any]:
        alt = self.notizen.get(str(roh.get("id") or ""))
        if alt is None and len(self.notizen) >= MAX_NOTIZEN:
            raise ValueError("Zu viele Notizen gespeichert. Bitte alte löschen.")
        if alt is not None and not self.sichtbar(alt, benutzer_id):
            raise PermissionError("Diese Notiz gehört einer anderen Person.")
        n: dict[str, Any] = dict(alt or {})
        jetzt = dt_util.now().isoformat(timespec="seconds")
        vorher = (n.get("titel", ""), n.get("text", ""))
        if "titel" in roh:
            n["titel"] = _text(roh["titel"], 200)
        if "text" in roh:
            # Zeilenumbrüche und Einrückung bleiben erhalten; nur Leerzeilen am Anfang und Leerraum am Ende fallen weg
            n["text"] = str(roh["text"] or "").rstrip().lstrip("\r\n")[:20000]
        if "person" in roh:
            p = roh["person"]
            n["person"] = p if p == GEMEINSAM or any(x["id"] == p for x in self.personen) else (benutzer_id or GEMEINSAM)
        if "angeheftet" in roh:
            n["angeheftet"] = bool(roh["angeheftet"])
        if "ordner" in roh:
            n["ordner"] = re.sub(r"[\x00-\x1f\x7f]", "", _text(roh["ordner"], 40)).strip()
        if "farbe" in roh:
            f = str(roh["farbe"] or "").strip()
            n["farbe"] = f.lower() if re.fullmatch(r"#[0-9a-fA-F]{6}", f) else ""
        if "erledigte_unten" in roh:
            n["erledigte_unten"] = bool(roh["erledigte_unten"])
        if not alt:
            n.setdefault("titel", "")
            n.setdefault("text", "")
            n.setdefault("person", benutzer_id or GEMEINSAM)
            n.setdefault("angeheftet", False)
            n.update(id=uuid.uuid4().hex[:12], erstellt=jetzt, erstellt_von=benutzer_id)
        # Nur echte Inhaltsänderungen zählen als „geändert“; Anheften, Ordner oder Farbe ändern die Reihenfolge nicht
        if not alt or (n.get("titel", ""), n.get("text", "")) != vorher or not n.get("geaendert"):
            n["geaendert"] = jetzt
        self.notizen[n["id"]] = n
        await self._sichern()
        return n

    async def notiz_loeschen(self, notiz_id: str, benutzer_id: str | None) -> None:
        n = self.notizen.get(notiz_id)
        if n is None:
            return
        if not self.sichtbar(n, benutzer_id):
            raise PermissionError("Diese Notiz gehört einer anderen Person.")
        del self.notizen[notiz_id]
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

    # ---------- Schichtplan (wie Supershift) ----------
    def schichtplan(self, person: str) -> dict[str, Any]:
        e = self.schichten.get(person) or {}
        return {"arten": e.get("arten") or [], "tage": e.get("tage", {})}

    async def schicht_arten(self, person: str, arten: list[dict[str, Any]]) -> dict[str, Any]:
        sauber, ids = [], set()
        for x in arten[:20]:
            if not isinstance(x, dict) or not _text(x.get("name"), 40):
                continue
            aid = _text(x.get("id"), 12) or uuid.uuid4().hex[:8]
            if aid in ids:
                continue
            ids.add(aid)
            zeit = lambda v: str(v) if v and re.match(r"^\d{2}:\d{2}$", str(v)) else None  # noqa: E731
            sauber.append({
                "id": aid,
                "name": _text(x.get("name"), 40),
                "kurz": _text(x.get("kurz"), 3) or _text(x.get("name"), 1).upper(),
                "farbe": str(x.get("farbe")) if re.match(r"^#[0-9a-fA-F]{6}$", str(x.get("farbe"))) else "#8e8e93",
                "von": zeit(x.get("von")),
                "bis": zeit(x.get("bis")),
                "pause": max(0, min(240, int(x.get("pause") or 0))) if str(x.get("pause") or 0).isdigit() else 0,
                # Frei/Urlaub (ohne Uhrzeit) standardmäßig nicht in den Arbeitskalender
                "kalender": bool(x["kalender"]) if "kalender" in x else bool(zeit(x.get("von")) and zeit(x.get("bis"))),
            })
        plan = self.schichten.setdefault(person, {})
        plan["arten"] = sauber
        # Tage mit gelöschten Arten aufräumen
        plan["tage"] = {t: a for t, a in plan.get("tage", {}).items() if a in ids}
        await self._sichern()
        return self.schichtplan(person)

    async def schicht_tage(self, person: str, tage: dict[str, Any]) -> dict[str, Any]:
        plan = self.schichten.setdefault(person, {})
        plan.setdefault("arten", [])
        ids = {a["id"] for a in plan["arten"]}
        ziel = plan.setdefault("tage", {})
        for tag, art in list(tage.items())[:800]:
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(tag)):
                continue
            if art and art in ids:
                ziel[tag] = art
            else:
                ziel.pop(tag, None)
        await self._sichern()
        return self.schichtplan(person)

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
        if "einkauf_listen" in werte:
            v = werte["einkauf_listen"]
            self.allgemein["einkauf_listen"] = None if v is None else [str(x) for x in v if str(x).startswith("todo.")][:10]
        if "wetter" in werte:
            v = werte["wetter"]
            self.allgemein["wetter"] = str(v) if v and (str(v).startswith("weather.") or v == "-") else None
        if "sensoren" in werte and isinstance(werte["sensoren"], list):
            arten = {"schicht_heute", "schicht_morgen", "naechste_schicht", "offene_aufgaben", "ueberfaellig"}
            self.allgemein["sensoren"] = [
                {"id": _text(x.get("id"), 12) or uuid.uuid4().hex[:8], "name": _text(x.get("name"), 60),
                 "art": x["art"], "person": _text(x.get("person"), 64) or GEMEINSAM}
                for x in werte["sensoren"][:20]
                if isinstance(x, dict) and x.get("art") in arten and _text(x.get("name"), 60)
            ]
        if "regeln" in werte and isinstance(werte["regeln"], list):
            sauber = []
            for x in werte["regeln"][:30]:
                if not isinstance(x, dict) or "." not in str(x.get("entitaet", "")) or not _text(x.get("titel"), 120) or not _text(x.get("zu"), 60):
                    continue
                sauber.append({
                    "id": _text(x.get("id"), 12) or uuid.uuid4().hex[:8],
                    "entitaet": _text(x.get("entitaet"), 120),
                    "zu": _text(x.get("zu"), 60),
                    "erledigen_bei": _text(x.get("erledigen_bei"), 60) or "",
                    "titel": _text(x.get("titel"), 120),
                    "person": _text(x.get("person"), 64) or GEMEINSAM,
                    "bereich": _text(x.get("bereich"), 40).lower(),
                    "aktiv": bool(x.get("aktiv", True)),
                })
            self.allgemein["regeln"] = sauber
        if "ausgeblendet" in werte and isinstance(werte["ausgeblendet"], list):
            self.allgemein["ausgeblendet"] = [str(x) for x in werte["ausgeblendet"]][:100]
            await self.async_personen()
        await self._sichern()

    async def einstellung(self, person: str, werte: dict[str, Any]) -> None:
        e = self.einstellungen.setdefault(person, {})
        if "andere_sehen" in werte:
            e["andere_sehen"] = bool(werte["andere_sehen"])
        for feld in ("kalender_sehen", "kalender_schreiben", "kalender_erinnern", "kalender_aus", "kalender_zeitleiste"):
            if feld in werte:
                v = werte[feld]
                e[feld] = None if v is None else [str(x) for x in v if str(x).startswith("calendar.")]
        if "aufgaben_sortierung" in werte:
            v = str(werte["aufgaben_sortierung"])
            e["aufgaben_sortierung"] = v if v in ("faellig", "prio", "bereich", "neu", "az") else "faellig"
        if "ausgeblendete_tags" in werte and isinstance(werte["ausgeblendete_tags"], list):
            e["ausgeblendete_tags"] = list(dict.fromkeys(_text(x, 40).lstrip("#").lower() for x in werte["ausgeblendete_tags"] if _text(x, 40)))[:100]
        if "standard_kalender" in werte:
            e["standard_kalender"] = str(werte["standard_kalender"]) if werte["standard_kalender"] else None
        if "handy" in werte:
            e["handy"] = str(werte["handy"]) if werte["handy"] else None
        for feld, lo, hi in (("tag_von", 0, 23), ("tag_bis", 1, 24)):
            if feld in werte and str(werte[feld]).isdigit():
                e[feld] = min(hi, max(lo, int(werte[feld])))
        if e.get("tag_bis", 22) <= e.get("tag_von", 7):
            e["tag_bis"] = min(24, e.get("tag_von", 7) + 1)
        if "schicht_kalender" in werte:
            v = werte["schicht_kalender"]
            e["schicht_kalender"] = None if v is None else (str(v) if str(v).startswith("calendar.") else "")
        if "schicht_push" in werte:
            v = str(werte["schicht_push"] or "")
            e["schicht_push"] = v if v == "vorabend" or (v.isdigit() and int(v) <= 1440) else ""
        if "schicht_push_uhr" in werte and UHRZEIT.match(str(werte["schicht_push_uhr"])):
            e["schicht_push_uhr"] = str(werte["schicht_push_uhr"])
        if "erinnerungen" in werte:
            e["erinnerungen"] = sorted({int(m) for m in werte["erinnerungen"] or [] if str(m).isdigit() and int(m) <= 43200})
        await self._sichern()
