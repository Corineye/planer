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
const montag = (d) => plusTage(d, -wt(d));
function kw(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - wt(d));
  const j = new Date(x.getFullYear(), 0, 4);
  const n = 1 + Math.round(((x - j) / 86400000 - 3 + wt(j)) / 7);
  return `${x.getFullYear()}-W${String(n).padStart(2, "0")}`;
}

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

const BEREICH_STANDARD = { arbeit: "#7fb4ff", lernen: "#c3a6ff", haushalt: "#ffb37a", werkstatt: "#5ff2b8", privat: "#f59ad6", gesundheit: "#9be36b", einkauf: "#ffd36b" };
const BEREICH_PALETTE = ["#7fb4ff", "#ffb37a", "#c3a6ff", "#9be36b", "#f59ad6", "#6be3e3", "#ffd36b", "#ff9a9a"];
function bereichFarbe(name, farben) {
  if (!name) return "";
  if (farben && farben[name]) return farben[name];
  if (BEREICH_STANDARD[name]) return BEREICH_STANDARD[name];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return BEREICH_PALETTE[h % BEREICH_PALETTE.length];
}
const istTage = (r, t) => r && r.art === "woche" && (r.alle || 1) === 1 && JSON.stringify(r.tage || []) === JSON.stringify(t);

