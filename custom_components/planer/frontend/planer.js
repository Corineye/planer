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
  const modus = "eigene";
  const werte = [...new Set([...ERINNER_VORGABEN, ...(liste || standard || [])])].sort((a, b) => a - b);
  const an = new Set(liste || standard || []);
  return `<fieldset>
    <legend>Erinnerung aufs Handy</legend>
    ${standard !== undefined ? `<p class="hinweis">Antippen, wann erinnert werden soll. Nichts ausgewählt = keine Erinnerung.</p>` : ""}
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
const datumKurz = (t) => { const d = ausIso(t); return `${d.getDate()}. ${MONATE[d.getMonth()]}`; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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

// Text aus Kalender-Beschreibungen (die oft HTML enthalten) ohne Ausführung von Inhalten
function klartext(html) {
  const roh = String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n");
  const doc = new DOMParser().parseFromString(roh, "text/html");
  return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}
// Adressen im Text als antippbare Links (Text wird vorher maskiert)
function verlinken(text) {
  return esc(text).replace(/\b(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}

// ---------- Stil ----------
const CSS = `
/* ===== Planer Designsystem (Apple HIG + Liquid Glass) =====
   Raster 4/8 px, Schriftstufen nach iOS, Glas nur für Navigation und Bedienelemente,
   Inhalt auf festen Karten. HA setzt die Grundschrift auf 14 px, darum hier feste px-Werte. */
:host{
  /* Farben hell */
  --bg:#f2f2f7; --card:#ffffff; --card2:#f2f2f7; --fg:#000000; --muted:#636366;
  --line:rgba(60,60,67,.14); --line2:rgba(60,60,67,.30); --fill:rgba(120,120,128,.12); --fill2:rgba(120,120,128,.2);
  --mint:#0066cc; --accent:#0066cc; --accent-fill:#0066cc; --on-mint:#ffffff; --mint-dim:rgba(0,102,204,.10);
  --warn:#9a5200; --warn-dim:rgba(255,149,0,.16); --red:#d70015; --focus:#0066cc;
  --thumb:#ffffff; --thumb-schatten:0 1px 4px rgba(0,0,0,.14),0 0 0 .5px rgba(0,0,0,.04);
  --glas:rgba(255,255,255,.66); --glas-rand:rgba(255,255,255,.8); --glas-blur:blur(22px) saturate(180%);
  --glas-schatten:0 8px 28px rgba(0,0,0,.10),0 1px 2px rgba(0,0,0,.06);
  --karte-schatten:0 1px 2px rgba(0,0,0,.05);
  /* Schrift (iOS-Stufen) */
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,Roboto,sans-serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --t-gross:28px; --t-titel:20px; --t-kopf:17px; --t-text:16px; --t-sub:14px; --t-fuss:13px; --t-klein:12px; --t-tab:11px;
  /* Abstände und Radien */
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px;
  --r-karte:14px; --r-feld:12px; --r-voll:999px;
  --z-leiste:10; --z-fab:11;
  display:block; min-height:100vh; min-height:100dvh; color:var(--fg); font-family:var(--font); font-size:var(--t-text); line-height:1.4;
  color-scheme:light dark; -webkit-font-smoothing:antialiased;
  background:
    radial-gradient(60vmax 40vmax at 10% -10%,rgba(0,122,255,.08),transparent 60%),
    radial-gradient(50vmax 40vmax at 100% 10%,rgba(175,82,222,.06),transparent 60%),
    var(--bg);
  background-attachment:fixed;
}
@media (prefers-color-scheme:dark){:host{
  --bg:#000000; --card:#1c1c1e; --card2:#2c2c2e; --fg:#ffffff; --muted:#aeaeb4;
  --line:rgba(255,255,255,.12); --line2:rgba(255,255,255,.28); --fill:rgba(118,118,128,.24); --fill2:rgba(118,118,128,.36);
  --mint:#5aa9ff; --accent:#5aa9ff; --accent-fill:#0a6cd9; --on-mint:#ffffff; --mint-dim:rgba(90,169,255,.16);
  --warn:#ffb340; --warn-dim:rgba(255,159,10,.18); --red:#ff6b61; --focus:#5aa9ff;
  --thumb:#636366; --thumb-schatten:0 1px 4px rgba(0,0,0,.4);
  --glas:rgba(40,40,44,.62); --glas-rand:rgba(255,255,255,.12);
  --glas-schatten:0 8px 28px rgba(0,0,0,.55),0 1px 2px rgba(0,0,0,.4);
  --karte-schatten:0 0 0 transparent;
  background:
    radial-gradient(60vmax 40vmax at 10% -10%,rgba(10,132,255,.16),transparent 60%),
    radial-gradient(50vmax 40vmax at 100% 10%,rgba(191,90,242,.10),transparent 60%),
    var(--bg);
  background-attachment:fixed;
}}
.schmal{--t-gross:34px; --t-titel:20px; --t-kopf:17px; --t-text:17px; --t-sub:15px; --t-fuss:13px; --t-klein:12px; --t-tab:11px; font-size:var(--t-text)}

*{box-sizing:border-box}
[hidden]{display:none!important}
button,input,select,textarea{font:inherit;color:inherit;letter-spacing:inherit}
button{-webkit-tap-highlight-color:transparent}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.muted{color:var(--muted)}
svg{flex:none}

/* ---------- Glas (nur Navigation und Bedienelemente) ---------- */
.glas,.seg,nav.tabs,.knopf:not(.primaer):not(.text),.rund,.fab{background:var(--glas);-webkit-backdrop-filter:var(--glas-blur);backdrop-filter:var(--glas-blur);border:1px solid var(--glas-rand);box-shadow:var(--glas-schatten)}
@media (prefers-reduced-transparency:reduce){.glas,.seg,nav.tabs,.knopf:not(.primaer):not(.text),.rund,.fab{background:var(--card);-webkit-backdrop-filter:none;backdrop-filter:none}}

/* ---------- Grundgerüst ---------- */
.wrap{max-width:1040px;margin:0 auto;padding:var(--s4) var(--s5) var(--s6);display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s4)}
.wrap>*{min-width:0}
.schmal .wrap{padding:var(--s2) var(--s4) calc(112px + env(safe-area-inset-bottom,0px));gap:var(--s4)}
header{display:flex;gap:var(--s3);align-items:center;min-width:0}
header .titel-block{display:grid;min-width:0;flex:1}
header h1{margin:0;font-size:var(--t-gross);font-weight:700;letter-spacing:-.02em;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
header .datum{font-size:var(--t-sub);color:var(--muted);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
header .rechts{margin-left:auto;display:flex;gap:var(--s2);align-items:center;flex:none}
.schmal header{align-items:flex-start;padding-top:var(--s1)}
.schmal header .titel-block{padding-top:2px}

/* ---------- Bedienelemente ---------- */
.rund{width:44px;height:44px;border-radius:50%;display:inline-grid;place-items:center;cursor:pointer;color:var(--fg);padding:0;position:relative;flex:none}
.rund svg{width:22px;height:22px}
.rund.aktiv{color:var(--on-mint);background:var(--accent-fill);border-color:var(--accent-fill)}
.rund select{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border-radius:50%}
.knopf{display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);min-height:44px;padding:0 var(--s4);border-radius:var(--r-voll);cursor:pointer;font-weight:600;font-size:var(--t-sub);color:var(--fg);transition:transform .12s ease,filter .2s ease;white-space:nowrap}
.knopf svg{width:20px;height:20px}
.knopf.primaer{background:var(--accent-fill);color:var(--on-mint);border:1px solid var(--accent-fill)}
.knopf.gefahr{color:var(--red)}
.knopf.text{background:none;border:0;box-shadow:none;color:var(--accent);padding:0 var(--s2)}
.knopf.text.fett{font-weight:700}
.knopf.klein{min-height:36px;padding:0 var(--s3);font-size:var(--t-fuss)}
.knopf:disabled{opacity:.45;cursor:default}
.knopf:hover:not(:disabled){filter:brightness(1.05)}
.knopf:active,.rund:active,.fab:active,.seg button:active,nav.tabs button:active{transform:scale(.96)}

/* Segment-Schalter wie in iOS: fester „Daumen“ für die Auswahl */
.seg{display:inline-flex;border-radius:var(--r-voll);padding:3px;gap:2px;max-width:100%}
.seg button{flex:1 1 auto;border:0;background:none;border-radius:var(--r-voll);min-height:38px;padding:0 var(--s4);cursor:pointer;color:var(--fg);font-size:var(--t-sub);font-weight:500;white-space:nowrap;transition:background .2s ease}
.seg button[aria-pressed="true"]{background:var(--thumb);box-shadow:var(--thumb-schatten);font-weight:700}
.filterzeile .seg{display:flex;width:100%}
.schmal .seg button{padding:0 var(--s2);min-height:40px}
.schmal .knopf.klein{min-height:44px}
.teile:empty{display:none}
dialog .knopf:not(.primaer):not(.text){box-shadow:none;background:var(--card);border-color:var(--line);-webkit-backdrop-filter:none;backdrop-filter:none}
fieldset .knopf:not(.primaer):not(.text){background:var(--card2);border-color:transparent}
@media (orientation:landscape) and (max-height:520px){.schmal nav.tabs[aria-label]{left:var(--s3);right:var(--s3);margin:0 auto;max-width:600px}.schmal nav.tabs[aria-label] button{min-height:44px;flex-direction:row;gap:6px}.schmal nav.tabs[aria-label] button svg{width:20px;height:20px}.schmal nav.tabs[aria-label] .zahl{position:static;background:var(--fill);color:var(--muted)}.schmal{--t-gross:28px}.schmal .wrap{padding-bottom:calc(88px + env(safe-area-inset-bottom,0px))}.fab{bottom:calc(72px + env(safe-area-inset-bottom,0px));right:calc(var(--s4) + env(safe-area-inset-right,0px))}}
@media (max-width:359px){.schmal{--t-gross:28px}.schmal nav.tabs{left:var(--s2);right:var(--s2)}.schmal nav.tabs button{font-size:10px}}

/* Filter-Chips für Bereiche (Desktop), ohne eigene Glasfläche */
.bereiche{display:flex;flex-wrap:wrap;gap:var(--s2)}
.bereiche button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 var(--s3);border-radius:var(--r-voll);border:1px solid var(--line);background:var(--card);color:var(--fg);font-size:var(--t-fuss);font-weight:500;cursor:pointer;box-shadow:var(--karte-schatten)}
.bereiche button[aria-pressed="true"]{background:var(--fg);color:var(--card);border-color:var(--fg);font-weight:700}
.aktivfilter{display:flex;gap:var(--s2);align-items:center;flex-wrap:wrap;font-size:var(--t-sub);color:var(--muted)}
.aktivfilter button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 var(--s3);border-radius:var(--r-voll);border:0;background:var(--fg);color:var(--card);font-weight:600;font-size:var(--t-fuss);cursor:pointer}
.aktivfilter button svg{width:14px;height:14px}

/* ---------- Schnelleingabe ---------- */
form.schnell{display:grid;gap:var(--s2)}
.eingabe{display:flex;gap:var(--s2);min-width:0;width:100%;align-items:center}
.eingabe input{flex:1;width:0;min-width:0;height:48px;border-radius:var(--r-voll);border:1px solid var(--line);background:var(--card);box-shadow:var(--karte-schatten);padding:0 var(--s4) 0 20px;font-size:var(--t-text)}
.eingabe input::placeholder{color:var(--muted)}
.eingabe .knopf{flex:none;height:48px}
.eingabe .knopf.primaer{box-shadow:0 4px 14px color-mix(in srgb,var(--accent-fill) 35%,transparent)}
.schmal .eingabe .knopf.primaer{width:48px;padding:0}
.zusatz{display:flex;gap:var(--s1);align-items:center;min-width:0}
.zusatz .knopf.text{padding:0 var(--s2) 0 var(--s1)}
.hinweis{font-size:var(--t-fuss);color:var(--muted);display:flex;gap:6px;flex-wrap:wrap;margin:0}
.hinweis:empty{display:none}
.schmal form.schnell{background:var(--card);border-radius:20px;padding:var(--s3);box-shadow:var(--glas-schatten);border:1px solid var(--line)}
.schmal form.schnell .eingabe input{box-shadow:none;background:var(--card2);border-color:transparent}
.fab{position:fixed;right:var(--s4);bottom:calc(88px + env(safe-area-inset-bottom,0px));z-index:var(--z-fab);width:56px;height:56px;border-radius:50%;display:grid;place-items:center;cursor:pointer;background:var(--accent-fill);color:var(--on-mint);border:0;box-shadow:0 6px 20px color-mix(in srgb,var(--accent-fill) 45%,transparent),0 2px 6px rgba(0,0,0,.2)}
.fab svg{width:26px;height:26px}

