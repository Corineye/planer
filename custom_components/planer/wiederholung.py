"""Wiederholungen: berechnet den nächsten Termin einer wiederkehrenden Aufgabe.

Format einer Regel (so speichert sie das Panel):
    {"art": "tag" | "woche" | "monat" | "jahr", "alle": 1, "tage": [0, 3], "bis": "2027-06-30"}
- "alle": jeden n-ten Tag / jede n-te Woche / ...
- "tage": nur bei "woche": Wochentage, 0 = Montag ... 6 = Sonntag. Leer = gleicher Wochentag.
- "bis": optional letztes Datum; danach endet die Wiederholung.
Die Woche beginnt am Montag.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

ARTEN = ("tag", "woche", "monat", "jahr")


def _plus_monate(d: date, monate: int, tag: int) -> date:
    m = d.month - 1 + monate
    jahr, monat = d.year + m // 12, m % 12 + 1
    return date(jahr, monat, min(tag, calendar.monthrange(jahr, monat)[1]))


def naechster(regel: dict[str, Any], d: date, start_tag: int | None = None) -> date:
    """Nächster Termin strikt nach d."""
    art = regel.get("art", "tag")
    alle = max(1, int(regel.get("alle") or 1))
    if art == "woche":
        tage = sorted({int(t) for t in regel.get("tage") or [] if 0 <= int(t) <= 6})
        if not tage:
            return d + timedelta(weeks=alle)
        for t in tage:
            if t > d.weekday():
                return d + timedelta(days=t - d.weekday())
        montag = d - timedelta(days=d.weekday()) + timedelta(weeks=alle)
        return montag + timedelta(days=tage[0])
    if art == "monat":
        return _plus_monate(d, alle, start_tag or d.day)
    if art == "jahr":
        return _plus_monate(d, 12 * alle, start_tag or d.day)
    return d + timedelta(days=alle)


def fortschreiben(regel: dict[str, Any], datum: date, heute: date) -> date | None:
    """Datum nach dem Abhaken: nächster Termin, der nicht in der Vergangenheit liegt.

    Gibt None zurück, wenn die Wiederholung über „bis“ hinaus wäre (Aufgabe ist dann endgültig erledigt).
    """
    start_tag = regel.get("monatstag") or datum.day
    n = naechster(regel, datum, start_tag)
    schutz = 0
    while n < heute and schutz < 5000:
        n = naechster(regel, n, start_tag)
        schutz += 1
    bis = regel.get("bis")
    if bis:
        try:
            if n > date.fromisoformat(bis):
                return None
        except ValueError:
            pass
    return n


def gueltig(regel: Any) -> dict[str, Any] | None:
    """Regel aus dem Panel prüfen und bereinigen. Ungültig oder leer → None."""
    if not isinstance(regel, dict) or regel.get("art") not in ARTEN:
        return None
    sauber: dict[str, Any] = {"art": regel["art"], "alle": max(1, min(365, int(regel.get("alle") or 1)))}
    if regel["art"] == "woche":
        sauber["tage"] = sorted({int(t) for t in regel.get("tage") or [] if str(t).isdigit() and 0 <= int(t) <= 6})
    if regel.get("monatstag"):
        sauber["monatstag"] = max(1, min(31, int(regel["monatstag"])))
    if regel.get("bis"):
        try:
            sauber["bis"] = date.fromisoformat(str(regel["bis"])).isoformat()
        except ValueError:
            pass
    return sauber