function regelText(r) {
  if (!r) return "";
  const n = r.alle || 1;
  if (istTage(r, [0, 1, 2, 3, 4])) return "werktags";
  if (istTage(r, [5, 6])) return "am Wochenende";
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

// Erinnerungen in Minuten vor Beginn
const ERINNER_VORGABEN = [0, 15, 30, 60, 180, 1440, 2880, 10080];
function minText(m) {
  if (m === 0) return "Zum Zeitpunkt";
  if (m % 10080 === 0) return `${m / 10080} ${m === 10080 ? "Woche" : "Wochen"} vorher`;
  if (m % 1440 === 0) return `${m / 1440} ${m === 1440 ? "Tag" : "Tage"} vorher`;
  if (m % 60 === 0) return `${m / 60} Std. vorher`;
  return `${m} Min. vorher`;
}
const minKurz = (l) => (l || []).map((m) => minText(m).replace(" vorher", "")).join(", ") || "keine";

// Wiederholung als Kalender-Regel (RRULE) für Google & Co.
function rrule(r, ganztag) {
  if (!r) return "";
  const freq = { tag: "DAILY", woche: "WEEKLY", monat: "MONTHLY", jahr: "YEARLY" }[r.art];
  let s = `FREQ=${freq}`;
  if ((r.alle || 1) > 1) s += `;INTERVAL=${r.alle}`;
  if (r.art === "woche" && r.tage && r.tage.length) s += `;BYDAY=${r.tage.map((t) => ["MO", "TU", "WE", "TH", "FR", "SA", "SU"][t]).join(",")}`;
  if (r.bis) s += `;UNTIL=${r.bis.replace(/-/g, "")}${ganztag ? "" : "T235959"}`;
  return s;
}

function wdhHtml(p, w = {}) {
  return `<fieldset>
    <legend>Wiederholung</legend>
    <div class="reihe">
      <div class="feld"><label for="${p}-art">Wiederholt sich</label><select id="${p}-art">
        ${(() => {
          const aktuell = istTage(w, [0, 1, 2, 3, 4]) ? "werktags" : istTage(w, [5, 6]) ? "wochenende" : w.art || "";
          return [["", "Nicht"], ["tag", "Täglich"], ["werktags", "Werktags (Mo–Fr)"], ["wochenende", "Am Wochenende (Sa, So)"], ["woche", "Wöchentlich"], ["monat", "Monatlich"], ["jahr", "Jährlich"]]
            .map(([k, t]) => `<option value="${k}" ${aktuell === k ? "selected" : ""}>${t}</option>`).join("");
        })()}
      </select></div>
      <div class="feld" id="${p}-alle-f"><label for="${p}-alle">Alle … (Abstand)</label><input id="${p}-alle" type="number" min="1" max="365" inputmode="numeric" value="${esc(w.alle || 1)}"></div>
      <div class="feld" id="${p}-bis-f"><label for="${p}-bis">Endet am (optional)</label><input id="${p}-bis" type="date" value="${esc(w.bis || "")}"></div>
    </div>
    <div class="feld" id="${p}-tage-f"><span class="lbl" id="${p}-tage-l">An diesen Tagen</span>
      <div class="tage" id="${p}-tage" role="group" aria-labelledby="${p}-tage-l">
        ${WT_KURZ.map((t, i) => `<label><input type="checkbox" value="${i}" ${(w.tage || []).includes(i) ? "checked" : ""} aria-label="${WOCHENTAGE[i]}"><span aria-hidden="true">${t}</span></label>`).join("")}
      </div>
    </div>
  </fieldset>`;
}
function wdhBinden(dlg, p) {
  const $ = (id) => dlg.querySelector(`#${p}-${id}`);
  const anpassen = () => {
    const art = $("art").value;
    $("alle-f").hidden = !art || art === "werktags" || art === "wochenende";
    $("bis-f").hidden = !art;
    $("tage-f").hidden = art !== "woche";
    const einheit = { tag: "Tage", woche: "Wochen", monat: "Monate", jahr: "Jahre" }[art];
    if (einheit) dlg.querySelector(`label[for="${p}-alle"]`).textContent = `Alle … ${einheit}`;
  };
  anpassen();
  $("art").addEventListener("change", anpassen);
}
function wdhLesen(dlg, p) {
  const $ = (id) => dlg.querySelector(`#${p}-${id}`);
  const art = $("art").value;
  if (!art) return null;
  if (art === "werktags" || art === "wochenende") return { art: "woche", alle: 1, bis: $("bis").value || undefined, tage: art === "werktags" ? [0, 1, 2, 3, 4] : [5, 6] };
  return {
    art, alle: +$("alle").value || 1, bis: $("bis").value || undefined,
    tage: art === "woche" ? [...$("tage").querySelectorAll("input:checked")].map((x) => +x.value) : undefined,
  };
}

// Erinnerungen wählen: Vorgaben zum Ankreuzen plus eigener Wert
function erinnHtml(p, liste, standard) {
  const modus = standard === undefined ? "eigene" : liste == null ? "standard" : liste.length ? "eigene" : "keine";
  const werte = [...new Set([...ERINNER_VORGABEN, ...(liste || standard || [])])].sort((a, b) => a - b);
  const an = new Set(liste || standard || []);
  return `<fieldset>
    <legend>Erinnerung aufs Handy</legend>
    ${standard !== undefined ? `<div class="schnellwahl" role="radiogroup" aria-label="Art der Erinnerung">
      ${[["standard", `Standard (${minKurz(standard)})`], ["eigene", "Eigene"], ["keine", "Keine"]].map(([k, t]) =>
        `<label class="check"><input type="radio" name="${p}-modus" value="${k}" ${modus === k ? "checked" : ""}> ${esc(t)}</label>`).join("")}
    </div>` : ""}
    <div id="${p}-eigene" ${modus === "eigene" ? "" : "hidden"} class="feld">
      <div class="tage wahl" id="${p}-werte" role="group" aria-label="Wann erinnern">
        ${werte.map((m) => `<label><input type="checkbox" value="${m}" ${an.has(m) ? "checked" : ""}><span>${esc(minText(m).replace(" vorher", ""))}</span></label>`).join("")}
      </div>
      <div class="eigen">
        <label class="sr" for="${p}-zahl">Eigener Wert</label>
        <input id="${p}-zahl" type="number" min="1" max="999" inputmode="numeric" placeholder="z. B. 45">
        <label class="sr" for="${p}-einheit">Einheit</label>
        <select id="${p}-einheit"><option value="1">Minuten</option><option value="60">Stunden</option><option value="1440">Tage</option></select>
        <button type="button" class="knopf klein" id="${p}-plus">Hinzufügen</button>
      </div>
    </div>
  </fieldset>`;
}
function erinnBinden(dlg, p, sagen) {
  const $ = (id) => dlg.querySelector(`#${p}-${id}`);
  dlg.querySelectorAll(`input[name="${p}-modus"]`).forEach((r) => r.addEventListener("change", () => { $("eigene").hidden = r.value !== "eigene" || !r.checked; }));
  $("plus").addEventListener("click", () => {
    const m = Math.round((+$("zahl").value || 0) * +$("einheit").value);
    if (!m || m > 43200) { sagen("Bitte eine Zahl eingeben, höchstens 30 Tage."); return; }
    const vorhanden = $("werte").querySelector(`input[value="${m}"]`);
    if (vorhanden) vorhanden.checked = true;
    else $("werte").insertAdjacentHTML("beforeend", `<label><input type="checkbox" value="${m}" checked><span>${esc(minText(m).replace(" vorher", ""))}</span></label>`);
    $("zahl").value = "";
    sagen(`${minText(m)} hinzugefügt`);
  });
}
function erinnLesen(dlg, p) {
  const modus = dlg.querySelector(`input[name="${p}-modus"]:checked`)?.value || "eigene";
  if (modus === "standard") return null;
  if (modus === "keine") return [];
  return [...dlg.querySelectorAll(`#${p}-werte input:checked`)].map((x) => +x.value).sort((a, b) => a - b);
}

const KAL_FARBEN = ["#5ff2b8", "#7fb4ff", "#ffb37a", "#f59ad6", "#c3a6ff", "#9be36b"];
const uhr = (s) => s.slice(11, 16);

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
  const weg = (re, fn) => { let ok = false; t = t.replace(re, (...m) => { ok = true; fn(m); return " "; }); return ok; };
  const WT = "(montags?|dienstags?|mittwochs?|donnerstags?|freitags?|samstags?|sonntags?|mo|di|mi|do|fr|sa|so)";

  // Wiederholung
  weg(/\s(täglich|jeden tag)(?=\s)/i, () => { r.wiederholung = { art: "tag", alle: 1 }; });
  weg(/\s(werktags|jeden werktag)(?=\s)/i, () => { r.wiederholung = { art: "woche", alle: 1, tage: [0, 1, 2, 3, 4] }; });
  weg(/\s(jedes wochenende|am wochenende|wochenends)(?=\s)/i, () => { r.wiederholung = { art: "woche", alle: 1, tage: [5, 6] }; });
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
  r.tags = [];
  while (true) {
    const treffer = weg(/\s#([\wäöüß-]+)(?=\s)/i, (m) => { if (!r.bereich) r.bereich = m[1].toLowerCase(); else r.tags.push(m[1].toLowerCase()); });
    if (!treffer) break;
  }
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
.gruppe h2{margin:0;font-size:.8125rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);display:flex;gap:8px;align-items:center}
.gruppe h2 .zahl{font-family:var(--mono);letter-spacing:0}
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
.spalten{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:22px;align-items:start}
.spalten>div{display:grid;gap:22px;min-width:0}
.schmal .spalten{grid-template-columns:1fr}
aside.kal{display:grid;gap:8px;position:sticky;top:12px}
.termine{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.termin{width:100%;display:grid;grid-template-columns:6.8em 1fr;gap:2px 10px;text-align:left;padding:8px 12px;border-radius:12px;border:1px solid var(--line);border-left:4px solid var(--k,var(--mint));background:var(--glass);cursor:pointer}
.termin .zeit{font-family:var(--mono);font-size:.8125rem;color:var(--muted);white-space:nowrap;padding-top:2px}
.termin .was{overflow-wrap:anywhere}
.termin .wo{grid-column:2;font-size:.8125rem;color:var(--muted)}
.termin.block{border-style:dashed;border-left-style:solid;background:none}
.frei{font-family:var(--mono);font-size:.8125rem;color:var(--mint)}
.tag-termine{display:grid;gap:6px}
.wahl label{min-width:auto;padding:0 12px}
.eigen{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.feld .eigen input{width:110px;min-height:40px;border-radius:10px;border:1px solid var(--line2);background:var(--bg2);padding:6px 10px}
.feld .eigen select{width:auto;min-height:40px;border-radius:10px;border:1px solid var(--line2);background:var(--bg2);padding:6px 10px}
.person-einst{border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:grid;gap:12px}
.person-einst h3{margin:0;font-size:1.05rem}
.kal-tab{width:100%;border-collapse:collapse;font-size:.9rem}
.kal-tab th,.kal-tab td{padding:6px 4px;border-bottom:1px solid var(--line);text-align:center}
.kal-tab th:first-child,.kal-tab td:first-child{text-align:left}
.kal-tab input{width:22px;height:22px;accent-color:var(--mint)}
.tab-wrap{overflow-x:auto}
.infos{display:grid;gap:6px;margin:0}
.infos dt{font-size:.8125rem;color:var(--muted)}
.infos dd{margin:0 0 6px}
.wkopf{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.wkopf h2{margin:0 8px 0 0;font-size:1.15rem}
.wkopf .knopf{min-width:44px}
.ziele{display:grid;gap:8px}
.ziel{display:flex;gap:10px;align-items:center}
.ziel input[type=text]{flex:1;min-width:0;min-height:44px;border-radius:10px;border:1px solid var(--line2);background:var(--bg2);padding:6px 12px}
.ziel input[type=checkbox]{width:24px;height:24px;accent-color:var(--mint);flex:none}
.ziel .nr{font-family:var(--mono);font-weight:700;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--mint-dim);color:var(--mint);flex:none}
.woche{display:grid;grid-template-columns:repeat(7,minmax(118px,1fr));gap:8px;min-width:860px}
.woche-wrap{overflow-x:auto;padding-bottom:4px}
.schmal .woche{grid-template-columns:1fr;min-width:0}
.wtag{background:var(--glass);border:1px solid var(--line);border-radius:14px;padding:8px;display:grid;gap:6px;align-content:start;min-height:180px;min-width:0}
.schmal .wtag{min-height:0}
.wtag.heute{border-color:rgba(95,242,184,.5)}
.wtag.ziel-drop{outline:2px dashed var(--mint);outline-offset:2px}
.wtag h3{margin:0;font-size:.9rem;display:flex;justify-content:space-between;gap:6px}
.wtag h3 .d{color:var(--muted);font-weight:400}
.wpunkt{display:block;width:100%;text-align:left;font-size:.8125rem;line-height:1.35;padding:5px 7px;border-radius:8px;border:1px solid transparent;background:rgba(255,255,255,.04);cursor:pointer;overflow-wrap:anywhere}
.wpunkt.t{border-left:3px solid var(--k,var(--mint));background:rgba(255,255,255,.02)}
.wpunkt.a.top{background:var(--mint-dim);color:var(--mint)}
.wpunkt.a.fertig{opacity:.55;text-decoration:line-through}
.wpunkt .z{font-family:var(--mono);color:var(--muted);margin-right:6px}
.wpunkt[draggable=true]{cursor:grab}
.wleer{font-size:.8125rem;color:var(--muted)}
.ablage{display:flex;gap:6px;flex-wrap:wrap}
.ablage .wpunkt{width:auto}
li.aufgabe.farbig .zeile{border-left:4px solid var(--b)}
.punkt{width:9px;height:9px;border-radius:50%;background:var(--b);display:inline-block}
.chip.naechstes{color:var(--on-mint);background:var(--mint);border-color:var(--mint);font-weight:600}
.bereiche{flex-wrap:wrap}
.bereiche button{display:inline-flex;gap:6px;align-items:center}
.teile{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.teil{display:flex;gap:8px;align-items:center}
.teil input[type=checkbox]{width:24px;height:24px;accent-color:var(--mint);flex:none}
.teil input[type=text]{flex:1;min-width:0;min-height:40px;border-radius:10px;border:1px solid var(--line2);background:var(--bg2);padding:6px 10px}
.teil .weg{width:40px;height:40px;border-radius:10px;border:1px solid var(--line2);background:none;cursor:pointer;flex:none}
.teil-neu{display:flex;gap:8px}
.teil-neu input{flex:1;min-width:0;min-height:44px;border-radius:10px;border:1px solid var(--line2);background:var(--bg2);padding:8px 12px}
.farben{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.farben label{display:flex;gap:8px;align-items:center;min-height:44px;border:1px solid var(--line);border-radius:10px;padding:4px 10px}
.farben input[type=color]{width:36px;height:28px;border:0;background:none;padding:0}
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
      this._bereich = localStorage.getItem("planer.bereich") || "";
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
    this._termineLaden();
    try {
      this._abo = this._hass.connection.subscribeMessage(() => {
        clearTimeout(this._neuTimer);
        this._neuTimer = setTimeout(() => this._lesen(), 150);
      }, { type: "planer/abonnieren" });
    } catch (e) { /* Änderungen dann erst beim nächsten Öffnen */ }
    // Tageswechsel: um Mitternacht neu zeichnen
    setInterval(() => { if (this._tag !== heute()) { this._zeichnen(); this._termineLaden(); } }, 60000);
    setInterval(() => this._termineLaden(), 5 * 60000);
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

  async _termineLaden() {
    try {
      this._termine = await this._hass.callWS({ type: "planer/termine", start: heute(), ende: iso(plusTage(new Date(), 15)) });
      this._kalFehler = "";
    } catch (e) {
      this._termine = [];
      this._kalFehler = "Termine konnten nicht geladen werden.";
    }
    if (this._daten) this._zeichnen();
  }

  _kal(id) { return (this._daten.kalender || []).find((k) => k.id === id) || { id, name: id }; }
  _farbe(id) {
    const i = (this._daten.kalender || []).findIndex((k) => k.id === id);
    return KAL_FARBEN[(i < 0 ? 0 : i) % KAL_FARBEN.length];
  }
  // Termine, die an diesem Tag stattfinden (ganztägige: Ende exklusiv)
  _termineAm(tag) {
    return (this._termine || []).filter((t) => {
      const s = t.start.slice(0, 10), e = t.ende.slice(0, 10);
      return t.ganztag ? s <= tag && tag < e : s <= tag && tag <= e;
    });
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
    const b = this._bereich;
    return d.aufgaben.filter((a) => {
      if (b && (a.bereich || "") !== b && !(a.tags || []).includes(b)) return false;
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
  // Was als Nächstes fällig ist, steht oben: früheres Datum, dann Uhrzeit, dann Top-Rang, dann Reihenfolge
  _sortiert(liste) {
    return [...liste].sort((a, b) =>
      (a.datum || "9999").localeCompare(b.datum || "9999") ||
      (a.uhrzeit ? 0 : 1) - (b.uhrzeit ? 0 : 1) ||
      (a.uhrzeit || "").localeCompare(b.uhrzeit || "") ||
      (a.top || 9) - (b.top || 9) ||
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
      woche: offen.filter((a) => a.datum && a.datum >= iso(montag(new Date())) && a.datum <= iso(plusTage(montag(new Date()), 6))).length,
    };
    const tabs = [["heute", "Heute"], ["woche", "Woche"], ["demnaechst", "Demnächst"], ["eingang", "Eingang"]];
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
          <button class="knopf primaer" type="submit" aria-label="Aufgabe hinzufügen">${schmal ? "＋" : "Aufgabe"}</button>
          <button class="knopf" type="button" data-aktion="erweitert" aria-label="Aufgabe mit allen Einstellungen anlegen">${schmal ? "⚙" : "Erweitert"}</button>
          ${(d.kalender || []).some((k) => k.schreiben) ? `<button class="knopf" type="button" data-aktion="termin" aria-label="Als Termin in den Kalender eintragen">${schmal ? "📅" : "Termin"}</button>` : ""}
        </div>
        <div class="hinweis" id="vorschau" aria-live="polite"></div>
        <span class="sr" id="tipp">Erkennt heute, morgen, Wochentage, Datum wie 24.12., Uhrzeit wie 15 Uhr, !1 bis !3 für Top 3, # für Bereich, @ für Person und Wiederholungen wie jeden Montag oder täglich. Taste N springt hierher.</span>
      </form>

      <nav class="tabs" aria-label="Ansichten">
        ${tabs.map(([k, t]) => `<button type="button" data-ansicht="${k}" data-fokus="t-${k}" ${this._ansicht === k ? 'aria-current="page"' : ""}>${t} <span class="zahl" aria-label="${zaehler[k]} offen">${zaehler[k]}</span></button>`).join("")}
      </nav>

      ${(() => {
        const liste = [...new Set(d.aufgaben.filter((a) => a.status === "offen").flatMap((a) => [a.bereich, ...(a.tags || [])]).filter(Boolean))].sort();
        if (this._bereich && !liste.includes(this._bereich)) liste.push(this._bereich);
        if (!liste.length) return "";
        return `<div class="seg bereiche" role="group" aria-label="Nach Bereich filtern">
          <button type="button" data-bereich="" data-fokus="b-alle" aria-pressed="${!this._bereich}">Alle Bereiche</button>
          ${liste.map((x) => `<button type="button" data-bereich="${esc(x)}" data-fokus="b-${esc(x)}" aria-pressed="${this._bereich === x}" style="--b:${bereichFarbe(x, d.farben)}"><span class="punkt" aria-hidden="true"></span>${esc(x[0].toUpperCase() + x.slice(1))}</button>`).join("")}
        </div>`;
      })()}

      <main id="inhalt">${this._ansichtHtml(alle, offen)}</main>
    </div>
    </div>
    <div id="ansage" class="sr" role="status" aria-live="polite"></div>
    <dialog id="blatt" aria-labelledby="blatt-titel"></dialog>
    <dialog id="einst" aria-labelledby="einst-titel"></dialog>
    <dialog id="tdlg" aria-labelledby="t-titel-h"></dialog>`;

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
    if (this._ansicht === "woche") return this._wocheHtml(alle);
    if (this._ansicht === "demnaechst") {
      const kommend = offen.filter((a) => a.datum && a.datum > h).sort((a, b) => a.datum.localeCompare(b.datum));
      const tage = new Set(kommend.map((a) => a.datum));
      for (let i = 1; i <= 14; i++) {
        const t = iso(plusTage(new Date(), i));
        if (this._termineAm(t).length) tage.add(t);
      }
      if (!tage.size) return `<p class="leer">Für die nächsten Tage ist nichts geplant.</p>`;
      return [...tage].sort().map((t) => {
        const termine = this._termineAm(t);
        const aufg = this._sortiert(kommend.filter((a) => a.datum === t));
        const id = `g-${t}`;
        return `<section class="gruppe" aria-labelledby="${id}">
          <h2 id="${id}">${esc(datumText(t))}</h2>
          ${termine.length ? `<ul class="termine" aria-label="Termine">${termine.map((x) => this._terminZeile(x, t)).join("")}</ul>` : ""}
          ${aufg.length ? `<ul class="liste" aria-label="Aufgaben">${aufg.map((a) => this._zeile(a)).join("")}</ul>` : ""}
        </section>`;
      }).join("");
    }
    // Heute
    const ueber = this._sortiert(offen.filter((a) => a.datum && a.datum < h));
    const heuteOffen = offen.filter((a) => a.datum === h);
    const top = heuteOffen.filter((a) => a.top).sort((a, b) => a.top - b.top);
    const rest = this._sortiert(heuteOffen.filter((a) => !a.top));
    const fertig = alle.filter((a) => a.status === "erledigt" && (a.erledigt_am || "").slice(0, 10) === h);
    const wiederHeute = alle.filter((a) => a.wiederholung && (a.verlauf || []).includes(h) && a.status === "offen");
    let html = "";
    const jetztUhr = new Date().toTimeString().slice(0, 5);
    const naechste = ueber[0] || this._sortiert(heuteOffen.filter((a) => a.uhrzeit && a.uhrzeit >= jetztUhr))[0] || top[0] || rest[0];
    this._naechste = naechste ? naechste.id : null;
    const kal = this._kalenderHeute(heuteOffen);
    if (this._narrow) html += kal;
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
    if (this._narrow) return html;
    return `<div class="spalten"><div>${html}</div>${kal}</div>`;
  }

  _wocheHtml(alle) {
    const start = this._wStart || montag(new Date());
    const k = kw(start);
    const nr = +k.slice(6);
    const tage = [...Array(7)].map((_, i) => iso(plusTage(start, i)));
    const ende = tage[6];
    const termine = this._wTermine?.start === iso(start) ? this._wTermine.liste : null;
    if (!termine) this._wocheTermineLaden(start);
    const ziele = [...((this._daten.wochen || {})[k]?.ziele || [])];
    while (ziele.length < 3) ziele.push({ text: "", erledigt: false });
    const am = (tag) => (termine || []).filter((t) => {
      const s0 = t.start.slice(0, 10), e0 = t.ende.slice(0, 10);
      return t.ganztag ? s0 <= tag && tag < e0 : s0 <= tag && tag <= e0;
    });
    const aufg = (tag) => this._sortiert(alle.filter((a) => a.datum === tag && (a.status === "offen" || (a.erledigt_am || "").slice(0, 10) === tag)));
    const d0 = ausIso(tage[0]), d6 = ausIso(ende);
    const spanne = `${d0.getDate()}. ${d0.getMonth() !== d6.getMonth() ? MONATE[d0.getMonth()] + " " : ""}– ${d6.getDate()}. ${MONATE[d6.getMonth()]}`;
    const eingang = this._sortiert(alle.filter((a) => a.status === "offen" && !a.datum));
    return `<section class="gruppe" aria-labelledby="w-titel">
      <div class="wkopf">
        <h2 id="w-titel">KW ${nr} <span class="muted" style="font-weight:400;color:var(--muted)">· ${esc(spanne)}</span></h2>
        <button type="button" class="knopf klein" data-woche="-1" aria-label="Vorige Woche">←</button>
        <button type="button" class="knopf klein" data-woche="0" ${iso(start) === iso(montag(new Date())) ? "disabled" : ""}>Diese Woche</button>
        <button type="button" class="knopf klein" data-woche="1" aria-label="Nächste Woche">→</button>
      </div>
    </section>
    <section class="gruppe" aria-labelledby="z-titel">
      <h2 id="z-titel">Wochenziele</h2>
      <form class="ziele" id="zform" data-kw="${k}">
        ${ziele.slice(0, 3).map((z, i) => `<div class="ziel">
          <span class="nr" aria-hidden="true">${i + 1}</span>
          <label class="sr" for="z-${i}">Wochenziel ${i + 1}</label>
          <input type="text" id="z-${i}" data-fokus="z-${i}" value="${esc(z.text)}" placeholder="${["Was soll diese Woche klappen?", "Zweites Ziel (optional)", "Drittes Ziel (optional)"][i]}">
          <input type="checkbox" id="zc-${i}" ${z.erledigt ? "checked" : ""} aria-label="Wochenziel ${i + 1} erreicht">
        </div>`).join("")}
      </form>
    </section>
    <div class="woche-wrap"><div class="woche" role="list" aria-label="Tage der Woche">
      ${tage.map((t) => {
        const d = ausIso(t);
        const ts = am(t), as = aufg(t);
        return `<div class="wtag ${t === this._tag ? "heute" : ""}" role="listitem" data-tag="${t}" aria-labelledby="wt-${t}">
          <h3 id="wt-${t}"><span>${WOCHENTAGE[wt(d)]}${t === this._tag ? " · heute" : ""}</span><span class="d">${d.getDate()}.${d.getMonth() + 1}.</span></h3>
          ${ts.map((x) => `<button type="button" class="wpunkt t" style="--k:${this._farbe(x.kalender)}" data-termin="${esc(`${x.kalender}|${x.uid}|${x.start}`)}" aria-label="${esc(`Termin ${x.titel}, ${x.ganztag ? "ganztägig" : uhr(x.start)}, ${this._kal(x.kalender).name}`)}">
            <span class="z">${x.ganztag ? "ganzt." : uhr(x.start)}</span><span>${esc(x.titel)}</span></button>`).join("")}
          ${as.map((a) => `<button type="button" class="wpunkt a ${a.top ? "top" : ""} ${a.status === "erledigt" ? "fertig" : ""}" style="${a.bereich ? `border-left:3px solid ${bereichFarbe(a.bereich, this._daten.farben)}` : ""}" draggable="${a.status === "offen"}" data-ziehen="${a.id}" data-aktion="oeffnen" data-id="${a.id}" data-fokus="w-${a.id}"
            aria-label="${esc(`Aufgabe ${a.titel}${a.top ? `, Top ${a.top}` : ""}${a.status === "erledigt" ? ", erledigt" : ""}. Öffnen zum Bearbeiten oder Verschieben`)}">
            ${a.top ? `<span class="z">${a.top}</span>` : a.uhrzeit ? `<span class="z">${a.uhrzeit}</span>` : ""}<span>${esc(a.titel)}</span></button>`).join("")}
          ${!ts.length && !as.length ? `<span class="wleer">frei</span>` : ""}
        </div>`;
      }).join("")}
    </div></div>
    ${termine === null ? `<p class="hinweis" role="status">Termine werden geladen …</p>` : ""}
    ${eingang.length ? `<section class="gruppe" aria-labelledby="ab-titel">
      <h2 id="ab-titel">Aus dem Eingang einplanen</h2>
      <p class="hinweis" style="display:block">${this._narrow ? "Aufgabe antippen und ein Datum wählen." : "Auf einen Tag ziehen oder öffnen und ein Datum wählen."}</p>
      <div class="ablage">${eingang.map((a) => `<button type="button" class="wpunkt a" draggable="true" data-ziehen="${a.id}" data-aktion="oeffnen" data-id="${a.id}">${esc(a.titel)}</button>`).join("")}</div>
    </section>` : ""}`;
  }

  async _wocheTermineLaden(start) {
    const key = iso(start);
    if (this._wLaedt === key) return;
    this._wLaedt = key;
    try {
      const liste = await this._hass.callWS({ type: "planer/termine", start: key, ende: iso(plusTage(start, 7)) });
      this._wTermine = { start: key, liste };
    } catch (e) {
      this._wTermine = { start: key, liste: [] };
    }
    this._wLaedt = null;
    if (this._ansicht === "woche") this._zeichnen();
  }

  _terminZeile(t, tag) {
    const k = this._kal(t.kalender);
    let zeit = "ganztägig";
    if (!t.ganztag) {
      const s = t.start.slice(0, 10) === tag ? uhr(t.start) : "…";
      const e = t.ende.slice(0, 10) === tag ? uhr(t.ende) : "…";
      zeit = `${s}–${e}`;
    }
    const key = `${t.kalender}|${t.uid}|${t.start}`;
    return `<li><button type="button" class="termin" style="--k:${this._farbe(t.kalender)}" data-termin="${esc(key)}" data-fokus="k-${esc(key)}"
      aria-label="${esc(`${t.titel}, ${zeit}, Kalender ${k.name}`)}">
      <span class="zeit">${esc(zeit)}</span><span class="was">${esc(t.titel)}${t.wiederholt ? ' <span aria-hidden="true">↻</span>' : ""}</span>
      <span class="wo">${esc(k.name)}${t.ort ? ` · ${esc(t.ort)}` : ""}</span>
    </button></li>`;
  }

  // Kalender-Spalte: Termine von heute, Zeitblöcke der Aufgaben, freie Zeit bis 22 Uhr
  _kalenderHeute(heuteOffen) {
    const h = this._tag;
    const termine = this._termineAm(h);
    const bloecke = heuteOffen.filter((a) => a.uhrzeit).sort((a, b) => a.uhrzeit.localeCompare(b.uhrzeit));
    const eintraege = [
      ...termine.map((t) => ({ sort: t.ganztag ? "00" : uhr(t.start), html: this._terminZeile(t, h) })),
      ...bloecke.map((a) => {
        const ende = a.dauer ? (() => { const [hh, mm] = a.uhrzeit.split(":").map(Number); const m = hh * 60 + mm + a.dauer; return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; })() : "";
        return { sort: a.uhrzeit, html: `<li><button type="button" class="termin block" data-aktion="oeffnen" data-id="${a.id}" aria-label="${esc(`Aufgabe ${a.titel} um ${a.uhrzeit}`)}">
          <span class="zeit">${a.uhrzeit}${ende ? `–${ende}` : ""}</span><span class="was">${esc(a.titel)}</span><span class="wo">Aufgabe${a.top ? ` · Top ${a.top}` : ""}</span></button></li>` };
      }),
    ].sort((x, y) => x.sort.localeCompare(y.sort));
    // freie Zeit von jetzt (frühestens 8 Uhr) bis 22 Uhr
    const jetzt = new Date();
    const von = Math.max(8 * 60, jetzt.getHours() * 60 + jetzt.getMinutes());
    const bis = 22 * 60;
    const belegt = [
      ...termine.filter((t) => !t.ganztag).map((t) => {
        const s = t.start.slice(0, 10) < h ? 0 : +uhr(t.start).slice(0, 2) * 60 + +uhr(t.start).slice(3);
        const e = t.ende.slice(0, 10) > h ? 1440 : +uhr(t.ende).slice(0, 2) * 60 + +uhr(t.ende).slice(3);
        return [s, e];
      }),
      ...bloecke.map((a) => { const s = +a.uhrzeit.slice(0, 2) * 60 + +a.uhrzeit.slice(3); return [s, s + (a.dauer || 30)]; }),
    ].map(([s, e]) => [Math.max(s, von), Math.min(e, bis)]).filter(([s, e]) => e > s).sort((x, y) => x[0] - y[0]);
    let frei = Math.max(0, bis - von), ende = von;
    for (const [s, e] of belegt) { const s2 = Math.max(s, ende); if (e > s2) { frei -= e - s2; ende = e; } }
    const freiText = frei <= 0 ? "Heute ist bis 22 Uhr nichts mehr frei." : `Frei bis 22 Uhr: ${Math.floor(frei / 60) ? `${Math.floor(frei / 60)} Std. ` : ""}${frei % 60 ? `${frei % 60} Min.` : ""}`.trim();
    const keineKal = !(this._daten.kalender || []).length;
    return `<aside class="kal gruppe" aria-labelledby="g-kal">
      <h2 id="g-kal">Kalender heute</h2>
      ${eintraege.length ? `<ul class="termine">${eintraege.map((x) => x.html).join("")}</ul>`
        : `<p class="leer">${keineKal ? "Noch kein Kalender sichtbar. In HA eingebundene Kalender erscheinen hier automatisch." : "Heute keine Termine."}</p>`}
      ${this._kalFehler ? `<p class="fehler">${esc(this._kalFehler)}</p>` : ""}
      <p class="frei">${esc(freiText)}</p>
    </aside>`;
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
    const farbe = bereichFarbe(a.bereich, this._daten.farben);
    if (!fertig && this._ansicht === "heute" && this._naechste === a.id) meta.unshift(`<span class="chip naechstes">Als Nächstes</span>`);
    if (a.bereich) meta.push(`<span class="chip" style="--b:${farbe}"><span class="punkt" aria-hidden="true"></span> ${esc(a.bereich)}</span>`);
    for (const t of a.tags || []) meta.push(`<span class="chip">#${esc(t)}</span>`);
    const teile = a.teilaufgaben || [];
    if (teile.length) {
      const fertigT = teile.filter((t) => t.erledigt).length;
      meta.push(`<span class="chip ${fertigT === teile.length ? "mint" : ""}"><span aria-hidden="true">☑</span> ${fertigT}/${teile.length}<span class="sr"> Teilaufgaben erledigt</span></span>`);
      const naechster = teile.find((t) => !t.erledigt);
      if (naechster && !fertig) meta.push(`<span class="chip">Nächster Schritt: ${esc(naechster.text)}</span>`);
    }
    if (a.wiederholung) meta.push(`<span class="chip mint"><span aria-hidden="true">↻</span> ${esc(regelText(a.wiederholung))}</span>`);
    if (a.verschoben > 0) meta.push(`<span class="chip warn">${a.verschoben}× verschoben</span>`);
    const morgen = !fertig ? `<button type="button" class="knopf klein" data-aktion="morgen" data-id="${a.id}" data-fokus="m-${a.id}" aria-label="${esc(a.titel)} auf morgen verschieben">Morgen</button>` : "";
    return `<li class="aufgabe ${a.top && !fertig ? "top" : ""} ${fertig ? "erledigt" : ""} ${a.bereich ? "farbig" : ""}" data-id="${a.id}" ${a.bereich ? `style="--b:${farbe}"` : ""}>
      <div class="wisch rechts" aria-hidden="true">✓ Erledigt</div><div class="wisch links" aria-hidden="true">Morgen →</div>
      <div class="zeile">
        <button type="button" class="haken" role="checkbox" aria-checked="${fertig}" data-aktion="haken" data-id="${a.id}" data-fokus="h-${a.id}" aria-label="${esc(a.titel)} erledigt">${fertig ? HAKEN : ""}</button>
        ${a.top && !fertig ? `<span class="rang" aria-label="Top ${a.top}">${a.top}</span>` : ""}
        <button type="button" class="inhalt" data-aktion="oeffnen" data-id="${a.id}" data-fokus="o-${a.id}">
          <span class="titel">${esc(a.titel)}<span class="sr">, bearbeiten</span></span>
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
    root.querySelectorAll("[data-bereich]").forEach((b) => b.addEventListener("click", () => {
      this._bereich = b.dataset.bereich;
      try { localStorage.setItem("planer.bereich", this._bereich); } catch (e) { /* egal */ }
      this._zeichnen();
      this._sagen(this._bereich ? `Nur Bereich ${this._bereich}` : "Alle Bereiche");
    }));
    root.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      this._filter = b.dataset.filter;
      try { localStorage.setItem("planer.filter", this._filter); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    root.querySelectorAll("[data-aktion]").forEach((b) => b.addEventListener("click", () => this._aktion(b.dataset.aktion, b.dataset.id)));
    root.querySelectorAll("li.aufgabe").forEach((li) => this._wischen(li));
    root.querySelectorAll("[data-woche]").forEach((b) => b.addEventListener("click", () => {
      const n = +b.dataset.woche;
      this._wStart = n === 0 ? montag(new Date()) : plusTage(this._wStart || montag(new Date()), 7 * n);
      this._zeichnen();
      this._sagen(`Kalenderwoche ${+kw(this._wStart).slice(6)}`);
    }));
    const zf = root.getElementById("zform");
    if (zf) {
      const speichern = async () => {
        const ziele = [0, 1, 2].map((i) => ({ text: zf.querySelector(`#z-${i}`).value.trim(), erledigt: zf.querySelector(`#zc-${i}`).checked }));
        const e = await this._ws({ type: "planer/woche", kw: zf.dataset.kw, ziele, notiz: "" });
        this._daten.wochen = { ...(this._daten.wochen || {}), [zf.dataset.kw]: e };
      };
      zf.querySelectorAll('input[type="text"]').forEach((i) => i.addEventListener("change", () => { speichern(); this._sagen("Wochenziel gespeichert"); }));
      zf.querySelectorAll('input[type="checkbox"]').forEach((c) => c.addEventListener("change", () => { speichern(); this._sagen(c.checked ? "Wochenziel erreicht" : "Wochenziel wieder offen"); }));
      zf.addEventListener("submit", (e) => e.preventDefault());
    }
    // Ziehen auf einen Tag (Maus/Trackpad); am Handy und mit Tastatur über „Öffnen“ und Datum
    root.querySelectorAll("[data-ziehen]").forEach((el) => el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", el.dataset.ziehen);
      e.dataTransfer.effectAllowed = "move";
    }));
    root.querySelectorAll(".wtag").forEach((tag) => {
      tag.addEventListener("dragover", (e) => { e.preventDefault(); tag.classList.add("ziel-drop"); });
      tag.addEventListener("dragleave", () => tag.classList.remove("ziel-drop"));
      tag.addEventListener("drop", async (e) => {
        e.preventDefault();
        tag.classList.remove("ziel-drop");
        const id = e.dataTransfer.getData("text/plain");
        const a = this._finde(id);
        if (!a || a.datum === tag.dataset.tag) return;
        await this._ws({ type: "planer/speichern", aufgabe: { id, datum: tag.dataset.tag, top: a.datum === tag.dataset.tag ? a.top : null } });
        this._sagen(`${a.titel} auf ${datumText(tag.dataset.tag)} gelegt`);
        await this._lesen();
      });
    });
    root.querySelectorAll("[data-termin]").forEach((b) => b.addEventListener("click", () => {
      const t = [...(this._termine || []), ...(this._wTermine?.liste || [])].find((x) => `${x.kalender}|${x.uid}|${x.start}` === b.dataset.termin);
      if (t) this._terminZeigen(t);
    }));
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

  _erweitert() {
    const s = this.shadowRoot.getElementById("schnell");
    const p = s.value.trim() ? parse(s.value, this._daten.personen) : {};
    const aufgabe = { titel: "", teilaufgaben: [], ...p };
    if (aufgabe.datum === undefined) aufgabe.datum = this._ansicht === "heute" ? heute() : null;
    if (!aufgabe.person) aufgabe.person = this._filter !== "ich" && this._filter !== "alle" ? this._filter : this._daten.ich;
    s.value = "";
    this._oeffnen(aufgabe);
  }

  _finde(id) { return this._daten.aufgaben.find((a) => a.id === id); }

  async _aktion(art, id) {
    const a = id ? this._finde(id) : null;
    if (art === "einstellungen") return this._einstellungen();
    if (art === "termin") return this._terminNeu();
    if (art === "erweitert") return this._erweitert();
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
      <h2 id="blatt-titel">${a.id ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</h2>
      <div class="feld"><label for="b-titel">Titel</label><input id="b-titel" required value="${esc(a.titel)}"></div>
      <fieldset>
        <legend>Teilaufgaben</legend>
        <ul class="teile" id="b-teile">${(a.teilaufgaben || []).map((t, i) => this._teilHtml(t, i)).join("")}</ul>
        <div class="teil-neu">
          <label class="sr" for="b-teil-neu">Neue Teilaufgabe</label>
          <input id="b-teil-neu" placeholder="Neue Teilaufgabe, Enter zum Hinzufügen" enterkeyhint="enter">
          <button type="button" class="knopf klein" id="b-teil-plus">Hinzufügen</button>
        </div>
      </fieldset>
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
        <div class="feld"><label for="b-tags">Hashtags</label><input id="b-tags" value="${esc((a.tags || []).map((t) => "#" + t).join(" "))}" placeholder="#filament #bestellen"></div>
        <div class="feld"><label for="b-bereich">Bereich</label><input id="b-bereich" value="${esc(a.bereich || "")}" placeholder="z. B. werkstatt" list="b-bereiche"><datalist id="b-bereiche">${[...new Set([...Object.keys(BEREICH_STANDARD), ...d.aufgaben.map((x) => x.bereich).filter(Boolean)])].map((b) => `<option value="${esc(b)}">`).join("")}</datalist></div>
      </div>
      ${wdhHtml("b", w)}
      ${erinnHtml("be", a.erinnerungen, d.einst.erinnerungen)}
      <p class="hinweis" style="display:block">Ohne Uhrzeit wird um 9:00 Uhr am Fälligkeitstag gerechnet. Erinnert wird nur, wenn für die Person ein Handy eingestellt ist.</p>
      <div class="feld"><label for="b-notiz">Notiz</label><textarea id="b-notiz">${esc(a.notiz || "")}</textarea></div>
      <p class="fehler" id="b-fehler" role="alert"></p>
      <div class="fuss">
        <button type="button" class="knopf gefahr links" id="b-loeschen">Löschen</button>
        <button type="button" class="knopf" id="b-abbrechen">Abbrechen</button>
        <button type="submit" class="knopf primaer">Speichern</button>
      </div>
    </form>`;

    const $ = (id) => dlg.querySelector(`#${id}`);
    wdhBinden(dlg, "b");
    erinnBinden(dlg, "be", (t) => this._sagen(t));
    const teilNeu = () => {
      const text = $("b-teil-neu").value.trim();
      if (!text) return;
      const ul = $("b-teile");
      ul.insertAdjacentHTML("beforeend", this._teilHtml({ id: "", text, erledigt: false }, ul.children.length));
      $("b-teil-neu").value = "";
      this._sagen(`Teilaufgabe hinzugefügt: ${text}`);
    };
    $("b-teil-plus").addEventListener("click", teilNeu);
    $("b-teil-neu").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); teilNeu(); } });
    $("b-teile").addEventListener("click", (e) => {
      const weg = e.target.closest(".weg");
      if (!weg) return;
      const li = weg.closest("li");
      const text = li.querySelector('input[type="text"]').value;
      const nachbar = li.nextElementSibling || li.previousElementSibling;
      li.remove();
      (nachbar?.querySelector('input[type="text"]') || $("b-teil-neu")).focus();
      this._sagen(`Teilaufgabe entfernt: ${text}`);
    });
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
      const wiederholung = wdhLesen(dlg, "b");
      if ($("b-teil-neu").value.trim()) teilNeu();
      const teilaufgaben = [...$("b-teile").children].map((li) => ({
        id: li.dataset.teil || "", text: li.querySelector('input[type="text"]').value.trim(), erledigt: li.querySelector('input[type="checkbox"]').checked,
      })).filter((t) => t.text);
      let datum = $("b-datum").value || null;
      if (wiederholung && !datum) datum = heute();
      const top = $("b-top").value ? +$("b-top").value : null;
      if (top && !datum) datum = heute();
      try {
        await this._ws({ type: "planer/speichern", aufgabe: {
          id: a.id, titel, datum, uhrzeit: $("b-uhr").value || null, dauer: $("b-dauer").value || null,
          person: $("b-person").value, top, bereich: $("b-bereich").value, tags: $("b-tags").value, notiz: $("b-notiz").value, wiederholung, erinnerungen: erinnLesen(dlg, "be"), teilaufgaben,
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

  _teilHtml(t, i) {
    const n = `b-t${i}-${Math.random().toString(36).slice(2, 6)}`;
    return `<li class="teil" data-teil="${esc(t.id || "")}">
      <input type="checkbox" id="${n}c" ${t.erledigt ? "checked" : ""} aria-label="${esc(t.text)} erledigt">
      <label class="sr" for="${n}">Teilaufgabe</label><input type="text" id="${n}" value="${esc(t.text)}">
      <button type="button" class="weg" aria-label="${esc(t.text)} entfernen">✕</button>
    </li>`;
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
    const kal = d.alle_kalender || [];
    dlg.innerHTML = `<form method="dialog" id="eform">
      <h2 id="einst-titel">Einstellungen</h2>
      ${kal.some((k) => k.anlegen) ? `<div class="feld"><label for="gk">Kalender für gemeinsame Termine</label>
        <select id="gk"><option value="">Keiner</option>${kal.filter((k) => k.anlegen).map((k) => `<option value="${esc(k.id)}" ${d.gemeinsam_kalender === k.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select>
        <span class="hinweis">Termine mit „Gemeinsam“ oder @gemeinsam landen hier.</span></div>` : ""}
      ${(d.alle_benutzer || []).length > 2 ? `<fieldset><legend>Wer nutzt den Planer?</legend>
        <p class="hinweis" style="display:block">Nur angehakte Benutzer erscheinen im Planer. Entferne den Haken bei Konten wie Tablet, Gast oder Claude.</p>
        ${d.alle_benutzer.map((b) => `<label class="check"><input type="checkbox" data-nutzer="${esc(b.id)}" ${b.ausgeblendet ? "" : "checked"} ${b.id === d.ich ? "disabled" : ""}> ${esc(b.name)}</label>`).join("")}
      </fieldset>` : ""}
      ${(() => {
        const namen = [...new Set([...Object.keys(BEREICH_STANDARD), ...d.aufgaben.map((a) => a.bereich).filter(Boolean)])].sort();
        return `<fieldset><legend>Bereiche und Farben</legend>
          <p class="hinweis" style="display:block">Einen neuen Bereich legst du einfach mit #name in der Schnelleingabe oder im Feld „Bereich“ an.</p>
          <div class="farben">${namen.map((x) => `<label><input type="color" data-farbe="${esc(x)}" value="${bereichFarbe(x, d.farben)}"> ${esc(x[0].toUpperCase() + x.slice(1))}</label>`).join("")}</div>
        </fieldset>`;
      })()}
      <p class="hinweis" style="display:block">Eigene und gemeinsame Aufgaben sieht jede Person immer. Pro Person legst du hier fest, was sie zusätzlich sieht, wo sie Termine eintragen darf und wie sie erinnert wird.</p>
      ${d.personen.map((p, i) => {
        const e = d.einstellungen[p.id] || {};
        const sehen = e.kalender_sehen, schreiben = e.kalender_schreiben;
        return `<section class="person-einst" data-person="${esc(p.id)}" aria-labelledby="pe-${i}">
          <h3 id="pe-${i}">${esc(p.name)}</h3>
          <label class="check"><input type="checkbox" data-feld="andere_sehen" ${e.andere_sehen !== false ? "checked" : ""}> Sieht die Aufgaben der anderen</label>
          ${kal.length ? `<div class="tab-wrap"><table class="kal-tab">
            <caption class="sr">Kalender von ${esc(p.name)}</caption>
            <thead><tr><th scope="col">Kalender</th><th scope="col">Sehen</th><th scope="col">Eintragen</th><th scope="col">Erinnern</th></tr></thead>
            <tbody>${kal.map((k) => `<tr><th scope="row" style="font-weight:400">${esc(k.name)}</th>
              <td><input type="checkbox" data-kal="sehen" value="${esc(k.id)}" aria-label="${esc(k.name)} sehen" ${sehen == null || sehen.includes(k.id) ? "checked" : ""}></td>
              <td>${k.anlegen ? `<input type="checkbox" data-kal="schreiben" value="${esc(k.id)}" aria-label="In ${esc(k.name)} eintragen" ${schreiben == null || schreiben.includes(k.id) ? "checked" : ""}>` : '<span class="sr">nicht möglich</span><span aria-hidden="true">–</span>'}</td>
              <td><input type="checkbox" data-kal="erinnern" value="${esc(k.id)}" aria-label="An Termine aus ${esc(k.name)} erinnern" ${(e.kalender_erinnern || []).includes(k.id) ? "checked" : ""}></td></tr>`).join("")}</tbody>
          </table></div>
          <div class="feld"><label for="sk-${i}">Standard-Kalender für neue Termine</label>
            <select id="sk-${i}" data-feld="standard_kalender"><option value="">Zuletzt benutzter</option>
            ${kal.filter((k) => k.anlegen).map((k) => `<option value="${esc(k.id)}" ${e.standard_kalender === k.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></div>`
          : `<p class="leer">Noch keine Kalender in Home Assistant.</p>`}
          <div class="feld"><label for="hy-${i}">Handy für Erinnerungen</label>
            <select id="hy-${i}" data-feld="handy"><option value="">Keine Erinnerungen</option>
            ${(d.handys || []).map((h) => `<option value="${esc(h.id)}" ${e.handy === h.id ? "selected" : ""}>${esc(h.name)}</option>`).join("")}</select>
            ${(d.handys || []).length ? "" : '<span class="hinweis">Kein Handy mit der Home-Assistant-App gefunden.</span>'}</div>
          ${erinnHtml(`se${i}`, e.erinnerungen || [30, 180, 1440])}
          <div class="fuss"><button type="button" class="knopf" data-speichern="${i}">Für ${esc(p.name.split(" ")[0])} speichern</button></div>
        </section>`;
      }).join("")}
      <div class="fuss"><button type="submit" class="knopf primaer">Schließen</button></div>
    </form>`;
    d.personen.forEach((p, i) => erinnBinden(dlg, `se${i}`, (t) => this._sagen(t)));
    dlg.querySelectorAll("[data-farbe]").forEach((f) => f.addEventListener("change", async () => {
      const farben = {};
      dlg.querySelectorAll("[data-farbe]").forEach((x) => { farben[x.dataset.farbe] = x.value; });
      await this._ws({ type: "planer/allgemein", werte: { farben } });
      this._sagen(`Farbe für ${f.dataset.farbe} gespeichert`);
    }));
    dlg.querySelectorAll("[data-nutzer]").forEach((c) => c.addEventListener("change", async () => {
      const aus = [...dlg.querySelectorAll("[data-nutzer]")].filter((x) => !x.checked).map((x) => x.dataset.nutzer);
      await this._ws({ type: "planer/allgemein", werte: { ausgeblendet: aus } });
      this._sagen("Gespeichert. Die Liste aktualisiert sich beim Schließen.");
    }));
    dlg.querySelector("#gk")?.addEventListener("change", async (e) => {
      await this._ws({ type: "planer/allgemein", werte: { gemeinsam_kalender: e.target.value || null } });
      this._sagen("Kalender für gemeinsame Termine gespeichert");
    });
    dlg.querySelectorAll("[data-speichern]").forEach((b) => b.addEventListener("click", async () => {
      const i = +b.dataset.speichern;
      const sec = dlg.querySelectorAll("section.person-einst")[i];
      const liste = (art) => [...sec.querySelectorAll(`[data-kal="${art}"]:checked`)].map((x) => x.value);
      const alle = (art) => sec.querySelectorAll(`[data-kal="${art}"]`).length;
      const werte = {
        andere_sehen: sec.querySelector('[data-feld="andere_sehen"]').checked,
        handy: sec.querySelector('[data-feld="handy"]').value || null,
        erinnerungen: erinnLesen(dlg, `se${i}`),
      };
      if (kal.length) {
        werte.kalender_sehen = liste("sehen").length === alle("sehen") ? null : liste("sehen");
        werte.kalender_schreiben = liste("schreiben").length === alle("schreiben") ? null : liste("schreiben");
        werte.kalender_erinnern = liste("erinnern");
        werte.standard_kalender = sec.querySelector('[data-feld="standard_kalender"]').value || null;
      }
      await this._ws({ type: "planer/einstellung", person: d.personen[i].id, werte });
      b.textContent = "Gespeichert ✓";
      this._sagen(`Einstellungen für ${d.personen[i].name} gespeichert`);
    }));
    dlg.addEventListener("close", async () => { await this._lesen(); this._termineLaden(); }, { once: true });
    dlg.showModal();
  }

  // Neuer Termin; übernimmt, was schon in der Schnelleingabe steht
  _terminNeu() {
    const dlg = this.shadowRoot.getElementById("tdlg");
    const d = this._daten;
    const text = this.shadowRoot.getElementById("schnell")?.value || "";
    const v = text.trim() ? parse(text, d.personen) : {};
    const schreibbar = (d.kalender || []).filter((k) => k.schreiben);
    let zuletzt = null;
    try { zuletzt = localStorage.getItem("planer.kalender"); } catch (e) { /* egal */ }
    const eigene = [d.einst.standard_kalender, zuletzt].find((x) => schreibbar.some((k) => k.id === x)) || schreibbar[0]?.id;
    const vorwahl = v.person === GEMEINSAM && schreibbar.some((k) => k.id === d.gemeinsam_kalender) ? d.gemeinsam_kalender : eigene;
    const datum = v.datum || heute();
    const von = v.uhrzeit || "";
    const bis = von ? (() => { const [h, m] = von.split(":").map(Number); return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; })() : "";
    dlg.innerHTML = `<form method="dialog" id="tform" novalidate>
      ${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
      <h2 id="t-titel-h">Neuer Termin</h2>
      <div class="feld"><label for="t-titel">Titel</label><input id="t-titel" required value="${esc(v.titel || "")}"></div>
      ${d.gemeinsam_kalender && schreibbar.some((k) => k.id === d.gemeinsam_kalender) ? `<div class="schnellwahl" role="radiogroup" aria-label="Für wen">
        <label class="check"><input type="radio" name="t-fuer" value="ich" ${v.person === GEMEINSAM ? "" : "checked"}> Für mich</label>
        <label class="check"><input type="radio" name="t-fuer" value="gemeinsam" ${v.person === GEMEINSAM ? "checked" : ""}> Gemeinsam (${esc(this._kal(d.gemeinsam_kalender).name)})</label>
      </div>` : ""}
      <div class="feld"><label for="t-kal">Kalender</label><select id="t-kal">
        ${schreibbar.map((k) => `<option value="${esc(k.id)}" ${k.id === vorwahl ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></div>
      <label class="check"><input type="checkbox" id="t-ganz" ${von ? "" : "checked"}> Ganztägig</label>
      <div class="reihe">
        <div class="feld"><label for="t-datum">Datum</label><input id="t-datum" type="date" value="${esc(datum)}"></div>
        <div class="feld" id="t-von-f"><label for="t-von">Von</label><input id="t-von" type="time" value="${esc(von || "09:00")}"></div>
        <div class="feld" id="t-bis-f"><label for="t-bis">Bis</label><input id="t-bis" type="time" value="${esc(bis || "10:00")}"></div>
        <div class="feld" id="t-ende-f"><label for="t-ende">Letzter Tag (optional)</label><input id="t-ende" type="date"></div>
      </div>
      ${wdhHtml("tw", v.wiederholung || {})}
      <div class="feld"><label for="t-ort">Ort (optional)</label><input id="t-ort"></div>
      <div class="feld"><label for="t-beschr">Beschreibung (optional)</label><textarea id="t-beschr"></textarea></div>
      <p class="hinweis" style="display:block">Erinnert wird mit deinem Standard (${esc(minKurz(d.einst.erinnerungen))}), wenn der Kalender in den Einstellungen unter „Erinnern“ angehakt ist.</p>
      <p class="fehler" id="t-fehler" role="alert"></p>
      <div class="fuss">
        <button type="button" class="knopf" id="t-abbrechen">Abbrechen</button>
        <button type="submit" class="knopf primaer">Eintragen</button>
      </div>
    </form>`;
    const $ = (id) => dlg.querySelector(`#${id}`);
    const ganz = () => { const g = $("t-ganz").checked; $("t-von-f").hidden = g; $("t-bis-f").hidden = g; $("t-ende-f").hidden = !g; };
    ganz();
    $("t-ganz").addEventListener("change", ganz);
    wdhBinden(dlg, "tw");
    dlg.querySelectorAll('input[name="t-fuer"]').forEach((r) => r.addEventListener("change", () => {
      $("t-kal").value = r.value === "gemeinsam" ? d.gemeinsam_kalender : eigene;
    }));
    $("t-abbrechen").addEventListener("click", () => dlg.close());
    $("tform").addEventListener("submit", async (e) => {
      e.preventDefault();
      const titel = $("t-titel").value.trim();
      if (!titel) { $("t-fehler").textContent = "Bitte einen Titel eingeben."; $("t-titel").focus(); return; }
      const g = $("t-ganz").checked;
      const tag = $("t-datum").value || heute();
      if (!g && $("t-bis").value <= $("t-von").value) { $("t-fehler").textContent = "„Bis“ muss nach „Von“ liegen."; $("t-bis").focus(); return; }
      const termin = {
        titel, ganztag: g, ort: $("t-ort").value, beschreibung: $("t-beschr").value,
        start: g ? tag : `${tag}T${$("t-von").value}`,
        ende: g ? ($("t-ende").value || tag) : `${tag}T${$("t-bis").value}`,
        rrule: rrule(wdhLesen(dlg, "tw"), g) || undefined,
      };
      try {
        await this._hass.callWS({ type: "planer/termin_anlegen", kalender: $("t-kal").value, termin });
      } catch (err) { $("t-fehler").textContent = err.message || "Eintragen hat nicht geklappt."; return; }
      if ($("t-kal").value !== d.gemeinsam_kalender) { try { localStorage.setItem("planer.kalender", $("t-kal").value); } catch (e2) { /* egal */ } }
      dlg.close();
      const s = this.shadowRoot.getElementById("schnell");
      if (s) { s.value = ""; this._vorschau(); }
      this._sagen(`Termin eingetragen: ${titel}, ${datumText(tag)}`);
      this._wTermine = null;
      this._termineLaden();
    });
    this._wischZu(dlg);
    dlg.showModal();
    $("t-titel").focus();
  }

  _terminZeigen(t) {
    const dlg = this.shadowRoot.getElementById("tdlg");
    const k = this._kal(t.kalender);
    const wann = t.ganztag
      ? (t.ende.slice(0, 10) > iso(plusTage(ausIso(t.start.slice(0, 10)), 1)) ? `${datumText(t.start.slice(0, 10))} bis ${datumText(iso(plusTage(ausIso(t.ende.slice(0, 10)), -1)))}, ganztägig` : `${datumText(t.start.slice(0, 10))}, ganztägig`)
      : `${datumText(t.start.slice(0, 10))}, ${uhr(t.start)}–${uhr(t.ende)} Uhr`;
    dlg.innerHTML = `<form method="dialog">
      ${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
      <h2 id="t-titel-h">${esc(t.titel)}</h2>
      <dl class="infos">
        <dt>Wann</dt><dd>${esc(wann)}${t.wiederholt ? " · wiederholt sich" : ""}</dd>
        <dt>Kalender</dt><dd>${esc(k.name)}</dd>
        ${t.ort ? `<dt>Ort</dt><dd>${esc(t.ort)}</dd>` : ""}
        ${t.beschreibung ? `<dt>Beschreibung</dt><dd style="white-space:pre-wrap">${esc(t.beschreibung)}</dd>` : ""}
      </dl>
      <p class="hinweis" style="display:block">Termine änderst du in Google Kalender. Hier kannst du sie ansehen und löschen.</p>
      <p class="fehler" id="t-fehler" role="alert"></p>
      <div class="fuss">
        ${k.loeschen && t.uid ? (t.recurrence_id
          ? `<button type="button" class="knopf gefahr links" data-loeschen="einer">Nur diesen löschen</button><button type="button" class="knopf gefahr" data-loeschen="folgende">Diesen und alle folgenden löschen</button>`
          : `<button type="button" class="knopf gefahr links" data-loeschen="einer">Löschen</button>`) : ""}
        <button type="submit" class="knopf primaer">Schließen</button>
      </div>
    </form>`;
    const sicher = {};
    dlg.querySelectorAll("[data-loeschen]").forEach((b) => b.addEventListener("click", async () => {
      const art = b.dataset.loeschen;
      if (!sicher[art]) { sicher[art] = true; b.textContent = "Wirklich löschen?"; b.focus(); return; }
      try {
        await this._hass.callWS({ type: "planer/termin_loeschen", kalender: t.kalender, uid: t.uid, recurrence_id: t.recurrence_id, alle_folgenden: art === "folgende" });
      } catch (err) { dlg.querySelector("#t-fehler").textContent = err.message || "Löschen hat nicht geklappt."; return; }
      dlg.close();
      this._sagen(`Termin gelöscht: ${t.titel}`);
      this._wTermine = null;
      this._termineLaden();
    }));
    this._wischZu(dlg);
    dlg.showModal();
  }
}

function CSS_escape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

if (!customElements.get("planer-panel")) customElements.define("planer-panel", PlanerPanel);
