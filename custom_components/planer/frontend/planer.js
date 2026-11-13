// Panel „Planer“: Heute mit Top 3, Demnächst, Eingang, Schnelleingabe, Wiederholungen.
// Daten kommen über die Websocket-Befehle planer/* aus der Integration (daten.py).
// Barrierefrei: echte Buttons und Formulare, sichtbarer Fokus, Ansagen für Bildschirmleser,
// jede Geste hat auch einen Knopf.

const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const WT_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const GEMEINSAM = "gemeinsam";

// ---------- Datum ----------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ausIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const plusTage = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const wt = (d) => (d.getDay() + 6) % 7; // 0 = Montag
const heute = () => iso(new Date());

function datumText(s, mitWochentag = true) {
  if (!s) return "Eingang";
  const h = heute();
  if (s === h) return "Heute";
  if (s === iso(plusTage(new Date(), 1))) return "Morgen";
  if (s === iso(plusTage(new Date(), -1))) return "Gestern";
  const d = ausIso(s);
  const t = `${d.getDate()}. ${MONATE[d.getMonth()]}`;
  return mitWochentag ? `${WOCHENTAGE[wt(d)]}, ${t}` : t;
}

function regelText(r) {
  if (!r) return "";
  const n = r.alle || 1;
  if (r.art === "tag") return n === 1 ? "täglich" : `alle ${n} Tage`;
  if (r.art === "woche") {
    const tage = (r.tage || []).map((t) => WT_KURZ[t]).join(", ");
    const basis = n === 1 ? "jede Woche" : `alle ${n} Wochen`;
    return tage ? `${basis} ${tage}` : basis;
  }
  if (r.art === "monat") return n === 1 ? "monatlich" : `alle ${n} Monate`;
  if (r.art === "jahr") return n === 1 ? "jährlich" : `alle ${n} Jahre`;
  return "";
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Schnelleingabe ----------
// Beispiel: „morgen 15 Uhr !1 PETG bestellen #werkstatt @linda jeden Montag“
const WT_MUSTER = [
  ["montag", "mo"], ["dienstag", "di"], ["mittwoch", "mi"], ["donnerstag", "do"],
  ["freitag", "fr"], ["samstag", "sa"], ["sonntag", "so"],
];

function wtIndex(wort) {
  const w = wort.toLowerCase().replace(/s$/, "");
  return WT_MUSTER.findIndex(([lang, kurz]) => w === lang || w === kurz);
}

function naechsterWochentag(i, abHeute = true) {
  const d = new Date();
  let diff = (i - wt(d) + 7) % 7;
  if (diff === 0 && !abHeute) diff = 7;
  return plusTage(d, diff);
}

export function parse(text, personen) {
  let t = ` ${text} `;
  const r = { titel: "", datum: undefined, uhrzeit: null, top: null, bereich: "", person: undefined, wiederholung: null };
  const weg = (re, fn) => { t = t.replace(re, (...m) => { fn(m); return " "; }); };
  const WT = "(montags?|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonntags?|mo|di|mi|do|fr|sa|so)";

  // Wiederholung
  weg(/\s(täglich|jeden tag)(?=\s)/i, () => { r.wiederholung = { art: "tag", alle: 1 }; });
  weg(/\salle (\d+) tage(?=\s)/i, (m) => { r.wiederholung = { art: "tag", alle: +m[1] }; });
  weg(new RegExp(`\\s(?:jeden|jede|alle)\\s+${WT}((?:\\s*(?:,|und|\\+)\\s*${WT})*)(?=\\s)`, "i"), (m) => {
    const woerter = (m[0].match(new RegExp(WT, "gi")) || []);
    const tage = [...new Set(woerter.map(wtIndex).filter((i) => i >= 0))].sort();
    r.wiederholung = { art: "woche", alle: 1, tage };
  });
  weg(/\s(wöchentlich|jede woche)(?=\s)/i, () => { r.wiederholung = { art: "woche", alle: 1, tage: [] }; });
  weg(/\salle (\d+) wochen(?=\s)/i, (m) => { r.wiederholung = { art: "woche", alle: +m[1], tage: [] }; });
  weg(/\s(monatlich|jeden monat)(?=\s)/i, () => { r.wiederholung = { art: "monat", alle: 1 }; });
  weg(/\salle (\d+) monate(?=\s)/i, (m) => { r.wiederholung = { art: "monat", alle: +m[1] }; });
  weg(/\s(jährlich|jedes jahr)(?=\s)/i, () => { r.wiederholung = { art: "jahr", alle: 1 }; });

  // Uhrzeit
  weg(/\s(?:um\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*uhr)?(?=\s)/i, (m) => { r.uhrzeit = `${m[1].padStart(2, "0")}:${m[2]}`; });
  weg(/\s(?:um\s+)?([01]?\d|2[0-3])\s*uhr(?=\s)/i, (m) => { r.uhrzeit = `${m[1].padStart(2, "0")}:00`; });

  // Datum
  weg(/\s(übermorgen)(?=\s)/i, () => { r.datum = iso(plusTage(new Date(), 2)); });
  weg(/\s(morgen)(?=\s)/i, () => { r.datum = iso(plusTage(new Date(), 1)); });
  weg(/\s(heute)(?=\s)/i, () => { r.datum = heute(); });
  weg(/\sin (\d+) (tagen|tag|wochen|woche)(?=\s)/i, (m) => { r.datum = iso(plusTage(new Date(), +m[1] * (/woche/i.test(m[2]) ? 7 : 1))); });
  weg(/\s(?:am\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/, (m) => {
    const jetzt = new Date();
    let y = m[3] ? +m[3] : jetzt.getFullYear();
    if (y < 100) y += 2000;
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && iso(d) < heute()) d = new Date(y + 1, +m[2] - 1, +m[1]);
    r.datum = iso(d);
  });
  weg(new RegExp(`\\s(?:am\\s+|nächsten?\\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(?=\\s)`, "i"), (m) => {
    r.datum = iso(naechsterWochentag(wtIndex(m[1])));
  });
  weg(/\s(eingang|irgendwann)(?=\s)/i, () => { r.datum = null; });

  // Top, Bereich, Person
  weg(/\s!([1-3])(?=\s)/, (m) => { r.top = +m[1]; });
  weg(/\s#([\wäöüß-]+)(?=\s)/i, (m) => { r.bereich = m[1].toLowerCase(); });
  weg(/\s@([\wäöüß-]+)(?=\s)/i, (m) => {
    const w = m[1].toLowerCase();
    if (["gemeinsam", "beide", "alle"].includes(w)) r.person = GEMEINSAM;
    else {
      const p = (personen || []).find((x) => x.name.toLowerCase() === w || x.name.split(" ")[0].toLowerCase() === w);
      if (p) r.person = p.id;
    }
  });

  // Wiederholung ohne Datum: erster Termin
  if (r.wiederholung && r.datum === undefined) {
    const w = r.wiederholung;
    r.datum = w.art === "woche" && w.tage && w.tage.length ? iso(naechsterWochentag(w.tage.find((x) => x >= wt(new Date())) ?? w.tage[0])) : heute();
  }
  if (r.top && r.datum === undefined) r.datum = heute();
  r.titel = t.replace(/\s+/g, " ").trim();
  return r;
}

// ---------- Stil ----------
const CSS = `
:host{
  --bg:#0b1110; --bg2:#111a18; --glass:rgba(24,37,34,.72); --line:rgba(140,255,214,.14); --line2:rgba(140,255,214,.28);
  --fg:#e6f1ed; --muted:#9db3ab; --mint:#5ff2b8; --mint-dim:rgba(95,242,184,.14); --on-mint:#06241a;
  --warn:#ffc46b; --warn-dim:rgba(255,196,107,.14); --red:#ff8f8f; --focus:#ffe58a;
  --font:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  display:block; min-height:100vh; min-height:100dvh; background:var(--bg); color:var(--fg); font-family:var(--font); font-size:1rem; line-height:1.5;
  background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);
  background-size:32px 32px; color-scheme:dark;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-radius:8px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wrap{max-width:960px;margin:0 auto;padding:16px 16px 120px;display:grid;gap:18px}
header{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header h1{margin:0;font-size:1.5rem;font-weight:700;letter-spacing:-.01em}
header .datum{color:var(--muted)}
header .rechts{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.menu{width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--glass);cursor:pointer;font-size:1.25rem}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--glass)}
.seg button{border:0;background:none;padding:8px 12px;min-height:44px;cursor:pointer;color:var(--muted)}
.seg button[aria-pressed="true"]{background:var(--mint-dim);color:var(--mint);font-weight:600}
.knopf{border:1px solid var(--line2);background:var(--glass);border-radius:12px;padding:8px 14px;min-height:44px;cursor:pointer}
.knopf:hover{border-color:var(--mint)}
.knopf.primaer{background:var(--mint);color:var(--on-mint);border-color:var(--mint);font-weight:600}
.knopf.gefahr{border-color:rgba(255,143,143,.5);color:var(--red)}
.knopf.klein{min-height:36px;padding:4px 10px;font-size:.875rem}

form.schnell{display:grid;gap:6px}
.eingabe{display:flex;gap:8px}
.eingabe input{flex:1;min-width:0;min-height:52px;border-radius:14px;border:1px solid var(--line2);background:var(--glass);padding:0 16px;font-size:1.05rem}
.eingabe input::placeholder{color:var(--muted)}
.hinweis{font-size:.875rem;color:var(--muted);min-height:1.5em;display:flex;gap:6px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:4px;font-size:.8125rem;padding:1px 8px;border-radius:99px;border:1px solid var(--line2);color:var(--muted);white-space:nowrap}
.chip.mint{color:var(--mint);border-color:rgba(95,242,184,.45);background:var(--mint-dim)}
.chip.warn{color:var(--warn);border-color:rgba(255,196,107,.45);background:var(--warn-dim)}

nav.tabs{display:flex;gap:6px}
nav.tabs button{border:1px solid transparent;background:none;border-radius:12px;padding:8px 14px;min-height:44px;cursor:pointer;color:var(--muted);display:flex;gap:6px;align-items:center}
nav.tabs button[aria-current="page"]{background:var(--mint-dim);color:var(--mint);border-color:rgba(95,242,184,.35);font-weight:600}
nav.tabs .zahl{font-family:var(--mono);font-size:.75rem;background:rgba(255,255,255,.08);border-radius:99px;padding:0 7px}
.schmal .eingabe .primaer{min-width:52px;font-size:1.4rem}
.schmal header .rechts{margin-left:0;width:100%}
.schmal nav.tabs{position:fixed;left:0;right:0;bottom:0;z-index:5;justify-content:space-around;background:rgba(11,17,16,.96);border-top:1px solid var(--line);padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px))}
.schmal nav.tabs button{flex:1;flex-direction:column;gap:0;font-size:.8125rem;padding:6px 4px}

main{display:grid;gap:22px}
section.gruppe{display:grid;gap:8px}
section.gruppe h2{margin:0;font-size:.8125rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:flex;gap:8px;align-items:center}
section.gruppe h2 .zahl{font-family:var(--mono);letter-spacing:0}
ul.liste{list-style:none;margin:0;padding:0;display:grid;gap:8px}
li.aufgabe{position:relative;border-radius:14px;touch-action:pan-y}
.zeile{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;background:var(--glass);border:1px solid var(--line);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:transform .15s ease}
.top .zeile{border-color:rgba(95,242,184,.35)}
.erledigt .zeile{opacity:.6}
.erledigt .titel{text-decoration:line-through}
.haken{flex:none;width:28px;height:28px;border-radius:8px;border:2px solid var(--muted);background:none;cursor:pointer;display:grid;place-items:center;padding:0}
.haken[aria-checked="true"]{background:var(--mint);border-color:var(--mint);color:var(--on-mint)}
.haken svg{width:16px;height:16px}
.rang{flex:none;font-family:var(--mono);font-size:.8125rem;font-weight:700;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--mint);color:var(--on-mint)}
.inhalt{flex:1;min-width:0;display:grid;gap:2px;text-align:left;background:none;border:0;padding:4px 0;cursor:pointer}
.titel{overflow-wrap:anywhere}
.meta{display:flex;gap:6px;flex-wrap:wrap}
.aktionen{display:flex;gap:6px;flex:none}
.leer{color:var(--muted);padding:12px 14px;border:1px dashed var(--line2);border-radius:14px}
.wisch{position:absolute;inset:0;border-radius:14px;display:flex;align-items:center;padding:0 18px;font-weight:600;pointer-events:none;opacity:0}
.wisch.rechts{background:var(--mint-dim);color:var(--mint)}
.wisch.links{background:var(--warn-dim);color:var(--warn);justify-content:flex-end}
details.zu summary{cursor:pointer;color:var(--muted);min-height:44px;display:flex;align-items:center}

dialog{border:1px solid var(--line2);border-radius:18px;background:#121c1a;color:var(--fg);padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 24px)}
dialog::backdrop{background:rgba(0,0,0,.6)}
.schmal dialog{margin:auto auto 0;width:100vw;max-width:100vw;border-radius:18px 18px 0 0;border-bottom:0}
dialog form{display:grid;gap:14px;padding:20px;padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))}
dialog h2{margin:0;font-size:1.2rem}
.griff{width:40px;height:4px;border-radius:2px;background:var(--line2);margin:-8px auto 0}
.feld{display:grid;gap:4px}
.feld>label,.feld>.lbl,fieldset legend{font-size:.875rem;color:var(--muted)}
.feld input,.feld select,.feld textarea{min-height:44px;border-radius:10px;border:1px solid var(--line2);background:var(--bg2);padding:8px 12px;width:100%}
.feld textarea{min-height:80px;resize:vertical}
.reihe{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.schnellwahl{display:flex;gap:6px;flex-wrap:wrap}
fieldset{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:0;display:grid;gap:10px}
.tage{display:flex;gap:6px;flex-wrap:wrap}
.tage label{display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:1px solid var(--line2);border-radius:10px;cursor:pointer}
.tage input{position:absolute;opacity:0;width:1px;height:1px}
.tage input:checked+span{color:var(--mint);font-weight:700}
.tage label:has(input:checked){background:var(--mint-dim);border-color:var(--mint)}
.tage label:has(input:focus-visible){outline:3px solid var(--focus);outline-offset:2px}
.fuss{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.fuss .links{margin-right:auto}
.fehler{color:var(--red)}
.check{display:flex;gap:10px;align-items:center;min-height:44px}
.check input{width:22px;height:22px;accent-color:var(--mint)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (forced-colors:active){.haken[aria-checked="true"]{forced-color-adjust:none;background:Highlight}}
`;

const HAKEN = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

class PlanerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._daten = null;
    this._ansicht = "heute";
    this._filter = "ich";
    this._fehler = "";
    this._tasten = (e) => this._taste(e);
    try {
      this._ansicht = localStorage.getItem("planer.ansicht") || "heute";
      this._filter = localStorage.getItem("planer.filter") || "ich";
    } catch (e) { /* ohne Speicher weiter */ }
  }

  set hass(h) {
    const erst = !this._hass;
    this._hass = h;
    if (erst && this.isConnected) this._start();
  }
  set narrow(n) { this._narrow = n; if (this._daten) this._zeichnen(); }
  set panel(p) { this._konf = (p && p.config) || {}; }

  connectedCallback() {
    document.addEventListener("keydown", this._tasten);
    if (this._hass) this._start();
    else this._zeichnen();
  }
  disconnectedCallback() {
    document.removeEventListener("keydown", this._tasten);
    if (this._abo) this._abo.then((ab) => ab()).catch(() => {});
    this._abo = null;
  }

  async _start() {
    if (this._gestartet) return;
    this._gestartet = true;
    await this._lesen();
    try {
      this._abo = this._hass.connection.subscribeMessage(() => {
        clearTimeout(this._neuTimer);
        this._neuTimer = setTimeout(() => this._lesen(), 150);
      }, { type: "planer/abonnieren" });
    } catch (e) { /* Änderungen dann erst beim nächsten Öffnen */ }
    // Tageswechsel: um Mitternacht neu zeichnen
    setInterval(() => { if (this._tag !== heute()) this._zeichnen(); }, 60000);
  }

  async _ws(msg) {
    try {
      return await this._hass.callWS(msg);
    } catch (e) {
      this._sagen(`Fehler: ${e.message || e.code || "unbekannt"}`);
      throw e;
    }
  }

  async _lesen() {
    try {
      this._daten = await this._hass.callWS({ type: "planer/lesen" });
      this._fehler = "";
    } catch (e) {
      this._fehler = `Der Planer konnte nicht geladen werden (${e.message || e.code}). Ist die Integration unter Geräte & Dienste eingerichtet?`;
    }
    this._zeichnen();
  }

  // ---------- Hilfen ----------
  _name(id) {
    if (id === GEMEINSAM) return "Gemeinsam";
    const p = (this._daten?.personen || []).find((x) => x.id === id);
    return p ? p.name.split(" ")[0] : "?";
  }
  _sichtbar() {
    const d = this._daten;
    if (!d) return [];
    const f = this._filter;
    return d.aufgaben.filter((a) => {
      if (f === "alle") return true;
      if (f === "ich") return a.person === d.ich || a.person === GEMEINSAM;
      return a.person === f;
    });
  }
  _sagen(text) {
    const r = this.shadowRoot.getElementById("ansage");
    if (!r) return;
    r.textContent = "";
    setTimeout(() => { r.textContent = text; }, 50);
  }
  _sortiert(liste) {
    return [...liste].sort((a, b) =>
      (a.top || 9) - (b.top || 9) ||
      (a.uhrzeit || "99") .localeCompare(b.uhrzeit || "99") ||
      (a.reihenfolge || 0) - (b.reihenfolge || 0));
  }

  // ---------- Zeichnen ----------
  _zeichnen() {
    const root = this.shadowRoot;
    const fokus = root.activeElement?.dataset?.fokus;
    const eingabe = root.getElementById("schnell")?.value || "";
    this._tag = heute();
    const schmal = !!this._narrow;

    if (!this._daten) {
      root.innerHTML = `<style>${CSS}</style><div class="wrap"><header>${this._menuKnopf()}<h1>Planer</h1></header>
        <p role="status">${esc(this._fehler || "Lade Aufgaben …")}</p></div>`;
      this._menuBinden();
      return;
    }

    const d = this._daten;
    const h = this._tag;
    const alle = this._sichtbar();
    const offen = alle.filter((a) => a.status === "offen");
    const zaehler = {
      heute: offen.filter((a) => a.datum && a.datum <= h).length,
      demnaechst: offen.filter((a) => a.datum && a.datum > h).length,
      eingang: offen.filter((a) => !a.datum).length,
    };
    const tabs = [["heute", "Heute"], ["demnaechst", "Demnächst"], ["eingang", "Eingang"]];
    const heuteD = new Date();
    const filterKnoepfe = d.andere_sehen
      ? `<div class="seg" role="group" aria-label="Wessen Aufgaben">
          ${[["ich", "Ich"], ...d.personen.filter((p) => p.id !== d.ich).map((p) => [p.id, p.name.split(" ")[0]]), [GEMEINSAM, "Gemeinsam"], ["alle", "Alle"]]
            .map(([k, t]) => `<button type="button" data-filter="${esc(k)}" data-fokus="f-${esc(k)}" aria-pressed="${this._filter === k}">${esc(t)}</button>`).join("")}
        </div>` : "";

    root.innerHTML = `<style>${CSS}</style>
    <div class="${schmal ? "schmal" : ""}">
    <div class="wrap">
      <header>
        ${this._menuKnopf()}
        <h1>Planer</h1>
        <span class="datum">${WOCHENTAGE[wt(heuteD)]}, ${heuteD.getDate()}. ${MONATE[heuteD.getMonth()]}</span>
        <div class="rechts">
          ${filterKnoepfe}
          ${d.admin ? `<button type="button" class="knopf" data-aktion="einstellungen" data-fokus="einst">Einstellungen</button>` : ""}
        </div>
      </header>

      <form class="schnell" id="schnellform" autocomplete="off">
        <label class="sr" for="schnell">Neue Aufgabe</label>
        <div class="eingabe">
          <input id="schnell" data-fokus="schnell" placeholder="Neue Aufgabe, z. B. morgen 15 Uhr !1 Filament bestellen #werkstatt" aria-describedby="vorschau tipp" enterkeyhint="done">
          <button class="knopf primaer" type="submit" aria-label="Hinzufügen">${schmal ? "＋" : "Hinzufügen"}</button>
        </div>
        <div class="hinweis" id="vorschau" aria-live="polite"></div>
        <span class="sr" id="tipp">Erkennt heute, morgen, Wochentage, Datum wie 24.12., Uhrzeit wie 15 Uhr, !1 bis !3 für Top 3, # für Bereich, @ für Person und Wiederholungen wie jeden Montag oder täglich. Taste N springt hierher.</span>
      </form>

      <nav class="tabs" aria-label="Ansichten">
        ${tabs.map(([k, t]) => `<button type="button" data-ansicht="${k}" data-fokus="t-${k}" ${this._ansicht === k ? 'aria-current="page"' : ""}>${t} <span class="zahl" aria-label="${zaehler[k]} offen">${zaehler[k]}</span></button>`).join("")}
      </nav>

      <main id="inhalt">${this._ansichtHtml(alle, offen)}</main>
    </div>
    </div>
    <div id="ansage" class="sr" role="status" aria-live="polite"></div>
    <dialog id="blatt" aria-labelledby="blatt-titel"></dialog>
    <dialog id="einst" aria-labelledby="einst-titel"></dialog>`;

    const s = root.getElementById("schnell");
    s.value = eingabe;
    this._vorschau();
    this._binden();
    if (fokus) {
      const el = root.querySelector(`[data-fokus="${CSS_escape(fokus)}"]`);
      if (el) el.focus();
    }
  }

  _menuKnopf() {
    return this._narrow ? `<button type="button" class="menu" id="menu" aria-label="Seitenleiste öffnen">☰</button>` : "";
  }
  _menuBinden() {
    const m = this.shadowRoot.getElementById("menu");
    if (m) m.onclick = () => this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
  }

  _ansichtHtml(alle, offen) {
    const h = this._tag;
    if (this._ansicht === "eingang") {
      const liste = this._sortiert(offen.filter((a) => !a.datum));
      return this._gruppe("Eingang", liste, "Der Eingang ist leer. Alles ohne Datum landet hier, auch was du per Sprache oder in der HA-App zur Planer-Liste hinzufügst.");
    }
    if (this._ansicht === "demnaechst") {
      const kommend = offen.filter((a) => a.datum && a.datum > h).sort((a, b) => a.datum.localeCompare(b.datum));
      if (!kommend.length) return `<p class="leer">Für die nächsten Tage ist nichts geplant.</p>`;
      const tage = [...new Set(kommend.map((a) => a.datum))];
      return tage.map((t) => this._gruppe(datumText(t), this._sortiert(kommend.filter((a) => a.datum === t)))).join("");
    }
    // Heute
    const ueber = this._sortiert(offen.filter((a) => a.datum && a.datum < h));
    const heuteOffen = offen.filter((a) => a.datum === h);
    const top = heuteOffen.filter((a) => a.top).sort((a, b) => a.top - b.top);
    const rest = this._sortiert(heuteOffen.filter((a) => !a.top));
    const fertig = alle.filter((a) => a.status === "erledigt" && (a.erledigt_am || "").slice(0, 10) === h);
    const wiederHeute = alle.filter((a) => a.wiederholung && (a.verlauf || []).includes(h) && a.status === "offen");
    let html = "";
    if (ueber.length) html += this._gruppe("Überfällig", ueber, "", "warn");
    const freie = 3 - top.length;
    html += this._gruppe("Top 3", top, "Noch keine Top-Aufgabe für heute. Öffne eine Aufgabe und wähle einen Rang, oder tippe !1 in die Schnelleingabe.",
      "", freie > 0 && top.length ? `${freie} ${freie === 1 ? "Platz" : "Plätze"} frei` : "");
    html += this._gruppe("Weitere Aufgaben heute", rest, "Sonst steht heute nichts an.");
    const erledigtHeute = [...fertig, ...wiederHeute];
    if (erledigtHeute.length) {
      html += `<details class="zu"><summary>Heute erledigt (${erledigtHeute.length})</summary>
        <ul class="liste">${erledigtHeute.map((a) => this._zeile(a, a.status === "offen")).join("")}</ul></details>`;
    }
    return html;
  }

  _gruppe(titel, liste, leer = "", art = "", zusatz = "") {
    const id = `g-${titel.replace(/\W+/g, "-").toLowerCase()}`;
    return `<section class="gruppe" aria-labelledby="${id}">
      <h2 id="${id}">${esc(titel)} ${titel === "Top 3" ? "" : `<span class="zahl">${liste.length || ""}</span>`}${zusatz ? ` <span class="chip">${esc(zusatz)}</span>` : ""}${art === "warn" ? ' <span class="chip warn">nachholen oder verschieben</span>' : ""}</h2>
      ${liste.length ? `<ul class="liste">${liste.map((a) => this._zeile(a)).join("")}</ul>` : leer ? `<p class="leer">${esc(leer)}</p>` : ""}
    </section>`;
  }

  _zeile(a, wiederErledigt = false) {
    const fertig = a.status === "erledigt" || wiederErledigt;
    const meta = [];
    if (a.datum && (this._ansicht !== "heute" || a.datum < this._tag)) meta.push(`<span class="chip ${a.datum < this._tag ? "warn" : ""}">${esc(datumText(a.datum))}</span>`);
    if (wiederErledigt) meta.push(`<span class="chip mint">nächstes Mal ${esc(datumText(a.datum))}</span>`);
    if (a.uhrzeit) meta.push(`<span class="chip">${esc(a.uhrzeit)} Uhr</span>`);
    if (this._filter !== "ich" || a.person !== this._daten.ich) meta.push(`<span class="chip">${esc(this._name(a.person))}</span>`);
    if (a.bereich) meta.push(`<span class="chip">#${esc(a.bereich)}</span>`);
    if (a.wiederholung) meta.push(`<span class="chip mint"><span aria-hidden="true">↻</span> ${esc(regelText(a.wiederholung))}</span>`);
    if (a.verschoben > 0) meta.push(`<span class="chip warn">${a.verschoben}× verschoben</span>`);
    const morgen = !fertig ? `<button type="button" class="knopf klein" data-aktion="morgen" data-id="${a.id}" data-fokus="m-${a.id}" aria-label="${esc(a.titel)} auf morgen verschieben">Morgen</button>` : "";
    return `<li class="aufgabe ${a.top && !fertig ? "top" : ""} ${fertig ? "erledigt" : ""}" data-id="${a.id}">
      <div class="wisch rechts" aria-hidden="true">✓ Erledigt</div><div class="wisch links" aria-hidden="true">Morgen →</div>
      <div class="zeile">
        <button type="button" class="haken" role="checkbox" aria-checked="${fertig}" data-aktion="haken" data-id="${a.id}" data-fokus="h-${a.id}" aria-label="${esc(a.titel)} erledigt">${fertig ? HAKEN : ""}</button>
        ${a.top && !fertig ? `<span class="rang" aria-label="Top ${a.top}">${a.top}</span>` : ""}
        <button type="button" class="inhalt" data-aktion="oeffnen" data-id="${a.id}" data-fokus="o-${a.id}" aria-label="${esc(a.titel)} bearbeiten">
          <span class="titel">${esc(a.titel)}</span>
          ${meta.length ? `<span class="meta">${meta.join("")}</span>` : ""}
        </button>
        <div class="aktionen">${morgen}</div>
      </div>
    </li>`;
  }

  _vorschau() {
    const root = this.shadowRoot;
    const s = root.getElementById("schnell");
    const v = root.getElementById("vorschau");
    if (!s || !v) return;
    if (!s.value.trim()) { v.innerHTML = ""; return; }
    const p = parse(s.value, this._daten.personen);
    const teile = [];
    teile.push(`<span class="chip">${esc(p.datum === undefined || p.datum === null ? "Eingang" : datumText(p.datum))}</span>`);
    if (p.uhrzeit) teile.push(`<span class="chip">${p.uhrzeit} Uhr</span>`);
    if (p.top) teile.push(`<span class="chip mint">Top ${p.top}</span>`);
    if (p.bereich) teile.push(`<span class="chip">#${esc(p.bereich)}</span>`);
    if (p.person) teile.push(`<span class="chip">${esc(this._name(p.person))}</span>`);
    if (p.wiederholung) teile.push(`<span class="chip mint">↻ ${esc(regelText(p.wiederholung))}</span>`);
    v.innerHTML = teile.join("");
  }

  // ---------- Bedienung ----------
  _binden() {
    const root = this.shadowRoot;
    this._menuBinden();
    root.getElementById("schnell").addEventListener("input", () => this._vorschau());
    root.getElementById("schnellform").addEventListener("submit", (e) => { e.preventDefault(); this._schnellAnlegen(); });
    root.querySelectorAll("[data-ansicht]").forEach((b) => b.addEventListener("click", () => {
      this._ansicht = b.dataset.ansicht;
      try { localStorage.setItem("planer.ansicht", this._ansicht); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    root.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      this._filter = b.dataset.filter;
      try { localStorage.setItem("planer.filter", this._filter); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    root.querySelectorAll("[data-aktion]").forEach((b) => b.addEventListener("click", () => this._aktion(b.dataset.aktion, b.dataset.id)));
    root.querySelectorAll("li.aufgabe").forEach((li) => this._wischen(li));
  }

  _taste(e) {
    if (e.key !== "n" && e.key !== "N") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const pfad = e.composedPath();
    if (pfad.some((el) => el instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable))) return;
    if (!pfad.includes(this)) return;
    if (this.shadowRoot.querySelector("dialog[open]")) return;
    e.preventDefault();
    this.shadowRoot.getElementById("schnell")?.focus();
  }

  async _schnellAnlegen() {
    const s = this.shadowRoot.getElementById("schnell");
    const p = parse(s.value, this._daten.personen);
    if (!p.titel) { this._sagen("Bitte einen Titel eingeben."); return; }
    const aufgabe = { ...p, datum: p.datum ?? (this._ansicht === "eingang" ? null : this._ansicht === "heute" ? heute() : null) };
    if (p.datum === undefined && this._ansicht === "heute") aufgabe.datum = heute();
    if (!aufgabe.person) aufgabe.person = this._filter !== "ich" && this._filter !== "alle" ? this._filter : this._daten.ich;
    await this._ws({ type: "planer/speichern", aufgabe });
    s.value = "";
    this._sagen(`Hinzugefügt: ${p.titel}, ${aufgabe.datum ? datumText(aufgabe.datum) : "Eingang"}`);
    await this._lesen();
    this.shadowRoot.getElementById("schnell")?.focus();
  }

  _finde(id) { return this._daten.aufgaben.find((a) => a.id === id); }

  async _aktion(art, id) {
    const a = id ? this._finde(id) : null;
    if (art === "einstellungen") return this._einstellungen();
    if (!a) return;
    if (art === "oeffnen") return this._oeffnen(a);
    if (art === "haken") {
      const jetztErledigt = !(a.status === "erledigt" || (a.wiederholung && (a.verlauf || []).includes(this._tag) && a.datum > this._tag));
      if (!jetztErledigt && a.wiederholung) { this._sagen("Wiederkehrende Aufgabe ist schon auf den nächsten Termin gesetzt."); return; }
      const neu = await this._ws({ type: "planer/erledigen", aufgabe_id: a.id, erledigt: jetztErledigt });
      this._sagen(jetztErledigt
        ? (neu.status === "offen" && neu.wiederholung ? `Erledigt: ${a.titel}. Nächstes Mal ${datumText(neu.datum)}.` : `Erledigt: ${a.titel}`)
        : `Wieder offen: ${a.titel}`);
      await this._lesen();
      return;
    }
    if (art === "morgen") {
      const basis = a.datum && a.datum > this._tag ? ausIso(a.datum) : new Date();
      const neu = iso(plusTage(basis, 1));
      await this._ws({ type: "planer/speichern", aufgabe: { id: a.id, datum: neu, top: null } });
      this._sagen(`${a.titel} auf ${datumText(neu)} verschoben`);
      await this._lesen();
    }
  }

  _wischen(li) {
    const zeile = li.querySelector(".zeile");
    const rechts = li.querySelector(".wisch.rechts");
    const links = li.querySelector(".wisch.links");
    let x0 = null, y0 = 0, dx = 0, aktiv = false;
    li.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; aktiv = false;
    });
    li.addEventListener("pointermove", (e) => {
      if (x0 === null) return;
      dx = e.clientX - x0;
      if (!aktiv && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - y0)) { aktiv = true; li.setPointerCapture(e.pointerId); }
      if (!aktiv) return;
      zeile.style.transform = `translateX(${dx}px)`;
      rechts.style.opacity = dx > 0 ? Math.min(1, dx / 90) : 0;
      links.style.opacity = dx < 0 ? Math.min(1, -dx / 90) : 0;
    });
    const ende = () => {
      if (x0 === null) return;
      const id = li.dataset.id;
      x0 = null;
      zeile.style.transform = ""; rechts.style.opacity = 0; links.style.opacity = 0;
      if (!aktiv) return;
      if (dx > 90) this._aktion("haken", id);
      else if (dx < -90 && !li.classList.contains("erledigt")) this._aktion("morgen", id);
    };
    li.addEventListener("pointerup", ende);
    li.addEventListener("pointercancel", ende);
  }

  // ---------- Bearbeiten ----------
  _oeffnen(a) {
    const root = this.shadowRoot;
    const dlg = root.getElementById("blatt");
    const d = this._daten;
    const w = a.wiederholung || {};
    const personen = [...d.personen.map((p) => [p.id, p.name]), [GEMEINSAM, "Gemeinsam"]];
    dlg.innerHTML = `<form method="dialog" id="bform" novalidate>
      ${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
      <h2 id="blatt-titel">Aufgabe bearbeiten</h2>
      <div class="feld"><label for="b-titel">Titel</label><input id="b-titel" required value="${esc(a.titel)}"></div>
      <div class="feld"><span class="lbl" id="b-datum-l">Wann</span>
        <div class="schnellwahl" role="group" aria-labelledby="b-datum-l">
          <button type="button" class="knopf klein" data-tag="0">Heute</button>
          <button type="button" class="knopf klein" data-tag="1">Morgen</button>
          <button type="button" class="knopf klein" data-tag="7">In einer Woche</button>
          <button type="button" class="knopf klein" data-tag="eingang">Eingang</button>
        </div>
      </div>
      <div class="reihe">
        <div class="feld"><label for="b-datum">Datum</label><input id="b-datum" type="date" value="${esc(a.datum || "")}"></div>
        <div class="feld"><label for="b-uhr">Uhrzeit (optional)</label><input id="b-uhr" type="time" value="${esc(a.uhrzeit || "")}"></div>
        <div class="feld"><label for="b-dauer">Dauer in Minuten</label><input id="b-dauer" type="number" min="5" max="720" step="5" inputmode="numeric" value="${esc(a.dauer || "")}"></div>
      </div>
      <div class="reihe">
        <div class="feld"><label for="b-person">Für</label><select id="b-person">${personen.map(([id, n]) => `<option value="${esc(id)}" ${a.person === id ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
        <div class="feld"><label for="b-top">Top 3</label><select id="b-top">
          <option value="">Keine Top-Aufgabe</option>${[1, 2, 3].map((i) => `<option value="${i}" ${a.top === i ? "selected" : ""}>Rang ${i}</option>`).join("")}</select></div>
        <div class="feld"><label for="b-bereich">Bereich</label><input id="b-bereich" value="${esc(a.bereich || "")}" placeholder="z. B. werkstatt" list="b-bereiche"><datalist id="b-bereiche">${[...new Set(d.aufgaben.map((x) => x.bereich).filter(Boolean))].map((b) => `<option value="${esc(b)}">`).join("")}</datalist></div>
      </div>
      <fieldset>
        <legend>Wiederholung</legend>
        <div class="reihe">
          <div class="feld"><label for="b-art">Wiederholt sich</label><select id="b-art">
            ${[["", "Nicht"], ["tag", "Täglich"], ["woche", "Wöchentlich"], ["monat", "Monatlich"], ["jahr", "Jährlich"]].map(([k, t]) => `<option value="${k}" ${(w.art || "") === k ? "selected" : ""}>${t}</option>`).join("")}
          </select></div>
          <div class="feld" id="b-alle-f"><label for="b-alle">Alle … (Abstand)</label><input id="b-alle" type="number" min="1" max="365" inputmode="numeric" value="${esc(w.alle || 1)}"></div>
          <div class="feld" id="b-bis-f"><label for="b-bis">Endet am (optional)</label><input id="b-bis" type="date" value="${esc(w.bis || "")}"></div>
        </div>
        <div class="feld" id="b-tage-f"><span class="lbl" id="b-tage-l">An diesen Tagen</span>
          <div class="tage" role="group" aria-labelledby="b-tage-l">
            ${WT_KURZ.map((t, i) => `<label><input type="checkbox" value="${i}" ${(w.tage || []).includes(i) ? "checked" : ""} aria-label="${WOCHENTAGE[i]}"><span aria-hidden="true">${t}</span></label>`).join("")}
          </div>
        </div>
      </fieldset>
      <div class="feld"><label for="b-notiz">Notiz</label><textarea id="b-notiz">${esc(a.notiz || "")}</textarea></div>
      <p class="fehler" id="b-fehler" role="alert"></p>
      <div class="fuss">
        <button type="button" class="knopf gefahr links" id="b-loeschen">Löschen</button>
        <button type="button" class="knopf" id="b-abbrechen">Abbrechen</button>
        <button type="submit" class="knopf primaer">Speichern</button>
      </div>
    </form>`;

    const $ = (id) => dlg.querySelector(`#${id}`);
    const artAnpassen = () => {
      const art = $("b-art").value;
      $("b-alle-f").hidden = !art;
      $("b-bis-f").hidden = !art;
      $("b-tage-f").hidden = art !== "woche";
    };
    artAnpassen();
    $("b-art").addEventListener("change", artAnpassen);
    dlg.querySelectorAll("[data-tag]").forEach((b) => b.addEventListener("click", () => {
      $("b-datum").value = b.dataset.tag === "eingang" ? "" : iso(plusTage(new Date(), +b.dataset.tag));
      this._sagen(b.dataset.tag === "eingang" ? "Datum entfernt, Aufgabe kommt in den Eingang" : `Datum ${datumText($("b-datum").value)}`);
    }));
    $("b-abbrechen").addEventListener("click", () => dlg.close());
    let sicher = false;
    $("b-loeschen").addEventListener("click", async () => {
      if (!sicher) { sicher = true; $("b-loeschen").textContent = "Wirklich löschen?"; $("b-loeschen").focus(); return; }
      await this._ws({ type: "planer/loeschen", aufgabe_id: a.id });
      dlg.close();
      this._sagen(`Gelöscht: ${a.titel}`);
      await this._lesen();
    });
    $("bform").addEventListener("submit", async (e) => {
      e.preventDefault();
      const titel = $("b-titel").value.trim();
      if (!titel) { $("b-fehler").textContent = "Bitte einen Titel eingeben."; $("b-titel").focus(); return; }
      const art = $("b-art").value;
      const wiederholung = art ? {
        art, alle: +$("b-alle").value || 1, bis: $("b-bis").value || undefined,
        tage: art === "woche" ? [...dlg.querySelectorAll(".tage input:checked")].map((x) => +x.value) : undefined,
      } : null;
      let datum = $("b-datum").value || null;
      if (wiederholung && !datum) datum = heute();
      const top = $("b-top").value ? +$("b-top").value : null;
      if (top && !datum) datum = heute();
      try {
        await this._ws({ type: "planer/speichern", aufgabe: {
          id: a.id, titel, datum, uhrzeit: $("b-uhr").value || null, dauer: $("b-dauer").value || null,
          person: $("b-person").value, top, bereich: $("b-bereich").value, notiz: $("b-notiz").value, wiederholung,
        } });
      } catch (err) { $("b-fehler").textContent = err.message || "Speichern hat nicht geklappt."; return; }
      dlg.close();
      this._sagen(`Gespeichert: ${titel}`);
      await this._lesen();
    });
    this._wischZu(dlg);
    dlg.showModal();
    $("b-titel").focus();
  }

  // Blatt auf dem Handy durch Wischen nach unten schließen (zusätzlich zu Abbrechen und Zurück-Taste)
  _wischZu(dlg) {
    if (!this._narrow) return;
    let y0 = null;
    dlg.addEventListener("touchstart", (e) => { y0 = dlg.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    dlg.addEventListener("touchend", (e) => {
      if (y0 !== null && e.changedTouches[0].clientY - y0 > 110) dlg.close();
      y0 = null;
    });
  }

  _einstellungen() {
    const dlg = this.shadowRoot.getElementById("einst");
    const d = this._daten;
    dlg.innerHTML = `<form method="dialog" id="eform">
      <h2 id="einst-titel">Wer sieht was</h2>
      <p class="hinweis" style="display:block">Eigene und gemeinsame Aufgaben sieht jede Person immer. Hier legst du fest, ob jemand zusätzlich die Aufgaben der anderen sieht.</p>
      ${d.personen.map((p) => `<label class="check"><input type="checkbox" data-person="${esc(p.id)}" ${(d.einstellungen[p.id]?.andere_sehen ?? true) ? "checked" : ""}> ${esc(p.name)} sieht die Aufgaben der anderen</label>`).join("")}
      <div class="fuss"><button type="submit" class="knopf primaer">Fertig</button></div>
    </form>`;
    dlg.querySelectorAll("[data-person]").forEach((c) => c.addEventListener("change", async () => {
      await this._ws({ type: "planer/einstellung", person: c.dataset.person, andere_sehen: c.checked });
      this._sagen("Gespeichert");
    }));
    dlg.addEventListener("close", () => this._lesen(), { once: true });
    dlg.showModal();
  }
}

function CSS_escape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

if (!customElements.get("planer-panel")) customElements.define("planer-panel", PlanerPanel);