/* ---------- Reiterleiste ---------- */
nav.tabs{display:flex;gap:2px;border-radius:var(--r-voll);padding:4px;width:max-content;max-width:100%}
nav.tabs button{display:flex;gap:var(--s2);align-items:center;border:0;background:none;border-radius:var(--r-voll);min-height:40px;padding:0 var(--s4);cursor:pointer;color:var(--fg);font-size:var(--t-sub);font-weight:500}
nav.tabs button svg{width:20px;height:20px}
nav.tabs button[aria-current="page"]{background:var(--mint-dim);color:var(--accent);font-weight:700}
nav.tabs .zahl{font-size:var(--t-klein);font-variant-numeric:tabular-nums;background:var(--fill);color:var(--muted);border-radius:var(--r-voll);padding:0 7px;line-height:20px;font-weight:600}
nav.tabs .zahl.null{display:none}
.schmal nav.tabs{position:fixed;left:var(--s3);right:var(--s3);bottom:calc(var(--s2) + env(safe-area-inset-bottom,0px));z-index:var(--z-leiste);width:auto;justify-content:space-around;padding:4px}
.schmal nav.tabs button{flex:1;flex-direction:column;gap:2px;justify-content:center;font-size:var(--t-tab);font-weight:600;padding:0 2px;min-height:56px;position:relative;min-width:0}
.schmal nav.tabs button span:not(.zahl){max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.schmal nav.tabs button svg{width:24px;height:24px}
.schmal nav.tabs .zahl{position:absolute;top:4px;left:calc(50% + 6px);font-size:var(--t-tab);line-height:16px;padding:0 5px;background:var(--accent-fill);color:var(--on-mint)}

/* ---------- Inhalt ---------- */
main{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s5)}
section.gruppe{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s2)}
.gruppe h2{margin:0;font-size:var(--t-titel);font-weight:700;letter-spacing:-.01em;display:flex;gap:var(--s2);align-items:baseline;flex-wrap:wrap}
.gruppe h2 .zahl{font-size:var(--t-sub);color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}
.gruppe h2 .chip{align-self:center}
ul.liste{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
li.aufgabe{position:relative;border-radius:var(--r-karte);touch-action:pan-y;min-width:0}
.zeile{display:flex;gap:var(--s1);align-items:center;padding:var(--s1) var(--s2) var(--s1) var(--s1);min-height:56px;border-radius:var(--r-karte);background:var(--card);box-shadow:var(--karte-schatten);transition:transform .15s ease;position:relative}
li.aufgabe.farbig .zeile{box-shadow:inset 4px 0 0 var(--b),var(--karte-schatten)}
.erledigt .zeile{opacity:.6}
.erledigt .titel{text-decoration:line-through}
/* Haken: sichtbar 24 px, Trefferfläche 44 px */
.haken{flex:none;width:44px;height:44px;border:0;background:none;cursor:pointer;display:grid;place-items:center;padding:0;border-radius:50%;color:var(--on-mint)}
.haken::before{content:"";grid-area:1/1;width:24px;height:24px;border-radius:50%;border:2px solid var(--line2);box-sizing:border-box}
.haken svg{grid-area:1/1;width:14px;height:14px;position:relative}
.haken[aria-checked="true"]::before{background:var(--accent-fill);border-color:var(--accent-fill)}
.top .haken::before{border-color:var(--accent)}
.rang{flex:none;font-size:var(--t-klein);font-weight:700;min-width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:var(--accent-fill);color:var(--on-mint);font-variant-numeric:tabular-nums;margin-right:var(--s1)}
.inhalt{flex:1;min-width:0;min-height:44px;align-content:center;display:grid;gap:var(--s1);text-align:left;background:none;border:0;padding:var(--s2) var(--s1);cursor:pointer;color:var(--fg)}
.titel{overflow-wrap:anywhere;font-size:var(--t-text);line-height:1.3}
.unter{font-size:var(--t-sub);color:var(--muted);overflow-wrap:anywhere}
.meta{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.aktionen{display:flex;gap:var(--s2);flex:none}
.leer{color:var(--muted);padding:var(--s3) var(--s4);border-radius:var(--r-karte);background:var(--fill);margin:0;font-size:var(--t-sub)}
.wisch{position:absolute;inset:0;border-radius:var(--r-karte);display:flex;align-items:center;padding:0 var(--s4);font-weight:700;pointer-events:none;opacity:0;gap:var(--s2)}
.wisch svg{width:20px;height:20px}
.wisch.rechts{background:var(--accent-fill);color:var(--on-mint)}
.wisch.links{background:#ff9500;color:#000;justify-content:flex-end}
details.zu summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:var(--t-sub);min-height:44px;display:flex;align-items:center;list-style:none}
details.zu summary::-webkit-details-marker{display:none}
details.zu summary::before{content:"";width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);margin:0 10px 0 4px;transition:transform .2s ease}
details.zu[open] summary::before{transform:rotate(45deg)}
details.zu>ul,details.zu>p{margin-top:var(--s2)}

/* Chips: ruhig, Farbe nur als Zusatz zum Text */
.chip{display:inline-flex;align-items:center;gap:5px;font-size:var(--t-klein);font-weight:500;line-height:20px;padding:0 var(--s2);border-radius:var(--r-voll);background:var(--fill);color:var(--muted);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.chip svg{width:12px;height:12px}
.chip.mint{color:var(--accent);background:var(--mint-dim)}
.chip.warn{color:var(--warn);background:var(--warn-dim)}
.chip.naechstes{color:var(--on-mint);background:var(--accent-fill);font-weight:700}
.punkt{width:8px;height:8px;border-radius:50%;background:var(--b);display:inline-block;flex:none}

/* ---------- Heute: zwei Spalten am PC ---------- */
.spalten{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--s5);align-items:start}
.spalten>div{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s5);min-width:0}
.spalten>*{min-width:0}
aside.kal{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s2);position:sticky;top:var(--s3)}
.termine{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.termin{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px var(--s3);text-align:left;padding:10px var(--s3) 10px var(--s4);border-radius:var(--r-karte);border:0;background:var(--card);box-shadow:inset 4px 0 0 var(--k,var(--accent)),var(--karte-schatten);cursor:pointer;color:var(--fg);min-height:52px;align-items:baseline}
.termin .zeit{font-size:var(--t-fuss);color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;min-width:5.6em}
.termin .was{overflow-wrap:anywhere;min-width:0;font-size:var(--t-text);font-weight:500}
.termin .was svg{width:14px;height:14px;vertical-align:-2px;color:var(--muted)}
.termin .wo{grid-column:2;font-size:var(--t-fuss);color:var(--muted);min-width:0;overflow-wrap:anywhere}
.termin.block{background:transparent;box-shadow:inset 0 0 0 1.5px var(--line2);border-radius:var(--r-karte)}
.frei{font-size:var(--t-fuss);color:var(--muted);margin:0}

/* ---------- Kalender ---------- */
.wkopf{display:flex;gap:var(--s2) var(--s3);align-items:center;flex-wrap:wrap}
.wkopf h2{margin:0 auto 0 0;font-size:var(--t-titel);font-weight:700;display:flex;gap:var(--s2);align-items:baseline;flex-wrap:wrap}
.wkopf h2 .zahl{font-size:var(--t-sub);color:var(--muted);font-weight:500}
.kalumschalter{justify-self:start;margin-bottom:var(--s1)}
.wkopf .navi .knopf{padding:0 var(--s3)}
.wkopf .navi{display:flex;gap:var(--s2);align-items:center}
.kalleiste{display:flex;gap:var(--s3);align-items:center;flex-wrap:wrap;justify-content:space-between}
.kalleiste .seg{flex:none}
.monat{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:var(--s1)}
.mkopf{font-size:var(--t-klein);text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:0 6px var(--s1);font-weight:600}
.mtag{display:flex;flex-direction:column;align-items:stretch;gap:2px;text-align:left;min-height:104px;padding:6px;border-radius:10px;border:0;background:var(--card);box-shadow:var(--karte-schatten);color:var(--fg);font:inherit;cursor:pointer;min-width:0;overflow:hidden}
.mtag:hover{box-shadow:inset 0 0 0 1.5px var(--line2)}
.mtag.fremd{background:transparent;box-shadow:none;color:var(--muted)}
.mnr{font-weight:600;font-size:var(--t-sub);font-variant-numeric:tabular-nums;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;margin-bottom:2px}
.mtag.heute .mnr{background:#d70015;color:#fff;font-weight:700}
.mpunkt{display:block;font-size:var(--t-klein);line-height:1.35;padding:1px 5px;border-radius:4px;background:color-mix(in srgb,var(--k,var(--accent)) 16%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mpunkt.aufg{background:var(--fill);color:var(--fg)}
.mmehr{font-size:var(--t-klein);color:var(--muted);padding-left:5px}
.schmal .monat{gap:2px}
.schmal .mkopf{text-align:center;padding:0 0 var(--s1)}
.schmal .mtag{min-height:60px;padding:var(--s1) 2px;border-radius:10px;gap:3px;align-items:center}
.schmal .mnr{font-size:var(--t-sub)}
.schmal .mpunkt{font-size:0;height:4px;width:100%;padding:0;border-radius:2px;background:var(--k,var(--accent))}
.schmal .mpunkt.aufg{background:var(--muted)}
.schmal .mmehr{font-size:var(--t-tab);padding:0;line-height:1}
.woche-wrap{overflow-x:auto;padding-bottom:var(--s1)}
.schmal .woche-wrap{overflow:visible}
.woche{display:grid;grid-template-columns:repeat(7,minmax(118px,1fr));gap:var(--s2);min-width:860px}
.schmal .woche{grid-template-columns:minmax(0,1fr);min-width:0}
.wtag{background:var(--card);border-radius:var(--r-karte);padding:var(--s2);display:grid;gap:6px;align-content:start;min-height:180px;min-width:0;box-shadow:var(--karte-schatten)}
.schmal .wtag{min-height:0;padding:var(--s3)}
.wtag.heute{box-shadow:inset 0 0 0 2px var(--accent),var(--karte-schatten)}
.wtag.ziel-drop{outline:2px dashed var(--accent);outline-offset:2px}
.wtag h3{margin:0 0 2px;font-size:var(--t-sub);font-weight:700;display:flex;justify-content:space-between;gap:6px}
.wtag h3 .d{color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}
.wpunkt{display:block;width:100%;text-align:left;font-size:var(--t-fuss);line-height:1.35;padding:6px var(--s2);border-radius:var(--s2);border:0;background:var(--fill);cursor:pointer;overflow-wrap:anywhere;color:var(--fg);min-height:32px}
.schmal .wpunkt{font-size:var(--t-sub);min-height:44px;padding:var(--s2) var(--s3)}
.wpunkt.t{background:color-mix(in srgb,var(--k,var(--accent)) 14%,transparent);box-shadow:inset 3px 0 0 var(--k,var(--accent))}
.wpunkt.a{background:color-mix(in srgb,var(--k,var(--accent)) 13%,var(--card));box-shadow:inset 3px 0 0 var(--k,var(--accent))}
.wpunkt.a::before{content:"";flex:none;display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid var(--k,var(--accent));margin-right:6px;vertical-align:-1px}
.wpunkt.a.fertig::before{background:var(--k,var(--accent))}
.wpunkt.a.top{background:color-mix(in srgb,var(--k,var(--accent)) 20%,var(--card))}
.wpunkt.a.fertig{opacity:.55;text-decoration:line-through}
.wpunkt .z{color:var(--muted);margin-right:6px;font-variant-numeric:tabular-nums}
.wpunkt[draggable=true]{cursor:grab}
.wleer{font-size:var(--t-fuss);color:var(--muted)}
.ablage{display:flex;gap:var(--s2);flex-wrap:wrap}
.ablage .wpunkt{width:auto}
.ziele{display:grid;gap:var(--s2)}
.ziel{display:flex;gap:var(--s3);align-items:center;background:var(--card);border-radius:var(--r-karte);padding:var(--s1) var(--s3);box-shadow:var(--karte-schatten);min-height:52px}
.ziel input[type=text]{flex:1;min-width:0;min-height:44px;border:0;background:none;padding:0}
.ziel input[type=checkbox]{width:24px;height:24px;accent-color:var(--accent-fill);flex:none}
.ziel .nr{font-weight:700;font-size:var(--t-klein);width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:var(--mint-dim);color:var(--accent);flex:none}

/* ---------- Einkauf: gruppierte Liste wie in Erinnerungen ---------- */
ul.liste.gruppiert{gap:0;background:var(--card);border-radius:var(--r-karte);box-shadow:var(--karte-schatten);overflow:hidden}
.gruppiert li.aufgabe{border-radius:0}
.gruppiert .zeile{border-radius:0;box-shadow:none;background:none;min-height:52px}
.gruppiert li+li .zeile::before{content:"";position:absolute;top:0;left:56px;right:0;height:1px;background:var(--line)}
.weg-knopf{width:44px;height:44px;border:0;background:none;border-radius:50%;display:grid;place-items:center;color:var(--muted);cursor:pointer;flex:none}
.weg-knopf svg{width:18px;height:18px}
.weg-knopf:hover{color:var(--red)}

/* ---------- Blätter und Dialoge ---------- */
dialog{border:0;border-radius:20px;background:var(--bg);color:var(--fg);padding:0;width:min(600px,calc(100vw - 32px));max-height:calc(100dvh - 48px);box-shadow:0 24px 64px rgba(0,0,0,.3);overflow:auto;overscroll-behavior:contain}
dialog::backdrop{background:rgba(0,0,0,.45)}
.schmal dialog{margin:auto auto 0;width:100%;max-width:100%;max-height:calc(100dvh - 12px);border-radius:16px 16px 0 0}
dialog form{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s4);padding:0 var(--s4) calc(var(--s5) + env(safe-area-inset-bottom,0px))}
.blatt-kopf{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:var(--s2);margin:0 calc(-1 * var(--s4));padding:var(--s2) var(--s2);background:color-mix(in srgb,var(--bg) 88%,transparent);-webkit-backdrop-filter:var(--glas-blur);backdrop-filter:var(--glas-blur);border-bottom:1px solid var(--line)}
.blatt-kopf h2{margin:0;font-size:var(--t-kopf);font-weight:700;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.blatt-kopf .l{justify-self:start}
.blatt-kopf .r{justify-self:end}
.blatt-kopf .stand{font-size:var(--t-fuss);color:var(--muted);padding-left:var(--s2)}
.blatt-kopf h2:focus{outline:none}
.griff{width:36px;height:5px;border-radius:3px;background:var(--line2);position:absolute;top:5px;left:50%;transform:translateX(-50%)}
.feld{display:grid;gap:6px;min-width:0}
.feld>label,.feld>.lbl,fieldset legend{font-size:var(--t-fuss);color:var(--muted);font-weight:600}
fieldset legend{padding:0 var(--s1)}
.feld input,.feld select,.feld textarea{min-height:44px;border-radius:var(--r-feld);border:1px solid var(--line);background:var(--card);padding:var(--s2) var(--s3);width:100%;min-width:0;font-size:var(--t-text)}
.feld textarea{min-height:88px;resize:vertical}
.reihe{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:var(--s3)}
.schnellwahl{display:flex;gap:var(--s2);flex-wrap:wrap}
fieldset{border:0;border-radius:var(--r-karte);padding:var(--s3) var(--s4) var(--s4);margin:0;display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s3);background:var(--card);min-width:0}
fieldset legend{float:left;width:100%;padding:0;margin-bottom:0}
fieldset legend+*{clear:both}
fieldset .feld input,fieldset .feld select,fieldset .feld textarea,fieldset .teil-neu input,fieldset .teil input[type=text]{background:var(--card2);border-color:transparent}
.tage{display:flex;gap:6px;flex-wrap:wrap}
.tage label{display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border-radius:var(--r-feld);cursor:pointer;background:var(--card2);font-weight:600;font-size:var(--t-sub);position:relative}
.tage input{position:absolute;opacity:0;width:1px;height:1px}
.tage label:has(input:checked){background:var(--accent-fill);color:var(--on-mint)}
.tage label:has(input:focus-visible){outline:3px solid var(--focus);outline-offset:2px}
.wahl label{min-width:auto;padding:0 var(--s3)}
.fuss{display:flex;gap:var(--s2);flex-wrap:wrap;justify-content:flex-end;align-items:center}
.fuss .links{margin-right:auto}
.fuss:not(:has(button)){display:none}
.fuss .knopf.gefahr{flex:1 1 auto}
.fehler{color:var(--red);margin:0;font-size:var(--t-sub)}
.fehler:empty{display:none}
.check{display:flex;gap:var(--s3);align-items:center;min-height:44px}
.check input{width:22px;height:22px;accent-color:var(--accent-fill);flex:none}
.eigen{display:flex;gap:var(--s2);flex-wrap:wrap;align-items:center}
.feld .eigen input{width:96px;min-height:44px}
.feld .eigen select{width:auto;min-height:44px}
.teile{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.teil{display:flex;gap:var(--s2);align-items:center}
.teil input[type=checkbox]{width:24px;height:24px;accent-color:var(--accent-fill);flex:none;margin:0 var(--s2) 0 var(--s1)}
.teil input[type=text]{flex:1;min-width:0;min-height:44px;border-radius:var(--r-feld);border:1px solid var(--line);padding:var(--s2) var(--s3)}
.teil-neu{display:flex;gap:var(--s2);align-items:center}
.teil-neu input{flex:1;min-width:0;min-height:44px;border-radius:var(--r-feld);border:1px solid var(--line);padding:var(--s2) var(--s3)}
.person-einst{background:var(--card);border-radius:var(--r-karte);padding:var(--s4);display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s3)}
.person-einst h3{margin:0;font-size:var(--t-kopf)}
.person-einst .feld select{background:var(--card2);border-color:transparent}
.kal-tab{width:100%;border-collapse:collapse;font-size:var(--t-sub)}
.kal-tab th,.kal-tab td{padding:var(--s2) var(--s1);border-bottom:1px solid var(--line);text-align:center}
.kal-tab thead th{font-size:var(--t-klein);color:var(--muted);font-weight:600}
.kal-tab th:first-child,.kal-tab td:first-child{text-align:left}
.kal-tab input{width:22px;height:22px;accent-color:var(--accent-fill)}
.tab-wrap{overflow-x:auto}
.infos{display:grid;gap:var(--s1);margin:0;background:var(--card);border-radius:var(--r-karte);padding:var(--s4)}
.infos dt{font-size:var(--t-fuss);color:var(--muted);font-weight:600}
.infos dd{margin:0 0 var(--s2)}
.farben{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:var(--s2)}
.farben label{display:flex;gap:var(--s2);align-items:center;min-height:44px;border-radius:var(--r-feld);padding:var(--s1) var(--s3);background:var(--card2)}
.farben input[type=color]{width:32px;height:28px;border:0;background:none;padding:0}

/* ===== v0.6: Zeitleiste, Tagesraster, Hinweise, Suche, Animationen ===== */
:host{--rot:#d70015;--rot-dim:rgba(215,0,21,.08);--bewegung:cubic-bezier(.2,.8,.2,1)}
@media (prefers-color-scheme:dark){:host{--rot:#ff6b61;--rot-dim:rgba(255,69,58,.14)}}
.gkopf{display:flex;align-items:center;gap:var(--s3);justify-content:space-between;flex-wrap:wrap}
.ueberfaellig h2{color:var(--rot)}
.ueberfaellig li.aufgabe .zeile{box-shadow:inset 4px 0 0 var(--rot),var(--karte-schatten)}
.ueberfaellig .haken::before{border-color:var(--rot)}
.gkopf .knopf.rot-knopf{color:#fff;background:#d70015;border-color:#d70015;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
.schmal #suchdlg,.schmal #tagdlg{height:calc(100dvh - 40px)}
#suchdlg{min-height:min(520px,calc(100dvh - 48px))}
.spalten>aside{position:sticky;top:var(--s3);min-width:0}
.wisch.links.rot{background:#d70015;color:#fff}
/* Zeitleiste */
ul.zeitleiste{list-style:none;margin:0;padding:0 0 0 var(--s4);display:grid;gap:var(--s2);position:relative}
ul.zeitleiste::before{content:"";position:absolute;left:5px;top:6px;bottom:6px;width:2px;border-radius:1px;background:var(--line2)}
ul.zeitleiste>li{position:relative}
ul.zeitleiste>li::before{content:"";position:absolute;left:calc(-1 * var(--s4) + 1px);top:20px;width:10px;height:10px;border-radius:50%;background:var(--card);box-shadow:inset 0 0 0 2px var(--accent)}
ul.zeitleiste>li.vorbei{opacity:.55}
ul.zeitleiste>li.vorbei::before{box-shadow:inset 0 0 0 2px var(--line2)}
ul.zeitleiste>li.jetzt{height:2px;margin:var(--s1) 0;background:var(--rot);border-radius:1px}
ul.zeitleiste>li.jetzt::before{top:-4px;background:var(--rot);box-shadow:none}
ul.zeitleiste>li.jetzt span{position:absolute;right:0;top:-10px;font-size:var(--t-klein);font-weight:700;color:var(--rot);background:var(--bg);padding:0 var(--s1)}
.tl-aufgabe{display:flex;align-items:center;gap:var(--s1);background:var(--card);border-radius:var(--r-karte);box-shadow:inset 0 0 0 1.5px var(--line2);padding:var(--s1) var(--s2) var(--s1) var(--s1);min-height:52px}
.tl-aufgabe.top{box-shadow:inset 0 0 0 1.5px var(--accent)}
.tl-aufgabe .inhalt{grid-template-columns:auto minmax(0,1fr);column-gap:var(--s3);align-items:baseline}
.tl-aufgabe .zeit{font-size:var(--t-fuss);color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.tl-aufgabe .unter{grid-column:2;font-size:var(--t-fuss)}
.termine.ganztag .termin{min-height:44px}
/* Tagesliste und Raster */
.tagliste{display:grid;gap:var(--s3)}
.tagliste .wtag{min-height:0;padding:var(--s3) var(--s3) var(--s3) var(--s3);gap:var(--s2)}
.tagliste .wtag h3{font-size:var(--t-kopf);align-items:baseline}
.tagliste .wtag.heute h3 .wt-name{color:var(--rot)}
.ganztags,.ohnezeit{display:flex;flex-wrap:wrap;gap:6px}
.ganztags .wpunkt,.ohnezeit .wpunkt{width:auto;max-width:100%}
.raster{position:relative;--rand:48px;margin-top:var(--s1)}
.std{position:absolute;left:0;right:0;height:0;border-top:1px solid var(--line)}
.std span{position:absolute;left:0;top:-8px;width:calc(var(--rand) - 8px);font-size:var(--t-tab);color:var(--muted);font-variant-numeric:tabular-nums;background:var(--card);padding-right:4px}
.std:first-child span{top:0}
.block{position:absolute;display:flex;flex-direction:column;gap:1px;overflow:hidden;text-align:left;border:0;border-radius:6px;padding:2px 6px;cursor:pointer;color:var(--fg);font-size:var(--t-fuss);line-height:1.25;background:color-mix(in srgb,var(--k,var(--accent)) 18%,var(--card));box-shadow:inset 3px 0 0 var(--k,var(--accent))}
.block b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.block span{color:var(--muted);font-size:var(--t-klein);white-space:nowrap}
.block.a{background:color-mix(in srgb,var(--k,var(--accent)) 13%,var(--card));box-shadow:inset 0 0 0 1.5px var(--k,var(--accent))}
.block.fertig{opacity:.5;text-decoration:line-through}
.block:focus-visible{z-index:3}
.wpunkt.block-aussen{display:inline-flex;gap:6px;position:static}
.jetztlinie{position:absolute;left:calc(var(--rand) - 6px);right:0;height:2px;background:var(--rot);z-index:2;pointer-events:none}
.jetztlinie::before{content:"";position:absolute;left:0;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--rot)}
.tagnavi{display:flex;align-items:center;justify-content:space-between;gap:var(--s2)}
.tagnavi .tagname{font-weight:600;text-align:center}
.tagnavi .rund{box-shadow:none}
.tag-inhalt{background:var(--card);border-radius:var(--r-karte);padding:var(--s3);display:grid;gap:var(--s2)}
.tag-inhalt .std span{background:var(--card)}
/* Termin-Details */
.beschreibung{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.beschreibung.offen{display:block;-webkit-line-clamp:unset}
.infos a{color:var(--accent);overflow-wrap:anywhere}
.kartenlink{display:inline-flex;gap:6px;align-items:flex-start;text-decoration:none;min-height:32px}
.kartenlink svg{width:18px;height:18px;margin-top:2px}
.kartenlink span{text-decoration:underline}
.knopf.mehr{padding:0;min-height:36px}
/* Hinweis mit Rückgängig */
.toast{position:fixed;left:50%;bottom:calc(var(--s5) + env(safe-area-inset-bottom,0px));z-index:30;transform:translate(-50%,24px);opacity:0;display:flex;align-items:center;gap:var(--s3);max-width:min(560px,calc(100% - 32px));padding:var(--s2) var(--s2) var(--s2) var(--s4);border-radius:var(--r-voll);background:#1c1c1e;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.3);font-size:var(--t-sub);transition:transform .3s var(--bewegung),opacity .2s ease}
.toast.an{transform:translate(-50%,0);opacity:1}
.toast span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.toast .knopf.text{color:#64b0ff;flex:none}
.schmal .toast{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
/* Suche und Auswahl-Blatt */
.suchfeld{display:flex;align-items:center;gap:var(--s2);background:var(--card);border-radius:var(--r-voll);padding:0 var(--s4);min-height:48px;border:1px solid var(--line)}
.suchfeld svg{width:20px;height:20px;color:var(--muted)}
.suchfeld input{flex:1;min-width:0;border:0;background:none;min-height:46px;font-size:var(--t-text);outline:none}
#such-erg{display:grid;gap:var(--s4)}
#such-erg h3{margin:0;font-size:var(--t-fuss);color:var(--muted);font-weight:600}
.treffer{width:100%;display:grid;gap:2px;text-align:left;background:none;border:0;padding:var(--s3) var(--s4);min-height:52px;cursor:pointer;color:var(--fg);position:relative}
.gruppiert li+li .treffer::before{content:"";position:absolute;top:0;left:var(--s4);right:0;height:1px;background:var(--line)}
.wahlliste{display:grid;background:var(--card);border-radius:var(--r-karte);overflow:hidden}
.wahlzeile{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);min-height:52px;padding:0 var(--s4);border:0;background:none;text-align:left;font-size:var(--t-text);color:var(--accent);font-weight:500;cursor:pointer;position:relative}
.wahlzeile+.wahlzeile::before{content:"";position:absolute;top:0;left:var(--s4);right:0;height:1px;background:var(--line)}
.datumwahl{color:var(--fg)}
.datumwahl input{border:0;background:var(--card2);border-radius:var(--r-feld);min-height:36px;padding:0 var(--s2)}
/* Animationen: sanft, abschaltbar über „Bewegung reduzieren“ */
dialog{transition:opacity .22s ease,transform .28s var(--bewegung),overlay .28s allow-discrete,display .28s allow-discrete;opacity:1;transform:none}
dialog::backdrop{transition:background-color .25s ease,overlay .25s allow-discrete,display .25s allow-discrete}
@starting-style{dialog[open]{opacity:0;transform:translateY(12px) scale(.98)}dialog[open]::backdrop{background:rgba(0,0,0,0)}}
.schmal dialog{transition:transform .32s var(--bewegung),opacity .2s ease,overlay .32s allow-discrete,display .32s allow-discrete}
@starting-style{.schmal dialog[open]{transform:translateY(100%);opacity:1}}
dialog.schliesst{opacity:0;transform:translateY(12px) scale(.98)}
.schmal dialog.schliesst{opacity:1;transform:translateY(100%)}
/* Geschlossener Zustand = Ende der Ausblend-Animation, damit nichts noch einmal aufblitzt */
dialog:not([open]){opacity:0;transform:translateY(12px) scale(.98)}
.schmal dialog:not([open]){opacity:1;transform:translateY(100%)}
dialog:not([open])::backdrop{background:rgba(0,0,0,0)}
dialog.schliesst::backdrop{background:rgba(0,0,0,0)}
main.einblenden{animation:einblenden .28s var(--bewegung)}
@keyframes einblenden{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
li.aufgabe.abgehakt .zeile{animation:abhaken .35s var(--bewegung) forwards}
li.aufgabe.abgehakt .haken::before{background:var(--accent-fill);border-color:var(--accent-fill)}
@keyframes abhaken{50%{transform:scale(.98)}to{opacity:.4}}
.schmal form.schnell:not([hidden]){animation:einblenden .25s var(--bewegung)}
.fab{transition:transform .2s var(--bewegung)}
details.zu[open]>ul{animation:einblenden .25s var(--bewegung)}
/* v0.7 */
dialog .schnellwahl .knopf:not(.primaer):not(.text)[aria-pressed="true"]{background:color-mix(in srgb,var(--accent-fill) 16%,var(--card));color:var(--accent);border-color:color-mix(in srgb,var(--accent-fill) 55%,transparent);font-weight:700}
.seg button[aria-checked="true"]{background:var(--thumb);box-shadow:var(--thumb-schatten);font-weight:700}
.wtag.kompakt{cursor:pointer;transition:transform .15s ease,box-shadow .2s ease}
.wtag.kompakt:hover{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 35%,transparent),var(--karte-schatten)}
.wtag.kompakt.heute:hover{box-shadow:inset 0 0 0 2px var(--accent),var(--karte-schatten)}
.wtag.kompakt:active{transform:scale(.99)}
.wtag.kompakt:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wtag .chips{display:flex;flex-wrap:wrap;gap:6px}
.wtag .chips .wpunkt{display:inline-flex;align-items:center;gap:6px;width:auto;max-width:100%;min-height:32px;cursor:inherit}
.schmal .wtag .chips .wpunkt{min-height:36px;font-size:var(--t-fuss);padding:6px var(--s3)}

.wpunkt .zt{font-variant-numeric:tabular-nums;color:var(--muted);font-weight:600}
.raster.waehlbar{cursor:crosshair;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.raster .auswahl{position:absolute;left:var(--rand);right:2px;border-radius:8px;background:color-mix(in srgb,var(--accent-fill) 22%,transparent);box-shadow:inset 0 0 0 2px var(--accent-fill);font-size:var(--t-klein);font-weight:700;color:var(--accent);padding:2px 8px;pointer-events:none;z-index:3;font-variant-numeric:tabular-nums}
dialog.pop{width:min(440px,calc(100vw - 32px))}
dialog.pop form{display:grid;gap:var(--s3);padding:var(--s3) var(--s5) var(--s5)}
.schmal dialog.pop form{padding:var(--s3) var(--s4) calc(var(--s5) + env(safe-area-inset-bottom))}
.q-kopf{display:flex;justify-content:space-between;align-items:center}
.q-kopf .rund{box-shadow:none}
.q-titel{font-size:var(--t-titel);font-weight:600;border:0;border-bottom:1.5px solid var(--line);border-radius:0;background:none;padding:var(--s2) 0;width:100%;color:var(--fg)}
.q-titel:focus{outline:none;border-bottom-color:var(--accent)}
.q-art{justify-self:start;background:var(--fill)}
.q-zeile{display:grid;grid-template-columns:24px minmax(0,1fr);gap:var(--s3);align-items:start;font-size:var(--t-sub)}
.q-zeile svg{width:22px;height:22px;color:var(--muted);margin-top:2px}
.q-zeiten{display:flex;align-items:center;gap:var(--s2);margin-top:var(--s1);flex-wrap:wrap}
.q-zeiten input{width:auto;min-width:0}
.q-fuss{display:flex;justify-content:flex-end;gap:var(--s2);align-items:center;margin-top:var(--s2)}
.tl-scroll{max-height:calc(100dvh - 300px);min-height:240px;overflow-y:auto;overscroll-behavior:contain;padding-right:var(--s1);display:grid;gap:var(--s4);align-content:start}
.schmal .tl-scroll{max-height:380px;min-height:0}
.tl-tag{display:grid;gap:var(--s2)}
.tl-kopf{margin:0;font-size:var(--t-fuss);font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;position:sticky;top:0;z-index:2;padding:var(--s1) 0 var(--s3);margin-bottom:calc(-1 * var(--s2));
  background:linear-gradient(to bottom,color-mix(in srgb,var(--bg) 82%,transparent) 0,color-mix(in srgb,var(--bg) 82%,transparent) 55%,transparent 100%);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);-webkit-mask-image:linear-gradient(to bottom,#000 60%,transparent);mask-image:linear-gradient(to bottom,#000 60%,transparent)}
.tl-scroll{-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 24px),transparent);padding-bottom:var(--s5)}
.tl-scroll:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:var(--s2)}
.kalleiste{display:flex;align-items:center;gap:var(--s2);flex-wrap:wrap}
.kalwahl .zahl{font-size:var(--t-klein);color:var(--muted);font-variant-numeric:tabular-nums}
.kalzeile{display:grid;grid-template-columns:12px minmax(0,1fr) auto;align-items:center;gap:var(--s3);cursor:pointer}
.kalzeile .punkt{width:12px;height:12px;border-radius:50%;background:var(--b)}
.kalzeile .n{overflow-wrap:anywhere;color:var(--fg);font-weight:500}
.kalzeile .schalter{width:22px;height:22px;accent-color:var(--accent-fill);margin:0}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (forced-colors:active){.haken[aria-checked="true"]::before{forced-color-adjust:none;background:Highlight}.seg button[aria-pressed="true"],nav.tabs button[aria-current="page"]{outline:2px solid Highlight}}
`;

const HAKEN = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;


const ICON = {
  heute: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/></svg>`,
  woche: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
  demnaechst: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
  eingang: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13.5l2.6-7.2A2 2 0 0 1 8 5h8a2 2 0 0 1 1.9 1.3l2.6 7.2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/></svg>`,
  einkauf: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.2l2.3 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.3"/><circle cx="10" cy="20.5" r="1.2"/><circle cx="17" cy="20.5" r="1.2"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  regler: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>`,
  termin: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>`,
  einstellungen: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  filter: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M7 12h10M10 17h4"/></svg>`,
  zu: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  wdh: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a8 8 0 0 1 14-5l2 2M20 4v4h-4M20 13a8 8 0 0 1-14 5l-2-2M4 20v-4h4"/></svg>`,
  teile: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M12 6h8M12 12h8M12 18h8"/></svg>`,
  zurueck: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  vor: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  haken: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  pfeil: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  suche: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
  aufgaben: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="6.5" r="1.6"/><circle cx="5.5" cy="12" r="1.6"/><circle cx="5.5" cy="17.5" r="1.6"/><path d="M10 6.5h10M10 12h10M10 17.5h10"/></svg>`,
  ort: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
};

class PlanerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._daten = null;
    this._ansicht = "heute";
    this._kalAnsicht = "monat";
    this._filter = "ich";
    this._fehler = "";
    this._tasten = (e) => this._taste(e);
    try {
      this._ansicht = localStorage.getItem("planer.ansicht") || "heute";
      this._kalAnsicht = localStorage.getItem("planer.kalansicht") || "monat";
      this._eListe = localStorage.getItem("planer.eliste") || "";
      this._filter = localStorage.getItem("planer.filter") || "ich";
      this._bereich = localStorage.getItem("planer.bereich") || "";
    } catch (e) { /* ohne Speicher weiter */ }
  }

  set hass(h) {
    const erst = !this._hass;
    this._hass = h;
    const el = this._daten && this._eListeId();
    if (el && this._eArtikel?.liste === el && h.states[el]?.last_updated !== this._eStand) {
      this._eStand = h.states[el]?.last_updated;
      this._einkaufLaden(true);
    }
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
      this._sTermine = null;
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
      this._gerust(schmal);
      this._app.innerHTML = `<div class="wrap"><header>${this._menuKnopf()}<div class="titel-block"><h1>Planer</h1></div></header>
        <p role="status">${esc(this._fehler || "Lade Aufgaben …")}</p></div>`;
      this._menuBinden();
      return;
    }

    const d = this._daten;
    const h = this._tag;
    const alle = this._sichtbar();
    const offen = alle.filter((a) => a.status === "offen");
    const zaehler = {
      heute: offen.filter((a) => !a.datum || a.datum <= h).length,
      demnaechst: offen.filter((a) => a.datum && a.datum > h).length,
      eingang: offen.length,
      woche: offen.filter((a) => a.datum && a.datum >= iso(montag(new Date())) && a.datum <= iso(plusTage(montag(new Date()), 6))).length,
      einkauf: (this._eArtikel?.liste === this._eListeId() ? this._eArtikel.items.filter((x) => !x.erledigt).length : 0),
    };
    const tabs = [["heute", "Heute"], ["woche", "Kalender"], ["demnaechst", "Demnächst"]];
    if (this._ansicht === "eingang") this._ansicht = "heute";
    if ((d.einkauf_listen || []).length) tabs.push(["einkauf", "Einkauf"]);
    if (this._ansicht === "einkauf" && !(d.einkauf_listen || []).length) this._ansicht = "heute";
    const heuteD = new Date();
    const filterKnoepfe = d.andere_sehen
      ? `<div class="seg" role="group" aria-label="Wessen Aufgaben">
          ${[["ich", "Ich"], ...d.personen.filter((p) => p.id !== d.ich).map((p) => [p.id, p.name.split(" ")[0]]), [GEMEINSAM, "Gemeinsam"], ["alle", "Alle"]]
            .map(([k, t]) => `<button type="button" data-filter="${esc(k)}" data-fokus="f-${esc(k)}" aria-pressed="${this._filter === k}">${esc(t)}</button>`).join("")}
        </div>` : "";

    const tabName = (tabs.find(([k]) => k === this._ansicht) || tabs[0])[1];
    const einkauf = this._ansicht === "einkauf";
    const bListe = [...new Set(d.aufgaben.filter((a) => a.status === "offen").flatMap((a) => [a.bereich, ...(a.tags || [])]).filter(Boolean))].sort();
    if (this._bereich && !bListe.includes(this._bereich)) bListe.push(this._bereich);
    const gross = (x) => x[0].toUpperCase() + x.slice(1);
    const bereichChips = !schmal && bListe.length && !einkauf
      ? `<div class="bereiche" role="group" aria-label="Nach Bereich filtern">
          <button type="button" data-bereich="" data-fokus="b-alle" aria-pressed="${!this._bereich}">Alle Bereiche</button>
          ${bListe.map((x) => `<button type="button" data-bereich="${esc(x)}" data-fokus="b-${esc(x)}" aria-pressed="${this._bereich === x}" style="--b:${bereichFarbe(x, d.farben)}"><span class="punkt" aria-hidden="true"></span>${esc(gross(x))}</button>`).join("")}
        </div>` : "";
    const bereichWahl = schmal && bListe.length && !einkauf
      ? `<span class="rund ${this._bereich ? "aktiv" : ""}" title="Nach Bereich filtern">${ICON.filter}
          <label class="sr" for="bwahl">Nach Bereich filtern</label>
          <select id="bwahl" data-fokus="bwahl"><option value="">Alle Bereiche</option>${bListe.map((x) => `<option value="${esc(x)}" ${this._bereich === x ? "selected" : ""}>${esc(gross(x))}</option>`).join("")}</select>
        </span>` : "";
    const aktivFilter = schmal && this._bereich && !einkauf
      ? `<div class="aktivfilter"><span>Nur</span><button type="button" data-bereich="" data-fokus="b-weg" aria-label="Filter ${esc(gross(this._bereich))} aufheben"><span class="punkt" style="--b:${bereichFarbe(this._bereich, d.farben)}" aria-hidden="true"></span>${esc(gross(this._bereich))}${ICON.zu}</button></div>` : "";
    const eingabeSichtbar = !schmal || this._eingabeOffen;
    const kannTermin = (d.kalender || []).some((k) => k.schreiben);

    this._gerust(schmal);
    const neueAnsicht = this._zuletzt !== this._ansicht;
    this._zuletzt = this._ansicht;
    this._app.innerHTML = `
    <div class="wrap">
      <header>
        ${this._menuKnopf()}
        <div class="titel-block">
          <h1>${esc(tabName)}</h1>
          <span class="datum">${schmal ? WT_KURZ[wt(heuteD)] + "." : WOCHENTAGE[wt(heuteD)]}, ${heuteD.getDate()}. ${MONATE[heuteD.getMonth()]}</span>
        </div>
        <div class="rechts">
          ${schmal ? "" : filterKnoepfe}
          <button type="button" class="rund" data-aktion="suche" data-fokus="suche" aria-label="Suchen" title="Suchen (Taste /)">${ICON.suche}</button>
          ${bereichWahl}
          ${d.admin ? `<button type="button" class="rund" data-aktion="einstellungen" data-fokus="einst" aria-label="Einstellungen" title="Einstellungen">${ICON.einstellungen}</button>` : ""}
        </div>
      </header>
      ${schmal && filterKnoepfe ? `<div class="filterzeile">${filterKnoepfe}</div>` : ""}
      ${aktivFilter}

      <form class="schnell" id="schnellform" autocomplete="off" ${eingabeSichtbar ? "" : "hidden"}>
        <label class="sr" for="schnell">${einkauf ? "Neuer Artikel" : "Neue Aufgabe"}</label>
        <div class="eingabe">
          <input id="schnell" data-fokus="schnell" placeholder="${einkauf ? "Artikel, z. B. Milch, 2 Liter" : schmal ? "Neue Aufgabe" : "Neue Aufgabe, z. B. morgen 15 Uhr !1 Filament bestellen #werkstatt"}" aria-describedby="vorschau tipp" enterkeyhint="done">
          <button class="knopf primaer" type="submit" aria-label="${einkauf ? "Artikel hinzufügen" : "Aufgabe hinzufügen"}">${ICON.plus}${schmal ? "" : "Hinzufügen"}</button>
          ${schmal ? "" : `<button class="knopf" type="button" data-aktion="erweitert" title="Aufgabe mit allen Einstellungen anlegen">${ICON.regler}Erweitert</button>
          ${kannTermin ? `<button class="knopf" type="button" data-aktion="termin" title="Termin in den Kalender eintragen">${ICON.termin}Termin</button>` : ""}`}
        </div>
        ${schmal ? `<div class="zusatz">
          <button class="knopf text" type="button" data-aktion="erweitert">${ICON.regler}Erweitert</button>
          ${kannTermin ? `<button class="knopf text" type="button" data-aktion="termin">${ICON.termin}Termin</button>` : ""}
          <button class="rund" type="button" data-aktion="eingabe-zu" aria-label="Eingabe schließen" title="Schließen" style="margin-left:auto;box-shadow:none">${ICON.zu}</button>
        </div>` : ""}
        <div class="hinweis" id="vorschau" aria-live="polite"></div>
        <span class="sr" id="tipp">${einkauf ? "Menge nach dem Komma, zum Beispiel Milch, 2 Liter. Erscheint sofort auch in Bring!." : ""}Erkennt heute, morgen, Wochentage, Datum wie 24.12., Uhrzeit wie 15 Uhr, !1 bis !3 für Top 3, # für Bereich, @ für Person und Wiederholungen wie jeden Montag oder täglich. Taste N springt hierher.</span>
      </form>

      <nav class="tabs" aria-label="Ansichten">
        ${tabs.map(([k, t]) => `<button type="button" data-ansicht="${k}" data-fokus="t-${k}" ${this._ansicht === k ? 'aria-current="page"' : ""}>${(k === "eingang" ? ICON.aufgaben : ICON[k]) || ""}<span>${t}</span><span class="zahl ${!zaehler[k] ? "null" : ""}" aria-label="${zaehler[k]} offen">${zaehler[k]}</span></button>`).join("")}
      </nav>
      ${bereichChips}

      <main id="inhalt">${this._ansichtHtml(alle, offen)}</main>
    </div>
    ${schmal && !this._eingabeOffen ? `<button type="button" class="fab" data-aktion="neu" data-fokus="fab" aria-label="${einkauf ? "Artikel hinzufügen" : "Neue Aufgabe"}">${ICON.plus}</button>` : ""}`;
    if (neueAnsicht) this._app.querySelector("main")?.classList.add("einblenden");

    const s = root.getElementById("schnell");
    s.value = eingabe;
    this._vorschau();
    this._binden();
    // Tages-Pop-up auffrischen, aber nicht während ein Zeitfenster gezogen oder eingetragen wird
    if (this.shadowRoot.getElementById("tagdlg")?.open) {
      if (this._rasterAktiv) this._tagSpaeter = true; else this._tagFuellen();
    }
    if (fokus && !root.querySelector("dialog[open]")) {
      const el = this._app.querySelector(`[data-fokus="${CSS_escape(fokus)}"]`);
      if (el) el.focus();
    }
  }

  // Fester Rahmen: Dialoge und Hinweis bleiben bestehen, nur #app wird neu gezeichnet
  _gerust(schmal) {
    const root = this.shadowRoot;
    if (!root.getElementById("rahmen")) {
      root.innerHTML = `<style>${CSS}</style><div id="rahmen">
        <div id="app"></div>
        <div id="ansage" class="sr" role="status" aria-live="polite"></div>
        <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
        <dialog id="blatt" aria-labelledby="blatt-titel"></dialog>
        <dialog id="einst" aria-labelledby="einst-titel"></dialog>
        <dialog id="tagdlg" aria-labelledby="tag-titel"></dialog>
        <dialog id="wahldlg" aria-labelledby="wahl-titel"></dialog>
        <dialog id="suchdlg" aria-labelledby="such-titel"></dialog>
        <dialog id="tdlg" aria-labelledby="t-titel-h"></dialog>
        <dialog id="schnelldlg" class="pop" aria-label="Schnell eintragen"></dialog>
      </div>`;
      this._app = root.getElementById("app");
      // Pop-ups schließen beim Klick außerhalb (nur wenn Drücken und Loslassen außerhalb waren)
      root.querySelectorAll("dialog").forEach((dlg) => {
        const aussen = (ev) => { const r = dlg.getBoundingClientRect(); return ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom; };
        let start = false;
        dlg.addEventListener("pointerdown", (ev) => { start = ev.target === dlg && aussen(ev); });
        dlg.addEventListener("click", (ev) => { if (start && ev.target === dlg && aussen(ev)) this._zu(dlg); start = false; });
      });
    }
    root.getElementById("rahmen").className = schmal ? "schmal" : "";
  }

  // Hinweis unten mit „Rückgängig“ (6 Sekunden)
  _hinweis(text, rueck) {
    const t = this.shadowRoot.getElementById("toast");
    if (!t) return;
    clearTimeout(this._toastTimer);
    t.innerHTML = `<span>${esc(text)}</span>${rueck ? `<button type="button" class="knopf text fett">Rückgängig</button>` : ""}`;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add("an"));
    const zu = () => { t.classList.remove("an"); this._toastTimer = setTimeout(() => { t.hidden = true; }, 250); };
    t.querySelector("button")?.addEventListener("click", async () => {
      clearTimeout(this._toastTimer);
      zu();
      try { await rueck(); this._sagen("Rückgängig gemacht"); } catch (e) { /* Fehler wird angesagt */ }
      await this._lesen();
    });
    this._toastTimer = setTimeout(zu, 6000);
  }

  _menuKnopf() {
    return this._narrow ? `<button type="button" class="menu rund" id="menu" aria-label="Seitenleiste öffnen" style="color:var(--fg)">${ICON.menu}</button>` : "";
  }
  _menuBinden() {
    const m = this.shadowRoot.getElementById("menu");
    if (m) m.onclick = () => this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
  }

  _ansichtHtml(alle, offen) {
    const h = this._tag;
    if (this._ansicht === "einkauf") return this._einkaufHtml();
    if (this._ansicht === "woche") return this._kalAnsicht === "monat" ? this._monatHtml(alle) : this._wocheHtml(alle);
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
    // Heute: alles von heute (auch mit Uhrzeit) plus Aufgaben ohne Datum
    const rest = [...this._sortiert(heuteOffen.filter((a) => !a.top)), ...this._sortiert(offen.filter((a) => !a.datum))];
    const spaeter = offen.filter((a) => a.datum && a.datum > h).sort((a, b) => a.datum.localeCompare(b.datum) || (a.uhrzeit || "99").localeCompare(b.uhrzeit || "99"));
    const fertig = alle.filter((a) => a.status === "erledigt" && (a.erledigt_am || "").slice(0, 10) === h);
    const wiederHeute = alle.filter((a) => a.wiederholung && (a.verlauf || []).includes(h) && a.status === "offen");
    let html = "";
    const jetztUhr = new Date().toTimeString().slice(0, 5);
    const naechste = ueber[0] || this._sortiert(heuteOffen.filter((a) => a.uhrzeit && a.uhrzeit >= jetztUhr))[0] || top[0] || rest[0];
    this._naechste = naechste ? naechste.id : null;
    const kal = this._zeitleiste(offen);
    if (ueber.length) html += this._gruppe("Überfällig", ueber, "", "rot");
    const freie = 3 - top.length;
    if (top.length) html += this._gruppe("Top 3", top, "", "", freie > 0 ? `${freie} ${freie === 1 ? "Platz" : "Plätze"} frei` : "");
    if (this._narrow) html += kal;
    html += this._gruppe(top.length ? "Weitere Aufgaben heute" : "Aufgaben heute", rest, "Für heute ist nichts offen.");
    if (spaeter.length) html += this._gruppe("Demnächst", spaeter);
    const erledigtHeute = [...fertig, ...wiederHeute];
    if (erledigtHeute.length) {
      html += `<details class="zu"><summary>Heute erledigt (${erledigtHeute.length})</summary>
        <ul class="liste">${erledigtHeute.map((a) => this._zeile(a, a.status === "offen")).join("")}</ul></details>`;
    }
    if (this._narrow) return html;
    return `<div class="spalten"><div>${html}</div><aside>${kal}</aside></div>`;
  }

  // ---------- Einkauf (Bring! und andere To-do-Listen) ----------
  _eListeId() {
    const listen = this._daten?.einkauf_listen || [];
    return (listen.find((l) => l.id === this._eListe) || listen[0] || {}).id;
  }

  async _einkaufLaden(still) {
    const liste = this._eListeId();
    if (!liste || this._eLaedt === liste) return;
    this._eLaedt = liste;
    try {
      const items = await this._hass.callWS({ type: "planer/einkauf", liste });
      this._eArtikel = { liste, items, fehler: null };
    } catch (e) {
      this._eArtikel = { liste, items: [], fehler: e.message || "Liste konnte nicht geladen werden." };
    }
    this._eLaedt = null;
    this._eStand = this._hass.states[liste]?.last_updated;
    if (!still || this._ansicht === "einkauf") this._zeichnen();
  }

  _einkaufHtml() {
    const listen = this._daten.einkauf_listen || [];
    const liste = this._eListeId();
    const geladen = this._eArtikel?.liste === liste ? this._eArtikel : null;
    if (!geladen) this._einkaufLaden();
    const name = (listen.find((l) => l.id === liste) || {}).name || "Einkauf";
    const offen = geladen ? geladen.items.filter((x) => !x.erledigt) : [];
    const fertig = geladen ? geladen.items.filter((x) => x.erledigt) : [];
    const zeile = (x) => `<li class="aufgabe ${x.erledigt ? "erledigt" : ""}" data-euid="${esc(x.uid)}">
        <div class="wisch rechts" aria-hidden="true">${ICON.haken}${x.erledigt ? "Zurück" : "Gekauft"}</div><div class="wisch links rot" aria-hidden="true">Löschen${ICON.zu}</div>
        <div class="zeile">
        <button type="button" class="haken" role="checkbox" aria-checked="${x.erledigt}" data-ehaken="${esc(x.uid)}" data-fokus="eh-${esc(x.uid)}" aria-label="${esc(x.text)} ${x.erledigt ? "wieder auf die Liste" : "gekauft"}">${x.erledigt ? HAKEN : ""}</button>
        <div class="inhalt" style="cursor:default"><span class="titel">${esc(x.text)}</span>${x.beschreibung ? `<span class="unter">${esc(x.beschreibung)}</span>` : ""}</div>
        <button type="button" class="weg-knopf" data-eweg="${esc(x.uid)}" data-fokus="ew-${esc(x.uid)}" aria-label="${esc(x.text)} löschen">${ICON.zu}</button>
      </div></li>`;
    return `${listen.length > 1 ? `<div class="seg filterzeile" style="display:flex" role="group" aria-label="Einkaufsliste wählen">${listen.map((l) => `<button type="button" data-eliste="${esc(l.id)}" aria-pressed="${l.id === liste}">${esc(l.name)}</button>`).join("")}</div>` : ""}

      <section class="gruppe" aria-labelledby="e-titel">
        <h2 id="e-titel" class="sr">${esc(name)}, ${offen.length} offen</h2>
        ${geladen?.fehler ? `<p class="leer" role="alert">${esc(geladen.fehler)}</p>` : ""}
        ${!geladen ? `<p class="hinweis" role="status">Liste wird geladen …</p>` : offen.length ? `<ul class="liste gruppiert">${offen.map(zeile).join("")}</ul>` : `<p class="leer">Alles eingekauft.</p>`}
      </section>
      ${fertig.length ? `<details class="zu"><summary>Zuletzt gekauft (${fertig.length})</summary><p class="hinweis">Antippen setzt den Artikel wieder auf die Liste.</p><ul class="liste gruppiert">${fertig.slice(0, 40).map(zeile).join("")}</ul></details>` : ""}`;
  }

  _einkaufBinden(root) {
    const liste = this._eListeId();
    root.querySelectorAll("[data-eliste]").forEach((b) => b.addEventListener("click", () => {
      this._eListe = b.dataset.eliste;
      try { localStorage.setItem("planer.eliste", this._eListe); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    const tun = async (art, uid, text, rueck) => {
      try { await this._ws({ type: "planer/einkauf_aktion", liste, art, uid }); this._sagen(text); }
      catch (err) { this._sagen(err.message || "Das hat nicht geklappt"); return; }
      if (rueck) this._hinweis(text, async () => { await this._ws({ type: "planer/einkauf_aktion", liste, ...rueck }); await this._einkaufLaden(); });
      await this._einkaufLaden();
    };
    root.querySelectorAll("[data-ehaken]").forEach((b) => b.addEventListener("click", () => {
      const x = this._eArtikel.items.find((y) => y.uid === b.dataset.ehaken);
      if (x) tun(x.erledigt ? "offen" : "erledigt", x.uid, x.erledigt ? `${x.text} wieder auf der Liste` : `${x.text} gekauft`,
        x.erledigt ? null : { art: "offen", uid: x.uid });
    }));
    root.querySelectorAll("[data-eweg]").forEach((b) => b.addEventListener("click", () => {
      const x = this._eArtikel.items.find((y) => y.uid === b.dataset.eweg);
      if (x) tun("loeschen", x.uid, `${x.text} gelöscht`, { art: "hinzufuegen", text: x.text, ...(x.beschreibung ? { beschreibung: x.beschreibung } : {}) });
    }));
  }

  _kalenderUmschalter() {
    const m = this._kalAnsicht === "monat";
    const kal = this._daten.kalender || [];
    const an = kal.filter((k) => k.angezeigt !== false).length;
    return `<div class="kalleiste"><div class="seg kalumschalter" role="group" aria-label="Kalenderansicht">
      <button type="button" data-kal-ansicht="monat" data-fokus="ka-m" aria-pressed="${m}">Monat</button>
      <button type="button" data-kal-ansicht="woche" data-fokus="ka-w" aria-pressed="${!m}">Woche</button>
    </div>
    ${kal.length ? `<button type="button" class="knopf kalwahl" data-aktion="kal-wahl" data-fokus="kal-wahl" aria-haspopup="dialog">${ICON.woche}<span>Kalender</span><span class="zahl">${an}/${kal.length}</span></button>` : ""}</div>`;
  }
  _kalNavi(art, heuteText, istJetzt, label) {
    return `<div class="navi" role="group" aria-label="${label}">
      <button type="button" class="rund" data-${art}="-1" data-fokus="${art}-z" aria-label="${art === "monat" ? "Voriger Monat" : "Vorige Woche"}">${ICON.zurueck}</button>
      <button type="button" class="knopf" data-${art}="0" data-fokus="${art}-h" ${istJetzt ? "disabled" : ""}>${heuteText}</button>
      <button type="button" class="rund" data-${art}="1" data-fokus="${art}-v" aria-label="${art === "monat" ? "Nächster Monat" : "Nächste Woche"}">${ICON.vor}</button>
    </div>`;
  }

  _monatHtml(alle) {
    const erster = this._mStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const von = montag(erster);
    const tage = [...Array(42)].map((_, i) => iso(plusTage(von, i)));
    const key = tage[0];
    const termine = this._mTermine?.start === key ? this._mTermine.liste : null;
    if (!termine) this._monatTermineLaden(von, key);
    const am = (tag) => (termine || []).filter((t) => {
      const s0 = t.start.slice(0, 10), e0 = t.ende.slice(0, 10);
      return t.ganztag ? s0 <= tag && tag < e0 : s0 <= tag && tag <= e0;
    });
    const aufg = (tag) => this._sortiert(alle.filter((a) => a.datum === tag && a.status === "offen"));
    const heuteIso = iso(new Date());
    const dieserMonat = erster.getMonth(), dieserJahr = erster.getFullYear();
    const zeilen = tage.slice(35).every((t) => ausIso(t).getMonth() !== dieserMonat) ? 35 : 42;
    return `<section class="gruppe" aria-labelledby="m-titel">
      ${this._kalenderUmschalter()}
      <div class="wkopf"><h2 id="m-titel">${MONATE[dieserMonat]} ${dieserJahr}</h2>${this._kalNavi("monat", "Heute", dieserMonat === new Date().getMonth() && dieserJahr === new Date().getFullYear(), "Monat wechseln")}</div>
      <div class="woche-wrap"><div class="monat" role="grid" aria-labelledby="m-titel">
        ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((n) => `<div class="mkopf" role="columnheader">${n}</div>`).join("")}
        ${tage.slice(0, zeilen).map((t) => {
          const d = ausIso(t);
          const ts = am(t), as = aufg(t);
          const items = [
            ...ts.map((x) => `<span class="mpunkt" style="--k:${this._farbe(x.kalender)}">${x.ganztag ? "" : uhr(x.start) + " "}${esc(x.titel)}</span>`),
            ...as.map((a) => `<span class="mpunkt aufg">${esc(a.titel)}</span>`),
          ];
          const sicht = items.slice(0, 3).join("");
          const rest = items.length > 3 ? `<span class="mmehr">+${items.length - 3}${this._narrow ? "" : " weitere"}</span>` : "";
          return `<button type="button" role="gridcell" class="mtag ${d.getMonth() !== dieserMonat ? "fremd" : ""} ${t === heuteIso ? "heute" : ""}" data-mtag="${t}"
            aria-label="${esc(`${d.getDate()}. ${MONATE[d.getMonth()]}: ${ts.length} Termine, ${as.length} Aufgaben. Tag öffnen`)}">
            <span class="mnr">${d.getDate()}</span>${sicht}${rest}</button>`;
        }).join("")}
      </div></div>
      ${termine === null ? `<p class="hinweis" role="status">Termine werden geladen …</p>` : ""}
      <p class="hinweis">Tippe auf einen Tag, um ihn mit allen Uhrzeiten zu öffnen.</p>
    </section>`;
  }

  async _monatTermineLaden(von, key) {
    if (this._mLaedt === key) return;
    this._mLaedt = key;
    try {
      const liste = await this._hass.callWS({ type: "planer/termine", start: key, ende: iso(plusTage(von, 42)) });
      this._mTermine = { start: key, von: key, bis: iso(plusTage(von, 42)), liste };
    } catch (e) {
      this._mTermine = { start: key, von: key, bis: iso(plusTage(von, 42)), liste: [] };
    }
    this._mLaedt = null;
    if (this._ansicht === "woche" && this._kalAnsicht === "monat") this._zeichnen();
  }

  // Woche als Liste: Starttag (normal heute) oben, dann die nächsten 7 Tage, jeder Tag nach Uhrzeit
  _wocheHtml(alle) {
    const start = this._wStart || ausIso(heute());
    const k = kw(montag(start));
    const tage = [...Array(8)].map((_, i) => iso(plusTage(start, i)));
    const termine = this._wTermine?.start === iso(start) ? this._wTermine.liste : null;
    if (!termine) this._wocheTermineLaden(start);
    const ziele = [...((this._daten.wochen || {})[k]?.ziele || [])];
    while (ziele.length < 3) ziele.push({ text: "", erledigt: false });
    const aufg = (tag) => this._sortiert(alle.filter((a) => a.datum === tag && (a.status === "offen" || (a.erledigt_am || "").slice(0, 10) === tag)));
    const d0 = ausIso(tage[0]), d7 = ausIso(tage[7]);
    const spanne = `${d0.getDate()}. ${d0.getMonth() !== d7.getMonth() ? MONATE[d0.getMonth()] + " " : ""}– ${d7.getDate()}. ${MONATE[d7.getMonth()]}`;
    const eingang = this._sortiert(alle.filter((a) => a.status === "offen" && !a.datum));
    return `<section class="gruppe" aria-labelledby="w-titel">
      ${this._kalenderUmschalter()}
      <div class="wkopf"><h2 id="w-titel">${esc(spanne)}</h2>${this._kalNavi("woche", "Heute", !this._wStart || iso(start) === heute(), "Tage wechseln")}</div>
    </section>
    <span class="sr" id="wt-h">Antippen zeigt den Tag mit Uhrzeiten</span>
    <div class="tagliste" role="list" aria-label="Die nächsten Tage">
      ${tage.map((t) => {
        const d = ausIso(t);
        const ts = this._termineIn(termine || [], t);
        const as = aufg(t);
        return `<section class="wtag kompakt ${t === this._tag ? "heute" : ""}" role="listitem" data-tag="${t}" data-tagauf="${t}" tabindex="0" aria-labelledby="wt-${t}" aria-describedby="wt-h">
          <h3 id="wt-${t}"><span class="wt-name">${t === this._tag ? "Heute" : WOCHENTAGE[wt(d)]}</span><span class="d">${d.getDate()}. ${MONATE[d.getMonth()]}</span></h3>
          ${this._tagKompakt(t, ts, as)}
        </section>`;
      }).join("")}
    </div>
    <section class="gruppe" aria-labelledby="z-titel">
      <h2 id="z-titel">Wochenziele <span class="zahl">KW ${+k.slice(6)}</span></h2>
      <form class="ziele" id="zform" data-kw="${k}">
        ${ziele.slice(0, 3).map((z, i) => `<div class="ziel">
          <span class="nr" aria-hidden="true">${i + 1}</span>
          <label class="sr" for="z-${i}">Wochenziel ${i + 1}</label>
          <input type="text" id="z-${i}" data-fokus="z-${i}" value="${esc(z.text)}" placeholder="${["Was soll diese Woche klappen?", "Zweites Ziel (optional)", "Drittes Ziel (optional)"][i]}">
          <input type="checkbox" id="zc-${i}" ${z.erledigt ? "checked" : ""} aria-label="Wochenziel ${i + 1} erreicht">
        </div>`).join("")}
      </form>
    </section>
    ${termine === null ? `<p class="hinweis" role="status">Termine werden geladen …</p>` : ""}
    ${eingang.length ? `<section class="gruppe" aria-labelledby="ab-titel">
      <h2 id="ab-titel">Aus dem Eingang einplanen</h2>
      <p class="hinweis">${this._narrow ? "Aufgabe antippen und ein Datum wählen." : "Auf einen Tag ziehen oder öffnen und ein Datum wählen."}</p>
      <div class="ablage">${eingang.map((a) => `<button type="button" class="wpunkt a" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}" draggable="true" data-ziehen="${a.id}" data-aktion="oeffnen" data-id="${a.id}">${esc(a.titel)}</button>`).join("")}</div>
    </section>` : ""}`;
  }

  _termineIn(liste, tag) {
    return liste.filter((t) => {
      const s0 = t.start.slice(0, 10), e0 = t.ende.slice(0, 10);
      return t.ganztag ? s0 <= tag && tag < e0 : s0 <= tag && tag <= e0;
    });
  }

  // Ein Tag kompakt (Woche): Ganztägiges, dann Termine und Aufgaben als Chips nach Uhrzeit
  _tagKompakt(tag, ts, as) {
    const ganz = ts.filter((t) => t.ganztag);
    const zeitlich = [
      ...ts.filter((t) => !t.ganztag).map((t) => ({ s: t.start.slice(0, 10) < tag ? "00:00" : uhr(t.start),
        html: `<span class="wpunkt t" style="--k:${this._farbe(t.kalender)}"><span class="zt">${t.start.slice(0, 10) < tag ? "" : uhr(t.start)}</span>${esc(t.titel)}</span>` })),
      ...as.filter((a) => a.uhrzeit).map((a) => ({ s: a.uhrzeit,
        html: `<span class="wpunkt a ${a.status === "erledigt" ? "fertig" : ""}" draggable="${a.status === "offen"}" data-ziehen="${a.id}" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}"><span class="zt">${a.uhrzeit}</span>${esc(a.titel)}</span>` })),
    ].sort((x, y) => x.s.localeCompare(y.s));
    const ohne = as.filter((a) => !a.uhrzeit);
    if (!ganz.length && !zeitlich.length && !ohne.length) return `<p class="wleer">Nichts geplant.</p>`;
    return `<div class="chips">
      ${ganz.map((t) => `<span class="wpunkt t" style="--k:${this._farbe(t.kalender)}">${esc(t.titel)}</span>`).join("")}
      ${zeitlich.map((x) => x.html).join("")}
      ${ohne.map((a) => `<span class="wpunkt a ${a.top ? "top" : ""} ${a.status === "erledigt" ? "fertig" : ""}" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}" draggable="${a.status === "offen"}" data-ziehen="${a.id}">${a.top ? `<span class="z">${a.top}</span>` : ""}${esc(a.titel)}</span>`).join("")}
    </div>`;
  }

  // Ein Tag wie im Google-Kalender: Ganztägiges oben, Aufgaben ohne Uhrzeit, dann Stundenraster mit Blöcken nach Dauer.
  // waehlbar: Raster immer zeigen, Zeitfenster lässt sich ziehen (Tages-Pop-up)
  _tagInhalt(tag, ts, as, hpx, waehlbar = false) {
    const von = this._daten.einst?.tag_von ?? 7, bis = this._daten.einst?.tag_bis ?? 22;
    const zeit = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5);
    const ganz = ts.filter((t) => t.ganztag);
    const ohne = as.filter((a) => !a.uhrzeit);
    const bloecke = [
      ...ts.filter((t) => !t.ganztag).map((t) => ({
        s: t.start.slice(0, 10) < tag ? 0 : zeit(uhr(t.start)), e: t.ende.slice(0, 10) > tag ? 1440 : zeit(uhr(t.ende)),
        html: (stil, hoch) => `<button type="button" class="block t" style="${stil};--k:${this._farbe(t.kalender)}" data-termin="${esc(`${t.kalender}|${t.uid}|${t.start}`)}"
          aria-label="${esc(`${t.titel}, ${uhr(t.start)} bis ${uhr(t.ende)}, ${this._kal(t.kalender).name}`)}"><b>${esc(t.titel)}</b>${hoch ? `<span>${uhr(t.start)}–${uhr(t.ende)}</span>` : ""}</button>`,
      })),
      ...as.filter((a) => a.uhrzeit).map((a) => {
        const s0 = zeit(a.uhrzeit);
        return { s: s0, e: s0 + (a.dauer || 30), html: (stil, hoch) => `<button type="button" class="block a ${a.status === "erledigt" ? "fertig" : ""}" style="${stil};--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}" data-aktion="oeffnen" data-id="${a.id}" draggable="${a.status === "offen"}" data-ziehen="${a.id}"
          aria-label="${esc(`Aufgabe ${a.titel} um ${a.uhrzeit}`)}"><b>${esc(a.titel)}</b>${hoch ? `<span>${a.uhrzeit} · Aufgabe</span>` : ""}</button>` };
      }),
    ].sort((x, y) => x.s - y.s || y.e - x.e);
    const imRaster = bloecke.filter((x) => x.e > von * 60 && x.s < bis * 60);
    const aussen = bloecke.filter((x) => !imRaster.includes(x));
    // Spalten für Überschneidungen
    let gruppe = [], gEnde = -1;
    const fertigGruppe = () => { const n = Math.max(...gruppe.map((x) => x.sp)) + 1; gruppe.forEach((x) => { x.n = n; }); gruppe = []; };
    for (const x of imRaster) {
      if (x.s >= gEnde && gruppe.length) fertigGruppe();
      const belegt = new Set(gruppe.filter((y) => y.e > x.s).map((y) => y.sp));
      x.sp = 0; while (belegt.has(x.sp)) x.sp++;
      gruppe.push(x); gEnde = Math.max(gEnde, x.e);
    }
    if (gruppe.length) fertigGruppe();
    const stunden = bis - von;
    const leer = !ganz.length && !ohne.length && !bloecke.length;
    const jetzt = new Date();
    const jetztMin = jetzt.getHours() * 60 + jetzt.getMinutes();
    let html = "";
    if (ganz.length) html += `<div class="ganztags">${ganz.map((t) => `<button type="button" class="wpunkt t" style="--k:${this._farbe(t.kalender)}" data-termin="${esc(`${t.kalender}|${t.uid}|${t.start}`)}" aria-label="${esc(`${t.titel}, ganztägig`)}">${esc(t.titel)}</button>`).join("")}</div>`;
    if (ohne.length) html += `<div class="ohnezeit">${ohne.map((a) => `<button type="button" class="wpunkt a ${a.top ? "top" : ""} ${a.status === "erledigt" ? "fertig" : ""}" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}" data-aktion="oeffnen" data-id="${a.id}" draggable="${a.status === "offen"}" data-ziehen="${a.id}">${a.top ? `<span class="z">${a.top}</span>` : ""}${esc(a.titel)}</button>`).join("")}</div>`;
    if (aussen.length) html += `<div class="ohnezeit">${aussen.map((x) => x.html("", true).replace('class="block', 'class="wpunkt block-aussen')).join("")}</div>`;
    if (imRaster.length || waehlbar) {
      html += `<div class="raster ${waehlbar ? "waehlbar" : ""}" style="--h:${hpx}px;height:${stunden * hpx}px" data-von="${von}" data-bis="${bis}" data-hpx="${hpx}">
        ${[...Array(stunden)].map((_, i) => `<div class="std" style="top:${i * hpx}px"><span>${String(von + i).padStart(2, "0")}:00</span></div>`).join("")}
        ${imRaster.map((x) => {
          const s0 = Math.max(x.s, von * 60), e0 = Math.min(x.e, bis * 60);
          const top = (s0 - von * 60) / 60 * hpx, hoehe = Math.max(20, (e0 - s0) / 60 * hpx - 2);
          const stil = `top:${top}px;height:${hoehe}px;left:calc(var(--rand) + (100% - var(--rand)) * ${x.sp} / ${x.n});width:calc((100% - var(--rand)) / ${x.n} - 3px)`;
          return x.html(stil, hoehe >= 36);
        }).join("")}
        ${tag === this._tag && jetztMin > von * 60 && jetztMin < bis * 60 ? `<div class="jetztlinie" style="top:${(jetztMin - von * 60) / 60 * hpx}px" aria-hidden="true"></div>` : ""}
      </div>`;
    }
    if (leer && !waehlbar) html += `<p class="wleer">Nichts geplant.</p>`;
    return html;
  }

  // Ein einzelner Tag als Blatt (aus der Monatsansicht)
  async _tagZeigen(tag) {
    this._tagOffen = tag;
    const dlg = this.shadowRoot.getElementById("tagdlg");
    this._tagFuellen();
    this._wischZu(dlg);
    if (!dlg.open) dlg.showModal();
    const vorhanden = [this._mTermine, this._wTermine, this._tTermine].find((c) => c && c.von <= tag && tag < c.bis);
    if (!vorhanden) {
      try {
        const liste = await this._hass.callWS({ type: "planer/termine", start: tag, ende: iso(plusTage(ausIso(tag), 1)) });
        this._tTermine = { von: tag, bis: iso(plusTage(ausIso(tag), 1)), liste };
      } catch (e) { this._tTermine = { von: tag, bis: iso(plusTage(ausIso(tag), 1)), liste: [] }; }
      if (this._tagOffen === tag) this._tagFuellen();
    }
  }

  _tagFuellen() {
    const tag = this._tagOffen;
    const dlg = this.shadowRoot.getElementById("tagdlg");
    if (!tag || !dlg) return;
    const quelle = [this._mTermine, this._wTermine, this._tTermine].find((c) => c && c.von <= tag && tag < c.bis);
    const ts = quelle ? this._termineIn(quelle.liste, tag) : [];
    const as = this._sortiert(this._sichtbar().filter((a) => a.datum === tag && (a.status === "offen" || (a.erledigt_am || "").slice(0, 10) === tag)));
    const d = ausIso(tag);
    const kannTermin = (this._daten.kalender || []).some((k) => k.schreiben);
    dlg.innerHTML = `<form method="dialog" class="tag-blatt">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <span class="l"></span><h2 id="tag-titel">${esc(datumText(tag))}</h2><button type="submit" class="knopf text fett r">Fertig</button></div>
      <div class="tagnavi">
        <button type="button" class="rund" data-tagweiter="-1" aria-label="Vorheriger Tag">${ICON.zurueck}</button>
        <span class="tagname">${WOCHENTAGE[wt(d)]}, ${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}</span>
        <button type="button" class="rund" data-tagweiter="1" aria-label="Nächster Tag">${ICON.vor}</button>
      </div>
      ${quelle ? "" : `<p class="hinweis" role="status">Termine werden geladen …</p>`}
      <p class="hinweis">${this._narrow ? "Auf eine freie Stunde tippen" : "Im Raster ein Zeitfenster ziehen"}, um etwas einzutragen.</p>
      <div class="tag-inhalt">${this._tagInhalt(tag, ts, as, 52, true)}</div>
      ${kannTermin ? `<button type="button" class="knopf" data-tagtermin="1">${ICON.termin}Ganztägig oder mit allen Optionen</button>` : ""}
    </form>`;
    dlg.querySelectorAll("[data-tagweiter]").forEach((b) => b.addEventListener("click", () => this._tagZeigen(iso(plusTage(ausIso(tag), +b.dataset.tagweiter)))));
    dlg.querySelectorAll("[data-aktion=oeffnen]").forEach((b) => b.addEventListener("click", () => { const a = this._finde(b.dataset.id); if (a) this._oeffnen(a); }));
    dlg.querySelector("[data-tagtermin]")?.addEventListener("click", () => this._terminNeu(tag));
    this._terminKlicks(dlg);
    const raster = dlg.querySelector(".raster.waehlbar");
    if (raster) this._rasterWahl(raster, tag);
    dlg.addEventListener("close", () => { this._tagOffen = null; }, { once: true });
  }

  // Zeitfenster im Raster ziehen (Maus) oder freie Stunde antippen (Touch), dann Schnell-Eintrag
  _rasterWahl(raster, tag) {
    const von = +raster.dataset.von, bis = +raster.dataset.bis, hpx = +raster.dataset.hpx;
    const minute = (y) => von * 60 + (y - raster.getBoundingClientRect().top) / hpx * 60;
    const grenzen = (m) => Math.max(von * 60, Math.min(bis * 60, m));
    let a = null, e = null, maus = false, x0 = 0, y0 = 0, sel = null;
    const zeigen = () => {
      if (!sel) { sel = document.createElement("div"); sel.className = "auswahl"; raster.appendChild(sel); }
      const s0 = Math.min(a, e), e0 = Math.max(a, e);
      sel.style.top = `${(s0 - von * 60) / 60 * hpx}px`;
      sel.style.height = `${Math.max(12, (e0 - s0) / 60 * hpx)}px`;
      sel.textContent = `${hhmm(s0)} – ${hhmm(e0)}`;
    };
    const weg = () => {
      sel?.remove(); sel = null; a = null; this._rasterAktiv = false;
      if (this._tagSpaeter) { this._tagSpaeter = false; this._tagFuellen(); }
    };
    raster.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".block") || ev.button > 0) return;
      maus = ev.pointerType === "mouse";
      x0 = ev.clientX; y0 = ev.clientY;
      this._rasterAktiv = true;
      if (maus) {
        a = grenzen(Math.floor(minute(ev.clientY) / 15) * 15); e = grenzen(a + 15);
        raster.setPointerCapture(ev.pointerId); ev.preventDefault(); zeigen();
      } else { a = grenzen(Math.floor(minute(ev.clientY) / 30) * 30); e = grenzen(a + 60); }
    });
    raster.addEventListener("pointermove", (ev) => {
      if (a === null) return;
      if (!maus) { if (Math.abs(ev.clientY - y0) > 10 || Math.abs(ev.clientX - x0) > 10) weg(); return; }
      const m = minute(ev.clientY);
      e = grenzen(m >= a ? Math.ceil(m / 15) * 15 : Math.floor(m / 15) * 15);
      if (e === a) e = grenzen(a + 15);
      zeigen();
    });
    raster.addEventListener("pointercancel", weg);
    raster.addEventListener("pointerup", () => {
      if (a === null) return;
      let s0 = Math.min(a, e), e0 = Math.max(a, e);
      if (maus && e0 - s0 <= 15 && Math.abs(e - a) <= 15 && !sel?.dataset.gezogen) e0 = Math.min(bis * 60, s0 + 60);
      if (e0 <= s0) e0 = Math.min(24 * 60 - 1, s0 + 60);
      a = s0; e = e0; zeigen();
      this._schnellEintrag(tag, hhmm(s0), hhmm(e0), weg);
    });
  }

  _schnellEintrag(tag, von, bis, fertig) {
    const dlg = this.shadowRoot.getElementById("schnelldlg");
    const d = this._daten;
    const schreibbar = (d.kalender || []).filter((k) => k.schreiben);
    let zuletzt = null;
    try { zuletzt = localStorage.getItem("planer.kalender"); } catch (e) { /* egal */ }
    const eigene = [d.einst.standard_kalender, zuletzt].find((x) => schreibbar.some((k) => k.id === x)) || schreibbar[0]?.id;
    let art = schreibbar.length ? "termin" : "aufgabe";
    const dd = ausIso(tag);
    dlg.innerHTML = `<form method="dialog" id="qform" novalidate>
      <div class="q-kopf"><span></span><button type="button" class="rund" id="q-zu" aria-label="Schließen">${ICON.zu}</button></div>
      <label class="sr" for="q-titel">Titel</label>
      <input id="q-titel" class="q-titel" placeholder="Titel hinzufügen" autocomplete="off" enterkeyhint="done">
      <div class="seg q-art" role="radiogroup" aria-label="Art">
        <button type="button" role="radio" data-art="termin" ${schreibbar.length ? "" : "disabled"}>Termin</button>
        <button type="button" role="radio" data-art="aufgabe">Aufgabe</button>
      </div>
      <div class="q-zeile">${ICON.demnaechst}<div>
        <div>${WOCHENTAGE[wt(dd)]}, ${dd.getDate()}. ${MONATE[dd.getMonth()]}</div>
        <div class="q-zeiten"><label class="sr" for="q-von">Von</label><input id="q-von" type="time" value="${von}"> – <label class="sr" for="q-bis">Bis</label><input id="q-bis" type="time" value="${bis}"></div>
      </div></div>
      ${schreibbar.length ? `<div class="q-zeile" id="q-kal-z">${ICON.woche}<div class="feld"><label class="sr" for="q-kal">Kalender</label><select id="q-kal">
        ${schreibbar.map((k) => `<option value="${esc(k.id)}" ${k.id === eigene ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></div></div>` : ""}
      <p class="fehler" id="q-fehler" role="alert"></p>
      <div class="q-fuss"><button type="button" class="knopf text" id="q-mehr">Weitere Optionen</button><button type="submit" class="knopf primaer">Speichern</button></div>
    </form>`;
    const $ = (id) => dlg.querySelector(`#${id}`);
    const artSetzen = (x) => {
      art = x;
      dlg.querySelectorAll("[data-art]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.art === art)));
      if ($("q-kal-z")) $("q-kal-z").hidden = art !== "termin";
    };
    artSetzen(art);
    dlg.querySelectorAll("[data-art]").forEach((b) => b.addEventListener("click", () => artSetzen(b.dataset.art)));
    $("q-zu").addEventListener("click", () => this._zu(dlg));
    dlg.addEventListener("close", () => fertig?.(), { once: true });
    const minuten = () => { const z = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5); return z($("q-bis").value) - z($("q-von").value); };
    $("q-mehr").addEventListener("click", () => {
      const titel = $("q-titel").value.trim();
      this._zu(dlg);
      if (art === "termin") this._terminNeu(tag, $("q-von").value, $("q-bis").value, titel, $("q-kal")?.value);
      else this._oeffnen({ titel, teilaufgaben: [], datum: tag, uhrzeit: $("q-von").value, dauer: Math.max(5, minuten()) || null, person: d.ich });
    });
    $("qform").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const titel = $("q-titel").value.trim() || (art === "termin" ? "" : "");
      if (!titel) { $("q-fehler").textContent = "Bitte einen Titel eingeben."; $("q-titel").focus(); return; }
      if (minuten() <= 0) { $("q-fehler").textContent = "„Bis“ muss nach „Von“ liegen."; return; }
      try {
        if (art === "termin") {
          await this._hass.callWS({ type: "planer/termin_anlegen", kalender: $("q-kal").value,
            termin: { titel, ganztag: false, ort: "", beschreibung: "", start: `${tag}T${$("q-von").value}`, ende: `${tag}T${$("q-bis").value}` } });
        } else {
          await this._hass.callWS({ type: "planer/speichern", aufgabe: { titel, datum: tag, uhrzeit: $("q-von").value, dauer: minuten(), person: d.ich } });
        }
      } catch (err) { $("q-fehler").textContent = err.message || "Speichern hat nicht geklappt."; return; }
      this._zu(dlg);
      this._sagen(`${art === "termin" ? "Termin" : "Aufgabe"} eingetragen: ${titel}, ${datumText(tag)} ${$("q-von").value}`);
      if (art === "termin") await this._termineNeu(tag); else await this._lesen();
    });
    dlg.showModal();
    $("q-titel").focus();
  }

  // Nach einem neuen Termin alle Termin-Zwischenspeicher neu laden
  async _termineNeu(tag) {
    this._mTermine = null; this._wTermine = null; this._tTermine = null; this._sTermine = null;
    await this._termineLaden();
    if (tag && this._tagOffen === tag) this._tagZeigen(tag);
  }

  async _wocheTermineLaden(start) {
    const key = iso(start);
    if (this._wLaedt === key) return;
    this._wLaedt = key;
    try {
      const liste = await this._hass.callWS({ type: "planer/termine", start: key, ende: iso(plusTage(start, 8)) });
      this._wTermine = { start: key, von: key, bis: iso(plusTage(start, 8)), liste };
    } catch (e) {
      this._wTermine = { start: key, von: key, bis: iso(plusTage(start, 8)), liste: [] };
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
      <span class="zeit">${esc(zeit)}</span><span class="was">${esc(t.titel)}${t.wiederholt ? ` ${ICON.wdh}` : ""}</span>
      <span class="wo">${esc(k.name)}${t.ort ? ` · ${esc(t.ort)}` : ""}</span>
    </button></li>`;
  }

  // Heute als Zeitleiste: Termine und Aufgaben mit Uhrzeit, Linie „Jetzt“, freie Zeit bis Tagesende
  // Zeitleiste: heute mit Jetzt-Markierung, dazu die nächsten Tage; scrollt in sich
  _zeitleiste(offen) {
    const h = this._tag;
    const zeit = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5);
    const jetzt = new Date();
    const jetztMin = jetzt.getHours() * 60 + jetzt.getMinutes();
    const bisStd = this._daten.einst?.tag_bis ?? 22;
    const tlKal = this._daten.einst?.kalender_zeitleiste;
    const tagDaten = (tag) => {
      const termine = this._termineAm(tag).filter((t) => tlKal == null || tlKal.includes(t.kalender));
      const eintraege = [
        ...termine.filter((t) => !t.ganztag).map((t) => {
          const s0 = t.start.slice(0, 10) < tag ? 0 : zeit(uhr(t.start));
          const e0 = t.ende.slice(0, 10) > tag ? 1440 : zeit(uhr(t.ende));
          return { s: s0, e: e0, html: this._terminZeile(t, tag) };
        }),
        ...offen.filter((a) => a.datum === tag && a.uhrzeit).map((a) => {
          const s0 = zeit(a.uhrzeit);
          const e0 = s0 + (a.dauer || 0);
          const bis = a.dauer ? ` – ${hhmm(e0)}` : "";
          return { s: s0, e: Math.max(e0, s0 + 1), html: `<li class="tl-aufgabe ${a.top ? "top" : ""}" data-id="${a.id}">
            <button type="button" class="haken" role="checkbox" aria-checked="false" data-aktion="haken" data-id="${a.id}" aria-label="${esc(a.titel)} erledigt"></button>
            <button type="button" class="inhalt" data-aktion="oeffnen" data-id="${a.id}">
              <span class="zeit">${a.uhrzeit}${bis}</span><span class="titel">${esc(a.titel)}</span>
              <span class="unter">Aufgabe${a.top ? ` · Top ${a.top}` : ""}${a.bereich ? ` · ${esc(a.bereich)}` : ""}</span></button></li>` };
        }),
      ].sort((x, y) => x.s - y.s);
      return { ganz: termine.filter((t) => t.ganztag), eintraege };
    };
    // Heute
    const heuteD = tagDaten(h);
    let html = "", jetztGesetzt = false;
    for (const x of heuteD.eintraege) {
      if (!jetztGesetzt && x.s >= jetztMin) { html += `<li class="jetzt"><span>Jetzt ${hhmm(jetztMin)}</span></li>`; jetztGesetzt = true; }
      html += x.e <= jetztMin ? x.html.replace(/^<li( class="([^"]*)")?/, (m, _k, k) => `<li class="${k || ""} vorbei"`) : x.html;
    }
    if (heuteD.eintraege.length && !jetztGesetzt) html += `<li class="jetzt"><span>Jetzt ${hhmm(jetztMin)}</span></li>`;
    // freie Zeit von jetzt (frühestens Tagesbeginn) bis Tagesende
    const von = Math.max((this._daten.einst?.tag_von ?? 7) * 60, jetztMin);
    const bis = bisStd * 60;
    const belegt = heuteD.eintraege.map((x) => [Math.max(x.s, von), Math.min(x.e, bis)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let frei = Math.max(0, bis - von), ende = von;
    for (const [a, b] of belegt) { const a2 = Math.max(a, ende); if (b > a2) { frei -= b - a2; ende = b; } }
    const freiText = frei <= 0 ? `Heute ist bis ${bisStd} Uhr nichts mehr frei.` : `Frei bis ${bisStd} Uhr: ${Math.floor(frei / 60) ? `${Math.floor(frei / 60)} Std. ` : ""}${frei % 60 ? `${frei % 60} Min.` : ""}`.trim();
    const keineKal = !(this._daten.kalender || []).length;
    const tagBlock = (tag, titel, inhalt, ganz) => `<div class="tl-tag" aria-label="${esc(titel)}">
        <h3 class="tl-kopf">${esc(titel)}</h3>
        ${ganz.length ? `<ul class="termine ganztag" aria-label="Ganztägig">${ganz.map((t) => this._terminZeile(t, tag)).join("")}</ul>` : ""}
        ${inhalt}
      </div>`;
    let tageHtml = tagBlock(h, `Heute, ${datumKurz(h)}`, heuteD.eintraege.length ? `<ul class="zeitleiste">${html}</ul>`
      : `<p class="leer">${keineKal ? "Noch kein Kalender sichtbar. In HA eingebundene Kalender erscheinen hier automatisch." : "Heute nichts mit Uhrzeit."}</p>`, heuteD.ganz)
      + `<p class="frei">${esc(freiText)}</p>`;
    for (let i = 1; i <= 14; i++) {
      const tag = iso(plusTage(ausIso(h), i));
      const d = tagDaten(tag);
      if (!d.ganz.length && !d.eintraege.length) continue;
      const name = i === 1 ? "Morgen" : WOCHENTAGE[wt(ausIso(tag))];
      tageHtml += tagBlock(tag, `${name}, ${datumKurz(tag)}`, d.eintraege.length ? `<ul class="zeitleiste">${d.eintraege.map((x) => x.html).join("")}</ul>` : "", d.ganz);
    }
    return `<section class="kal gruppe" aria-labelledby="g-kal">
      <h2 id="g-kal">Zeitleiste <span class="zahl">14 Tage</span></h2>
      ${this._kalFehler ? `<p class="fehler">${esc(this._kalFehler)}</p>` : ""}
      <div class="tl-scroll" tabindex="0" aria-label="Zeitleiste, scrollbar">${tageHtml}</div>
    </section>`;
  }

  _gruppe(titel, liste, leer = "", art = "", zusatz = "") {
    const id = `g-${titel.replace(/\W+/g, "-").toLowerCase()}`;
    const knopf = art === "rot" && liste.length
      ? `<button type="button" class="knopf klein rot-knopf" data-aktion="alle-heute" data-fokus="alle-heute">Alle auf heute</button>` : "";
    return `<section class="gruppe ${art === "rot" ? "ueberfaellig" : ""}" aria-labelledby="${id}">
      <div class="gkopf"><h2 id="${id}">${esc(titel)} ${titel === "Top 3" ? "" : `<span class="zahl">${liste.length || ""}</span>`}${zusatz ? ` <span class="chip">${esc(zusatz)}</span>` : ""}</h2>${knopf}</div>
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
      meta.push(`<span class="chip ${fertigT === teile.length ? "mint" : ""}">${ICON.teile}${fertigT}/${teile.length}<span class="sr"> Teilaufgaben erledigt</span></span>`);
      const naechster = teile.find((t) => !t.erledigt);
      if (naechster && !fertig) meta.push(`<span class="chip">Nächster Schritt: ${esc(naechster.text)}</span>`);
    }
    if (a.wiederholung) meta.push(`<span class="chip mint">${ICON.wdh}${esc(regelText(a.wiederholung))}</span>`);
    if (a.verschoben > 0) meta.push(`<span class="chip warn">${a.verschoben}× verschoben</span>`);
    const morgen = !fertig && !this._narrow ? `<button type="button" class="knopf klein" data-aktion="morgen" data-id="${a.id}" data-fokus="m-${a.id}" aria-label="${esc(a.titel)} auf morgen verschieben">Morgen</button>` : "";
    return `<li class="aufgabe ${a.top && !fertig ? "top" : ""} ${fertig ? "erledigt" : ""} ${a.bereich ? "farbig" : ""}" data-id="${a.id}" ${a.bereich ? `style="--b:${farbe}"` : ""}>
      <div class="wisch rechts" aria-hidden="true">${ICON.haken}Erledigt</div><div class="wisch links" aria-hidden="true">Verschieben${ICON.pfeil}</div>
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
    if (!s.value.trim() || this._ansicht === "einkauf") { v.innerHTML = ""; return; }
    const p = parse(s.value, this._daten.personen);
    const teile = [];
    teile.push(`<span class="chip">${esc(p.datum === undefined || p.datum === null ? "Eingang" : datumText(p.datum))}</span>`);
    if (p.uhrzeit) teile.push(`<span class="chip">${p.uhrzeit} Uhr</span>`);
    if (p.top) teile.push(`<span class="chip mint">Top ${p.top}</span>`);
    if (p.bereich) teile.push(`<span class="chip">#${esc(p.bereich)}</span>`);
    if (p.person) teile.push(`<span class="chip">${esc(this._name(p.person))}</span>`);
    if (p.wiederholung) teile.push(`<span class="chip mint">${ICON.wdh}${esc(regelText(p.wiederholung))}</span>`);
    v.innerHTML = teile.join("");
  }

  // ---------- Bedienung ----------
  _binden() {
    const root = this.shadowRoot;
    this._menuBinden();
    root.getElementById("schnell").addEventListener("input", () => this._vorschau());
    root.getElementById("schnellform").addEventListener("submit", (e) => { e.preventDefault(); this._schnellAnlegen(); });
    this._app.querySelectorAll("[data-ansicht]").forEach((b) => b.addEventListener("click", () => {
      this._ansicht = b.dataset.ansicht;
      if (!root.getElementById("schnell")?.value.trim()) this._eingabeOffen = false;
      try { localStorage.setItem("planer.ansicht", this._ansicht); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    this._app.querySelectorAll("[data-bereich]").forEach((b) => b.addEventListener("click", () => {
      this._bereich = b.dataset.bereich;
      try { localStorage.setItem("planer.bereich", this._bereich); } catch (e) { /* egal */ }
      this._zeichnen();
      this._sagen(this._bereich ? `Nur Bereich ${this._bereich}` : "Alle Bereiche");
    }));
    root.getElementById("bwahl")?.addEventListener("change", (e) => {
      this._bereich = e.target.value;
      try { localStorage.setItem("planer.bereich", this._bereich); } catch (err) { /* egal */ }
      this._zeichnen();
      this._sagen(this._bereich ? `Nur Bereich ${this._bereich}` : "Alle Bereiche");
    });
    this._app.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      this._filter = b.dataset.filter;
      try { localStorage.setItem("planer.filter", this._filter); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    this._app.querySelectorAll("[data-aktion]").forEach((b) => b.addEventListener("click", () => this._aktion(b.dataset.aktion, b.dataset.id)));
    this._app.querySelectorAll("li.aufgabe").forEach((li) => this._wischen(li));
    this._einkaufBinden(root);
    this._app.querySelectorAll("[data-kal-ansicht]").forEach((b) => b.addEventListener("click", () => {
      this._kalAnsicht = b.dataset.kalAnsicht;
      try { localStorage.setItem("planer.kalansicht", this._kalAnsicht); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    this._app.querySelectorAll("[data-monat]").forEach((b) => b.addEventListener("click", () => {
      const n = +b.dataset.monat;
      const jetzt = new Date();
      const e = this._mStart || new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
      this._mStart = n === 0 ? new Date(jetzt.getFullYear(), jetzt.getMonth(), 1) : new Date(e.getFullYear(), e.getMonth() + n, 1);
      this._zeichnen();
      this._sagen(`${MONATE[this._mStart.getMonth()]} ${this._mStart.getFullYear()}`);
    }));
    this._app.querySelectorAll("[data-mtag]").forEach((b) => b.addEventListener("click", () => this._tagZeigen(b.dataset.mtag)));
    this._app.querySelectorAll("[data-tagauf]").forEach((b) => {
      b.addEventListener("click", () => this._tagZeigen(b.dataset.tagauf));
      b.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this._tagZeigen(b.dataset.tagauf); } });
    });
    this._app.querySelectorAll("[data-woche]").forEach((b) => b.addEventListener("click", () => {
      const n = +b.dataset.woche;
      this._wStart = n === 0 ? null : plusTage(this._wStart || ausIso(heute()), 7 * n);
      this._zeichnen();
      const st = this._wStart || ausIso(heute());
      this._sagen(`${datumText(iso(st))} bis ${datumText(iso(plusTage(st, 7)))}`);
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
    this._app.querySelectorAll("[data-ziehen]").forEach((el) => el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", el.dataset.ziehen);
      e.dataTransfer.effectAllowed = "move";
    }));
    this._app.querySelectorAll(".wtag").forEach((tag) => {
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
    this._terminKlicks(this._app);
  }

  _alleTermine() {
    return [...(this._termine || []), ...(this._wTermine?.liste || []), ...(this._mTermine?.liste || []), ...(this._tTermine?.liste || []), ...(this._sTermine || [])];
  }
  _terminKlicks(wurzel) {
    wurzel.querySelectorAll("[data-termin]").forEach((b) => b.addEventListener("click", () => {
      const t = this._alleTermine().find((x) => `${x.kalender}|${x.uid}|${x.start}` === b.dataset.termin);
      if (t) this._terminZeigen(t);
    }));
  }

  _taste(e) {
    if (e.key !== "n" && e.key !== "N" && e.key !== "/") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const pfad = e.composedPath();
    if (pfad.some((el) => el instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable))) return;
    if (!pfad.includes(this)) return;
    if (this.shadowRoot.querySelector("dialog[open]")) return;
    e.preventDefault();
    if (e.key === "/") { this._suche(); return; }
    if (this._narrow && !this._eingabeOffen) { this._aktion("neu"); return; }
    this.shadowRoot.getElementById("schnell")?.focus();
  }

  async _schnellAnlegen() {
    const s = this.shadowRoot.getElementById("schnell");
    if (this._ansicht === "einkauf") {
      const roh = s.value.trim();
      const liste = this._eListeId();
      if (!roh || !liste) { this._sagen("Bitte einen Artikel eingeben."); return; }
      const i = roh.indexOf(",");
      const text = i > 0 ? roh.slice(0, i).trim() : roh;
      const beschreibung = i > 0 ? roh.slice(i + 1).trim() : "";
      s.value = "";
      try {
        await this._ws({ type: "planer/einkauf_aktion", liste, art: "hinzufuegen", text, ...(beschreibung ? { beschreibung } : {}) });
        this._sagen(`${text} hinzugefügt`);
      } catch (err) { /* angesagt */ }
      await this._einkaufLaden();
      this.shadowRoot.getElementById("schnell")?.focus();
      return;
    }
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
    if (art === "kal-wahl") return this._kalenderWahl();
    if (art === "erweitert") return this._erweitert();
    if (art === "neu" || art === "eingabe-zu") {
      this._eingabeOffen = art === "neu";
      if (!this._eingabeOffen) { const s = this.shadowRoot.getElementById("schnell"); if (s) s.value = ""; }
      this._zeichnen();
      if (this._eingabeOffen) { this.shadowRoot.getElementById("schnell")?.focus(); this.scrollIntoView?.({ block: "start" }); }
      else this.shadowRoot.querySelector(".fab")?.focus();
      return;
    }
    if (art === "suche") return this._suche();
    if (art === "alle-heute") return this._alleAufHeute();
    if (!a) return;
    if (art === "oeffnen") return this._oeffnen(a);
    if (art === "haken") {
      const jetztErledigt = !(a.status === "erledigt" || (a.wiederholung && (a.verlauf || []).includes(this._tag) && a.datum > this._tag));
      if (!jetztErledigt && a.wiederholung) { this._sagen("Wiederkehrende Aufgabe ist schon auf den nächsten Termin gesetzt."); return; }
      const vorher = { datum: a.datum || null, top: a.top || null };
      this._abhakAnimation(a.id);
      const neu = await this._ws({ type: "planer/erledigen", aufgabe_id: a.id, erledigt: jetztErledigt });
      const text = jetztErledigt
        ? (neu.status === "offen" && neu.wiederholung ? `Erledigt: ${a.titel}. Nächstes Mal ${datumText(neu.datum)}.` : `Erledigt: ${a.titel}`)
        : `Wieder offen: ${a.titel}`;
      this._sagen(text);
      if (jetztErledigt) this._hinweis(text, () => this._ws({ type: "planer/erledigen", aufgabe_id: a.id, erledigt: false, rueckgaengig: vorher }));
      await this._lesen();
      return;
    }
    if (art === "morgen") {
      const basis = a.datum && a.datum > this._tag ? ausIso(a.datum) : new Date();
      return this._verschieben(a, iso(plusTage(basis, 1)));
    }
    if (art === "verschieben") return this._verschiebenWahl(a);
  }

  async _verschieben(a, datum) {
    const vorher = { datum: a.datum || null, top: a.top || null };
    await this._ws({ type: "planer/speichern", aufgabe: { id: a.id, datum, top: null } });
    const text = datum ? `${a.titel} auf ${datumText(datum)} verschoben` : `${a.titel} in den Eingang gelegt`;
    this._sagen(text);
    this._hinweis(text, () => this._ws({ type: "planer/speichern", aufgabe: { id: a.id, ...vorher } }));
    await this._lesen();
  }

  // Auswahl „Verschieben“ als kleines Blatt
  // Welche Kalender angezeigt werden – jede Person für sich
  _kalenderWahl() {
    const dlg = this.shadowRoot.getElementById("wahldlg");
    const kal = this._daten.kalender || [];
    dlg.innerHTML = `<form method="dialog" class="wahl-blatt">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}<span class="l"></span><h2 id="wahl-titel">Kalender anzeigen</h2><button type="submit" class="knopf text fett r">Fertig</button></div>
      <p class="hinweis">Gilt nur für dich. Ausgeblendete Kalender erscheinen nirgends im Planer, auch nicht in der Zeitleiste.</p>
      <div class="wahlliste kalliste">${kal.map((k) => `<label class="wahlzeile kalzeile"><span class="punkt" style="--b:${this._farbe(k.id)}" aria-hidden="true"></span><span class="n">${esc(k.name)}</span>
        <input type="checkbox" class="schalter" value="${esc(k.id)}" ${k.angezeigt !== false ? "checked" : ""}></label>`).join("")}</div>
      <p class="fehler" role="alert" id="kw-fehler"></p>
    </form>`;
    dlg.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", async () => {
      const aus = [...dlg.querySelectorAll("input[type=checkbox]:not(:checked)")].map((x) => x.value);
      try {
        await this._hass.callWS({ type: "planer/kalender_anzeige", aus });
        dlg.querySelector("#kw-fehler").textContent = "";
      } catch (e) { dlg.querySelector("#kw-fehler").textContent = e.message || "Speichern hat nicht geklappt."; c.checked = !c.checked; return; }
      kal.forEach((k) => { k.angezeigt = !aus.includes(k.id); });
      this._sagen(`${c.closest("label").textContent.trim()} ${c.checked ? "eingeblendet" : "ausgeblendet"}`);
      await this._termineNeu();
      this._lesen();
    }));
    this._wischZu(dlg);
    dlg.showModal();
  }

  _verschiebenWahl(a) {
    const dlg = this.shadowRoot.getElementById("wahldlg");
    const basis = new Date();
    const mo = (() => { const d = plusTage(basis, 1); while (wt(d) !== 0) d.setDate(d.getDate() + 1); return d; })();
    const wahl = [
      ["Morgen", iso(plusTage(basis, 1))],
      ["Übermorgen", iso(plusTage(basis, 2))],
      [`Nächsten Montag (${mo.getDate()}.${mo.getMonth() + 1}.)`, iso(mo)],
      ["In einer Woche", iso(plusTage(basis, 7))],
      ["Ohne Datum (steht unter Heute)", ""],
    ];
    dlg.innerHTML = `<form method="dialog" class="wahl-blatt">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}<span class="l"></span><h2 id="wahl-titel">Verschieben</h2><button type="submit" class="knopf text fett r">Abbrechen</button></div>
      <p class="hinweis">${esc(a.titel)}</p>
      <div class="wahlliste">${wahl.map(([t, d]) => `<button type="button" class="wahlzeile" data-auf="${d}">${esc(t)}</button>`).join("")}
        <label class="wahlzeile datumwahl"><span>Datum wählen</span><input type="date" id="w-datum" value="${esc(a.datum || "")}"></label>
      </div>
    </form>`;
    const fertig = (d) => { this._zu(dlg); this._verschieben(a, d || null); };
    dlg.querySelectorAll("[data-auf]").forEach((b) => b.addEventListener("click", () => fertig(b.dataset.auf)));
    dlg.querySelector("#w-datum").addEventListener("change", (e) => { if (e.target.value) fertig(e.target.value); });
    this._wischZu(dlg);
    dlg.showModal();
    dlg.querySelector("[data-auf]").focus();
  }

  // Suche über Aufgaben, Termine (60 Tage zurück, 180 voraus) und die Einkaufsliste
  async _suche() {
    const dlg = this.shadowRoot.getElementById("suchdlg");
    dlg.innerHTML = `<form method="dialog" class="such-blatt" autocomplete="off">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}<span class="l"></span><h2 id="such-titel">Suchen</h2><button type="submit" class="knopf text fett r">Fertig</button></div>
      <div class="suchfeld">${ICON.suche}<label class="sr" for="such-q">Suchbegriff</label><input id="such-q" type="search" placeholder="Aufgaben, Termine, Einkauf" enterkeyhint="search"></div>
      <div id="such-erg" aria-live="polite"></div>
    </form>`;
    const q = dlg.querySelector("#such-q"), erg = dlg.querySelector("#such-erg");
    dlg.querySelector("form").addEventListener("submit", (e) => { if (e.submitter?.classList.contains("r")) return; e.preventDefault(); });
    const zeigen = () => {
      const w = q.value.trim().toLowerCase();
      if (w.length < 2) { erg.innerHTML = `<p class="hinweis">Mindestens zwei Buchstaben eingeben.</p>`; return; }
      const passt = (...t) => t.some((x) => String(x || "").toLowerCase().includes(w));
      const aufg = this._sichtbar().filter((a) => passt(a.titel, a.notiz, a.bereich, ...(a.tags || []), ...(a.teilaufgaben || []).map((t) => t.text)))
        .sort((a, b) => (a.status === "offen" ? 0 : 1) - (b.status === "offen" ? 0 : 1) || (a.datum || "9").localeCompare(b.datum || "9")).slice(0, 30);
      const gesehen = new Set();
      const termine = (this._sTermine || []).filter((t) => passt(t.titel, t.ort, t.beschreibung))
        .filter((t) => { const k = `${t.kalender}|${t.uid}|${t.start}`; if (gesehen.has(k)) return false; gesehen.add(k); return true; })
        .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 30);
      const einkauf = (this._eArtikel?.items || []).filter((x) => passt(x.text, x.beschreibung)).slice(0, 20);
      const teil = (titel, inhalt) => inhalt ? `<section class="gruppe"><h3>${titel}</h3><ul class="liste gruppiert">${inhalt}</ul></section>` : "";
      const html = teil("Aufgaben", aufg.map((a) => `<li><button type="button" class="treffer" data-sa="${a.id}"><span class="titel">${esc(a.titel)}</span><span class="unter">${a.status === "erledigt" ? "Erledigt" : a.datum ? esc(datumText(a.datum)) : "Ohne Datum"}${a.uhrzeit ? `, ${a.uhrzeit} Uhr` : ""}${a.bereich ? ` · ${esc(a.bereich)}` : ""}</span></button></li>`).join(""))
        + teil("Termine", termine.map((t) => `<li><button type="button" class="treffer" data-st="${esc(`${t.kalender}|${t.uid}|${t.start}`)}"><span class="titel">${esc(t.titel)}</span><span class="unter">${esc(datumText(t.start.slice(0, 10)))}${t.ganztag ? "" : `, ${uhr(t.start)} Uhr`} · ${esc(this._kal(t.kalender).name)}</span></button></li>`).join(""))
        + teil("Einkauf", einkauf.map((x) => `<li><button type="button" class="treffer" data-se="1"><span class="titel">${esc(x.text)}</span><span class="unter">${x.erledigt ? "Gekauft" : "Auf der Liste"}${x.beschreibung ? ` · ${esc(x.beschreibung)}` : ""}</span></button></li>`).join(""));
      erg.innerHTML = html || `<p class="leer">Nichts gefunden für „${esc(q.value.trim())}“.</p>`;
      erg.querySelectorAll("[data-sa]").forEach((b) => b.addEventListener("click", () => { const a = this._finde(b.dataset.sa); if (a) this._oeffnen(a); }));
      erg.querySelectorAll("[data-st]").forEach((b) => b.addEventListener("click", () => { const t = this._alleTermine().find((x) => `${x.kalender}|${x.uid}|${x.start}` === b.dataset.st); if (t) this._terminZeigen(t); }));
      erg.querySelectorAll("[data-se]").forEach((b) => b.addEventListener("click", () => { this._zu(dlg); this._ansicht = "einkauf"; this._zeichnen(); }));
    };
    q.addEventListener("input", zeigen);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
    zeigen();
    this._wischZu(dlg);
    dlg.showModal();
    q.focus();
    if (!this._eArtikel && this._eListeId()) this._einkaufLaden(true).then(() => zeigen());
    if (!this._sTermine) {
      erg.insertAdjacentHTML("beforeend", `<p class="hinweis" id="such-laden">Termine werden geladen …</p>`);
      try {
        this._sTermine = await this._hass.callWS({ type: "planer/termine", start: iso(plusTage(new Date(), -60)), ende: iso(plusTage(new Date(), 180)) });
      } catch (e) { this._sTermine = []; }
      zeigen();
    }
  }

  async _alleAufHeute() {
    const h = this._tag;
    const ueber = this._sichtbar().filter((a) => a.status === "offen" && a.datum && a.datum < h);
    if (!ueber.length) return;
    const vorher = ueber.map((a) => ({ id: a.id, datum: a.datum, top: a.top || null }));
    for (const a of ueber) await this._ws({ type: "planer/speichern", aufgabe: { id: a.id, datum: h, top: null } });
    const text = `${ueber.length} ${ueber.length === 1 ? "Aufgabe" : "Aufgaben"} auf heute geschoben`;
    this._sagen(text);
    this._hinweis(text, async () => { for (const v of vorher) await this._ws({ type: "planer/speichern", aufgabe: v }); });
    await this._lesen();
  }

  // Dialog mit Ausblend-Animation schließen
  _zu(dlg) {
    if (!dlg.open) return;
    try { dlg._vorZu?.(); } catch (e) { /* Speichern meldet Fehler selbst */ }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { dlg.close(); return; }
    dlg.classList.add("schliesst");
    setTimeout(() => { dlg.close(); dlg.classList.remove("schliesst"); }, 200);
  }

  _abhakAnimation(id) {
    const li = this._app?.querySelector(`li.aufgabe[data-id="${CSS_escape(id)}"]`);
    li?.classList.add("abgehakt");
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
      if (li.dataset.euid) {
        if (dx > 90) li.querySelector("[data-ehaken]")?.click();
        else if (dx < -90) li.querySelector("[data-eweg]")?.click();
        return;
      }
      if (dx > 90) this._aktion("haken", id);
      else if (dx < -90 && !li.classList.contains("erledigt")) this._aktion("verschieben", id);
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
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        ${a.id ? '<span class="l stand" id="b-stand" aria-live="polite"></span>' : '<button type="button" class="knopf text l" id="b-abbrechen">Abbrechen</button>'}
        <h2 id="blatt-titel">${a.id ? "Aufgabe" : "Neue Aufgabe"}</h2>
        <button type="submit" class="knopf text fett r">${a.id ? "Fertig" : "Hinzufügen"}</button>
      </div>
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
          <button type="button" class="knopf klein" data-tag="eingang">Ohne Datum</button>
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
      ${erinnHtml("be", a.id ? a.erinnerungen : (a.erinnerungen ?? []), d.einst.erinnerungen)}
      <p class="hinweis">Ohne Uhrzeit wird um 9:00 Uhr am Fälligkeitstag gerechnet. Erinnert wird nur, wenn für die Person ein Handy eingestellt ist.</p>
      <div class="feld"><label for="b-notiz">Notiz</label><textarea id="b-notiz">${esc(a.notiz || "")}</textarea></div>
      <p class="fehler" id="b-fehler" role="alert"></p>
      ${a.id ? `<div class="fuss"><button type="button" class="knopf gefahr" id="b-loeschen" style="width:100%">Aufgabe löschen</button></div>` : ""}
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
    const wannZiel = (b) => (b.dataset.tag === "eingang" ? "" : iso(plusTage(new Date(), +b.dataset.tag)));
    const wannZeigen = () => dlg.querySelectorAll("[data-tag]").forEach((b) => b.setAttribute("aria-pressed", String(wannZiel(b) === $("b-datum").value)));
    dlg.querySelectorAll("[data-tag]").forEach((b) => b.addEventListener("click", () => {
      $("b-datum").value = wannZiel(b);
      wannZeigen();
      this._sagen(b.dataset.tag === "eingang" ? "Datum entfernt, Aufgabe steht unter Heute" : `Datum ${datumText($("b-datum").value)}`);
    }));
    $("b-datum").addEventListener("input", wannZeigen);
    $("b-datum").addEventListener("change", wannZeigen);
    wannZeigen();
    $("b-abbrechen")?.addEventListener("click", () => this._zu(dlg));
    let sicher = false;
    // Automatisch speichern (nur bestehende Aufgaben): kurz nach jeder Änderung und beim Schließen.
    let uhr = null, aenderung = false, geaendert = false, weg = false, laeuft = Promise.resolve();
    // #hashtags im Titel wie bei der Schnelleingabe übernehmen: erstes = Bereich (wenn leer), weitere = Hashtags
    const hashtagsAusTitel = () => {
      const t = $("b-titel").value;
      const funde = [...t.matchAll(/(^|\s)#([\wäöüß-]+)/gi)].map((x) => x[2].toLowerCase());
      if (!funde.length) return false;
      const rest = t.replace(/(^|\s)#[\wäöüß-]+/gi, " ").replace(/\s+/g, " ").trim();
      if (!rest) return false;
      $("b-titel").value = rest;
      if (!$("b-bereich").value.trim()) $("b-bereich").value = funde.shift();
      const vorhanden = $("b-tags").value.split(/[\s,]+/).map((x) => x.replace(/^#/, "").toLowerCase()).filter(Boolean);
      $("b-tags").value = [...new Set([...vorhanden, ...funde])].map((x) => "#" + x).join(" ");
      aenderung = true;
      this._sagen(`Hashtags übernommen: ${$("b-tags").value || $("b-bereich").value}`);
      return true;
    };
    $("b-titel").addEventListener("change", hashtagsAusTitel);
    const sammeln = () => {
      const wiederholung = wdhLesen(dlg, "b");
      const lis = [...$("b-teile").children];
      const teilaufgaben = lis.map((li) => ({
        id: li.dataset.teil || "", text: li.querySelector('input[type="text"]').value.trim(), erledigt: li.querySelector('input[type="checkbox"]').checked,
      })).filter((t) => t.text);
      let datum = $("b-datum").value || null;
      if (wiederholung && !datum) datum = heute();
      const top = $("b-top").value ? +$("b-top").value : null;
      if (top && !datum) datum = heute();
      return { lis, aufgabe: {
        id: a.id, titel: $("b-titel").value.trim(), datum, uhrzeit: $("b-uhr").value || null, dauer: $("b-dauer").value || null,
        person: $("b-person").value, top, bereich: $("b-bereich").value, tags: $("b-tags").value, notiz: $("b-notiz").value, wiederholung, erinnerungen: erinnLesen(dlg, "be"), teilaufgaben,
      } };
    };
    const stand = (t) => { const el = $("b-stand"); if (el) el.textContent = t; };
    const autoSpeichern = () => {
      clearTimeout(uhr); uhr = null;
      if (!a.id || weg || !aenderung) return laeuft;
      const { lis, aufgabe } = sammeln();
      if (!aufgabe.titel) { stand("Titel fehlt"); return laeuft; }
      aenderung = false;
      stand("Speichert …");
      laeuft = laeuft.then(async () => {
        try {
          const neu = await this._hass.callWS({ type: "planer/speichern", aufgabe });
          geaendert = true;
          // Neue Teilaufgaben bekommen ihre ID, damit sie beim nächsten Speichern nicht doppelt entstehen.
          const mitText = lis.filter((li) => li.querySelector('input[type="text"]').value.trim());
          (neu?.teilaufgaben || []).forEach((t, i) => { if (mitText[i]) mitText[i].dataset.teil = t.id; });
          stand(aenderung ? "" : "Gespeichert");
        } catch (err) { aenderung = true; stand(""); $("b-fehler").textContent = err.message || "Speichern hat nicht geklappt."; }
      });
      return laeuft;
    };
    if (a.id) {
      // Schnell speichern: beim Tippen nach 300 ms, bei Auswahl/Verlassen eines Feldes sofort
      const merken = (e, sofort = false) => {
        if (e.target.id === "b-teil-neu") return;
        aenderung = true; stand(""); $("b-fehler").textContent = "";
        clearTimeout(uhr);
        if (sofort) autoSpeichern(); else uhr = setTimeout(autoSpeichern, 300);
      };
      $("bform").addEventListener("input", (e) => merken(e, e.target.type === "checkbox" || e.target.type === "radio" || e.target.tagName === "SELECT"));
      $("bform").addEventListener("change", (e) => merken(e, true));
      $("bform").addEventListener("focusout", () => { if (aenderung) autoSpeichern(); });
      $("bform").addEventListener("click", (e) => { if (e.target.closest(".weg, [data-tag], #b-teil-plus")) merken(e, true); });
      $("b-teil-neu").addEventListener("keydown", (e) => { if (e.key === "Enter") setTimeout(() => merken({ target: $("bform") }, true)); });
      // Beim Wegklicken/Schließen sofort sichern, nicht erst nach der Animation
      dlg._vorZu = () => { hashtagsAusTitel(); return autoSpeichern(); };
      // App/Tab wird verlassen: sofort sichern
      const weglegen = () => { if (document.visibilityState === "hidden" && dlg.open) dlg._vorZu?.(); };
      document.addEventListener("visibilitychange", weglegen);
      window.addEventListener("pagehide", weglegen);
      dlg.addEventListener("close", () => { document.removeEventListener("visibilitychange", weglegen); window.removeEventListener("pagehide", weglegen); }, { once: true });
    }
    dlg.onclose = async () => {
      dlg._vorZu = null;
      if (!a.id || weg) return;
      hashtagsAusTitel();
      await autoSpeichern();
      if (geaendert) { geaendert = false; await this._lesen(); }
    };
    $("b-loeschen")?.addEventListener("click", async () => {
      if (!sicher) { sicher = true; $("b-loeschen").textContent = "Wirklich löschen?"; $("b-loeschen").focus(); return; }
      weg = true; clearTimeout(uhr);
      await laeuft;
      await this._ws({ type: "planer/loeschen", aufgabe_id: a.id });
      this._zu(dlg);
      this._sagen(`Gelöscht: ${a.titel}`);
      const kopie = { titel: a.titel, datum: a.datum || null, uhrzeit: a.uhrzeit || null, dauer: a.dauer || null, person: a.person, top: a.top || null,
        bereich: a.bereich || "", tags: a.tags || [], notiz: a.notiz || "", wiederholung: a.wiederholung || null, erinnerungen: a.erinnerungen ?? null,
        teilaufgaben: (a.teilaufgaben || []).map((t) => ({ id: "", text: t.text, erledigt: t.erledigt })) };
      this._hinweis(`Gelöscht: ${a.titel}`, () => this._ws({ type: "planer/speichern", aufgabe: kopie }));
      await this._lesen();
    });
    $("bform").addEventListener("submit", async (e) => {
      e.preventDefault();
      const titel = $("b-titel").value.trim();
      if (!titel) { $("b-fehler").textContent = "Bitte einen Titel eingeben."; $("b-titel").focus(); return; }
      if ($("b-teil-neu").value.trim()) { teilNeu(); aenderung = true; }
      hashtagsAusTitel();
      if (a.id) {
        // Bestehende Aufgabe: „Fertig“ speichert den letzten Stand und schließt.
        await autoSpeichern();
        if ($("b-fehler").textContent) return;
        this._zu(dlg);
        return;
      }
      try {
        await this._ws({ type: "planer/speichern", aufgabe: sammeln().aufgabe });
      } catch (err) { $("b-fehler").textContent = err.message || "Speichern hat nicht geklappt."; return; }
      this._zu(dlg);
      this._sagen(`Gespeichert: ${titel}`);
      await this._lesen();
    });
    this._wischZu(dlg);
    dlg.showModal();
    // Nur bei neuen Aufgaben direkt ins Titelfeld (öffnet die Tastatur); Details öffnen ohne Tastatur.
    if (a.id) { dlg.querySelector("#blatt-titel").setAttribute("tabindex", "-1"); dlg.querySelector("#blatt-titel").focus({ preventScroll: true }); }
    else $("b-titel").focus();
  }

  _teilHtml(t, i) {
    const n = `b-t${i}-${Math.random().toString(36).slice(2, 6)}`;
    return `<li class="teil" data-teil="${esc(t.id || "")}">
      <input type="checkbox" id="${n}c" ${t.erledigt ? "checked" : ""} aria-label="${esc(t.text)} erledigt">
      <label class="sr" for="${n}">Teilaufgabe</label><input type="text" id="${n}" value="${esc(t.text)}">
      <button type="button" class="weg weg-knopf" aria-label="${esc(t.text)} entfernen">${ICON.zu}</button>
    </li>`;
  }

  // Blatt auf dem Handy durch Wischen nach unten schließen (zusätzlich zu Abbrechen und Zurück-Taste)
  _wischZu(dlg) {
    if (!this._narrow || dlg.dataset.wisch) return;
    dlg.dataset.wisch = "1";
    let y0 = null;
    dlg.addEventListener("touchstart", (e) => { y0 = dlg.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
    dlg.addEventListener("touchend", (e) => {
      if (y0 !== null && e.changedTouches[0].clientY - y0 > 110) this._zu(dlg);
      y0 = null;
    });
  }

  _einstellungen() {
    const dlg = this.shadowRoot.getElementById("einst");
    const d = this._daten;
    const kal = d.alle_kalender || [];
    dlg.innerHTML = `<form method="dialog" id="einform">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}<span class="l"></span><h2 id="einst-titel">Einstellungen</h2><button type="submit" class="knopf text fett r">Fertig</button></div>
      ${kal.some((k) => k.anlegen) ? `<div class="feld"><label for="gk">Kalender für gemeinsame Termine</label>
        <select id="gk"><option value="">Keiner</option>${kal.filter((k) => k.anlegen).map((k) => `<option value="${esc(k.id)}" ${d.gemeinsam_kalender === k.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select>
        <span class="hinweis">Termine mit „Gemeinsam“ oder @gemeinsam landen hier.</span></div>` : ""}
      ${(d.alle_todo || []).length ? `<fieldset><legend>Einkaufslisten</legend>
        <p class="hinweis">Diese Listen erscheinen im Reiter „Einkauf“. Ohne Auswahl werden alle Bring!-Listen gezeigt.</p>
        ${d.alle_todo.map((l) => `<label class="check"><input type="checkbox" data-eliste-wahl="${esc(l.id)}" ${(d.einkauf_eingestellt == null ? l.bring : d.einkauf_eingestellt.includes(l.id)) ? "checked" : ""}> ${esc(l.name)}${l.bring ? " (Bring!)" : ""}</label>`).join("")}
      </fieldset>` : ""}
      ${(d.alle_benutzer || []).length > 2 ? `<fieldset><legend>Wer nutzt den Planer?</legend>
        <p class="hinweis">Nur angehakte Benutzer erscheinen im Planer. Entferne den Haken bei Konten wie Tablet, Gast oder Claude.</p>
        ${d.alle_benutzer.map((b) => `<label class="check"><input type="checkbox" data-nutzer="${esc(b.id)}" ${b.ausgeblendet ? "" : "checked"} ${b.id === d.ich ? "disabled" : ""}> ${esc(b.name)}</label>`).join("")}
      </fieldset>` : ""}
      ${(() => {
        const namen = [...new Set([...Object.keys(BEREICH_STANDARD), ...d.aufgaben.map((a) => a.bereich).filter(Boolean)])].sort();
        return `<fieldset><legend>Bereiche und Farben</legend>
          <p class="hinweis">Einen neuen Bereich legst du einfach mit #name in der Schnelleingabe oder im Feld „Bereich“ an.</p>
          <div class="farben">${namen.map((x) => `<label><input type="color" data-farbe="${esc(x)}" value="${bereichFarbe(x, d.farben)}"> ${esc(x[0].toUpperCase() + x.slice(1))}</label>`).join("")}</div>
        </fieldset>`;
      })()}
      <p class="hinweis">Eigene und gemeinsame Aufgaben sieht jede Person immer. Pro Person legst du hier fest, was sie zusätzlich sieht, wo sie Termine eintragen darf und wie sie erinnert wird.</p>
      ${d.personen.map((p, i) => {
        const e = d.einstellungen[p.id] || {};
        const sehen = e.kalender_sehen, schreiben = e.kalender_schreiben;
        return `<section class="person-einst" data-person="${esc(p.id)}" aria-labelledby="pe-${i}">
          <h3 id="pe-${i}">${esc(p.name)}</h3>
          <label class="check"><input type="checkbox" data-feld="andere_sehen" ${e.andere_sehen !== false ? "checked" : ""}> Sieht die Aufgaben der anderen</label>
          ${kal.length ? `<div class="tab-wrap"><table class="kal-tab">
            <caption class="sr">Kalender von ${esc(p.name)}</caption>
            <thead><tr><th scope="col">Kalender</th><th scope="col">Sehen</th><th scope="col">Eintragen</th><th scope="col">Erinnern</th><th scope="col">Zeitleiste</th></tr></thead>
            <tbody>${kal.map((k) => `<tr><th scope="row" style="font-weight:400">${esc(k.name)}</th>
              <td><input type="checkbox" data-kal="sehen" value="${esc(k.id)}" aria-label="${esc(k.name)} sehen" ${sehen == null || sehen.includes(k.id) ? "checked" : ""}></td>
              <td>${k.anlegen ? `<input type="checkbox" data-kal="schreiben" value="${esc(k.id)}" aria-label="In ${esc(k.name)} eintragen" ${schreiben == null || schreiben.includes(k.id) ? "checked" : ""}>` : '<span class="sr">nicht möglich</span><span aria-hidden="true">–</span>'}</td>
              <td><input type="checkbox" data-kal="erinnern" value="${esc(k.id)}" aria-label="An Termine aus ${esc(k.name)} erinnern" ${(e.kalender_erinnern || []).includes(k.id) ? "checked" : ""}></td>
              <td><input type="checkbox" data-kal="zeitleiste" value="${esc(k.id)}" aria-label="${esc(k.name)} in der Zeitleiste zeigen" ${e.kalender_zeitleiste == null || e.kalender_zeitleiste.includes(k.id) ? "checked" : ""}></td></tr>`).join("")}</tbody>
          </table></div>
          <div class="feld"><label for="sk-${i}">Standard-Kalender für neue Termine</label>
            <select id="sk-${i}" data-feld="standard_kalender"><option value="">Zuletzt benutzter</option>
            ${kal.filter((k) => k.anlegen).map((k) => `<option value="${esc(k.id)}" ${e.standard_kalender === k.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></div>`
          : `<p class="leer">Noch keine Kalender in Home Assistant.</p>`}
          <div class="feld"><label for="hy-${i}">Handy für Erinnerungen</label>
            <select id="hy-${i}" data-feld="handy"><option value="">Keine Erinnerungen</option>
            ${(d.handys || []).map((h) => `<option value="${esc(h.id)}" ${e.handy === h.id ? "selected" : ""}>${esc(h.name)}</option>`).join("")}</select>
            ${(d.handys || []).length ? "" : '<span class="hinweis">Kein Handy mit der Home-Assistant-App gefunden.</span>'}</div>
          <div class="reihe">
            <div class="feld"><label for="tv-${i}">Kalender-Raster ab</label><select id="tv-${i}" data-feld="tag_von">${[...Array(24)].map((_, h) => `<option value="${h}" ${(e.tag_von ?? 7) === h ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("")}</select></div>
            <div class="feld"><label for="tb-${i}">bis</label><select id="tb-${i}" data-feld="tag_bis">${[...Array(24)].map((_, h) => h + 1).map((h) => `<option value="${h}" ${(e.tag_bis ?? 22) === h ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("")}</select></div>
          </div>
          ${erinnHtml(`se${i}`, e.erinnerungen || [30, 180, 1440])}
          <div class="fuss"><button type="button" class="knopf" data-speichern="${i}">Für ${esc(p.name.split(" ")[0])} speichern</button></div>
        </section>`;
      }).join("")}
    </form>`;
    d.personen.forEach((p, i) => erinnBinden(dlg, `se${i}`, (t) => this._sagen(t)));
    dlg.querySelectorAll("[data-farbe]").forEach((f) => f.addEventListener("change", async () => {
      const farben = {};
      dlg.querySelectorAll("[data-farbe]").forEach((x) => { farben[x.dataset.farbe] = x.value; });
      await this._ws({ type: "planer/allgemein", werte: { farben } });
      this._sagen(`Farbe für ${f.dataset.farbe} gespeichert`);
    }));
    dlg.querySelectorAll("[data-eliste-wahl]").forEach((c) => c.addEventListener("change", async () => {
      const an = [...dlg.querySelectorAll("[data-eliste-wahl]")].filter((x) => x.checked).map((x) => x.dataset.elisteWahl);
      await this._ws({ type: "planer/allgemein", werte: { einkauf_listen: an } });
      this._sagen("Einkaufslisten gespeichert");
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
        tag_von: +sec.querySelector('[data-feld="tag_von"]').value,
        tag_bis: +sec.querySelector('[data-feld="tag_bis"]').value,
      };
      if (kal.length) {
        werte.kalender_sehen = liste("sehen").length === alle("sehen") ? null : liste("sehen");
        werte.kalender_schreiben = liste("schreiben").length === alle("schreiben") ? null : liste("schreiben");
        werte.kalender_erinnern = liste("erinnern");
        werte.kalender_zeitleiste = liste("zeitleiste").length === alle("zeitleiste") ? null : liste("zeitleiste");
        werte.standard_kalender = sec.querySelector('[data-feld="standard_kalender"]').value || null;
      }
      await this._ws({ type: "planer/einstellung", person: d.personen[i].id, werte });
      b.textContent = "Gespeichert";
      this._sagen(`Einstellungen für ${d.personen[i].name} gespeichert`);
    }));
    dlg.addEventListener("close", async () => { await this._lesen(); this._termineLaden(); }, { once: true });
    dlg.showModal();
  }

  // Neuer Termin; übernimmt, was schon in der Schnelleingabe steht
  _terminNeu(festDatum, festVon, festBis, festTitel, festKal) {
    const dlg = this.shadowRoot.getElementById("tdlg");
    const d = this._daten;
    const text = this.shadowRoot.getElementById("schnell")?.value || "";
    const v = text.trim() ? parse(text, d.personen) : {};
    const schreibbar = (d.kalender || []).filter((k) => k.schreiben);
    let zuletzt = null;
    try { zuletzt = localStorage.getItem("planer.kalender"); } catch (e) { /* egal */ }
    const eigene = [d.einst.standard_kalender, zuletzt].find((x) => schreibbar.some((k) => k.id === x)) || schreibbar[0]?.id;
    const vorwahl = v.person === GEMEINSAM && schreibbar.some((k) => k.id === d.gemeinsam_kalender) ? d.gemeinsam_kalender : eigene;
    if (festTitel) v.titel = festTitel;
    const datum = festDatum || v.datum || heute();
    const von = festVon || v.uhrzeit || "";
    const bis = festBis || von ? festBis || (() => { const [h, m] = von.split(":").map(Number); return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; })() : "";
    dlg.innerHTML = `<form method="dialog" id="tform" novalidate>
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <button type="button" class="knopf text l" id="t-abbrechen">Abbrechen</button>
        <h2 id="t-titel-h">Neuer Termin</h2>
        <button type="submit" class="knopf text fett r">Eintragen</button>
      </div>
      <div class="feld"><label for="t-titel">Titel</label><input id="t-titel" required value="${esc(v.titel || "")}"></div>
      ${d.gemeinsam_kalender && schreibbar.some((k) => k.id === d.gemeinsam_kalender) ? `<div class="schnellwahl" role="radiogroup" aria-label="Für wen">
        <label class="check"><input type="radio" name="t-fuer" value="ich" ${v.person === GEMEINSAM ? "" : "checked"}> Für mich</label>
        <label class="check"><input type="radio" name="t-fuer" value="gemeinsam" ${v.person === GEMEINSAM ? "checked" : ""}> Gemeinsam (${esc(this._kal(d.gemeinsam_kalender).name)})</label>
      </div>` : ""}
      <div class="feld"><label for="t-kal">Kalender</label><select id="t-kal">
        ${schreibbar.map((k) => `<option value="${esc(k.id)}" ${k.id === (festKal || vorwahl) ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></div>
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
      <p class="hinweis">Erinnert wird mit deinem Standard (${esc(minKurz(d.einst.erinnerungen))}), wenn der Kalender in den Einstellungen unter „Erinnern“ angehakt ist.</p>
      <p class="fehler" id="t-fehler" role="alert"></p>

    </form>`;
    const $ = (id) => dlg.querySelector(`#${id}`);
    const ganz = () => { const g = $("t-ganz").checked; $("t-von-f").hidden = g; $("t-bis-f").hidden = g; $("t-ende-f").hidden = !g; };
    ganz();
    $("t-ganz").addEventListener("change", ganz);
    wdhBinden(dlg, "tw");
    dlg.querySelectorAll('input[name="t-fuer"]').forEach((r) => r.addEventListener("change", () => {
      $("t-kal").value = r.value === "gemeinsam" ? d.gemeinsam_kalender : eigene;
    }));
    $("t-abbrechen").addEventListener("click", () => this._zu(dlg));
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
      this._zu(dlg);
      const s = this.shadowRoot.getElementById("schnell");
      if (s) { s.value = ""; this._vorschau(); }
      this._sagen(`Termin eingetragen: ${titel}, ${datumText(tag)}`);
      this._termineNeu(tag);
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
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <span class="l"></span><h2 id="t-titel-h">${esc(t.titel)}</h2>
        <button type="submit" class="knopf text fett r">Fertig</button>
      </div>
      <dl class="infos">
        <dt>Wann</dt><dd>${esc(wann)}${t.wiederholt ? " · wiederholt sich" : ""}</dd>
        <dt>Kalender</dt><dd>${esc(k.name)}</dd>
        ${t.ort ? `<dt>Ort</dt><dd><a class="kartenlink" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(t.ort)}" target="_blank" rel="noopener noreferrer">${ICON.ort}<span>${verlinken(t.ort)}</span></a></dd>` : ""}
        ${t.beschreibung ? `<dt>Beschreibung</dt><dd><div class="beschreibung" id="t-beschr-text">${verlinken(klartext(t.beschreibung))}</div>
          <button type="button" class="knopf text mehr" id="t-mehr" aria-expanded="false" aria-controls="t-beschr-text" hidden>Mehr lesen</button></dd>` : ""}
      </dl>
      <p class="hinweis">Termine änderst du in Google Kalender. Hier kannst du sie ansehen und löschen.</p>
      <p class="fehler" id="t-fehler" role="alert"></p>
      <div class="fuss">
        ${k.loeschen && t.uid ? (t.recurrence_id
          ? `<button type="button" class="knopf gefahr" data-loeschen="einer">Nur diesen löschen</button><button type="button" class="knopf gefahr" data-loeschen="folgende">Diesen und alle folgenden löschen</button>`
          : `<button type="button" class="knopf gefahr" data-loeschen="einer">Termin löschen</button>`) : ""}
      </div>
    </form>`;
    const sicher = {};
    dlg.querySelectorAll(".kartenlink a, .beschreibung a").forEach((x) => x.addEventListener("click", (e) => e.stopPropagation()));
    requestAnimationFrame(() => {
      const txt = dlg.querySelector("#t-beschr-text"), mehr = dlg.querySelector("#t-mehr");
      if (!txt || !mehr) return;
      if (txt.scrollHeight > txt.clientHeight + 2) mehr.hidden = false;
      mehr.addEventListener("click", () => {
        const auf = txt.classList.toggle("offen");
        mehr.textContent = auf ? "Weniger" : "Mehr lesen";
        mehr.setAttribute("aria-expanded", String(auf));
      });
    });
    dlg.querySelectorAll("[data-loeschen]").forEach((b) => b.addEventListener("click", async () => {
      const art = b.dataset.loeschen;
      if (!sicher[art]) { sicher[art] = true; b.textContent = "Wirklich löschen?"; b.focus(); return; }
      try {
        await this._hass.callWS({ type: "planer/termin_loeschen", kalender: t.kalender, uid: t.uid, recurrence_id: t.recurrence_id, alle_folgenden: art === "folgende" });
      } catch (err) { dlg.querySelector("#t-fehler").textContent = err.message || "Löschen hat nicht geklappt."; return; }
      this._zu(dlg);
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
