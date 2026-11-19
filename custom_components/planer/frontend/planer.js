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
.wrap{max-width:1320px;margin:0 auto;padding:var(--s4) var(--s5) var(--s6);display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s4)}
.wrap>*{min-width:0}
.schmal .wrap{padding:var(--s2) var(--s4) calc(112px + env(safe-area-inset-bottom,0px));gap:var(--s4)}
header{display:flex;gap:var(--s3);align-items:center;min-width:0}
header .titel-block{display:grid;min-width:0;flex:1}
header h1{margin:0;font-size:var(--t-gross);font-weight:700;letter-spacing:-.02em;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
header .datum{font-size:var(--t-sub);color:var(--muted);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
header .rechts{margin-left:auto;display:flex;gap:var(--s2);align-items:center;flex:none}
header{flex-wrap:wrap}
header nav.tabs{flex:none;order:3;margin:0 auto 0 0}
header .titel-block{flex:1 1 200px}
header .rechts{order:2}
header nav.tabs button{padding:0 var(--s3)}
#rahmen:not(.schmal) .wrap{container-type:inline-size}
@container (min-width:840px){header{flex-wrap:nowrap}header nav.tabs{flex:0 1 auto;min-width:0}header nav.tabs{order:2;margin:0 var(--s2)}header .titel-block{flex:none;min-width:0}header .rechts{order:3;margin-left:auto}header nav.tabs .zahl{display:none}}
@container (min-width:990px){header nav.tabs .zahl:not(.null){display:inline}}
@container (max-width:700px){header nav.tabs{max-width:100%}header nav.tabs button{padding:0 var(--s2);gap:4px;flex:1 1 auto;justify-content:center;min-width:0}header nav.tabs .zahl{display:none}}
.schmal header{padding-top:var(--s1)}
.tagraster{display:grid;gap:var(--s4);width:100%;min-width:0;grid-template-columns:minmax(0,1fr);align-items:stretch}
@container (min-width:720px){.tagraster{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container (min-width:1120px){.tagraster{grid-template-columns:repeat(6,minmax(0,1fr))}.tagraster>.tkarte{grid-column:span 2}.tagraster>.tkarte:nth-child(-n+2 of .tkarte){grid-column:span 3}}
.tagraster>.zu,.tagraster>.fehler{grid-column:1/-1}
.tkarte{align-content:start}
.tkarte h2{margin:0;padding:0 var(--s1);min-height:28px;display:flex;align-items:center;gap:var(--s2)}
.tkarte h2 .wetter{margin-left:auto;display:inline-flex;align-items:baseline;gap:4px;font-size:var(--t-sub);font-weight:600;color:var(--fg);font-variant-numeric:tabular-nums}
.tkarte h2 .wetter>span[aria-hidden]{font-size:1.2em;align-self:center}
.tkarte h2 .wetter small{font-size:var(--t-fuss);font-weight:500;color:var(--muted)}
.tkarte{padding:var(--s3);border-radius:20px;background:var(--fill);display:grid;gap:var(--s3);min-width:0}
.tkarte h2{font-size:var(--t-kopf);color:var(--muted)}
.tkarte.heute h2{color:var(--accent)}
.tkarte.heute{box-shadow:inset 0 0 0 1.5px var(--accent-dim,var(--line2))}
.schicht-chips{display:flex;flex-wrap:wrap;gap:6px}
.schicht-chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:5px 11px;border-radius:var(--r-voll,999px);font-size:var(--t-fuss);font-weight:600;color:var(--fg);background:color-mix(in srgb,var(--k) 22%,transparent);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--k) 55%,transparent)}
.schicht-chip b{display:inline-grid;place-items:center;min-width:20px;height:20px;border-radius:10px;background:var(--k);color:#fff;font-size:11px;padding:0 4px}
.schicht-chip .sz{font-variant-numeric:tabular-nums;font-weight:500}
.schicht-chip .sw{color:var(--muted);font-weight:500}
ul.liste>li.vorbei{opacity:.5}
ul.liste>li.jetzt{display:flex;align-items:center;gap:var(--s2);color:var(--rot);font-size:var(--t-klein);font-weight:700;margin:2px 0}
ul.liste>li.jetzt::before,ul.liste>li.jetzt::after{content:"";height:2px;border-radius:1px;background:var(--rot);flex:1}
ul.liste>li.jetzt::before{flex:0 0 12px}
.chip.rot{color:var(--rot);background:color-mix(in srgb,var(--rot) 14%,transparent)}
li.aufgabe.ueberf .zeile{box-shadow:inset 4px 0 0 var(--rot),var(--karte-schatten)}
li.aufgabe.ueberf .haken::before{border-color:var(--rot)}
.schmal header{flex-wrap:nowrap;align-items:center}
.schmal header .titel-block{flex:1 1 0;min-width:0}
.schmal header .rechts{order:0;gap:var(--s1)}
.schmal header h1{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.schmal header .titel-block{padding-top:2px}

/* ---------- Bedienelemente ---------- */
.rund{width:44px;height:44px;border-radius:50%;display:inline-grid;place-items:center;cursor:pointer;color:var(--fg);padding:0;position:relative;flex:none}
.rund svg{width:22px;height:22px}
.rund.aktiv{color:var(--on-mint);background:var(--accent-fill);border-color:var(--accent-fill)}
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
.schmal .seg button{padding:0 var(--s2);min-height:40px}
.schmal .knopf.klein{min-height:44px}
.teile:empty{display:none}
dialog .knopf:not(.primaer):not(.text){box-shadow:none;background:var(--card);border-color:var(--line);-webkit-backdrop-filter:none;backdrop-filter:none}
fieldset .knopf:not(.primaer):not(.text){background:var(--card2);border-color:transparent}
@media (orientation:landscape) and (max-height:520px){.schmal nav.tabs[aria-label]{left:var(--s3);right:var(--s3);margin:0 auto;max-width:600px}.schmal nav.tabs[aria-label] button{min-height:44px;flex-direction:row;gap:6px}.schmal nav.tabs[aria-label] button svg{width:20px;height:20px}.schmal nav.tabs[aria-label] .zahl{position:static;background:var(--fill);color:var(--muted)}.schmal{--t-gross:28px}.schmal .wrap{padding-bottom:calc(88px + env(safe-area-inset-bottom,0px))}.fab{bottom:calc(72px + env(safe-area-inset-bottom,0px));right:calc(var(--s4) + env(safe-area-inset-right,0px))}}
@media (max-width:359px){.schmal{--t-gross:28px}.schmal nav.tabs{left:var(--s2);right:var(--s2)}.schmal nav.tabs button{font-size:10px}}

/* Filter-Chips für Bereiche (Desktop), ohne eigene Glasfläche */

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
.hinweis.ausblende{align-items:center;justify-content:space-between;padding:0 var(--s2)}
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
.schmal .aufgabe .meta{flex-wrap:nowrap;overflow:hidden}.schmal .aufgabe .meta .chip{flex:0 1 auto;min-width:0}.schmal .aufgabe .meta .chip.rot,.schmal .aufgabe .meta .chip.zeit{flex:none}
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
.wkopf .kalumschalter{margin:0;justify-self:auto}
.wkopf .navi .knopf{padding:0 var(--s3)}
.wkopf .navi{display:flex;gap:var(--s2);align-items:center}
.schmal .wkopf:has(#w-titel){flex-wrap:nowrap}
.schmal #w-titel{flex-wrap:nowrap;white-space:nowrap;min-width:0}
.schmal #w-titel .zahl{font-size:var(--t-titel);font-weight:700;color:var(--muted)}
.kalleiste{display:flex;gap:var(--s3);align-items:center;flex-wrap:wrap;justify-content:space-between}
.kalleiste .seg{flex:none}
.monat{--kompakt:1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;align-content:start}
.mkopf{font-size:var(--t-klein);text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:0 0 var(--s1);font-weight:600;text-align:center}
.mtag{position:relative;display:flex;flex-direction:column;align-items:stretch;gap:2px;text-align:left;height:108px;padding:4px 2px 2px;border-radius:10px;border:0;background:var(--card);box-shadow:var(--karte-schatten);color:var(--fg);font:inherit;cursor:pointer;min-width:0;overflow:hidden}
.schmal .mtag{height:auto;min-height:0;box-shadow:none}
.mtag:hover{box-shadow:inset 0 0 0 1.5px var(--line2)}
.mtag.fremd{background:transparent;box-shadow:none;color:var(--muted)}
.mtag.fremd .me,.mtag.fremd .msz{opacity:.55}
.mtag.mschichttag{background:color-mix(in srgb,var(--sc1) 12%,var(--card))}
.mtag.fremd.mschichttag{background:color-mix(in srgb,var(--sc1) 8%,transparent)}
.mnr{flex:none;font-weight:600;font-size:12px;font-variant-numeric:tabular-nums;width:22px;height:22px;display:grid;place-items:center;border-radius:50%;margin-bottom:1px}
.mtag.heute .mnr,.schichtmonat .stag.heute .mnr{background:var(--rot);color:#fff;font-weight:700}
.schichtmonat .stag.heute,.wtag.heute{box-shadow:inset 0 0 0 2.5px var(--rot),var(--karte-schatten)}
.mstreifen{position:absolute;left:0;right:0;top:0;height:3px;display:flex}
.mstreifen i{flex:1;background:var(--sc)}
.msz{display:flex;gap:2px;flex:none;flex-wrap:nowrap;min-width:0}
.msk{flex:0 1 auto;min-width:0;overflow:hidden;white-space:nowrap;font-size:9px;font-weight:700;padding:0 3px;height:14px;line-height:14px;border-radius:4px;background:var(--sc);color:#fff}
.msk .sz{display:none;font-weight:500;margin-left:4px}
.me{flex:none;display:block;min-width:0;height:14px;line-height:14px;font-size:9.5px;font-weight:600;padding:0 2px 0 3px;border-radius:3px;background:color-mix(in srgb,var(--c) 20%,transparent);border-left:2px solid var(--c);color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.me[hidden]{display:none!important}
.me .u{display:none}
.me.auf{background:none;border-left:0;padding-left:1px}
.me.auf::before{content:"";display:inline-block;box-sizing:border-box;width:8px;height:8px;border-radius:50%;border:1.5px solid var(--c);margin-right:3px;vertical-align:-1px}
.mmehr{flex:none;font-size:9px;color:var(--muted);font-weight:700;padding-left:3px;line-height:12px}
.schmal .monat{grid-template-rows:auto repeat(var(--zeilen),minmax(0,1fr))}
.schmal .monat .mtag{padding:3px 1px 1px}
.schmal .mnr{width:20px;height:20px;font-size:12px}
.schmal .mtag:has(.msz) .mnr{margin-bottom:0}
@container (min-width:600px){
.monat{--kompakt:1;gap:var(--s1);grid-template-rows:auto repeat(var(--zeilen),minmax(0,1fr))}
.mkopf{text-align:left;padding-left:6px}
.mtag{height:auto;min-height:0;padding:5px 6px 4px;overflow:hidden;gap:3px}
.mmehr{font-size:var(--t-tab);line-height:16px;padding-left:6px}
.mnr{width:26px;height:26px;font-size:var(--t-sub);margin-bottom:2px}
.msz{flex-wrap:nowrap;gap:3px;overflow:hidden}
.msz:has(.msk + .msk) .sz{display:none}
.msk{font-size:10.5px;height:18px;line-height:18px;padding:0 6px;overflow:visible}
.msk .sz{display:inline}
.mstreifen{height:4px}
.me{height:auto;line-height:1.25;font-size:11.5px;padding:3px 4px 3px 6px;white-space:nowrap;border-left-width:3px;border-radius:5px;overflow:hidden}
.me .u{display:inline;color:var(--muted);font-variant-numeric:tabular-nums;margin-right:4px;font-weight:500}
.me .tx{overflow:hidden;text-overflow:ellipsis}
.me.auf{padding-left:2px;display:flex;gap:4px;align-items:baseline}
.me.auf::before{flex:none;margin-right:0}
.me.auf .u{margin-right:0;white-space:nowrap;flex:none}
.me.auf .tx{flex:1;min-width:0}
.me.auf::before{width:10px;height:10px;margin-right:4px;vertical-align:-1px}
}
@container (min-width:820px){.me{white-space:normal;overflow:visible}.me .tx{overflow:visible;overflow-wrap:anywhere}}
.woche-wrap{overflow-x:auto;padding-bottom:var(--s1)}
.schmal .woche-wrap{overflow:visible}
.woche{display:grid;grid-template-columns:repeat(7,minmax(118px,1fr));gap:var(--s2);min-width:860px}
.schmal .woche{grid-template-columns:minmax(0,1fr);min-width:0}
.wtag{background:var(--card);border-radius:var(--r-karte);padding:var(--s2);display:grid;gap:6px;align-content:start;min-height:180px;min-width:0;box-shadow:var(--karte-schatten)}
.schmal .wtag{min-height:0;padding:var(--s3)}

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
.blatt-kopf h2 .stand{display:block;padding:0;font-size:var(--t-tab);font-weight:500;line-height:1.2}
.blatt-kopf h2 .stand:empty{display:none}
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
.block .wer-av{color:#fff;font-size:9px}
.schmal .me .wer-av{display:none}
.me .wer-av{margin-right:3px;vertical-align:-1px}
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
main.einblenden{animation:einblenden .3s var(--bewegung)}
@media (prefers-reduced-motion:reduce){main.einblenden{animation:none}}
@keyframes einblenden{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
li.aufgabe.klappt{transition:height .28s var(--bewegung),opacity .22s ease,margin .28s var(--bewegung);opacity:0;margin-block:0!important}
li.aufgabe.abgehakt .zeile{animation:abhaken .35s var(--bewegung) forwards}
.tag-aufgaben{list-style:none;margin:0;padding:var(--s1) var(--s3);border-radius:var(--r-karte);background:var(--card);display:grid}
.tag-aufgaben li{display:flex;align-items:center;gap:var(--s1);min-height:44px;border-left:3px solid var(--k);padding-left:var(--s1)}
.tag-aufgaben li+li{border-top:.5px solid var(--line2)}
.tag-aufgaben .ta-titel{flex:1;min-width:0;text-align:left;border:0;background:none;font:inherit;color:var(--fg);padding:var(--s2) 0;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag-aufgaben .ta-titel .u{color:var(--muted);margin-right:var(--s2);font-variant-numeric:tabular-nums}
.tag-aufgaben li.fertig .ta-titel{color:var(--muted);text-decoration:line-through}
.tag-aufgaben li.abgehakt .haken::before,li.aufgabe.abgehakt .haken::before{background:var(--accent-fill);border-color:var(--accent-fill);animation:haken-fuell .32s var(--bewegung)}
li.aufgabe.abgehakt .haken::after{content:"";grid-area:1/1;width:24px;height:24px;border-radius:50%;box-shadow:0 0 0 0 var(--accent-fill);animation:haken-ring .5s ease-out forwards;pointer-events:none}
li.aufgabe.abgehakt .haken svg{animation:haken-svg .3s .08s var(--bewegung) both}
@keyframes haken-fuell{0%{transform:scale(.6)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes haken-ring{to{box-shadow:0 0 0 10px transparent}}
@keyframes haken-svg{from{transform:scale(0) rotate(-20deg);opacity:0}}
@media (prefers-reduced-motion:reduce){li.aufgabe.abgehakt .haken::before,li.aufgabe.abgehakt .haken::after,li.aufgabe.abgehakt .haken svg{animation:none}}
/* Kontextmenü: Eintrag hebt sich an, der Rest tritt zurück (wie iOS) */
li.angehoben{position:relative;z-index:5;transform:scale(1.03);box-shadow:0 12px 32px rgba(0,0,0,.18);border-radius:var(--r-karte);transition:transform .25s var(--bewegung),box-shadow .25s ease}
#rahmen.kontext-an li.aufgabe:not(.angehoben),#rahmen.kontext-an li.nrow:not(.angehoben){opacity:.45;filter:blur(1.5px);transition:opacity .2s ease,filter .2s ease}
/* Großer Titel: beim Scrollen erscheint oben eine schmale Glasleiste mit kleinem Titel */
.kompakt-kopf{display:none}
.schmal .kompakt-kopf{display:grid;place-items:center;position:fixed;left:0;right:0;top:0;z-index:20;height:calc(44px + env(safe-area-inset-top,0px));padding-top:env(safe-area-inset-top,0px);font-size:var(--t-kopf);font-weight:600;color:var(--fg);background:color-mix(in srgb,var(--bg) 72%,transparent);-webkit-backdrop-filter:var(--glas-blur);backdrop-filter:var(--glas-blur);box-shadow:0 .5px 0 var(--line2);opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .2s ease,transform .25s var(--bewegung)}
#rahmen.eingerollt .kompakt-kopf{opacity:1;transform:none}
.schmal header h1{transition:opacity .2s ease}
#rahmen.eingerollt header h1{opacity:0}
#rahmen.eingerollt .wcal.drei .wsticky{top:calc(44px + env(safe-area-inset-top,0px))}
/* Blätter: folgen dem Finger, hochziehen = ganze Höhe */
.schmal dialog.zieht{transition:none}
.schmal dialog.voll{min-height:calc(100dvh - 12px)}
/* Einstellungen als gruppierte Listen (wie iOS-Einstellungen) */
#einst fieldset,#einst .person-einst{border:0;margin:0 0 var(--s5);padding:var(--s2) var(--s4);border-radius:var(--r-karte);background:var(--card);box-shadow:none;display:grid;gap:0}
#einst fieldset>legend,#einst .person-einst>h3{float:left;width:100%;left:0;padding:0 0 var(--s2) var(--s4);margin:0;font-size:var(--t-fuss);font-weight:500;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);transform:translateY(calc(-100% - var(--s2)));position:absolute}
#einst fieldset,#einst .person-einst{position:relative;margin-top:calc(var(--s5) + var(--s2))}
#einst fieldset>*:not(legend)+*:not(legend),#einst .person-einst>*:not(h3)+*:not(h3){border-top:.5px solid var(--line2)}
#einst fieldset>*:not(legend),#einst .person-einst>*:not(h3){padding-block:var(--s3);margin:0}
/* Verschachtelte Gruppen in einer Karte (z. B. Erinnerung aufs Handy) nicht noch einmal als Karte */
#einst fieldset fieldset,#einst .person-einst fieldset{position:static;margin:0;padding:var(--s3) 0;background:none;border-radius:0;display:grid;gap:var(--s2)}
#einst fieldset fieldset>legend,#einst .person-einst fieldset>legend{position:static;transform:none;float:left;width:100%;padding:0;margin:0 0 var(--s2);text-transform:none;letter-spacing:0;font-size:var(--t-fuss);font-weight:600;color:var(--muted)}
#einst fieldset fieldset>*,#einst .person-einst fieldset>*{border-top:0!important;padding-block:0!important}
#einst .feld input,#einst .feld select,#einst .feld textarea{background:var(--card2);border-color:transparent}
#einst .regel-liste{list-style:none;margin:0;padding:0;display:grid}
#einst .regel-liste li{display:flex;align-items:center;gap:var(--s2);padding:var(--s2) 0}
#einst .regel-liste li+li{border-top:.5px solid var(--line2)}
#einst .regel-text{flex:1;min-width:0;display:grid;gap:2px}
#einst .regel-form{display:grid;gap:var(--s4);padding-top:var(--s4)}
#einst .regel-form .reihe{gap:var(--s3)}
#einst .regel-form #r-speichern{width:100%;margin-top:var(--s1)}
#einst .regel-form .fehler:empty,#einst .regel-form .hinweis:empty{display:none}
#einst .regel-neu summary{list-style:none;width:max-content}
#einst .regel-neu summary::-webkit-details-marker{display:none}
#einst .regel-neu .feld input,#einst .regel-neu .feld select{background:var(--card2);border-color:transparent}
#einst .check{min-height:44px;display:flex;align-items:center;gap:var(--s3)}
#einst form>.hinweis{padding:0 var(--s4);margin:0 0 var(--s2)}
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
/* Woche wie Google Kalender */
.wcal{--rand:44px;position:relative;overflow-y:auto;overflow-x:hidden;background:var(--card);border-radius:var(--r-karte);box-shadow:var(--karte-schatten);overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.schmal .wcal{--rand:26px;border-radius:12px}
.wzeile{display:grid;grid-template-columns:var(--rand) repeat(var(--wn,7),minmax(0,1fr))}
.wsticky{position:sticky;top:0;z-index:6;background:var(--card);box-shadow:0 1px 0 var(--line)}
.wl{font-size:var(--t-tab);color:var(--muted);align-self:center;text-align:right;padding-right:4px;min-width:0}
.wganzz .wl{font-size:9px;line-height:1.1}
.schmal .wganzz .wl{font-size:0}
.wkh{border:0;border-left:1px solid var(--line);background:none;font:inherit;color:var(--muted);text-transform:uppercase;font-size:10px;font-weight:600;letter-spacing:.04em;padding:5px 0 3px;cursor:pointer;display:grid;justify-items:center;gap:1px;min-width:0}
.wkh b{font-size:17px;color:var(--fg);width:30px;height:30px;line-height:30px;border-radius:50%;text-transform:none;letter-spacing:0;font-weight:600;font-variant-numeric:tabular-nums}
.schmal .wkh b{font-size:14px;width:24px;height:24px;line-height:24px}
.wkh.heute b{background:var(--rot);color:#fff}
.wkh.heute .wn{color:var(--rot)}
.wkg{display:flex;flex-direction:column;gap:2px;min-width:0;min-height:24px;padding:2px 1px;border-left:1px solid var(--line);border-top:1px solid var(--line);cursor:pointer}
.wc{display:block;box-sizing:border-box;width:100%;min-width:0;height:18px;line-height:18px;text-align:left;border:0;font:inherit;font-size:11px;padding:0 4px;border-radius:4px;background:color-mix(in srgb,var(--c,var(--accent)) 24%,var(--card));color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;flex:none}
.wc.t{box-shadow:inset 3px 0 0 var(--c)}
.wc.a{background:color-mix(in srgb,var(--c) 10%,var(--card))}
.wc.a::before{content:"";display:inline-block;box-sizing:border-box;width:8px;height:8px;border-radius:50%;border:1.5px solid var(--c);margin-right:4px;vertical-align:-1px}
.wc.a.fertig{opacity:.55;text-decoration:line-through}
.wc.s{background:var(--sc);color:#fff;font-weight:700;pointer-events:none}
.wc.s .nm{font-style:normal;font-weight:500;margin-left:4px}
.wc.mehr{background:var(--fill);color:var(--muted);text-align:center;font-weight:600}
.schmal .wc{font-size:9px;height:15px;line-height:15px;padding:0 2px;border-radius:3px}
.schmal .wc.t{box-shadow:inset 2px 0 0 var(--c);padding-left:3px}
.schmal .wc.a::before{width:6px;height:6px;margin-right:2px}
.schmal .wc.s .nm{display:none}
.wstunden{position:relative}
.wstunden span{position:absolute;right:4px;transform:translateY(-50%);font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums;line-height:1}
.wstunden span:first-child{transform:translateY(3px)}
.schmal .wstunden span{font-size:9px;right:3px}
.schmal .wstunden small{display:none}
.wspalte{position:relative;min-width:0;border-left:1px solid var(--line);background-image:repeating-linear-gradient(to bottom,var(--line) 0 1px,transparent 1px var(--hpx));cursor:pointer}
/* Vergangene Tage: leicht grau, ohne Farbe – so sieht man sofort, wo man ist */
.wspalte.vorbei,.wkg.vorbei{background-color:color-mix(in srgb,var(--fg) 5%,transparent)}
.wkh.vorbei{color:var(--muted)}
.wspalte.vorbei>.wband{opacity:.3}
.wspalte.vorbei>*,.wkg.vorbei>*{filter:grayscale(1);opacity:.6}
.mtag.vorbei,.mtag.vorbei.mschichttag,.mtag.fremd.vorbei.mschichttag{background:color-mix(in srgb,var(--fg) 6%,var(--card))}
.mtag.vorbei>*{filter:grayscale(1);opacity:.55}
.schichtmonat .stag.vorbei,.schichtmonat .stag.vorbei.belegt{background:color-mix(in srgb,var(--fg) 6%,var(--card));box-shadow:none}
.schichtmonat .stag.vorbei>*{filter:grayscale(1);opacity:.55}
/* Formulare in Blättern: lose Felder als Karten wie gruppierte iOS-Listen, Eingaben ohne Rahmen */
dialog:not(.pop) form>.feld,dialog:not(.pop) form>.reihe,dialog:not(.pop) form>label.check{background:var(--card);border-radius:var(--r-karte);padding:var(--s3) var(--s4);margin:0}
dialog:not(.pop) form>label.check{min-height:44px;display:flex;align-items:center;gap:var(--s3)}
dialog:not(.pop) form>.feld input,dialog:not(.pop) form>.feld select,dialog:not(.pop) form>.feld textarea,dialog:not(.pop) form>.reihe .feld input,dialog:not(.pop) form>.reihe .feld select{background:var(--card2);border-color:transparent}
dialog:not(.pop) form>.feld input:focus,dialog:not(.pop) form>.reihe .feld input:focus,dialog:not(.pop) form>.feld textarea:focus{border-color:var(--accent)}
.mtag.vorbei .mnr{color:var(--muted)}
.wspalte.ziel-drop,.wkg.ziel-drop{outline:2px dashed var(--accent);outline-offset:-2px}
.wband{position:absolute;z-index:1;box-sizing:border-box;pointer-events:none;overflow:hidden;background:color-mix(in srgb,var(--k) 26%,transparent);border-left:3px solid var(--k);padding:2px 3px;font-size:10px;font-weight:600;line-height:1.15;color:var(--fg)}
.wband span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wband b{font-weight:800}
.schmal .wband{border-left-width:2px;padding:1px;font-size:8.5px}
/* 3-Tage-Ansicht am Handy */
.wcal.drei{--rand:38px;overflow:visible;overscroll-behavior:auto}
.wcal.drei .wsticky{top:0;border-radius:var(--r-karte) var(--r-karte) 0 0}
.wcal.drei .wband{left:calc(var(--bi) * 7px + 1px)!important;width:5px!important;padding:0;border:0;border-radius:3px;background:var(--k)}
.wcal.drei .wband span{display:none}
.wcal.drei .block{margin-left:calc(var(--nb,0) * 7px);max-width:calc(100% - var(--nb,0) * 7px - 2px);border-radius:8px;padding:3px 7px}
.wcal.drei .block b{font-size:var(--t-fuss)}
.wcal.drei .block.a b{white-space:nowrap;display:block}
.wcal.drei .block.t b{white-space:normal;display:-webkit-box;-webkit-line-clamp:var(--zl,1);-webkit-box-orient:vertical}
.wcal.drei .block span{font-size:var(--t-tab)}
.wcal.drei .wkh b{font-size:var(--t-kopf)}
.wcal.drei .wc.s .nm{display:inline}
.monat.rein-r{animation:w-rein-r .28s var(--bewegung)}
.monat.rein-l{animation:w-rein-l .28s var(--bewegung)}
.wcal.rein-r .wkoerper,.wcal.rein-r .wsticky{animation:w-rein-r .28s var(--bewegung)}
.wcal.rein-l .wkoerper,.wcal.rein-l .wsticky{animation:w-rein-l .28s var(--bewegung)}
@keyframes w-rein-r{from{transform:translateX(40px);opacity:.3}}
@keyframes w-rein-l{from{transform:translateX(-40px);opacity:.3}}
@media (prefers-reduced-motion:reduce){.monat.rein-r,.monat.rein-l,.wcal.rein-r .wkoerper,.wcal.rein-l .wkoerper,.wcal.rein-r .wsticky,.wcal.rein-l .wsticky{animation:none}}
.wleiste{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:0 0 var(--s2)}
.wleiste button{display:grid;justify-items:center;gap:2px;min-height:48px;padding:4px 0;border:0;border-radius:12px;background:transparent;color:var(--fg);font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.wleiste button small{font-size:10px;font-weight:600;color:var(--muted)}
.wleiste button b{font-size:15px;font-weight:600;width:28px;height:28px;display:grid;place-items:center;border-radius:50%}
.wleiste button.an{background:var(--fill)}
.wleiste button.heute b{background:var(--rot);color:#fff}
.wleiste button.vorbei{color:var(--muted)}
.wleiste .pk{display:flex;gap:2px;height:5px}
.wleiste .pk i{width:5px;height:5px;border-radius:50%;background:var(--sc)}
.schmal .wband.geteilt span{font-size:0}
.schmal .wband.geteilt b{font-size:9px}
.wcal .block{z-index:2;font-size:11px;line-height:1.2;padding:2px 4px;border-radius:5px}
.wcal .block b{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;white-space:normal;overflow:hidden;overflow-wrap:anywhere}
.schmal .wcal .block{font-size:9px;padding:1px 2px;border-radius:3px;box-shadow:inset 2px 0 0 var(--k)}
.schmal .wcal .block.a{box-shadow:inset 0 0 0 1.5px var(--k)}
.wjetzt{position:absolute;left:0;right:0;height:2px;margin-top:-1px;background:var(--rot);z-index:4;pointer-events:none}
.wjetzt::before{content:"";position:absolute;left:-1px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--rot)}
.schmal .wrap:has(.monat){padding-bottom:0}
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
.kalzeile{display:grid;grid-template-columns:12px minmax(0,1fr) auto;align-items:center;gap:var(--s3);cursor:pointer}
.kalzeile .punkt{width:12px;height:12px;border-radius:50%;background:var(--b)}
.kalzeile .n{overflow-wrap:anywhere;color:var(--fg);font-weight:500}
.kalzeile .schalter{width:22px;height:22px;accent-color:var(--accent-fill);margin:0}
/* Schichtplan */
.stempelleiste{display:flex;gap:var(--s2);overflow-x:auto;padding:2px 2px var(--s2);scrollbar-width:none;-webkit-overflow-scrolling:touch}
.stempelleiste::-webkit-scrollbar{display:none}
.stempel{flex:none;display:inline-flex;align-items:center;gap:var(--s2);min-height:44px;padding:0 var(--s3) 0 6px;border-radius:var(--r-voll);border:1.5px solid color-mix(in srgb,var(--k,var(--muted)) 45%,transparent);background:var(--card);color:var(--fg);cursor:pointer;font-weight:600;font-size:var(--t-fuss)}
.stempel .skurz{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--k,var(--fill));color:#fff;font-weight:800}
.stempel.radierer .skurz{background:var(--fill);color:var(--fg)}
.stempel.radierer svg{width:16px;height:16px}
.stempel[aria-pressed="true"]{background:color-mix(in srgb,var(--k,var(--muted)) 18%,var(--card));border-color:var(--k,var(--fg));box-shadow:0 0 0 3px color-mix(in srgb,var(--k,var(--muted)) 25%,transparent)}
.schichtmonat .stag{display:grid;grid-template-rows:auto 1fr auto;justify-items:center;align-items:center;gap:2px;min-height:72px;padding:6px 2px;border:0;border-radius:12px;background:var(--card);color:var(--fg);cursor:pointer;font:inherit}
.schmal .schichtmonat .stag{min-height:58px}
.schichtmonat .stag .mnr{font-size:var(--t-fuss);font-weight:600;color:var(--muted)}
.schichtmonat .stag .mnr{width:26px;height:26px;display:grid;place-items:center;border-radius:50%}
.schichtmonat .stag.fremd{opacity:.4}
.schichtmonat .stag.belegt{background:color-mix(in srgb,var(--k) 16%,var(--card));box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--k) 55%,transparent)}
.schichtmonat .stag .skurz{display:inline-grid;place-items:center;min-width:30px;height:30px;padding:0 4px;border-radius:9px;background:var(--k);color:#fff;font-weight:800;font-size:var(--t-sub)}
.schichtmonat .stag .szeit{font-size:var(--t-klein);color:var(--muted);font-variant-numeric:tabular-nums}
.schmal .schichtmonat .stag .szeit{display:none}
.schichtmonat .stag:active{transform:scale(.96)}
.schicht-fuss{display:grid;gap:var(--s3);margin-top:var(--s3)}
.sich-kopf{margin:var(--s2) 0}
.sich-liste{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.sich-liste li{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);padding:8px var(--s3);border-radius:var(--r-feld);background:var(--card)}
.sich-liste li.frage{flex-wrap:wrap;background:var(--fill)}
.sich-text{display:grid;min-width:0;flex:1 1 200px}
.sich-knoepfe{display:flex;gap:var(--s2);flex-wrap:wrap}
.stat-raster{display:grid;gap:var(--s5)}
.stat-raster.zwei{grid-template-columns:repeat(2,minmax(0,1fr))}
.schmal .stat-raster.zwei{grid-template-columns:1fr}
dialog:has(.stat-raster.zwei){width:min(820px,calc(100vw - 32px))}
.schmal dialog:has(.stat-raster.zwei){width:100%}
.stat-spalte h3{margin:0 0 var(--s2);font-size:var(--t-kopf)}
.stat-spalte h4{margin:var(--s4) 0 var(--s2);font-size:var(--t-sub);color:var(--muted);font-weight:600}
.stat{margin:0;display:grid;gap:1px;background:var(--line,var(--fill));border-radius:var(--r-karte);overflow:hidden}
.stat>div{display:flex;justify-content:space-between;align-items:baseline;gap:var(--s3);padding:10px var(--s3);background:var(--card)}
.stat dt{color:var(--muted);font-size:var(--t-sub)}
.stat dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.stat .gross dd{font-size:20px}
.stat dd.plus{color:var(--accent)}
.stat-arten{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.stat-arten li{display:flex;align-items:center;gap:var(--s3);padding:6px var(--s3);border-radius:var(--r-feld);background:var(--card)}
.stat-arten .skurz{flex:none;min-width:30px;height:26px;padding:0 4px;display:grid;place-items:center;border-radius:8px;background:var(--k);color:#fff;font-weight:700;font-size:13px}
.stat-arten .stat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stat-arten .stat-n{font-variant-numeric:tabular-nums;font-weight:600}
.schicht-summe{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;font-size:var(--t-sub)}
.wpunkt.s{background:color-mix(in srgb,var(--k) 16%,var(--card));box-shadow:inset 3px 0 0 var(--k)}
.wpunkt.s b{color:var(--k);filter:brightness(.85)}
.termin.schicht{cursor:default}
.schichtzeile{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:var(--s3);align-items:center;text-align:left}
.schichtzeile .skurz{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--k);color:#fff;font-weight:800}
.schichtzeile .szeit{color:var(--muted);font-variant-numeric:tabular-nums}
.schichtzeile.aktiv{background:color-mix(in srgb,var(--k) 14%,transparent)}
.sarten{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.sart,.sart-kopf{display:grid;grid-template-columns:44px minmax(0,2fr) 56px minmax(0,1fr) minmax(0,1fr) 64px 76px 44px;gap:var(--s2);align-items:center}
.sart-kopf{font-size:var(--t-klein);color:var(--muted);font-weight:600}
.sart input[type=color]{width:40px;height:40px;padding:0;border:0;border-radius:10px;background:none}
.schmal .sart-kopf{display:none}
.schmal .sart{grid-template-columns:44px minmax(0,1fr) 56px 44px;padding:var(--s2);border-radius:12px;background:var(--card)}
.schmal .sart .sa-von,.schmal .sart .sa-bis{grid-column:span 1}
.schmal .sart .sa-von{grid-column:1 / span 2}
.schmal .sart .sa-bis{grid-column:3 / span 2}
.schmal .sart .sa-pause{grid-column:1 / span 2}
.schmal .sart .sa-kal{grid-column:3 / span 2}
.sa-kal{display:inline-flex;align-items:center;gap:6px;min-height:44px;font-size:var(--t-klein);color:var(--muted)}
.sa-kal input{width:20px;height:20px}
.schicht-start{display:grid;gap:var(--s3);justify-items:start;padding:var(--s4);border-radius:var(--r-karte);background:var(--card);margin-bottom:var(--s3)}
.schicht-start p{margin:0;line-height:1.45}
.stempel.neu{border-style:dashed}
.stempel.neu .skurz{background:var(--fill);color:var(--fg)}
.stempel.neu svg{width:16px;height:16px}
.schicht-wer{display:flex;flex-wrap:wrap;gap:var(--s2);margin-bottom:var(--s3)}
.schichtmonat.beide .stag{cursor:default;grid-template-rows:auto 1fr}
.sbeide{display:grid;gap:3px;justify-items:center;width:100%}
.sb{display:inline-flex;align-items:center;gap:3px;min-width:0;max-width:100%;padding:1px 6px 1px 2px;border-radius:7px;background:var(--k);color:#fff;font-weight:800;font-size:var(--t-klein)}
.sb i{font-style:normal;display:inline-grid;place-items:center;width:16px;height:16px;border-radius:5px;background:rgb(255 255 255 / .28);font-size:10px}
.sb.leer{background:var(--fill);color:var(--muted)}
.sb.leer i{background:transparent}
.rh-vorschau{display:flex;flex-wrap:wrap;gap:6px}
.rh-tag{display:grid;justify-items:center;min-width:44px;padding:4px 6px;border-radius:10px;background:color-mix(in srgb,var(--k,var(--muted)) 16%,var(--card));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--k,var(--muted)) 40%,transparent)}
.rh-modus{margin-bottom:var(--s3)}
.rh-info{flex-basis:100%;color:var(--muted);font-size:var(--t-klein)}
.rh-tag small{font-size:10px;color:var(--muted)}
.rh-tag b{color:var(--k,var(--muted))}
/* ---------- Notizen ---------- */
.notiz-hinweis{margin:0 0 var(--s1)}
.notiz-pin{flex:none;color:var(--accent);display:inline-grid;place-items:center}
.notiz-pin svg{width:14px;height:14px;fill:currentColor}
.ngruppe{display:grid;gap:var(--s2);margin-bottom:var(--s5)}
.ngruppe h2{margin:0 var(--s3);font-size:var(--t-text);font-weight:700;letter-spacing:-.01em}
.nliste{list-style:none;margin:0;padding:0;background:var(--card);border-radius:var(--r-karte);overflow:hidden;box-shadow:var(--karte-schatten)}
.nrow{position:relative;background:var(--card);overflow:hidden}
.nrow-aktionen{position:absolute;top:0;right:0;bottom:0;width:168px;display:flex;visibility:hidden}
.nrow.zieht .nrow-aktionen,.nrow.offen .nrow-aktionen{visibility:visible}
.nrow-aktionen button{flex:1;border:0;padding:0 var(--s2);color:#fff;font:inherit;font-size:var(--t-sub);font-weight:600;cursor:pointer}
.nrow-an{background:#ff9f0a}
.nrow-weg{background:#ff3b30}
.nrow-zeile{position:relative;z-index:1;display:flex;flex-direction:column;gap:2px;align-items:stretch;text-align:left;width:100%;min-height:62px;padding:10px var(--s4);border:0;border-radius:0;background:var(--card);color:var(--fg);font:inherit;cursor:pointer;touch-action:pan-y;transition:transform .25s var(--bewegung);-webkit-user-select:none;user-select:none}
.nrow-zeile::before{content:"";position:absolute;top:0;left:var(--s4);right:0;height:1px;background:var(--line)}
.nrow:first-child .nrow-zeile::before{display:none}
.nrow.zieht .nrow-zeile{transition:none}
.nrow.offen .nrow-zeile{transform:translateX(-168px)}
.nrow-zeile:active{background:var(--fill)}
.nrow-titel{display:flex;gap:var(--s2);align-items:center;font-weight:600;font-size:var(--t-text);line-height:1.3;min-width:0}
.nrow-titel>span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.nrow-unter{display:flex;gap:var(--s2);align-items:baseline;min-width:0;color:var(--muted);font-size:var(--t-sub);line-height:1.35}
.nrow-zeit{flex:none;color:var(--fg);opacity:.75;font-variant-numeric:tabular-nums}
.nrow-vor{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.nrow-vor .fort{font-variant-numeric:tabular-nums}
.nz-leiste{display:flex;gap:var(--s2);padding:var(--s2) 0;margin-bottom:var(--s1);background:transparent}
.nz-leiste .knopf{font:inherit;font-size:var(--t-sub);font-weight:600;min-height:40px;gap:6px;background:var(--fill);border:0;box-shadow:none;color:var(--fg)}
.nz-leiste .knopf svg{width:20px;height:20px;color:var(--accent)}
.nz-leiste .knopf[aria-pressed="true"]{color:var(--accent)}
.nz-liste{display:flex;flex-direction:column;min-height:40vh;padding-bottom:var(--s4)}
.nz{display:flex;gap:var(--s2);align-items:flex-start;min-width:0}
.nz textarea{flex:1;min-width:0;display:block;border:0;background:transparent;color:var(--fg);padding:5px 0;margin:0;font:inherit;font-size:max(16px,var(--t-text));line-height:1.45;resize:none;overflow:hidden;border-radius:0;box-shadow:none;outline:none;min-height:0;-webkit-appearance:none;appearance:none}
.nz textarea::placeholder{color:var(--muted);font-weight:500}
.nz-titel textarea{font-size:26px;font-weight:700;letter-spacing:-.015em;line-height:1.25;padding:var(--s2) 0}
.nz-box{flex:none;width:30px;height:30px;margin:0 0 0 -4px;padding:0;border:0;background:transparent;display:grid;place-items:center;cursor:pointer;color:var(--muted);-webkit-tap-highlight-color:transparent}
.nz-box::before{content:"";width:22px;height:22px;border-radius:50%;border:1.5px solid currentColor;box-sizing:border-box;display:block}
.nz[data-ok="1"] .nz-box{color:var(--accent)}
.nz[data-ok="1"] .nz-box::before{background:var(--accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 12.5l4 4 8-9'/%3E%3C/svg%3E") center/16px no-repeat;border-color:var(--accent)}
.nz[data-ok="1"] textarea{color:var(--muted);text-decoration:line-through}
.notiz-pinknopf{justify-content:flex-start;gap:var(--s2);min-height:44px;width:100%}
.notiz-pinknopf svg{width:20px;height:20px}
.notiz-pinknopf[aria-pressed="true"]{color:var(--accent);border-color:var(--accent)}
.notiz-pinknopf[aria-pressed="true"] svg{fill:currentColor}
/* Handy-Feinschliff (v0.9) */
.schmal header h1{font-size:clamp(24px,7.4vw,var(--t-gross))}
.schmal .seg button{min-height:44px}
.q-zeiten input[type=time],#w-datum{min-height:44px;padding:0 var(--s2);border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font:inherit;font-size:max(16px,var(--t-text))}
.kalzeile .schalter,.kal-tab input[type=checkbox]{position:relative}
.kalzeile .schalter::before,.kal-tab input[type=checkbox]::before{content:"";position:absolute;inset:-11px}
.wahl-blatt .wahlzeile:focus-visible{outline-offset:-3px}
.wahl-blatt .wahlzeile:focus:not(:focus-visible){outline:none}
.mehr-knopf{flex:none;display:grid;place-items:center;width:44px;height:44px;margin:-6px -8px -6px 0;border:0;background:none;color:var(--muted);border-radius:50%;cursor:pointer}
.mehr-knopf svg{width:18px;height:18px}
.mehr-knopf:active{background:var(--fill)}
.schmal .fab.weg{transform:translateY(140%) scale(.8);opacity:0;pointer-events:none}
.fab{transition:transform .25s var(--bewegung),opacity .2s ease}
.schmal nav.tabs{background:color-mix(in srgb,var(--bg) 86%,transparent);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6)}
.schmal nav.tabs button{font-size:11px}
.tag-blatt .blatt-kopf h2{display:grid;justify-items:center;line-height:1.15}
.tag-unter{font-size:var(--t-klein);font-weight:500;color:var(--muted)}
.tag-r{display:inline-flex;align-items:center;gap:var(--s1);justify-self:end}
.t-zeiten{flex-wrap:wrap}
.t-zeiten .t-datum-f{flex-basis:100%}
.t-zeiten #t-von-f,.t-zeiten #t-bis-f{flex:1 1 0;min-width:0}
/* Schicht-Formular (iOS-Stil) */
.sliste{list-style:none;margin:0;padding:0;border-radius:var(--r-karte);background:var(--card);overflow:hidden}
.sliste li+li{border-top:1px solid var(--line)}
.szeile{display:flex;align-items:center;gap:var(--s3);width:100%;min-height:60px;padding:var(--s2) var(--s4);border:0;background:none;color:var(--fg);font:inherit;text-align:left;cursor:pointer}
.szeile:active{background:var(--fill)}
.szeile .skurz{flex:none;display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--k);color:#fff;font-weight:800}
.szeile.neu .skurz{background:var(--fill);color:var(--accent)}
.szeile.neu b{color:var(--accent)}
.szeile svg{width:18px;height:18px;color:var(--muted);flex:none}
.szeile .skurz svg{color:inherit}
.sz-text{flex:1;min-width:0;display:grid;gap:2px}
.sz-text small{color:var(--muted);font-size:var(--t-sub)}
.sform{display:grid;gap:var(--s4);padding-top:var(--s2)}
.svorschau{display:flex;align-items:center;justify-content:center;gap:var(--s3);padding:var(--s3);font-size:var(--t-titel,20px);font-weight:700}
.svorschau .skurz{display:inline-grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--k);color:#fff;font-size:22px;font-weight:800;box-shadow:0 4px 14px color-mix(in srgb,var(--k) 45%,transparent)}
.sgruppe{border-radius:var(--r-karte);background:var(--card);overflow:hidden}
.sgruppe .szeile-feld+.szeile-feld,.sgruppe > * + *,#sf-zeiten .szeile-feld{border-top:1px solid var(--line)}
.szeile-feld{display:flex;align-items:center;gap:var(--s3);min-height:52px;padding:0 var(--s4);font-size:var(--t-text)}
.szeile-feld > span{flex:none;min-width:90px}
.szeile-feld input:not([type=checkbox]),.szeile-feld select{flex:1;min-width:0;min-height:44px;border:0;background:transparent;color:var(--fg);font:inherit;font-size:max(16px,var(--t-text));text-align:right;padding:0;outline:none}
.szeile-feld input::placeholder{color:var(--muted)}
.szeile-feld input[type=time]{justify-content:flex-end}
.schalter-zeile{justify-content:space-between}
.schalter-zeile > span{flex:1}
input[role=switch]{appearance:none;-webkit-appearance:none;flex:none;width:51px;height:31px;border-radius:16px;background:var(--fill);position:relative;cursor:pointer;transition:background .2s ease;margin:0}
input[role=switch]::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.25);transition:transform .2s var(--bewegung)}
input[role=switch]:checked{background:#34c759}
input[role=switch]:checked::after{transform:translateX(20px)}
input[role=switch]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sfarben{flex:1;display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;padding:var(--s2) 0}
.sfarbe{width:30px;height:30px;border-radius:50%;border:0;background:var(--k);cursor:pointer;position:relative}
.sfarbe[aria-checked="true"]{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--k)}
.sfarbe-eigen{overflow:hidden;background:conic-gradient(#ff3b30,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff3b30)}
.sfarbe-eigen input[type=color]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0}
.sfarbe-eigen[aria-checked="true"]{background:var(--k)}
.knopf.gefahr{color:var(--rot)}
.knopf.breit{width:100%;justify-content:center}
/* Aufgeräumt (v0.9.1) */
.schmal header .datum{overflow:visible}
.stempel-hinweis:empty{display:none}
.schmal .kalleiste{flex-wrap:nowrap}
.schmal .kalleiste .seg{flex:1;min-width:0}
.schmal .schicht-summe{font-size:var(--t-klein)}
.stempelleiste.unten{margin-top:var(--s3)}
.schmal .stempelleiste.unten{position:sticky;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:3;padding:var(--s2);margin:var(--s3) calc(-1 * var(--s2)) 0;border-radius:var(--r-voll);background:color-mix(in srgb,var(--bg) 88%,transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
/* ---------- Kontextmenü (iOS-Stil) ---------- */
.menue{position:fixed;z-index:1000;min-width:220px;max-width:min(300px,calc(100vw - 16px));overflow:auto;overscroll-behavior:contain;padding:6px 0;border-radius:14px;background:color-mix(in srgb,var(--card) 97%,transparent);-webkit-backdrop-filter:var(--glas-blur);backdrop-filter:var(--glas-blur);box-shadow:0 12px 40px rgba(0,0,0,.22),0 0 0 .5px var(--line2);color:var(--fg);animation:menue-auf .18s var(--bewegung)}
.menue[data-seite="oben"]{animation-name:menue-auf-oben}
@keyframes menue-auf{from{opacity:0;transform:translateY(-6px) scale(.97)}}
@keyframes menue-auf-oben{from{opacity:0;transform:translateY(6px) scale(.97)}}
.menue-punkt{display:flex;align-items:center;gap:var(--s2);width:100%;min-height:44px;padding:0 var(--s4) 0 var(--s2);border:0;background:none;color:inherit;font:inherit;font-size:var(--t-text);text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
.menue-punkt:hover,.menue-punkt:focus-visible{background:var(--fill);outline:none}
.menue-punkt:focus-visible{box-shadow:inset 0 0 0 2px var(--focus)}
.menue-punkt:active{background:var(--fill2)}
.menue-punkt:disabled{opacity:.4;cursor:default}
.menue-punkt.gefahr{color:var(--rot)}
.menue-haken{flex:none;width:18px;display:grid;place-items:center;color:var(--accent)}
.menue-haken svg{width:16px;height:16px}
.menue-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.menue-pfeil{flex:none;color:var(--muted);font-size:20px;line-height:1}
.menue-icon{flex:none;width:22px;display:grid;place-items:center;color:var(--fg)}
.menue-punkt.gefahr .menue-icon{color:var(--rot)}
.menue-icon svg{width:20px;height:20px}
.menue-icon .g-h1{font-weight:800;font-size:19px}
.menue-icon .g-h2{font-weight:700;font-size:16px}
.menue-icon .g-t{font-weight:600;font-size:15px}
.menue-trenner{height:1px;margin:5px 0;background:var(--line)}
.menue-eingabe{display:flex;align-items:center;gap:var(--s1);padding:var(--s1) var(--s2) var(--s1) var(--s4)}
.menue-eingabe input{flex:1;min-width:0;min-height:40px;padding:0 var(--s2);border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font:inherit;font-size:max(16px,var(--t-text))}
.menue-eingabe .knopf{min-height:44px;padding:0 var(--s2)}
/* ---------- Notizen: Format, Tabellen, Links, Ordner ---------- */
.nz-leiste{position:sticky;z-index:1;align-items:center;margin:0 calc(-1 * var(--s4));padding:var(--s2) var(--s4);background:var(--bg)}
.nz-leiste .knopf{min-height:44px}
.nz-aa{font-weight:700;font-size:17px;letter-spacing:-.02em;color:var(--accent)}
.nz-leiste-luecke{flex:1}
.nz-mehr{width:44px;padding:0;justify-content:center}
.nz-mehr svg{width:22px!important;height:22px!important}
.nz-geteilt{display:inline-flex;align-items:center;gap:4px;font-size:var(--t-klein);font-weight:600;color:var(--accent);background:var(--mint-dim);border-radius:var(--r-voll);padding:3px var(--s2)}
.nz-geteilt[hidden]{display:none}
.nz-geteilt svg{width:15px;height:15px}
.nz-meta{display:flex;flex-wrap:wrap;gap:var(--s2);margin-top:calc(-1 * var(--s2))}
.nz-meta[hidden]{display:none}
.nz-chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 var(--s3);border:0;border-radius:var(--r-voll);background:var(--fill);color:var(--fg);font:inherit;font-size:var(--t-fuss);font-weight:500;cursor:pointer;position:relative}
.nz-chip::before{content:"";position:absolute;inset:-6px 0}
.nz-chip svg{width:15px;height:15px;color:var(--muted)}
.nz-punkt{display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--nf);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.menue-icon .nz-punkt{width:16px;height:16px}
dialog.nz-farbig .blatt-kopf{box-shadow:inset 0 -3px 0 var(--nf)}
.nz-h1 textarea{font-size:22px;font-weight:700;letter-spacing:-.01em;line-height:1.3;padding-top:var(--s2)}
.nz-h2 textarea{font-size:18px;font-weight:650;line-height:1.35;padding-top:6px}
.nz-mark{flex:none;min-width:22px;padding-top:5px;text-align:right;color:var(--muted);font-size:max(16px,var(--t-text));line-height:1.45;font-variant-numeric:tabular-nums}
.nz[data-art="num"] .nz-mark{min-width:26px}
.nz-tab{flex-direction:column;align-items:stretch;gap:var(--s1);padding:var(--s2) 0}
.nz-tab-scroll{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}
.nz-tabelle{border-collapse:collapse;min-width:100%;table-layout:fixed}
.nz-tabelle td{border:1px solid var(--line2);padding:0;min-width:96px;background:var(--card)}
.nz-tabelle tr:first-child td{background:var(--fill)}
.nz-tabelle tr:first-child .nz-zelle{font-weight:600}
.nz-zelle{display:block;width:100%;min-width:96px;min-height:40px;box-sizing:border-box;border:0;background:transparent;color:var(--fg);padding:6px var(--s2);font:inherit;font-size:max(16px,var(--t-sub));outline:none;border-radius:0}
.nz-zelle:focus{box-shadow:inset 0 0 0 2px var(--focus)}
.nz-tab-knoepfe{display:flex;gap:var(--s2)}
.nz-tab-knoepfe .knopf{min-height:36px;font-size:var(--t-fuss);gap:4px;background:var(--fill);border:0;box-shadow:none;color:var(--fg);position:relative}
.nz-tab-knoepfe .knopf::before{content:"";position:absolute;inset:-4px 0}
.nz-tab-knoepfe svg{width:16px;height:16px;color:var(--accent)}
.nz-tab-mehr{width:44px;padding:0;justify-content:center}
.nz-links{display:grid;gap:var(--s2)}
.nz-links[hidden]{display:none}
.nz-links-t{font-size:var(--t-klein);font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.nz-links ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:var(--s2)}
.nz-link{display:inline-flex;align-items:center;gap:6px;min-height:44px;max-width:100%;padding:0 var(--s3);border-radius:var(--r-voll);background:var(--mint-dim);color:var(--accent);font-size:var(--t-sub);font-weight:600;text-decoration:none}
.nz-link span:not(.sr){overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}
.nz-link svg{flex:none;width:17px;height:17px}
.nz-toast{display:flex;align-items:center;justify-content:space-between;gap:var(--s2);padding:var(--s1) var(--s1) var(--s1) var(--s4);border-radius:var(--r-feld);background:var(--fg);color:var(--bg);font-size:var(--t-sub);position:sticky;bottom:calc(var(--s2) + env(safe-area-inset-bottom,0px));z-index:2;box-shadow:0 6px 20px rgba(0,0,0,.2)}
.nz-toast[hidden]{display:none}
.nz-toast .knopf{color:var(--bg);min-height:44px}
.nsuche{margin:0 0 var(--s3);min-height:40px;background:var(--fill);border:0}
.nsuche input{min-height:40px;color:var(--fg);font-size:max(16px,var(--t-text))}
.nrow-farbe .nrow-zeile{box-shadow:inset 4px 0 0 var(--nf)}
.nrow-meta{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;margin-top:2px;min-width:0}
.nrow-ordner{display:inline-flex;align-items:center;gap:3px;font-size:var(--t-klein);color:var(--muted)}
.nrow-ordner svg{width:13px;height:13px}
.nrow-tag{font-size:var(--t-klein);font-weight:600;color:var(--accent);background:var(--mint-dim);border-radius:var(--r-voll);padding:0 6px;line-height:18px}
/* ---------- Menüs überall: Filter-Pillen, ⋯ pro Zeile, Personen-Kreis ---------- */
.pillen{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center;min-width:0;margin-top:calc(-1 * var(--s2))}
.pille{display:inline-flex;align-items:center;gap:6px;min-height:36px;max-width:100%;min-width:0;padding:0 10px 0 12px;border:0;border-radius:var(--r-voll);background:var(--fill);color:var(--fg);font:inherit;font-size:var(--t-sub);font-weight:600;line-height:1.2;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent;transition:background .15s ease}
.pille::before{content:"";position:absolute;inset:-4px 0}
.pille:has(.wer-av){padding-left:6px}
.pille:active,.pille[aria-expanded="true"]{background:var(--fill2)}
@media (hover:hover){.pille:hover{background:var(--fill2)}}
.pille.aktiv{background:var(--mint-dim);color:var(--accent)}
.pille-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.pille .pfeil-runter{width:14px;height:14px;opacity:.65;margin-left:-2px}
.pille>svg:not(.pfeil-runter){width:16px;height:16px}
.pille .punkt{width:10px;height:10px}
.pille.filterchip{min-height:30px;padding:0 10px}
.pille.filterchip .chip-x{font-size:11px;opacity:.7;margin-left:2px}
.rund.wer-knopf .wer-av{width:30px;height:30px;font-size:14px}
.rund.wer-knopf .wer-av.alle svg{width:18px;height:18px}
.rund .filter-punkt{position:absolute;top:7px;right:7px;width:10px;height:10px;border-radius:50%;background:var(--accent-fill);box-shadow:0 0 0 2px var(--card)}
.menue-kopf{padding:8px 12px 2px;font-size:var(--t-klein);font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.wer-av{flex:none;display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--pf);color:#fff;font-size:11px;font-weight:700;line-height:1;letter-spacing:0;font-style:normal}
.wer-av.klein{width:14px;height:14px;font-size:9px;margin-right:4px;vertical-align:-2px}
.wer-av.alle{background:var(--fill2);color:var(--fg)}
.wer-av.alle svg{width:15px;height:15px}
.pille .wer-av{width:24px;height:24px;font-size:12px}
.menue-icon .wer-av{width:22px;height:22px;font-size:12px}
.menue-icon .rang{margin:0;min-width:20px;height:20px}
.zeile-av{margin:0 2px}
.nrow-av{margin-left:auto}
.mehr-knopf:focus-visible{outline-offset:-3px}
@media (hover:hover){
  .mehr-knopf:hover{background:var(--fill);color:var(--fg)}
  #rahmen:not(.schmal) li.aufgabe .mehr-knopf,#rahmen:not(.schmal) .nrow-mehr{opacity:0;transition:opacity .15s ease}
  #rahmen:not(.schmal) li.aufgabe:hover .mehr-knopf,#rahmen:not(.schmal) li.aufgabe:focus-within .mehr-knopf,
  #rahmen:not(.schmal) .nrow:hover .nrow-mehr,#rahmen:not(.schmal) .nrow:focus-within .nrow-mehr,
  #rahmen:not(.schmal) .mehr-knopf[aria-expanded="true"]{opacity:1}
}
#rahmen:not(.schmal) .aktionen{align-items:center}
#rahmen:not(.schmal) .aktionen .mehr-knopf{margin:-6px -4px}
.nrow-mehr{position:absolute;z-index:2;right:var(--s2);top:50%;margin:-22px 0 0}
#rahmen:not(.schmal) .nrow-zeile{padding-right:56px}
li.aufgabe .zeile,.nrow-zeile{-webkit-touch-callout:none}
.schmal li.aufgabe .zeile{-webkit-user-select:none;user-select:none}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media (forced-colors:active){.haken[aria-checked="true"]::before{forced-color-adjust:none;background:Highlight}.seg button[aria-pressed="true"],nav.tabs button[aria-current="page"]{outline:2px solid Highlight}}
.wpunkt.s b{filter:none;background:var(--k);padding:0 5px;border-radius:5px;color:#fff;margin-right:2px}
/* Schichtfarbe: Schrift je nach Helligkeit der gewählten Farbe hell oder dunkel */
@supports (color:oklch(from red l c h)){
.msk,.wc.s{color:oklch(from var(--sc) calc((0.72 - l) * 1000) 0 0)}
.stempel:not(.radierer):not(.neu) .skurz,.schichtmonat .stag .skurz,.schichtzeile .skurz,.szeile:not(.neu) .skurz,.svorschau .skurz,.sb:not(.leer),.wpunkt.s b{color:oklch(from var(--k) calc((0.72 - l) * 1000) 0 0)}
}
.sb i{background:color-mix(in srgb,currentColor 20%,transparent)}
.rh-tag b{color:var(--fg)}
`;

const HAKEN = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;


// Kennfarben für Personen (weiße Schrift, Kontrast ≥ 4.5:1); Gemeinsam immer Lila
const PERSON_FARBEN = ["#0064c8", "#c23d00", "#1d7a36", "#b0007a", "#5b5bd6"];
const PERSON_GEMEINSAM = "#8040a6";
const ICON = {
  runter: `<svg class="pfeil-runter" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  kopie: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/></svg>`,
  stift: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>`,
  heute: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9.5"/></svg>`,
  woche: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
  demnaechst: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
  eingang: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13.5l2.6-7.2A2 2 0 0 1 8 5h8a2 2 0 0 1 1.9 1.3l2.6 7.2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/></svg>`,
  einkauf: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2.2l2.3 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.3"/><circle cx="10" cy="20.5" r="1.2"/><circle cx="17" cy="20.5" r="1.2"/></svg>`,
  notizen: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7.5L19.5 8.5V18a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5z"/><path d="M14.5 3.5v5h5M8.5 13h7M8.5 16.5h4.5"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-.8 5.5L17.5 13h-11l3.3-3.5L9 4zM12 13v7"/></svg>`,
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
  mehr: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="5.5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="18.5" cy="12" r="1.9"/></svg>`,
  ordner: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>`,
  tabelle: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 10h17M3.5 14.5h17M12 5v14"/></svg>`,
  muell: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.2h9L17.5 7M10.2 10.5v5.5M13.8 10.5v5.5"/></svg>`,
  personen: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.3" r="2.5"/><path d="M15.8 14.2c2.4-.3 4.3 1.3 4.8 4.3"/></svg>`,
  link: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
  telefon: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6.5 3.8l2.6-.3 1.6 4-2 1.5a11 11 0 0 0 6.3 6.3l1.5-2 4 1.6-.3 2.6a2 2 0 0 1-2.1 1.8A16 16 0 0 1 4.7 5.9a2 2 0 0 1 1.8-2.1z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/></svg>`,
};

// ---------- Notiz-Format ----------
// Gespeichert wird reiner Text, damit Notizen überall lesbar bleiben:
// „# “ Überschrift, „## “ Zwischenüberschrift, „• “ Aufzählung, „1. “ Nummerierung, „☐ “/„☑ “ Checkliste,
// „| a | b |“ Tabellenzeile, **fett**. Die erste Zeile ist der Titel.
const NOTIZ_FARBEN = [["Rot", "#ff3b30"], ["Orange", "#ff9500"], ["Gelb", "#ffcc00"], ["Grün", "#34c759"], ["Türkis", "#00c7be"], ["Blau", "#007aff"], ["Lila", "#af52de"], ["Grau", "#8e8e93"]];
function notizZeileLesen(z) {
  z = String(z ?? "");
  if (z.startsWith("## ")) return { art: "h2", wert: z.slice(3) };
  if (z.startsWith("# ")) return { art: "h1", wert: z.slice(2) };
  if (z === "•" || z.startsWith("• ")) return { art: "bullet", wert: z.slice(2) };
  let m = /^(\d{1,3})\. /.exec(z);
  if (m) return { art: "num", wert: z.slice(m[0].length) };
  m = /^([☐☑]) ?/.exec(z);
  if (m) return { art: "check", wert: z.slice(m[0].length), ok: m[1] === "☑" };
  if (z === "|" || z.startsWith("| ")) return { art: "table", wert: z };
  return { art: "text", wert: z };
}
function notizZellen(z) {
  let s = z === "|" ? "" : z.slice(2);
  if (s.endsWith(" |")) s = s.slice(0, -2); else if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split(" | ");
}
const notizOhneFett = (s) => String(s || "").replace(/\*\*(.+?)\*\*/g, "$1");
// Zeile als lesbarer Text für Vorschau und Suche (ohne Präfixe)
function notizKlartext(z) {
  const p = notizZeileLesen(z);
  return notizOhneFett(p.art === "table" ? notizZellen(z).map((c) => c.trim()).filter(Boolean).join(" · ") : p.wert).trim();
}
function notizTags(text) {
  const raus = new Set();
  for (const m of String(text || "").matchAll(/(^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,39})/gu)) {
    if (/\p{L}/u.test(m[2])) raus.add(m[2].toLowerCase());
  }
  return [...raus];
}
// Links, E-Mail-Adressen und Telefonnummern im Text
function notizLinks(text) {
  const t = String(text || "");
  const raus = [], gesehen = new Set(), belegt = [];
  const frei = (a, b) => !belegt.some(([x, y]) => a < y && b > x);
  const dazu = (art, roh, href, a) => {
    belegt.push([a, a + roh.length]);
    if (gesehen.has(href)) return;
    gesehen.add(href); raus.push({ art, text: roh, href });
  };
  for (const m of t.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"'|]+/gi)) {
    const u = m[0].replace(/[.,;:!?)\]}*]+$/, "");
    if (u.length > 4) dazu("web", u, /^www\./i.test(u) ? `https://${u}` : u, m.index);
  }
  for (const m of t.matchAll(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu)) {
    if (frei(m.index, m.index + m[0].length)) dazu("mail", m[0], `mailto:${m[0]}`, m.index);
  }
  for (const m of t.matchAll(/(^|[^\p{L}\p{N}+])((?:\+\d{1,3}|0)[\d /-]{5,18}\d)(?!\d)/gu)) {
    const a = m.index + m[1].length, roh = m[2].trim();
    const ziffern = roh.replace(/\D/g, "");
    if (ziffern.length < 6 || ziffern.length > 16 || !frei(a, a + roh.length)) continue;
    dazu("tel", roh, `tel:${roh.replace(/[ /-]/g, "")}`, a);
  }
  return raus;
}

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
      if (this._ansicht === "demnaechst") this._ansicht = "heute";
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
    // Plus-Knopf beim Runterscrollen ausblenden, damit er keine Zeilen verdeckt; beim Hochscrollen wieder da
    this._rollen ||= (e) => {
      const el = e.target === document || e.target === window ? document.scrollingElement : e.target;
      if (!el || el.classList?.contains("tl-scroll") || el.closest?.("dialog")) return;
      const y = el.scrollTop || 0, alt = this._rollY?.get?.(el) ?? 0;
      (this._rollY ||= new WeakMap()).set(el, y);
      if (!e.target.closest || el === document.scrollingElement) this.shadowRoot?.getElementById("rahmen")?.classList.toggle("eingerollt", !!this._narrow && y > 44);
      if (Math.abs(y - alt) < 6) return;
      this.shadowRoot?.querySelector(".fab")?.classList.toggle("weg", y > alt && y > 40);
    };
    window.addEventListener("scroll", this._rollen, { capture: true, passive: true });
    this.shadowRoot?.addEventListener("scroll", this._rollen, { capture: true, passive: true });
    if (this._hass) this._start();
    else this._zeichnen();
  }
  disconnectedCallback() {
    document.removeEventListener("keydown", this._tasten);
    if (this._kalGroesse) { window.removeEventListener("resize", this._kalGroesse); this._kalGroesse = null; }
    this._monatRO?.disconnect(); this._monatRO = null; this._wocheRO?.disconnect(); this._wocheRO = null;
    window.removeEventListener("scroll", this._rollen, { capture: true });
    this.shadowRoot?.removeEventListener("scroll", this._rollen, { capture: true });
    if (this._abo) this._abo.then((ab) => ab()).catch(() => {});
    this._abo = null;
  }

  async _start() {
    if (this._gestartet) return;
    this._gestartet = true;
    await this._lesen();
    this._termineLaden();
    this._wetterStart();
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
      const stand = this._sZaehler || 0;
      const neu = await this._hass.callWS({ type: "planer/lesen" });
      // Noch nicht gespeicherte oder gerade gesendete Schichten über die Serverdaten legen (sonst flackern sie)
      this._schichtenDrueber(neu);
      this._daten = neu;
      this._fehler = "";
      // War währenddessen eine Sendung fertig geworden, kann die Antwort veraltet sein: noch einmal lesen
      if (stand !== (this._sZaehler || 0) && !this._lesenNochmal) {
        this._lesenNochmal = true;
        try { await this._lesen(); } finally { this._lesenNochmal = false; }
        return;
      }
    } catch (e) {
      this._fehler = `Der Planer konnte nicht geladen werden (${e.message || e.code}). Ist die Integration unter Geräte & Dienste eingerichtet?`;
    }
    this._zeichnen();
    // Offene Notiz bekommt Änderungen von anderen Geräten mit
    try { this._notizLive?.(); } catch (e) { /* egal */ }
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
    return this._ohneSchichtTermine(this._termine || []).filter((t) => {
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
      // Gemeinsames steht auch in der Liste jeder einzelnen Person
      return a.person === f || a.person === GEMEINSAM;
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
      eingang: offen.length,
      woche: offen.filter((a) => a.datum && a.datum >= iso(montag(new Date())) && a.datum <= iso(plusTage(montag(new Date()), 6))).length,
      notizen: this._notizenSichtbar().length,
      einkauf: (this._eArtikel && this._eArtikel.liste === this._eListeId() ? this._eArtikel.items.filter((x) => !x.erledigt).length : 0),
    };
    const tabs = [["heute", "Heute"], ["woche", "Kalender"]];
    tabs.push(["notizen", "Notizen"]);
    if (this._ansicht === "eingang" || this._ansicht === "demnaechst") this._ansicht = "heute";
    if ((d.einkauf_listen || []).length) tabs.push(["einkauf", "Einkauf"]);
    if (this._ansicht === "einkauf" && !(d.einkauf_listen || []).length) this._ansicht = "heute";
    const heuteD = new Date();
    const einkauf = this._ansicht === "einkauf";
    const notizen = this._ansicht === "notizen";
    const tabName = (tabs.find(([k]) => k === this._ansicht) || tabs[0])[1];
    const pillen = this._pillenHtml();
    const eListen = d.einkauf_listen || [];
    const eName = einkauf && eListen.length > 1 ? (eListen.find((l) => l.id === this._eListeId()) || {}).name || "" : "";
    const eingabeSichtbar = !schmal || this._eingabeOffen;
    const kannTermin = (d.kalender || []).some((k) => k.schreiben);

    // Am Desktop sitzen die Reiter in der Kopfzeile, am Handy unten als Leiste
    const tabsHtml = `<nav class="tabs" aria-label="Ansichten">
        ${tabs.map(([k, t]) => `<button type="button" data-ansicht="${k}" data-fokus="t-${k}" ${this._ansicht === k ? 'aria-current="page"' : ""}>${(k === "eingang" ? ICON.aufgaben : ICON[k]) || ""}<span>${t}</span><span class="zahl ${!zaehler[k] ? "null" : ""}" aria-label="${zaehler[k]} ${k === "notizen" ? (zaehler[k] === 1 ? "Notiz" : "Notizen") : "offen"}">${zaehler[k]}</span></button>`).join("")}
      </nav>`;
    this._gerust(schmal);
    const neueAnsicht = this._zuletzt !== this._ansicht || (this._ansicht === "woche" && this._zuletztKal !== this._kalAnsicht);
    this._zuletzt = this._ansicht; this._zuletztKal = this._kalAnsicht;
    this._app.innerHTML = `
    <div class="kompakt-kopf" aria-hidden="true">${esc(tabName)}</div>
    <div class="wrap">
      <header>
        ${this._menuKnopf()}
        <div class="titel-block">
          <h1>${esc(tabName)}</h1>
          <span class="datum">${schmal ? WT_KURZ[wt(heuteD)] + "." : WOCHENTAGE[wt(heuteD)]}, ${heuteD.getDate()}. ${MONATE[heuteD.getMonth()]}${eName ? ` · ${esc(eName)}` : ""}</span>
        </div>
        ${schmal ? "" : tabsHtml}
        <div class="rechts">
          ${this._werKnopf()}
          <button type="button" class="rund" data-aktion="suche" data-fokus="suche" aria-label="Suchen" title="Suchen (Taste /)">${ICON.suche}</button>
          ${this._kopfEintraege().length ? `<button type="button" class="rund" data-aktion="kopf-menue" data-fokus="kopf-menue" aria-haspopup="menu" aria-expanded="false" aria-label="Weitere Aktionen${this._bereich && this._bereichFilterAn() ? `, Bereichsfilter aktiv: ${esc(this._bereich)}` : ""}" title="Weitere Aktionen">${ICON.mehr}${this._bereich && this._bereichFilterAn() ? '<span class="filter-punkt" aria-hidden="true"></span>' : ""}</button>` : ""}
        </div>
      </header>
      ${pillen}

      <form class="schnell" id="schnellform" autocomplete="off" ${eingabeSichtbar ? "" : "hidden"}>
        <label class="sr" for="schnell">${einkauf ? "Neuer Artikel" : notizen ? "Neue Notiz" : "Neue Aufgabe"}</label>
        <div class="eingabe">
          <input id="schnell" data-fokus="schnell" placeholder="${einkauf ? "Artikel, z. B. Milch, 2 Liter" : notizen ? "Neue Notiz, z. B. Ideen fürs Wochenende" : schmal ? "Neue Aufgabe" : "Neue Aufgabe, z. B. morgen 15 Uhr !1 Filament bestellen #werkstatt"}" aria-describedby="vorschau tipp" enterkeyhint="done">
          <button class="knopf primaer" type="submit" aria-label="${einkauf ? "Artikel hinzufügen" : notizen ? "Notiz hinzufügen" : "Aufgabe hinzufügen"}">${ICON.plus}${schmal ? "" : "Hinzufügen"}</button>
          ${schmal || notizen ? "" : `<button class="knopf" type="button" data-aktion="erweitert" title="Aufgabe mit allen Einstellungen anlegen">${ICON.regler}Erweitert</button>
          ${kannTermin ? `<button class="knopf" type="button" data-aktion="termin" title="Termin in den Kalender eintragen">${ICON.termin}Termin</button>` : ""}`}
        </div>
        ${schmal ? `<div class="zusatz">
          ${notizen ? "" : `<button class="knopf text" type="button" data-aktion="erweitert">${ICON.regler}Erweitert</button>
          ${kannTermin ? `<button class="knopf text" type="button" data-aktion="termin">${ICON.termin}Termin</button>` : ""}`}
          <button class="rund" type="button" data-aktion="eingabe-zu" aria-label="Eingabe schließen" title="Schließen" style="margin-left:auto;box-shadow:none">${ICON.zu}</button>
        </div>` : ""}
        <div class="hinweis" id="vorschau" aria-live="polite"></div>
        <span class="sr" id="tipp">${notizen ? "Titel der neuen Notiz eingeben. Danach öffnet sich der Editor. Taste N springt hierher." : ""}${einkauf ? "Menge nach dem Komma, zum Beispiel Milch, 2 Liter. Erscheint sofort auch in Bring!." : ""}Erkennt heute, morgen, Wochentage, Datum wie 24.12., Uhrzeit wie 15 Uhr, !1 bis !3 für Top 3, # für Bereich, @ für Person und Wiederholungen wie jeden Montag oder täglich. Taste N springt hierher.</span>
      </form>

      ${schmal ? tabsHtml : ""}

      <main id="inhalt">${this._ansichtHtml(alle, offen)}</main>
    </div>
    ${schmal && !this._eingabeOffen && !(this._ansicht === "woche" && this._kalAnsicht === "schichten") ? `<button type="button" class="fab" data-aktion="neu" data-fokus="fab" aria-label="${einkauf ? "Artikel hinzufügen" : notizen ? "Neue Notiz" : "Neue Aufgabe"}">${ICON.plus}</button>` : ""}`;
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
      if (el?.id === "n-suche") { try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* egal */ } }
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

  // ---------- Menüs: ⋯ oben, Filter-Pillen, Menü pro Eintrag ----------
  // Wem ein Eintrag gehört: kleiner runder Kreis mit Anfangsbuchstabe (G = Gemeinsam)
  _personFarbe(id) {
    if (id === GEMEINSAM) return PERSON_GEMEINSAM;
    const i = (this._daten?.personen || []).findIndex((p) => p.id === id);
    return PERSON_FARBEN[(i < 0 ? 0 : i) % PERSON_FARBEN.length];
  }
  _avatar(id, klasse = "") {
    const k = id === GEMEINSAM ? "G" : (this._name(id) || "?").charAt(0).toUpperCase();
    return `<span class="wer-av ${klasse}" style="--pf:${this._personFarbe(id)}" title="${esc(this._name(id))}" aria-hidden="true">${esc(k)}</span>`;
  }
  // Kalender-Reiter: bei „Gemeinsam“ und „Alle“ auch die Einzel-To-dos beider Personen (in den Aufgabenlisten bleibt Gemeinsam = nur Gemeinsames)
  _kalenderAufgaben() {
    const f = this._filter || "ich";
    if (f !== "alle" && f !== GEMEINSAM) return this._sichtbar();
    const b = this._bereich;
    return this._daten.aufgaben.filter((a) => !b || (a.bereich || "") === b || (a.tags || []).includes(b));
  }
  // Kleiner Avatar vor dem Titel, wenn im Kalender mehrere Personen gemischt sind
  _kalAv(a) {
    const f = this._filter || "ich";
    return f === "alle" || f === GEMEINSAM ? this._avatar(a.person, "klein") : "";
  }
  // Bei „Ich“ nur Gemeinsames kennzeichnen, sonst jeden Eintrag
  _werZeigen(person) {
    const f = this._filter || "ich";
    return f === "ich" ? person !== this._daten.ich : true;
  }
  _werText() {
    const f = this._filter || "ich";
    return f === "alle" ? "Alle" : f === GEMEINSAM ? "Gemeinsam" : f === "ich" ? "Ich" : this._name(f);
  }
  _bereichListe() {
    const d = this._daten;
    const l = [...new Set(d.aufgaben.filter((a) => a.status === "offen").flatMap((a) => [a.bereich, ...(a.tags || [])]).filter(Boolean))].sort();
    if (this._bereich && !l.includes(this._bereich)) l.push(this._bereich);
    return l;
  }
  _notizFilterListen() {
    const sichtbar = this._notizenSichtbar();
    const ordner = [...new Set(sichtbar.map((n) => n.ordner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
    const tags = [...new Set(sichtbar.flatMap((n) => this._notizTagsVon(n)))].sort((a, b) => a.localeCompare(b, "de"));
    if (this._nOrdner && !ordner.includes(this._nOrdner)) this._nOrdner = "";
    if (this._nTag && !tags.includes(this._nTag)) this._nTag = "";
    return { ordner, tags };
  }
  _pille(art, inhalt, label, aktiv) {
    return `<button type="button" class="pille${aktiv ? " aktiv" : ""}" data-menue="${art}" data-fokus="p-${art}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(label)}">${inhalt}${ICON.runter}</button>`;
  }
  // Personenwahl: runder Knopf in der Kopfzeile (Avatar), öffnet das Auswahl-Menü
  _werKnopf() {
    if (this._ansicht === "einkauf") return "";
    const d = this._daten, f = this._filter || "ich";
    const werId = f === "ich" ? d.ich : f === "alle" ? "" : f;
    const inhalt = werId ? this._avatar(werId) : `<span class="wer-av alle" aria-hidden="true">${ICON.personen}</span>`;
    return `<button type="button" class="rund wer-knopf" data-menue="wer" data-fokus="p-wer" aria-haspopup="menu" aria-expanded="false" aria-label="Wessen Einträge: ${esc(this._werText())}. Ändern" title="Wessen Einträge: ${esc(this._werText())}">${inhalt}</button>`;
  }
  // Der Bereichsfilter wirkt in Heute, Demnächst und Kalender
  _bereichFilterAn() { return ["heute", "woche"].includes(this._ansicht); }
  // Eine Zeile unter dem Titel nur, wenn es etwas anzuzeigen gibt (Bereichsfilter aktiv, Notizen-Filter)
  _pillenHtml() {
    const d = this._daten, v = this._ansicht;
    if (v === "einkauf") return "";
    const teile = [];
    const b = this._bereich;
    if (b && v !== "notizen" && this._bereichFilterAn()) {
      const name = b[0].toUpperCase() + b.slice(1);
      teile.push(`<button type="button" class="pille aktiv filterchip" data-aktion="bereich-weg" data-fokus="p-bereich" aria-label="Bereichsfilter ${esc(name)} entfernen"><span class="punkt" style="--b:${bereichFarbe(b, d.farben)}" aria-hidden="true"></span><span class="pille-text">Bereich: ${esc(name)}</span><span class="chip-x" aria-hidden="true">✕</span></button>`);
    }
    if (v === "notizen") {
      const { ordner, tags } = this._notizFilterListen();
      if (ordner.length || tags.length) {
        const t = [this._nOrdner, this._nTag ? `#${this._nTag}` : ""].filter(Boolean).join(" · ") || "Alle Notizen";
        teile.push(this._pille("notizen", `${this._nOrdner ? ICON.ordner : ""}<span class="pille-text">${esc(t)}</span>`, `Notizen filtern: ${t}. Ändern`, !!(this._nOrdner || this._nTag)));
      }
    }
    return teile.length ? `<div class="pillen" role="group" aria-label="Filter">${teile.join("")}</div>` : "";
  }
  _bereichSetzen(b) {
    this._bereich = b;
    try { localStorage.setItem("planer.bereich", b); } catch (e) { /* egal */ }
    this._zeichnen();
    this._sagen(b ? `Nur Bereich ${b}` : "Alle Bereiche");
  }

  _filterSetzen(f) {
    this._filter = f;
    try { localStorage.setItem("planer.filter", f); } catch (e) { /* egal */ }
    this._zeichnen();
    this._sagen(`Zeigt: ${this._werText()}`);
  }
  _werMenue(anker, info) {
    const d = this._daten, f = this._filter || "ich";
    const punkt = (id, text) => ({ text, icon: this._avatar(id), radio: true, aktiv: f === (id === d.ich ? "ich" : id), aktion: () => this._filterSetzen(id === d.ich ? "ich" : id) });
    this._menue(anker, [
      punkt(d.ich, "Ich"),
      ...(d.andere_sehen ? d.personen.filter((p) => p.id !== d.ich).map((p) => punkt(p.id, p.name.split(" ")[0])) : []),
      punkt(GEMEINSAM, "Gemeinsam"),
      d.andere_sehen ? "-" : null,
      d.andere_sehen ? { text: "Alle", icon: ICON.personen, radio: true, aktiv: f === "alle", aktion: () => this._filterSetzen("alle") } : null,
    ], { titel: "Wessen Einträge", tastatur: info?.tastatur });
  }
  _bereichMenue(anker, info) {
    const d = this._daten;
    const setzen = (b) => this._bereichSetzen(b);
    this._menue(anker, [
      { text: "Alle Bereiche", radio: true, aktiv: !this._bereich, aktion: () => setzen("") },
      "-",
      ...this._bereichListe().map((x) => ({ text: x[0].toUpperCase() + x.slice(1), icon: `<span class="nz-punkt" style="--nf:${bereichFarbe(x, d.farben)}"></span>`, radio: true, aktiv: this._bereich === x, aktion: () => setzen(x) })),
    ], { titel: "Bereich", tastatur: info?.tastatur });
  }
  _notizFilterMenue(anker, info) {
    const { ordner, tags } = this._notizFilterListen();
    const setzen = (o, t) => {
      this._nOrdner = o; this._nTag = t;
      this._zeichnen();
      this._sagen([o ? `Ordner ${o}` : "", t ? `#${t}` : ""].filter(Boolean).join(", ") || "Alle Notizen");
    };
    const zurueck = { text: "Zurück", icon: "‹", aktion: (i) => haupt(i) };
    const haupt = (i) => this._menue(anker, [
      { text: "Alle Notizen", radio: true, aktiv: !this._nOrdner && !this._nTag, aktion: () => setzen("", "") },
      "-",
      ordner.length ? { text: this._nOrdner ? `Ordner: ${this._nOrdner}` : "Ordner", icon: ICON.ordner, untermenue: true, aktion: ordnerM } : null,
      tags.length ? { text: this._nTag ? `Tag: #${this._nTag}` : "Tags", icon: '<span class="g-t">#</span>', untermenue: true, aktion: tagM } : null,
    ], { titel: "Notizen filtern", tastatur: i?.tastatur });
    const ordnerM = (i) => this._menue(anker, [zurueck, "-",
      { text: "Alle Ordner", radio: true, aktiv: !this._nOrdner, aktion: () => setzen("", this._nTag) },
      ...ordner.map((o) => ({ text: o, icon: ICON.ordner, radio: true, aktiv: this._nOrdner === o, aktion: () => setzen(o, this._nTag) })),
    ], { titel: "Ordner", tastatur: i?.tastatur });
    const tagM = (i) => this._menue(anker, [zurueck, "-",
      { text: "Alle Tags", radio: true, aktiv: !this._nTag, aktion: () => setzen(this._nOrdner, "") },
      ...tags.map((t) => ({ text: `#${t}`, radio: true, aktiv: this._nTag === t, aktion: () => setzen(this._nOrdner, t) })),
    ], { titel: "Tags", tastatur: i?.tastatur });
    haupt(info);
  }

  // Selten gebrauchte Aktionen der Ansicht (⋯ oben rechts). Ohne anker nur zum Zählen.
  _kopfEintraege(anker, zurueck) {
    const d = this._daten, v = this._ansicht;
    const termin = (d.kalender || []).some((k) => k.schreiben) ? { text: "Neuer Termin", icon: ICON.termin, aktion: () => this._terminNeu() } : null;
    let e = [];
    // Bereichsfilter (Heute, Demnächst, Kalender; im Kalender nicht bei Schichten)
    const bFilter = this._bereichFilterAn() && !(v === "woche" && this._kalAnsicht === "schichten") && (this._bereich || this._bereichListe().length) ? [
      { kopf: "Filter" },
      { text: this._bereich ? `Bereich: ${this._bereich[0].toUpperCase() + this._bereich.slice(1)}` : "Bereich: Alle", icon: this._bereich ? `<span class="nz-punkt" style="--nf:${bereichFarbe(this._bereich, d.farben)}"></span>` : ICON.filter, untermenue: true,
        aktion: (i) => this._menue(anker, [
          { text: "Zurück", icon: "‹", aktion: zurueck }, "-",
          { text: "Alle Bereiche", radio: true, aktiv: !this._bereich, aktion: () => this._bereichSetzen("") },
          ...this._bereichListe().map((x) => ({ text: x[0].toUpperCase() + x.slice(1), icon: `<span class="nz-punkt" style="--nf:${bereichFarbe(x, d.farben)}"></span>`, radio: true, aktiv: this._bereich === x, aktion: () => this._bereichSetzen(x) })),
        ], { titel: "Bereich", tastatur: i?.tastatur }) },
    ] : [];
    // Am PC stehen „Erweitert“ und „Termin“ schon neben der Eingabezeile, deshalb nur am Handy hier.
    if (v === "heute" && this._narrow) e = [{ text: "Neue Aufgabe mit allen Optionen", icon: ICON.regler, aktion: () => this._erweitert() }, termin];
    else if (v === "woche" && this._kalAnsicht === "schichten") {
      const aus = !this._schichtPerson();
      e = [
        { text: "Wiederholen …", icon: ICON.wdh, aus, aktion: () => this._schichtRhythmus() },
        { text: "Schichten bearbeiten …", icon: ICON.regler, aus, aktion: () => this._schichtArten() },
        { text: "Kalender & Erinnerung …", icon: ICON.woche, aus, aktion: () => this._schichtEinstellung() },
        { text: "Statistik …", icon: ICON.tabelle, aktion: () => this._schichtStatistik() },
      ];
    } else if (v === "woche") {
      const kal = d.kalender || [];
      e = [kal.length ? { text: `Kalender auswählen (${kal.filter((k) => k.angezeigt !== false).length}/${kal.length})`, icon: ICON.woche, aktion: () => this._kalenderWahl() } : null, termin];
    } else if (v === "notizen") e = [{ text: "Neue Notiz", icon: ICON.plus, aktion: () => this._aktion("neu") }];
    else if (v === "einkauf") {
      const listen = d.einkauf_listen || [];
      if (listen.length > 1) {
        const jetzt = this._eListeId();
        e = [{ text: `Liste: ${(listen.find((l) => l.id === jetzt) || {}).name || ""}`, icon: ICON.einkauf, untermenue: true, aktion: (i) => this._menue(anker, [
          { text: "Zurück", icon: "‹", aktion: zurueck }, "-",
          ...listen.map((l) => ({ text: l.name, radio: true, aktiv: l.id === jetzt, aktion: () => {
            this._eListe = l.id;
            try { localStorage.setItem("planer.eliste", l.id); } catch (err) { /* egal */ }
            this._zeichnen();
            this._sagen(`Liste ${l.name}`);
          } })),
        ], { titel: "Liste", tastatur: i?.tastatur }) }];
      }
    }
    // Abschnitt „Filter“: Bereich, Sortierung, Ausblenden
    if (v === "heute") e.push("-", ...bFilter, ...this._listenEintraege(anker, zurueck));
    else if (bFilter.length) e.push("-", ...bFilter);
    e = e.filter(Boolean);
    if (d.admin) e.push("-", { text: "Einstellungen", icon: ICON.einstellungen, aktion: () => this._einstellungen() });
    if (e[0] === "-") e.shift();
    return e;
  }
  _kopfMenue(anker, info) {
    const auf = (i) => this._menue(anker, this._kopfEintraege(anker, auf), { titel: "Weitere Aktionen", tastatur: i?.tastatur });
    auf(info);
  }

  // Menü pro Aufgabe (⋯, Rechtsklick, langes Drücken, Umschalt+F10)
  _aufgabeKopie(a) {
    return { titel: a.titel, datum: a.datum || null, uhrzeit: a.uhrzeit || null, dauer: a.dauer || null, person: a.person, top: a.top || null,
      bereich: a.bereich || "", tags: a.tags || [], notiz: a.notiz || "", wiederholung: a.wiederholung || null, erinnerungen: a.erinnerungen ?? null,
      teilaufgaben: (a.teilaufgaben || []).map((t) => ({ id: "", text: t.text, erledigt: t.erledigt })) };
  }
  async _aufgabeAendern(a, felder, text) {
    const vorher = {};
    for (const k of Object.keys(felder)) vorher[k] = a[k] ?? (k === "bereich" ? "" : null);
    try { await this._ws({ type: "planer/speichern", aufgabe: { id: a.id, ...felder } }); } catch (e) { return; }
    this._sagen(text);
    this._hinweis(text, () => this._ws({ type: "planer/speichern", aufgabe: { id: a.id, ...vorher } }));
    await this._lesen();
  }
  async _aufgabeDuplizieren(a) {
    let neu;
    try { neu = await this._ws({ type: "planer/speichern", aufgabe: this._aufgabeKopie(a) }); } catch (e) { return; }
    const text = `Dupliziert: ${a.titel}`;
    this._sagen(text);
    if (neu?.id) this._hinweis(text, () => this._ws({ type: "planer/loeschen", aufgabe_id: neu.id }));
    await this._lesen();
  }
  async _aufgabeLoeschen(a) {
    const kopie = this._aufgabeKopie(a);
    try { await this._ws({ type: "planer/loeschen", aufgabe_id: a.id }); } catch (e) { return; }
    this._sagen(`Gelöscht: ${a.titel}`);
    this._hinweis(`Gelöscht: ${a.titel}`, () => this._ws({ type: "planer/speichern", aufgabe: kopie }));
    await this._lesen();
  }
  _aufgabeMenue(a, anker, opt = {}) {
    const d = this._daten;
    const fertig = a.status === "erledigt";
    const o = (i, titel) => ({ titel, tastatur: i?.tastatur, punkt: opt.punkt });
    const gross = (x) => x[0].toUpperCase() + x.slice(1);
    const punktIcon = (f) => `<span class="nz-punkt" style="--nf:${f}"></span>`;
    const zurueck = { text: "Zurück", icon: "‹", aktion: (i) => haupt(i) };
    const verschiebenM = (i) => {
      const basis = new Date();
      const mo = plusTage(basis, 1);
      while (wt(mo) !== 0) mo.setDate(mo.getDate() + 1);
      const wahl = [["Heute", heute()], ["Morgen", iso(plusTage(basis, 1))], ["Übermorgen", iso(plusTage(basis, 2))],
        [`Nächsten Montag (${mo.getDate()}.${mo.getMonth() + 1}.)`, iso(mo)], ["In einer Woche", iso(plusTage(basis, 7))], ["Ohne Datum", ""]];
      this._menue(anker, [zurueck, "-",
        ...wahl.map(([t, dt]) => ({ text: t, radio: true, aktiv: (a.datum || "") === dt, aktion: () => this._verschieben(a, dt || null) })),
        "-",
        { text: "Datum wählen …", icon: ICON.woche, aktion: () => this._verschiebenWahl(a) },
      ], o(i, "Verschieben"));
    };
    const bereichM = (i) => {
      const liste = [...new Set([...Object.keys(BEREICH_STANDARD), ...d.aufgaben.map((x) => x.bereich).filter(Boolean)])].sort((x, y) => x.localeCompare(y, "de"));
      const setzen = (b) => this._aufgabeAendern(a, { bereich: b }, b ? `${a.titel}: Bereich ${gross(b)}` : `${a.titel}: kein Bereich`);
      this._menue(anker, [zurueck, "-",
        ...liste.map((b) => ({ text: gross(b), icon: punktIcon(bereichFarbe(b, d.farben)), radio: true, aktiv: a.bereich === b, aktion: () => setzen(b) })),
        { text: "Kein Bereich", radio: true, aktiv: !a.bereich, aktion: () => setzen("") },
        "-",
        { eingabe: true, text: "Neuer Bereich", knopf: "OK", max: 40, aktion: (w) => setzen(w.replace(/^#/, "").toLowerCase()) },
      ], o(i, "Bereich"));
    };
    const fuerM = (i) => this._menue(anker, [zurueck, "-",
      ...[...d.personen.map((p) => p.id), GEMEINSAM].map((id) => ({ text: this._name(id), icon: this._avatar(id), radio: true, aktiv: a.person === id,
        aktion: () => this._aufgabeAendern(a, { person: id }, `${a.titel}: für ${this._name(id)}`) })),
    ], o(i, "Für"));
    const topM = (i) => this._menue(anker, [zurueck, "-",
      ...[1, 2, 3].map((r) => ({ text: `Rang ${r}`, icon: `<span class="rang klein">${r}</span>`, radio: true, aktiv: a.top === r,
        aktion: () => this._aufgabeAendern(a, { top: r }, `${a.titel}: Top ${r}`) })),
      { text: "Keiner", radio: true, aktiv: !a.top, aktion: () => this._aufgabeAendern(a, { top: null }, `${a.titel}: nicht mehr in den Top 3`) },
    ], o(i, "Top 3"));
    const haupt = (i) => this._menue(anker, [
      fertig ? null : { text: "Verschieben", icon: ICON.pfeil, untermenue: true, aktion: verschiebenM },
      { text: a.bereich ? `Bereich: ${gross(a.bereich)}` : "Bereich", icon: a.bereich ? punktIcon(bereichFarbe(a.bereich, d.farben)) : ICON.filter, untermenue: true, aktion: bereichM },
      { text: `Für: ${this._name(a.person)}`, icon: this._avatar(a.person), untermenue: true, aktion: fuerM },
      fertig ? null : { text: a.top ? `Top 3: Rang ${a.top}` : "Top 3", icon: `<span class="rang klein">${a.top || "3"}</span>`, untermenue: true, aktion: topM },
      "-",
      { text: "Duplizieren", icon: ICON.kopie, aktion: () => this._aufgabeDuplizieren(a) },
      { text: "Bearbeiten …", icon: ICON.stift, aktion: () => this._oeffnen(a) },
      "-",
      { text: "Löschen", icon: ICON.muell, gefahr: true, aktion: () => this._aufgabeLoeschen(a) },
    ], o(i, a.titel));
    haupt(opt);
  }

  // Menü pro Notiz
  async _notizAendern(n, felder, text) {
    const vorher = {};
    for (const k of Object.keys(felder)) vorher[k] = n[k] ?? (k === "angeheftet" ? false : "");
    try { await this._ws({ type: "planer/notiz_speichern", notiz: { id: n.id, ...felder } }); } catch (e) { return; }
    this._sagen(text);
    this._hinweis(text, () => this._ws({ type: "planer/notiz_speichern", notiz: { id: n.id, ...vorher } }));
    await this._lesen();
  }
  async _notizLoeschen(n) {
    const kopie = { titel: n.titel, text: n.text, person: n.person, angeheftet: !!n.angeheftet, ordner: n.ordner || "", farbe: n.farbe || "", erledigte_unten: n.erledigte_unten !== false };
    const titel = this._notizTitel(n);
    try { await this._ws({ type: "planer/notiz_loeschen", notiz_id: n.id }); } catch (err) { return; }
    this._sagen(`Gelöscht: ${titel}`);
    this._hinweis(`Gelöscht: ${titel}`, () => this._ws({ type: "planer/notiz_speichern", notiz: kopie }));
    await this._lesen();
  }
  _notizMenue(n, anker, opt = {}) {
    const d = this._daten;
    const o = (i, titel) => ({ titel, tastatur: i?.tastatur, punkt: opt.punkt });
    const zurueck = { text: "Zurück", icon: "‹", aktion: (i) => haupt(i) };
    const titel = this._notizTitel(n);
    const ordnerM = (i) => {
      const alle = [...new Set((d.notizen || []).map((x) => x.ordner).filter(Boolean))].sort((x, y) => x.localeCompare(y, "de"));
      const setzen = (w) => this._notizAendern(n, { ordner: w }, w ? `${titel}: Ordner ${w}` : `${titel}: kein Ordner`);
      this._menue(anker, [zurueck, "-",
        ...alle.map((x) => ({ text: x, icon: ICON.ordner, radio: true, aktiv: n.ordner === x, aktion: () => setzen(x) })),
        { text: "Kein Ordner", radio: true, aktiv: !n.ordner, aktion: () => setzen("") },
        "-",
        { eingabe: true, text: "Neuer Ordner", knopf: "Anlegen", max: 40, aktion: (w) => setzen(w) },
      ], o(i, "Ordner"));
    };
    const farbM = (i) => this._menue(anker, [zurueck, "-",
      ...NOTIZ_FARBEN.map(([name, f]) => ({ text: name, icon: `<span class="nz-punkt" style="--nf:${f}"></span>`, radio: true, aktiv: (n.farbe || "").toLowerCase() === f,
        aktion: () => this._notizAendern(n, { farbe: f }, `${titel}: ${name}`) })),
      "-",
      { text: "Keine Farbe", radio: true, aktiv: !n.farbe, aktion: () => this._notizAendern(n, { farbe: "" }, `${titel}: keine Farbe`) },
    ], o(i, "Farbe"));
    const fuerM = (i) => this._menue(anker, [zurueck, "-",
      ...[...d.personen.map((p) => p.id), GEMEINSAM].map((id) => ({ text: this._name(id), icon: this._avatar(id), radio: true, aktiv: n.person === id,
        aktion: () => this._notizAendern(n, { person: id }, `${titel}: für ${this._name(id)}`) })),
    ], o(i, "Teilen"));
    const haupt = (i) => this._menue(anker, [
      { text: n.angeheftet ? "Loslösen" : "Anheften", icon: ICON.pin, aktion: () => this._notizAendern(n, { angeheftet: !n.angeheftet }, n.angeheftet ? "Anheften aufgehoben" : "Notiz angeheftet") },
      "-",
      { text: n.ordner ? `Ordner: ${n.ordner}` : "Ordner", icon: ICON.ordner, untermenue: true, aktion: ordnerM },
      { text: "Farbe", icon: `<span class="nz-punkt" style="--nf:${n.farbe || "transparent"}"></span>`, untermenue: true, aktion: farbM },
      { text: `Teilen: ${this._name(n.person)}`, icon: this._avatar(n.person), untermenue: true, aktion: fuerM },
      "-",
      { text: "Löschen", icon: ICON.muell, gefahr: true, aktion: () => this._notizLoeschen(n) },
    ], o(i, titel));
    haupt(opt);
  }

  // Rechtsklick, Kontextmenü-Taste/Umschalt+F10 und langes Drücken (450 ms) öffnen das Menü einer Zeile
  _kontextBinden(li, oeffnen) {
    let uhr = null, x0 = 0, y0 = 0, schlucken = false;
    const auf = (opt) => {
      if (Date.now() - (this._kontextZeit || 0) < 700) return;
      this._kontextZeit = Date.now();
      const rahmen = this.shadowRoot.getElementById("rahmen");
      if (!opt.tastatur && !opt.punkt) { li.classList.add("angehoben"); rahmen?.classList.add("kontext-an"); this._angehoben = li; }
      oeffnen(opt);
    };
    const stopp = () => { clearTimeout(uhr); uhr = null; };
    li.addEventListener("contextmenu", (e) => {
      if (e.target.closest("input,textarea")) return;
      e.preventDefault();
      const tastatur = e.button !== 2 && !e.clientX && !e.clientY;
      auf(tastatur ? { tastatur: true } : { punkt: { x: e.clientX, y: e.clientY } });
    });
    li.addEventListener("keydown", (e) => {
      if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
      e.preventDefault();
      auf({ tastatur: true, anker: e.target.closest("button") });
    });
    li.addEventListener("pointerdown", (e) => {
      li._lang = false; schlucken = false;
      if (e.pointerType === "mouse" || e.button > 0 || e.target.closest(".nrow-aktionen,.mehr-knopf,.haken")) return;
      x0 = e.clientX; y0 = e.clientY;
      stopp();
      uhr = setTimeout(() => {
        uhr = null;
        li._lang = true; schlucken = true;
        try { navigator.vibrate?.(10); } catch (err) { /* egal */ }
        auf({});
      }, 450);
    });
    li.addEventListener("pointermove", (e) => { if (uhr && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) stopp(); });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => li.addEventListener(t, stopp));
    // Nach dem langen Drücken nicht auch noch öffnen
    li.addEventListener("click", (e) => { if (schlucken) { schlucken = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }
  _menueBinden() {
    const app = this._app;
    app.querySelectorAll("[data-menue]").forEach((b) => b.addEventListener("click", (e) => {
      const info = { tastatur: e.detail === 0 };
      const art = b.dataset.menue;
      if (art === "wer") this._werMenue(b, info);
      else if (art === "bereich") this._bereichMenue(b, info);
      else if (art === "notizen") this._notizFilterMenue(b, info);
    }));
    app.querySelectorAll('[data-aktion="bereich-weg"]').forEach((b) => b.addEventListener("click", () => this._bereichSetzen("")));
    app.querySelectorAll('[data-aktion="kopf-menue"]').forEach((b) => b.addEventListener("click", (e) => this._kopfMenue(b, { tastatur: e.detail === 0 })));
    app.querySelectorAll("[data-zmenue]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const a = this._finde(b.dataset.zmenue);
      if (a) this._aufgabeMenue(a, b, { tastatur: e.detail === 0 });
    }));
    app.querySelectorAll("li.aufgabe[data-id]").forEach((li) => this._kontextBinden(li, (opt) => {
      const a = this._finde(li.dataset.id);
      if (a) this._aufgabeMenue(a, opt.anker || li.querySelector(".mehr-knopf") || li.querySelector(".inhalt"), opt);
    }));
  }
  _notizKontextBinden(wurzel) {
    wurzel.querySelectorAll("li.nrow").forEach((li) => this._kontextBinden(li, (opt) => {
      const n = this._notiz(li.dataset.nid);
      if (n) this._notizMenue(n, opt.anker || li.querySelector(".nrow-mehr") || li.querySelector(".nrow-zeile"), opt);
    }));
    wurzel.querySelectorAll("[data-nmenue]").forEach((b) => b.addEventListener("click", (e) => {
      const n = this._notiz(b.dataset.nmenue);
      if (n) this._notizMenue(n, b, { tastatur: e.detail === 0 });
    }));
  }

  // Heute/Demnächst: ausgeblendete #Hashtags/Bereiche herausnehmen und darauf hinweisen
  _ansichtHtml(alle, offen) {
    if (this._ansicht !== "heute") return this._ansichtInnen(alle, offen);
    const set = new Set(this._ausgeblendet());
    if (!set.size) return this._ansichtInnen(alle, offen);
    const weg = (a) => set.has(a.bereich || "") || (a.tags || []).some((t) => set.has(t));
    const n = offen.filter(weg).length;
    const hinweis = n ? `<p class="hinweis ausblende" role="status"><span>${n} ausgeblendet</span><button type="button" class="knopf text klein" data-aktion="tags-einblenden" data-fokus="tags-einblenden">Einblenden</button></p>` : "";
    return hinweis + this._ansichtInnen(alle.filter((a) => !weg(a)), offen.filter((a) => !weg(a)));
  }
  _ausgeblendet() { return this._daten?.einst?.ausgeblendete_tags || []; }
  async _ansichtSpeichern(werte) {
    Object.assign(this._daten.einst, werte);
    this._zeichnen();
    try { await this._ws({ type: "planer/ansicht", ...werte }); } catch (e) { /* Meldung kam schon */ }
    await this._lesen();
  }
  // Sortierung der Aufgabenlisten (pro Person gespeichert); „Fällig“ ist die gewohnte Reihenfolge
  _listeSort(liste) {
    const art = this._daten?.einst?.aufgaben_sortierung || "faellig";
    const l = this._sortiert(liste);
    if (art === "prio") return l.sort((a, b) => (a.top || 9) - (b.top || 9));
    if (art === "bereich") return l.sort((a, b) => (a.bereich ? 0 : 1) - (b.bereich ? 0 : 1) || (a.bereich || "").localeCompare(b.bereich || "", "de"));
    if (art === "neu") return l.sort((a, b) => (b.erstellt || "").localeCompare(a.erstellt || ""));
    if (art === "az") return l.sort((a, b) => (a.titel || "").localeCompare(b.titel || "", "de", { sensitivity: "base" }));
    return l;
  }
  _listenEintraege(anker, zurueck) {
    const d = this._daten;
    const arten = [["faellig", "Fällig"], ["prio", "Priorität"], ["bereich", "Bereich"], ["neu", "Neueste zuerst"], ["az", "A–Z"]];
    const jetzt = d.einst?.aufgaben_sortierung || "faellig";
    const aus = this._ausgeblendet();
    const tags = [...new Set([...d.aufgaben.filter((a) => a.status === "offen").flatMap((a) => [a.bereich, ...(a.tags || [])]).filter(Boolean), ...aus])].sort((a, b) => a.localeCompare(b, "de"));
    return [
      { text: `Sortierung: ${arten.find((x) => x[0] === jetzt)[1]}`, icon: ICON.filter, untermenue: true, aktion: (i) => this._menue(anker, [
        { text: "Zurück", icon: "‹", aktion: zurueck }, "-",
        ...arten.map(([k, t]) => ({ text: t, radio: true, aktiv: jetzt === k, aktion: () => { this._ansichtSpeichern({ aufgaben_sortierung: k }); this._sagen(`Sortiert nach ${t}`); } })),
      ], { titel: "Sortierung", tastatur: i?.tastatur }) },
      tags.length ? { text: aus.length ? `Ausblenden (${aus.length})` : "Ausblenden", icon: '<span class="g-t">#</span>', untermenue: true, aktion: (i) => this._menue(anker, [
        { text: "Zurück", icon: "‹", aktion: zurueck },
        aus.length ? { text: "Alle einblenden", aktion: () => this._ansichtSpeichern({ ausgeblendete_tags: [] }) } : null, "-",
        ...tags.map((t) => ({ text: `#${t}`, aktiv: aus.includes(t), aktion: () => this._ansichtSpeichern({ ausgeblendete_tags: aus.includes(t) ? aus.filter((x) => x !== t) : [...aus, t] }) })),
      ], { titel: "Hashtags ausblenden", tastatur: i?.tastatur }) } : null,
    ];
  }

  _ansichtInnen(alle, offen) {
    const h = this._tag;
    if (this._ansicht === "einkauf") return this._einkaufHtml();
    if (this._ansicht === "notizen") return this._notizenHtml();
    if (this._ansicht === "woche") return this._kalAnsicht === "monat" ? this._monatHtml(this._kalenderAufgaben()) : this._kalAnsicht === "schichten" ? this._schichtHtml() : this._wocheHtml(this._kalenderAufgaben());
    return this._heuteHtml(alle, offen);
  }

  // Heute: Tageskarten für heute und die nächsten 14 Tage
  _heuteHtml(alle, offen) {
    const h = this._tag;
    const zeit = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5);
    const jetztMin = new Date().getHours() * 60 + new Date().getMinutes();
    const bisStd = this._daten.einst?.tag_bis ?? 22;
    const tlKal = this._daten.einst?.kalender_zeitleiste;
    const faellig = (this._daten.einst?.aufgaben_sortierung || "faellig") === "faellig";
    const sort = (l) => (faellig ? this._sortiert(l) : this._listeSort(l));
    const ueber = this._listeSort(offen.filter((a) => a.datum && a.datum < h));
    const heuteOffen = offen.filter((a) => a.datum === h);
    const top = heuteOffen.filter((a) => a.top).sort((a, b) => a.top - b.top);
    const ohne = sort(offen.filter((a) => !a.datum));
    const fertig = alle.filter((a) => a.status === "erledigt" && (a.erledigt_am || "").slice(0, 10) === h);
    const wiederHeute = alle.filter((a) => a.wiederholung && (a.verlauf || []).includes(h) && a.status === "offen");
    const naechste = ueber[0] || this._sortiert(heuteOffen.filter((a) => a.uhrzeit && a.uhrzeit >= hhmm(jetztMin)))[0] || top[0] || this._sortiert(heuteOffen)[0] || ohne[0];
    this._naechste = naechste ? naechste.id : null;
    const vorbei = (html) => html.replace(/^<li( class="([^"]*)")?/, (m, _k, k) => `<li class="${k || ""} vorbei"`);
    const karte = (tag, i) => {
      const heute = i === 0;
      const termine = this._termineAm(tag).filter((t) => tlKal == null || tlKal.includes(t.kalender));
      const ganz = termine.filter((t) => t.ganztag);
      const schs = this._schichtenAm(tag);
      const tagAufg = tag === h ? heuteOffen.filter((a) => !a.top) : offen.filter((a) => a.datum === tag);
      const mitZeit = [
        ...termine.filter((t) => !t.ganztag).map((t) => {
          const s0 = t.start.slice(0, 10) < tag ? 0 : zeit(uhr(t.start));
          const e0 = t.ende.slice(0, 10) > tag ? 1440 : zeit(uhr(t.ende));
          return { s: s0, e: e0, html: this._terminZeile(t, tag) };
        }),
        ...sort(tagAufg.filter((a) => a.uhrzeit)).map((a) => {
          const s0 = zeit(a.uhrzeit);
          return { s: s0, e: s0 + (a.dauer || 0), html: this._zeile(a), aufgabe: true };
        }),
      ].sort((x, y) => x.s - y.s);
      const ohneZeit = sort(tagAufg.filter((a) => !a.uhrzeit));
      const items = [];
      if (heute) {
        for (const a of top) items.push(this._zeile(a));
        for (const a of ueber) items.push(this._zeile(a));
        let gesetzt = false;
        for (const x of mitZeit) {
          if (!gesetzt && x.s >= jetztMin) { items.push(`<li class="jetzt" aria-hidden="true"><span>Jetzt ${hhmm(jetztMin)}</span></li>`); gesetzt = true; }
          items.push(x.e <= jetztMin ? vorbei(x.html) : x.html);
        }
        if (mitZeit.length && !gesetzt) items.push(`<li class="jetzt" aria-hidden="true"><span>Jetzt ${hhmm(jetztMin)}</span></li>`);
        for (const a of ohneZeit) items.push(this._zeile(a));
        for (const a of ohne) items.push(this._zeile(a));
      } else {
        for (const x of mitZeit) items.push(x.html);
        for (const a of ohneZeit) items.push(this._zeile(a));
      }
      if (!heute && !items.length && !ganz.length && !schs.length) return "";
      let frei = "";
      if (heute) {
        const von = Math.max((this._daten.einst?.tag_von ?? 7) * 60, jetztMin);
        const bis = bisStd * 60;
        const belegt = [...mitZeit].map((x) => [Math.max(x.s, von), Math.min(x.e, bis)]).filter(([p, q]) => q > p).sort((x, y) => x[0] - y[0]);
        let f = Math.max(0, bis - von), ende = von;
        for (const [p, q] of belegt) { const p2 = Math.max(p, ende); if (q > p2) { f -= q - p2; ende = q; } }
        frei = `<p class="frei">${esc(f <= 0 ? `Heute ist bis ${bisStd} Uhr nichts mehr frei.` : `Frei bis ${bisStd} Uhr: ${Math.floor(f / 60) ? `${Math.floor(f / 60)} Std. ` : ""}${f % 60 ? `${f % 60} Min.` : ""}`.trim())}</p>`;
      }
      const name = i === 0 ? "Heute" : i === 1 ? "Morgen" : WOCHENTAGE[wt(ausIso(tag))];
      const id = `g-${tag}`;
      const chips = schs.length ? `<div class="schicht-chips">${schs.map(({ a: sc, wer }) => `<span class="schicht-chip" style="--k:${sc.farbe}"><b>${esc(sc.kurz || sc.name)}</b> ${esc(sc.name)}${sc.von && sc.bis ? ` <span class="sz">${esc(sc.von)}–${esc(sc.bis)}</span>` : ""}${wer ? ` <span class="sw">${esc(wer)}</span>` : ""}</span>`).join("")}</div>` : "";
      return `<section class="gruppe tkarte ${heute ? "heute" : ""}" aria-labelledby="${id}">
        <h2 id="${id}">${esc(name)}, ${esc((() => { const d = ausIso(tag); const m = MONATE[d.getMonth()]; return `${d.getDate()}. ${m.length > 4 ? m.slice(0, 3) + "." : m}`; })())}${this._wetterHtml(tag)}</h2>
        ${chips}
        ${ganz.length ? `<ul class="termine ganztag" aria-label="Ganztägig">${ganz.map((t) => this._terminZeile(t, tag)).join("")}</ul>` : ""}
        ${items.length ? `<ul class="liste" aria-label="Einträge">${items.join("")}</ul>` : heute ? `<p class="leer">Für heute ist nichts offen.</p>` : ""}
        ${frei}
      </section>`;
    };
    let html = "";
    for (let i = 0; i <= 14; i++) html += karte(iso(plusTage(ausIso(h), i)), i);
    if (this._kalFehler) html = `<p class="fehler">${esc(this._kalFehler)}</p>` + html;
    const erledigtHeute = [...fertig, ...wiederHeute];
    if (erledigtHeute.length) {
      html += `<details class="zu"><summary>Heute erledigt (${erledigtHeute.length})</summary>
        <ul class="liste">${erledigtHeute.map((a) => this._zeile(a, a.status === "offen")).join("")}</ul></details>`;
    }
    return `<div class="tagraster">${html}</div>`;
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
    return `<section class="gruppe" aria-labelledby="e-titel">
        <h2 id="e-titel" class="sr">${esc(name)}, ${offen.length} offen</h2>
        ${geladen?.fehler ? `<p class="leer" role="alert">${esc(geladen.fehler)}</p>` : ""}
        ${!geladen ? `<p class="hinweis" role="status">Liste wird geladen …</p>` : offen.length ? `<ul class="liste gruppiert">${offen.map(zeile).join("")}</ul>` : `<p class="leer">Alles eingekauft.</p>`}
      </section>
      ${fertig.length ? `<details class="zu"><summary>Zuletzt gekauft (${fertig.length})</summary><p class="hinweis">Antippen setzt den Artikel wieder auf die Liste.</p><ul class="liste gruppiert">${fertig.slice(0, 40).map(zeile).join("")}</ul></details>` : ""}`;
  }

  _einkaufBinden(root) {
    const liste = this._eListeId();
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


  // ---------- Schichtplan (wie Supershift) ----------
  // Wessen Plan bearbeitet wird: oben gewählte Person. „Alle“/„Gemeinsam“ = beide zusammen (null).
  _schichtPerson() {
    const d = this._daten, s = d.schichten || {};
    if (!this._filter || this._filter === "ich") return d.ich;
    if (this._filter === "alle" || this._filter === GEMEINSAM) return Object.keys(s).length > 1 ? null : d.ich;
    return s[this._filter] ? this._filter : d.ich;
  }
  _schichtPersonen() {
    const p = this._schichtPerson();
    if (!p) return (this._daten.personen || []).map((x) => x.id).filter((id) => (this._daten.schichten || {})[id]);
    // Wer den Arbeitskalender einer anderen Person eingeblendet hat, sieht auch deren Schichten
    if (this._ansicht === "woche" && this._kalAnsicht === "schichten") return [p];
    const extra = (this._daten.personen || []).map((x) => x.id).filter((id) => id !== p && this._plan(id).arten.length && this._schichtKalAn(id));
    return [p, ...extra];
  }
  // Kalender, in den die Schichten einer Person laufen (eingestellt oder „<Vorname> Arbeit“)
  _schichtKal(person) {
    const se = (this._daten.schicht_einst || {})[person] || {};
    if (se.kalender) return se.kalender;
    const vn = `${(this._name(person) || "").split(" ")[0].toLowerCase()} arbeit`;
    return (this._daten.kalender || []).find((k) => (k.name || "").trim().toLowerCase() === vn)?.id || null;
  }
  _schichtKalAn(person) {
    const id = this._schichtKal(person);
    return !!id && (this._daten.kalender || []).some((k) => k.id === id && k.angezeigt !== false);
  }
  // Vom Planer eingetragene Schicht-Termine ausblenden, wenn die Schicht schon als Schicht gezeigt wird
  _ohneSchichtTermine(liste) {
    const kals = new Set(this._schichtPersonen().map((p) => this._schichtKal(p)).filter(Boolean));
    if (!kals.size) return liste;
    return liste.filter((t) => !(kals.has(t.kalender) && (t.beschreibung || "").includes("planer-schicht")));
  }
  // Schichten an einem Tag für alle gerade gezeigten Personen; bei mehreren mit Namenskürzel
  _schichtenAm(tag) {
    const pers = this._schichtPersonen();
    return pers.map((p) => ({ a: this._schichtAm(tag, p), p, wer: pers.length > 1 ? (this._name(p) || "?").split(" ")[0] : "" })).filter((x) => x.a);
  }
  _plan(person) { return (this._daten.schichten || {})[person] || { arten: [], tage: {} }; }
  _schichtAm(tag, person) {
    const p = this._plan(person || this._daten.ich);
    const id = p.tage[tag];
    return id ? p.arten.find((a) => a.id === id) || null : null;
  }
  _schichtMinuten(a) {
    if (!a || !a.von || !a.bis) return 0;
    const z = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5);
    let m = z(a.bis) - z(a.von);
    if (m <= 0) m += 1440;
    return Math.max(0, m - (a.pause || 0));
  }
  _schichtZeit(a) { return a && a.von && a.bis ? `${a.von}–${a.bis}` : ""; }

  _schichtHtml() {
    const d = this._daten;
    const person = this._schichtPerson();
    if (!person) return this._schichtBeideHtml();
    const plan = this._plan(person);
    const jetzt = new Date();
    const erster = this._sStart || new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
    const von = montag(erster);
    const monat = erster.getMonth(), jahr = erster.getFullYear();
    const tage = [...Array(42)].map((_, i) => iso(plusTage(von, i)));
    const zeilen = tage.slice(35).every((t) => ausIso(t).getMonth() !== monat) ? 35 : 42;
    const heuteIso = iso(jetzt);
    const imMonat = tage.filter((t) => ausIso(t).getMonth() === monat);
    let minuten = 0;
    const anzahl = {};
    for (const t of imMonat) {
      const a = this._schichtAm(t, person);
      if (!a) continue;
      minuten += this._schichtMinuten(a);
      anzahl[a.id] = (anzahl[a.id] || 0) + 1;
    }
    const stempel = this._stempel;
    const wer = this._narrow ? "" : ` · ${esc(person === d.ich ? "Meine Schichten" : this._name(person).split(" ")[0])}`;
    return `<section class="gruppe" aria-labelledby="s-titel">
      ${this._narrow ? this._kalenderUmschalter() : ""}
      <div class="wkopf"><h2 id="s-titel">${MONATE[monat]} ${jahr}${wer}</h2>${this._narrow ? "" : this._kalenderUmschalter(true)}${this._kalNavi("schicht", "Heute", monat === jetzt.getMonth() && jahr === jetzt.getFullYear(), "Monat wechseln")}</div>
      <div class="woche-wrap"><div class="monat schichtmonat" role="grid" aria-labelledby="s-titel">
        ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((n) => `<div class="mkopf" role="columnheader">${n}</div>`).join("")}
        ${tage.slice(0, zeilen).map((t) => {
          const dd = ausIso(t);
          const a = this._schichtAm(t, person);
          return `<button type="button" role="gridcell" class="stag ${dd.getMonth() !== monat ? "fremd" : ""} ${t === heuteIso ? "heute" : ""} ${t < heuteIso ? "vorbei" : ""} ${a ? "belegt" : ""}" data-stag="${t}" ${a ? `style="--k:${a.farbe}"` : ""}
            aria-label="${esc(`${dd.getDate()}. ${MONATE[dd.getMonth()]}: ${a ? `${a.name} ${this._schichtZeit(a)}` : "keine Schicht"}`)}">
            <span class="mnr">${dd.getDate()}</span>${a ? `<span class="skurz">${esc(a.kurz)}</span><span class="szeit">${esc(a.von || "")}</span>` : ""}</button>`;
        }).join("")}
      </div></div>
      ${!plan.arten.length ? `<div class="schicht-start"><p><b>Noch keine Schichten angelegt.</b><br>Lege deine Schichten einmal an, zum Beispiel Frühdienst 06:00–14:15. Sie bleiben gespeichert und stehen dann hier zum Eintragen bereit.</p>
        <button type="button" class="knopf primaer" data-aktion="schicht-neu">${ICON.plus}Schicht anlegen</button></div>` : `
      <div class="stempelleiste unten" role="group" aria-label="Schicht zum Eintragen wählen">
        ${plan.arten.map((a) => `<button type="button" class="stempel" data-stempel="${esc(a.id)}" aria-pressed="${stempel === a.id}" style="--k:${a.farbe}" title="${esc(a.name)} ${esc(this._schichtZeit(a))}">
          <span class="skurz">${esc(a.kurz)}</span><span class="sname">${esc(a.name)}</span></button>`).join("")}
        <button type="button" class="stempel radierer" data-stempel="leer" aria-pressed="${stempel === "leer"}" title="Schicht entfernen"><span class="skurz">${ICON.zu}</span><span class="sname">Entfernen</span></button>
      </div>
      <p class="hinweis stempel-hinweis" role="status">${stempel ? `${stempel === "leer" ? "Entfernen" : esc(plan.arten.find((a) => a.id === stempel)?.name || "")}: Tage antippen` : ""}</p>`}
      <div class="schicht-fuss">
        <div class="schicht-summe"><b>${Math.floor(minuten / 60)} Std.${minuten % 60 ? ` ${minuten % 60} Min.` : ""}</b> im ${MONATE[monat]}
          ${plan.arten.filter((a) => anzahl[a.id]).map((a) => `<span class="chip" style="--b:${a.farbe}"><span class="punkt" aria-hidden="true"></span> ${anzahl[a.id]}× ${esc(a.name)}</span>`).join("")}</div>
      </div>
    </section>`;
  }

  // Beide Pläne nebeneinander (nur ansehen); eintragen über die Auswahl oben
  _schichtBeideHtml() {
    const d = this._daten;
    const pers = this._schichtPersonen();
    const jetzt = new Date();
    const erster = this._sStart || new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
    const von = montag(erster);
    const monat = erster.getMonth(), jahr = erster.getFullYear();
    const tage = [...Array(42)].map((_, i) => iso(plusTage(von, i)));
    const zeilen = tage.slice(35).every((t) => ausIso(t).getMonth() !== monat) ? 35 : 42;
    const heuteIso = iso(jetzt);
    const vorname = (p) => (this._name(p) || "?").split(" ")[0];
    const summe = pers.map((p) => {
      let m = 0;
      for (const t of tage) if (ausIso(t).getMonth() === monat) m += this._schichtMinuten(this._schichtAm(t, p));
      return `<span class="chip"><b>${esc(vorname(p))}</b> ${Math.floor(m / 60)} Std.${m % 60 ? ` ${m % 60} Min.` : ""}</span>`;
    }).join("");
    return `<section class="gruppe" aria-labelledby="s-titel">
      ${this._narrow ? this._kalenderUmschalter() : ""}
      <div class="wkopf"><h2 id="s-titel">${MONATE[monat]} ${jahr}${this._narrow ? "" : " · Beide"}</h2>${this._narrow ? "" : this._kalenderUmschalter(true)}${this._kalNavi("schicht", "Heute", monat === jetzt.getMonth() && jahr === jetzt.getFullYear(), "Monat wechseln")}</div>
      <div class="schicht-wer">${pers.map((p) => `<button type="button" class="knopf klein" data-filter="${esc(p === d.ich ? "ich" : p)}">${esc(vorname(p))} bearbeiten</button>`).join("")}</div>
      <div class="woche-wrap"><div class="monat schichtmonat beide" role="grid" aria-labelledby="s-titel">
        ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((n) => `<div class="mkopf" role="columnheader">${n}</div>`).join("")}
        ${tage.slice(0, zeilen).map((t) => {
          const dd = ausIso(t);
          const l = pers.map((p) => ({ p, a: this._schichtAm(t, p) }));
          return `<div role="gridcell" class="stag ${dd.getMonth() !== monat ? "fremd" : ""} ${t === heuteIso ? "heute" : ""} ${t < heuteIso ? "vorbei" : ""}"
            aria-label="${esc(`${dd.getDate()}. ${MONATE[dd.getMonth()]}: ${l.map(({ p, a }) => `${vorname(p)} ${a ? a.name : "keine Schicht"}`).join(", ")}`)}">
            <span class="mnr">${dd.getDate()}</span><span class="sbeide">${l.map(({ p, a }) => a
              ? `<span class="sb" style="--k:${a.farbe}" title="${esc(`${vorname(p)}: ${a.name} ${this._schichtZeit(a)}`)}"><i>${esc(vorname(p)[0])}</i>${esc(a.kurz)}</span>`
              : "").join("")}</span></div>`;
        }).join("")}
      </div></div>
      <div class="schicht-fuss"><div class="schicht-summe">${summe}</div></div>
    </section>`;
  }

  // Zahlen eines Monats für eine Person: Stunden (ohne Pause, über Mitternacht), Arten, Wochenenden, Nachtstunden, freie Tage
  _schichtZahlen(person, jahr, monat) {
    const z = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5);
    const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
    const r = { minuten: 0, nacht: 0, ohneZeit: 0, schichttage: 0, frei: 0, wochenenden: 0, arten: {} };
    const wes = new Set();
    for (let i = 1; i <= tageImMonat; i++) {
      const d = new Date(jahr, monat, i);
      const a = this._schichtAm(iso(d), person);
      if (!a) { r.frei++; continue; }
      r.schichttage++;
      r.arten[a.id] = (r.arten[a.id] || 0) + 1;
      if (d.getDay() === 0 || d.getDay() === 6) wes.add(iso(montag(d)));
      if (!a.von || !a.bis) { r.ohneZeit++; continue; }
      r.minuten += this._schichtMinuten(a);
      const s0 = z(a.von); let e0 = z(a.bis); if (e0 <= s0) e0 += 1440;
      for (const [n0, n1] of [[0, 360], [1320, 1800], [2760, 3240]]) r.nacht += Math.max(0, Math.min(e0, n1) - Math.max(s0, n0));
    }
    r.wochenenden = wes.size;
    return r;
  }
  _schichtStatistik() {
    const jetzt = new Date();
    const erster = this._sStart || new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
    const jahr = erster.getFullYear(), monat = erster.getMonth();
    const vor = new Date(jahr, monat - 1, 1);
    const pers = this._schichtPersonen();
    const std = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} Std.`;
    const diff = (m) => `${m > 0 ? "+" : m < 0 ? "−" : "±"}${std(Math.abs(m))}`;
    const spalte = (p) => {
      const plan = this._plan(p);
      const a = this._schichtZahlen(p, jahr, monat), v = this._schichtZahlen(p, vor.getFullYear(), vor.getMonth());
      const dm = a.minuten - v.minuten;
      const arten = plan.arten.filter((x) => a.arten[x.id]);
      return `<section class="stat-spalte" aria-label="${esc(this._name(p))}">
        ${pers.length > 1 ? `<h3>${esc((this._name(p) || "").split(" ")[0])}</h3>` : ""}
        <dl class="stat">
          <div class="gross"><dt>Arbeitsstunden</dt><dd>${std(a.minuten)}</dd></div>
          <div><dt>Zum ${MONATE[vor.getMonth()]} (${std(v.minuten)})</dt><dd class="${dm > 0 ? "plus" : ""}">${diff(dm)}</dd></div>
          <div><dt>Nachtstunden (22–6 Uhr)</dt><dd>${std(a.nacht)}</dd></div>
          <div><dt>Wochenenden mit Schicht</dt><dd>${a.wochenenden}</dd></div>
          <div><dt>Schichttage</dt><dd>${a.schichttage}</dd></div>
          ${a.ohneZeit ? `<div><dt>davon ohne Uhrzeit (nicht in Stunden)</dt><dd>${a.ohneZeit}</dd></div>` : ""}
          <div><dt>Freie Tage</dt><dd>${a.frei}</dd></div>
        </dl>
        <h4>Schichtarten</h4>
        ${arten.length ? `<ul class="stat-arten">${arten.map((x) => `<li style="--k:${x.farbe}"><span class="skurz">${esc(x.kurz)}</span><span class="stat-name">${esc(x.name)}</span><span class="stat-n">${a.arten[x.id]}×</span></li>`).join("")}</ul>` : `<p class="leer">Keine Schichten in diesem Monat.</p>`}
      </section>`;
    };
    const dlg = this.shadowRoot.getElementById("blatt");
    dlg.onclose = null; dlg._vorZu = null;
    dlg.innerHTML = `<form method="dialog" class="stat-blatt">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <span class="l"></span><h2 id="blatt-titel">Statistik ${MONATE[monat]} ${jahr}</h2><button type="submit" class="knopf text fett r">Fertig</button></div>
      <div class="stat-raster ${pers.length > 1 ? "zwei" : ""}">${pers.map(spalte).join("") || '<p class="leer">Keine Schichtpläne vorhanden.</p>'}</div>
      <p class="hinweis">Stunden = von–bis minus Pause, auch über Mitternacht. Nachtstunden zählen ohne Abzug der Pause und gehören zum Tag, an dem die Schicht beginnt.</p>
    </form>`;
    this._wischZu(dlg);
    dlg.showModal();
  }

  _schichtEinstellung() {
    const d = this._daten;
    const person = this._schichtPerson() || d.ich;
    const se = (d.schicht_einst || {})[person] || {};
    const dlg = this.shadowRoot.getElementById("blatt");
    dlg.onclose = null; dlg._vorZu = null;
    const kal = d.schicht_kalender_wahl || [];
    const push = se.push || "";
    dlg.innerHTML = `<form method="dialog" id="seform" novalidate>
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <button type="button" class="knopf text l" id="se-abbrechen">Abbrechen</button><h2 id="blatt-titel">Schichten von ${esc((this._name(person) || "").split(" ")[0])}</h2><button type="submit" class="knopf text fett r">Sichern</button></div>
      <div class="feld"><label for="se-kal">In Kalender eintragen</label>
        <select id="se-kal"><option value="auto" ${se.wahl == null ? "selected" : ""}>Automatisch (Kalender „Vorname Arbeit“)</option>
          <option value="" ${se.wahl === "" ? "selected" : ""}>Nicht übertragen</option>
          ${kal.map((k) => `<option value="${esc(k.id)}" ${se.wahl === k.id ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select>
        <span class="hinweis">Neue, geänderte und gelöschte Schichten werden dort nach ein paar Sekunden nachgezogen. Frei und Urlaub nur, wenn bei der Schicht „In Kalender“ angehakt ist.</span></div>
      <div class="feld"><label for="se-push">Push-Erinnerung aufs Handy</label>
        <select id="se-push">
          <option value="" ${!push ? "selected" : ""}>Keine</option>
          <option value="vorabend" ${push === "vorabend" ? "selected" : ""}>Am Vorabend</option>
          ${[30, 60, 90, 120, 180].map((m) => `<option value="${m}" ${push === String(m) ? "selected" : ""}>${minText(m).replace(" vorher", "")} vor Schichtbeginn</option>`).join("")}
        </select></div>
      <div class="feld" id="se-uhr-feld" ${push === "vorabend" ? "" : "hidden"}><label for="se-uhr">Uhrzeit am Vorabend</label><input id="se-uhr" type="time" value="${esc(se.push_uhr || "20:00")}"></div>
      <p class="hinweis">Die Erinnerung geht an das Handy, das in den Einstellungen für diese Person hinterlegt ist.</p>
      <p class="fehler" id="se-fehler" role="alert"></p>
    </form>`;
    const $ = (id) => dlg.querySelector(`#${id}`);
    $("se-push").addEventListener("change", () => { $("se-uhr-feld").hidden = $("se-push").value !== "vorabend"; });
    $("se-abbrechen").addEventListener("click", () => this._zu(dlg));
    $("seform").addEventListener("submit", async (e) => {
      e.preventDefault();
      const k = $("se-kal").value;
      const werte = { schicht_kalender: k === "auto" ? null : k, schicht_push: $("se-push").value, schicht_push_uhr: $("se-uhr").value || "20:00" };
      try { await this._ws({ type: "planer/schicht_einstellung", person, werte }); }
      catch (err) { $("se-fehler").textContent = err.message || "Speichern hat nicht geklappt."; return; }
      this._zu(dlg);
      this._sagen("Gespeichert");
      await this._lesen();
    });
    this._wischZu(dlg);
    dlg.showModal();
  }

  _schichtBinden() {
    const person = this._schichtPerson();
    this._app.querySelectorAll("[data-stempel]").forEach((b) => b.addEventListener("click", () => {
      this._stempel = this._stempel === b.dataset.stempel ? null : b.dataset.stempel;
      this._zeichnen();
    }));
    this._app.querySelectorAll("[data-stag]").forEach((b) => b.addEventListener("click", () => {
      const tag = b.dataset.stag;
      if (!this._stempel) { this._schichtWahl(tag, person); return; }
      const alt = this._plan(person).tage[tag] || null;
      const neu = this._stempel === "leer" ? null : this._stempel;
      this._schichtSetzen(person, { [tag]: alt === neu ? null : neu });
    }));
    this._app.querySelectorAll("[data-schicht]").forEach((b) => b.addEventListener("click", () => {
      const n = +b.dataset.schicht;
      const jetzt = new Date();
      const e = this._sStart || new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
      this._sStart = n === 0 ? null : new Date(e.getFullYear(), e.getMonth() + n, 1);
      this._zeichnen();
    }));
  }

  // Sofort anzeigen, gesammelt speichern
  _schichtSetzen(person, aenderungen) {
    const s = (this._daten.schichten ||= {});
    const plan = (s[person] ||= { arten: [], tage: {} });
    for (const [t, a] of Object.entries(aenderungen)) { if (a) plan.tage[t] = a; else delete plan.tage[t]; }
    this._sOffen = { ...(this._sOffen || {}), [person]: { ...((this._sOffen || {})[person] || {}), ...aenderungen } };
    clearTimeout(this._sUhr);
    this._sUhr = setTimeout(() => this._schichtSenden(), 250);
    this._zeichnen();
  }
  // Schichten, die noch nicht (fertig) beim Server sind, über frisch gelesene Daten legen
  _schichtenDrueber(daten) {
    for (const quelle of [this._sUnterwegs, this._sOffen]) {
      for (const [person, tage] of Object.entries(quelle || {})) {
        const s = (daten.schichten ||= {});
        const plan = (s[person] ||= { arten: [], tage: {} });
        plan.tage = { ...plan.tage };
        for (const [t, a] of Object.entries(tage)) { if (a) plan.tage[t] = a; else delete plan.tage[t]; }
      }
    }
  }
  // Sendungen laufen nacheinander, nie parallel
  async _schichtSenden() {
    if (this._sSendet) return;
    this._sSendet = true;
    try {
      while (this._sOffen && Object.keys(this._sOffen).length) {
        const offen = this._sOffen;
        this._sOffen = {};
        this._sUnterwegs = offen;
        let fehler = false;
        for (const [person, tage] of Object.entries(offen)) {
          try { await this._hass.callWS({ type: "planer/schicht_tage", person, tage }); }
          catch (e) { fehler = true; this._sagen(`Fehler: ${e.message || e.code || "unbekannt"}`); }
        }
        this._sUnterwegs = null;
        this._sZaehler = (this._sZaehler || 0) + 1;
        if (fehler) { this._sOffen = {}; await this._lesen(); }
      }
    } finally {
      this._sSendet = false;
      this._sUnterwegs = null;
    }
  }

  _schichtWahl(tag, person) {
    const dlg = this.shadowRoot.getElementById("wahldlg");
    const plan = this._plan(person);
    const jetzt = plan.tage[tag];
    dlg.innerHTML = `<form method="dialog" class="wahl-blatt">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}<span class="l"></span><h2 id="wahl-titel">${esc(datumText(tag))}</h2><button type="submit" class="knopf text fett r">Fertig</button></div>
      <div class="wahlliste">${plan.arten.map((a) => `<button type="button" class="wahlzeile schichtzeile ${jetzt === a.id ? "aktiv" : ""}" data-sw="${esc(a.id)}" style="--k:${a.farbe}">
          <span class="skurz">${esc(a.kurz)}</span><span>${esc(a.name)}</span><span class="szeit">${esc(this._schichtZeit(a))}</span></button>`).join("")}
        ${jetzt ? `<button type="button" class="wahlzeile" data-sw="">Keine Schicht</button>` : ""}
      </div>
    </form>`;
    dlg.querySelectorAll("[data-sw]").forEach((b) => b.addEventListener("click", () => {
      this._zu(dlg);
      this._schichtSetzen(person, { [tag]: b.dataset.sw || null });
    }));
    this._wischZu(dlg);
    dlg.showModal();
  }

  // Liste der eigenen Schichten; Tippen öffnet das Formular für genau eine Schicht
  _schichtArten() {
    const person = this._schichtPerson() || this._daten.ich;
    const arten = this._plan(person).arten;
    if (!arten.length) return this._schichtForm(null);
    const dlg = this.shadowRoot.getElementById("blatt");
    dlg.onclose = null; dlg._vorZu = null;
    dlg.innerHTML = `<form method="dialog" id="slform" novalidate>
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <span class="l"></span><h2 id="blatt-titel">Schichten</h2><button type="submit" class="knopf text fett r">Fertig</button></div>
      <ul class="sliste" role="list">${arten.map((a) => `<li><button type="button" class="szeile" data-sart="${esc(a.id)}" style="--k:${a.farbe}">
          <span class="skurz">${esc(a.kurz)}</span><span class="sz-text"><b>${esc(a.name)}</b><small>${a.von && a.bis ? `${esc(a.von)}–${esc(a.bis)}${a.pause ? ` · ${a.pause} Min. Pause` : ""}` : "ohne Uhrzeit"}</small></span>${ICON.vor}</button></li>`).join("")}
        <li><button type="button" class="szeile neu" data-sart=""><span class="skurz">${ICON.plus}</span><span class="sz-text"><b>Neue Schicht</b></span></button></li>
      </ul>
    </form>`;
    dlg.querySelectorAll("[data-sart]").forEach((b) => b.addEventListener("click", () => this._schichtForm(arten.find((a) => a.id === b.dataset.sart) || null, true)));
    this._wischZu(dlg);
    if (!dlg.open) dlg.showModal();
  }

  _schichtForm(art, ausListe = false) {
    const person = this._schichtPerson() || this._daten.ich;
    const arten = this._plan(person).arten;
    const dlg = this.shadowRoot.getElementById("blatt");
    dlg.onclose = null; dlg._vorZu = null;
    const FARBEN = ["#ff9f0a", "#ff453a", "#ff375f", "#bf5af2", "#5e5ce6", "#0a84ff", "#30b0c7", "#34c759", "#a2845e", "#8e8e93"];
    const a = art || { name: "", kurz: "", farbe: FARBEN[arten.length % FARBEN.length], von: "", bis: "", pause: 0 };
    const mitZeit = art ? !!(a.von && a.bis) : true;
    const eigenAktiv = /^#[0-9a-fA-F]{6}$/.test(a.farbe || "") && !FARBEN.some((f) => f.toLowerCase() === a.farbe.toLowerCase());
    const eigen = eigenAktiv ? a.farbe : "#8e8e93";
    const imKal = a.kalender ?? mitZeit;
    dlg.innerHTML = `<form method="dialog" id="sfform" novalidate>
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <button type="button" class="knopf text l" id="sf-zurueck">${ausListe ? "Zurück" : "Abbrechen"}</button><h2 id="blatt-titel">${art ? "Schicht bearbeiten" : "Neue Schicht"}</h2><button type="submit" class="knopf text fett r">Sichern</button></div>
      <div class="sform">
        <div class="svorschau" id="sf-vorschau" style="--k:${a.farbe}"><span class="skurz" id="sf-vk">${esc(a.kurz || "?")}</span><span id="sf-vn">${esc(a.name || "Neue Schicht")}</span></div>
        <div class="sgruppe">
          <label class="szeile-feld"><span>Name</span><input id="sf-name" value="${esc(a.name)}" placeholder="z. B. Frühdienst" autocomplete="off" maxlength="40"></label>
          <label class="szeile-feld"><span>Kürzel</span><input id="sf-kurz" value="${esc(a.kurz)}" placeholder="F" maxlength="3" autocomplete="off" autocapitalize="characters"></label>
        </div>
        <div class="sgruppe">
          <div class="szeile-feld"><span>Farbe</span><div class="sfarben" role="radiogroup" aria-label="Farbe">${FARBEN.map((f) => `<button type="button" role="radio" class="sfarbe" data-farbe="${f}" style="--k:${f}" aria-checked="${f.toLowerCase() === (a.farbe || "").toLowerCase()}" aria-label="Farbe ${f}"></button>`).join("")}<label class="sfarbe sfarbe-eigen" role="radio" aria-checked="${eigenAktiv}" style="--k:${eigen}" title="Eigene Farbe"><input type="color" id="sf-eigen" value="${eigen}" aria-label="Eigene Farbe"></label></div></div>
        </div>
        <div class="sgruppe">
          <label class="szeile-feld schalter-zeile"><span>Mit Uhrzeit</span><input type="checkbox" role="switch" id="sf-zeit" ${mitZeit ? "checked" : ""}></label>
          <div id="sf-zeiten" ${mitZeit ? "" : "hidden"}>
            <label class="szeile-feld"><span>Beginn</span><input id="sf-von" type="time" value="${esc(a.von || "06:00")}"></label>
            <label class="szeile-feld"><span>Ende</span><input id="sf-bis" type="time" value="${esc(a.bis || "14:00")}"></label>
            <label class="szeile-feld"><span>Pause</span><select id="sf-pause">${[0, 15, 30, 45, 60, 90].map((m) => `<option value="${m}" ${(+a.pause || 0) === m ? "selected" : ""}>${m ? `${m} Min.` : "keine"}</option>`).join("")}</select></label>
          </div>
        </div>
        <div class="sgruppe">
          <label class="szeile-feld schalter-zeile"><span>In Arbeitskalender eintragen</span><input type="checkbox" role="switch" id="sf-kal" ${imKal ? "checked" : ""}></label>
        </div>
        ${art ? `<button type="button" class="knopf gefahr breit" id="sf-weg">Schicht löschen</button>` : ""}
        <p class="fehler" id="sf-fehler" role="alert"></p>
      </div>
    </form>`;
    const $ = (id) => dlg.querySelector(`#${id}`);
    let farbe = a.farbe;
    const vorschau = () => {
      $("sf-vorschau").style.setProperty("--k", farbe);
      $("sf-vk").textContent = $("sf-kurz").value.trim() || ($("sf-name").value.trim()[0] || "?").toUpperCase();
      $("sf-vn").textContent = $("sf-name").value.trim() || "Neue Schicht";
    };
    $("sf-name").addEventListener("input", vorschau);
    $("sf-kurz").addEventListener("input", vorschau);
    dlg.querySelectorAll("[data-farbe]").forEach((b) => b.addEventListener("click", () => {
      farbe = b.dataset.farbe;
      dlg.querySelectorAll("[data-farbe]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      dlg.querySelector(".sfarbe-eigen").setAttribute("aria-checked", "false");
      vorschau();
    }));
    $("sf-eigen").addEventListener("input", (ev) => {
      farbe = ev.target.value;
      dlg.querySelectorAll("[data-farbe]").forEach((x) => x.setAttribute("aria-checked", "false"));
      const eig = dlg.querySelector(".sfarbe-eigen");
      eig.setAttribute("aria-checked", "true");
      eig.style.setProperty("--k", farbe);
      vorschau();
    });
    $("sf-zeit").addEventListener("change", () => { $("sf-zeiten").hidden = !$("sf-zeit").checked; if (!$("sf-zeit").checked) $("sf-kal").checked = false; });
    const zurueck = () => (ausListe ? this._schichtArten() : this._zu(dlg));
    $("sf-zurueck").addEventListener("click", zurueck);
    const senden = async (liste, text) => {
      try { await this._ws({ type: "planer/schicht_arten", person, arten: liste }); }
      catch (err) { $("sf-fehler").textContent = err.message || "Speichern hat nicht geklappt."; return false; }
      await this._lesen();
      this._sagen(text);
      return true;
    };
    $("sf-weg")?.addEventListener("click", async () => {
      const tage = Object.values(this._plan(person).tage).filter((x) => x === art.id).length;
      if (tage && !$("sf-weg").dataset.sicher) { $("sf-weg").dataset.sicher = "1"; $("sf-weg").textContent = `Wirklich löschen? ${tage} eingetragene Tage gehen mit weg`; return; }
      if (await senden(arten.filter((x) => x.id !== art.id), `${art.name} gelöscht`)) { if (this._stempel === art.id) this._stempel = null; zurueck(); }
    });
    $("sfform").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("sf-name").value.trim();
      if (!name) { $("sf-fehler").textContent = "Bitte einen Namen eingeben."; $("sf-name").focus(); return; }
      const mz = $("sf-zeit").checked;
      const neu = { id: art?.id, name, kurz: $("sf-kurz").value.trim() || name[0].toUpperCase(), farbe,
        von: mz ? $("sf-von").value || null : null, bis: mz ? $("sf-bis").value || null : null,
        pause: mz ? +$("sf-pause").value || 0 : 0, kalender: $("sf-kal").checked };
      const liste = art ? arten.map((x) => (x.id === art.id ? neu : x)) : [...arten, neu];
      if (await senden(liste, `${name} gespeichert`)) zurueck();
    });
    this._wischZu(dlg);
    if (!dlg.open) dlg.showModal();
    if (!art && !this._narrow) $("sf-name").focus();
  }

  // Rhythmus wie in Supershift: Folge von Kürzeln wiederholen (z. B. F F S S N N X X)
  _schichtRhythmus() {
    const person = this._schichtPerson();
    const plan = this._plan(person);
    const dlg = this.shadowRoot.getElementById("blatt");
    dlg.onclose = null; dlg._vorZu = null;
    const jetzt = new Date();
    const start = this._sStart && this._sStart > jetzt ? iso(this._sStart) : heute();
    dlg.innerHTML = `<form method="dialog" id="rhform" novalidate>
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <button type="button" class="knopf text l" id="rh-abbrechen">Abbrechen</button><h2 id="blatt-titel">Schichten wiederholen</h2><button type="submit" class="knopf text fett r">Eintragen</button></div>
      <div class="seg rh-modus" role="group" aria-label="Art der Wiederholung">
        <button type="button" data-rhmodus="muster" aria-pressed="${this._rhModus !== "kopie"}">Rhythmus</button>
        <button type="button" data-rhmodus="kopie" aria-pressed="${this._rhModus === "kopie"}">Zeitraum wiederholen</button>
      </div>
      <div id="rh-m" ${this._rhModus === "kopie" ? "hidden" : ""}>
      <p class="hinweis">Kürzel der Reihe nach, mit Leerzeichen getrennt. „-“ heißt keine Schicht. Der Rhythmus wiederholt sich bis zum Enddatum.</p>
      <div class="schnellwahl">${plan.arten.map((a) => `<button type="button" class="knopf klein" data-rh="${esc(a.kurz)}" style="--k:${a.farbe}">${esc(a.kurz)} · ${esc(a.name)}</button>`).join("")}<button type="button" class="knopf klein" data-rh="-">– frei lassen</button><button type="button" class="knopf klein" data-rh="zurueck">⌫</button></div>
      <div class="feld"><label for="rh-muster">Rhythmus</label><input id="rh-muster" value="${esc(this._rhMuster || "")}" placeholder="z. B. F F S S N N X X" autocomplete="off" autocapitalize="characters"></div>
      </div>
      <div id="rh-k" ${this._rhModus === "kopie" ? "" : "hidden"}>
      <p class="hinweis">Wähle einen schon geplanten Zeitraum als Vorlage. Er wird ab dem Startdatum immer wieder hintereinander eingetragen, bis zum Enddatum.</p>
      <div class="reihe">
        <div class="feld"><label for="rh-qvon">Vorlage von</label><input id="rh-qvon" type="date" value="${this._rhQ?.[0] || start}"></div>
        <div class="feld"><label for="rh-qbis">Vorlage bis</label><input id="rh-qbis" type="date" value="${this._rhQ?.[1] || iso(plusTage(ausIso(start), 13))}"></div>
      </div>
      </div>
      <div class="reihe">
        <div class="feld"><label for="rh-von">Eintragen ab</label><input id="rh-von" type="date" value="${this._rhModus === "kopie" ? iso(plusTage(ausIso(this._rhQ?.[1] || iso(plusTage(ausIso(start), 13))), 1)) : start}"></div>
        <div class="feld"><label for="rh-bis">Bis</label><input id="rh-bis" type="date" value="${iso(plusTage(ausIso(start), 90))}"></div>
      </div>
      <label class="check"><input type="checkbox" id="rh-ueber" checked> Bestehende Schichten überschreiben</label>
      <div class="rh-vorschau" id="rh-vorschau" aria-live="polite"></div>
      <p class="fehler" id="rh-fehler" role="alert"></p>
    </form>`;
    const $ = (id) => dlg.querySelector(`#${id}`);
    const lesen = () => $("rh-muster").value.trim().split(/[\s,;]+/).filter(Boolean);
    const nachKurz = (k) => plan.arten.find((a) => a.kurz.toLowerCase() === k.toLowerCase());
    const nachId = (id) => plan.arten.find((a) => a.id === id);
    const kopie = () => this._rhModus === "kopie";
    // Folge der Art-IDs (null = keine Schicht), die wiederholt wird
    const folge = () => {
      if (!kopie()) return lesen().map((k) => nachKurz(k)?.id || null);
      const qv = $("rh-qvon").value, qb = $("rh-qbis").value;
      if (!qv || !qb || qb < qv) return [];
      const f = [];
      for (let t = ausIso(qv); iso(t) <= qb && f.length < 366; t = plusTage(t, 1)) f.push(plan.tage[iso(t)] || null);
      return f;
    };
    const vorschau = () => {
      if (kopie()) {
        const f = folge();
        $("rh-fehler").textContent = !f.length ? "„Vorlage bis“ muss nach „Vorlage von“ liegen." : !f.some(Boolean) ? "In der Vorlage sind noch keine Schichten eingetragen." : "";
        const v = ausIso($("rh-von").value || heute());
        $("rh-vorschau").innerHTML = f.length ? `<small class="rh-info">Vorlage: ${f.length} Tage</small>` + [...Array(14)].map((_, i) => {
          const a = nachId(f[i % f.length]);
          const t = plusTage(v, i);
          return `<span class="rh-tag" ${a ? `style="--k:${a.farbe}"` : ""}><small>${WT_KURZ[wt(t)]} ${t.getDate()}.</small><b>${a ? esc(a.kurz) : "–"}</b></span>`;
        }).join("") : "";
        return;
      }
      const m = lesen();
      const falsch = m.filter((k) => k !== "-" && !nachKurz(k));
      $("rh-fehler").textContent = falsch.length ? `Unbekannt: ${falsch.join(", ")}` : "";
      if (!m.length) { $("rh-vorschau").innerHTML = ""; return; }
      const v = ausIso($("rh-von").value || heute());
      $("rh-vorschau").innerHTML = [...Array(14)].map((_, i) => {
        const a = nachKurz(m[i % m.length]);
        const t = plusTage(v, i);
        return `<span class="rh-tag" ${a ? `style="--k:${a.farbe}"` : ""}><small>${WT_KURZ[wt(t)]} ${t.getDate()}.</small><b>${a ? esc(a.kurz) : "–"}</b></span>`;
      }).join("");
    };
    dlg.querySelectorAll("[data-rh]").forEach((b) => b.addEventListener("click", () => {
      const m = lesen();
      if (b.dataset.rh === "zurueck") m.pop(); else m.push(b.dataset.rh);
      $("rh-muster").value = m.join(" ");
      vorschau();
    }));
    ["rh-muster", "rh-von", "rh-qvon"].forEach((id) => $(id).addEventListener("input", vorschau));
    $("rh-qbis").addEventListener("input", () => {
      // Ziel beginnt standardmäßig direkt nach der Vorlage
      if ($("rh-qbis").value) $("rh-von").value = iso(plusTage(ausIso($("rh-qbis").value), 1));
      vorschau();
    });
    dlg.querySelectorAll("[data-rhmodus]").forEach((b) => b.addEventListener("click", () => {
      this._rhModus = b.dataset.rhmodus;
      dlg.querySelectorAll("[data-rhmodus]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      $("rh-m").hidden = kopie(); $("rh-k").hidden = !kopie();
      if (kopie() && $("rh-qbis").value) $("rh-von").value = iso(plusTage(ausIso($("rh-qbis").value), 1));
      vorschau();
    }));
    vorschau();
    $("rh-abbrechen").addEventListener("click", () => this._zu(dlg));
    $("rhform").addEventListener("submit", (e) => {
      e.preventDefault();
      const m = lesen();
      if (kopie()) {
        if (!folge().some(Boolean)) { vorschau(); return; }
      } else {
        if (!m.length) { $("rh-fehler").textContent = "Bitte einen Rhythmus eingeben."; return; }
        if (m.some((k) => k !== "-" && !nachKurz(k))) return;
      }
      const f = folge();
      const v = $("rh-von").value, b = $("rh-bis").value;
      if (!v || !b || b < v) { $("rh-fehler").textContent = "„Bis“ muss nach „Ab“ liegen."; return; }
      const ueber = $("rh-ueber").checked;
      const aenderungen = {};
      let i = 0;
      for (let t = ausIso(v); iso(t) <= b && i < 800; t = plusTage(t, 1), i++) {
        const tag = iso(t);
        if (!ueber && plan.tage[tag]) continue;
        aenderungen[tag] = f[i % f.length] || null;
      }
      if (kopie()) this._rhQ = [$("rh-qvon").value, $("rh-qbis").value]; else this._rhMuster = m.join(" ");
      this._zu(dlg);
      this._schichtSetzen(person, aenderungen);
      this._sagen(`${kopie() ? "Zeitraum wiederholt" : "Rhythmus eingetragen"}: ${Object.keys(aenderungen).length} Tage`);
    });
    this._wischZu(dlg);
    dlg.showModal();
  }

  _kalenderUmschalter(inline) {
    const v = this._kalAnsicht;
    return `${inline ? "" : '<div class="kalleiste">'}<div class="seg kalumschalter" role="group" aria-label="Kalenderansicht">
      <button type="button" data-kal-ansicht="monat" data-fokus="ka-m" aria-pressed="${v === "monat"}">Monat</button>
      <button type="button" data-kal-ansicht="woche" data-fokus="ka-w" aria-pressed="${v === "woche"}">Woche</button>
      <button type="button" data-kal-ansicht="schichten" data-fokus="ka-s" aria-pressed="${v === "schichten"}">Schichten</button>
    </div>${inline ? "" : "</div>"}`;
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
    const am = (tag) => this._ohneSchichtTermine(termine || []).filter((t) => {
      const s0 = t.start.slice(0, 10), e0 = t.ende.slice(0, 10);
      return t.ganztag ? s0 <= tag && tag < e0 : s0 <= tag && tag <= e0;
    });
    const aufg = (tag) => this._sortiert(alle.filter((a) => a.datum === tag && a.status === "offen"));
    const heuteIso = iso(new Date());
    const dieserMonat = erster.getMonth(), dieserJahr = erster.getFullYear();
    const zeilen = tage.slice(35).every((t) => ausIso(t).getMonth() !== dieserMonat) ? 35 : 42;
    return `<section class="gruppe" aria-labelledby="m-titel">
      ${this._narrow ? this._kalenderUmschalter() : ""}
      <div class="wkopf"><h2 id="m-titel">${MONATE[dieserMonat]} ${dieserJahr}</h2>${this._narrow ? "" : this._kalenderUmschalter(true)}${this._kalNavi("monat", "Heute", dieserMonat === new Date().getMonth() && dieserJahr === new Date().getFullYear(), "Monat wechseln")}</div>
      <div class="woche-wrap"><div class="monat ${this._mRichtung > 0 ? "rein-r" : this._mRichtung < 0 ? "rein-l" : ""}" role="grid" aria-labelledby="m-titel" style="--zeilen:${zeilen / 7}">
        ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((n) => `<div class="mkopf" role="columnheader">${n}</div>`).join("")}
        ${tage.slice(0, zeilen).map((t) => {
          const d = ausIso(t);
          const ts = am(t), as = aufg(t);
          const sch = this._schichtenAm(t);
          const items = [
            ...ts.map((x) => `<span class="me" style="--c:${this._farbe(x.kalender)}">${x.ganztag ? "" : `<span class="u">${uhr(x.start)}</span>`}<span class="tx">${esc(x.titel)}</span></span>`),
            ...as.map((a) => `<span class="me auf" style="--c:${bereichFarbe(a.bereich, this._daten.farben) || "var(--muted)"}">${a.uhrzeit ? `<span class="u">${a.uhrzeit}</span>` : ""}<span class="tx">${this._kalAv(a)}${esc(a.titel)}</span></span>`),
          ];
          const schHtml = sch.length ? `<span class="msz">${sch.map(({ a: sc, wer }) => `<span class="msk" style="--sc:${sc.farbe}" title="${esc(`${wer ? wer + ": " : ""}${sc.name} ${this._schichtZeit(sc)}`.trim())}">${esc(wer ? `${wer[0]} ${sc.kurz}` : sc.kurz)}${sc.von && sc.bis ? `<span class="sz">${sc.von}–${sc.bis}</span>` : ""}</span>`).join("")}</span>` : "";
          const streifen = sch.length ? `<span class="mstreifen" aria-hidden="true">${sch.map(({ a: sc }) => `<i style="--sc:${sc.farbe}"></i>`).join("")}</span>` : "";
          return `<button type="button" role="gridcell" class="mtag ${d.getMonth() !== dieserMonat ? "fremd" : ""} ${t === heuteIso ? "heute" : ""} ${t < heuteIso ? "vorbei" : ""} ${sch.length ? "mschichttag" : ""}" data-mtag="${t}" ${sch.length ? `style="--sc1:${sch[0].a.farbe}"` : ""}
            aria-label="${esc(`${d.getDate()}. ${MONATE[d.getMonth()]}: ${sch.map(({ a: sc, wer }) => `${wer ? wer + " " : ""}${sc.name}`).join(", ")}${sch.length ? ", " : ""}${ts.length} Termine, ${as.length} Aufgaben. Tag öffnen`)}">
            ${streifen}<span class="mnr">${d.getDate()}</span>${schHtml}${items.join("")}</button>`;
        }).join("")}
      </div></div>
      ${termine === null ? `<p class="hinweis" role="status">Termine werden geladen …</p>` : ""}
    </section>`;
  }

  // Nach dem Zeichnen: Monat und Woche an die freie Höhe anpassen (Handy ohne Scrollen)
  _kalPassen() {
    if (this._ansicht !== "woche") return;
    if (this._kalAnsicht === "monat") this._monatPassen();
    else if (this._kalAnsicht === "woche") this._wochePassen();
    else return;
    if (!this._kalGroesse) {
      this._kalGroesse = () => { cancelAnimationFrame(this._kalRaf); this._kalRaf = requestAnimationFrame(() => this._kalPassen()); };
      window.addEventListener("resize", this._kalGroesse);
    }
  }
  _freieHoehe(el) {
    const nav = this._app.querySelector("nav.tabs[aria-label]") || this._app.querySelector("nav.tabs");
    const oben = el.getBoundingClientRect().top + (window.scrollY || 0);
    const unten = this._narrow && nav ? nav.getBoundingClientRect().top - 8 : window.innerHeight - 16;
    return Math.max(280, Math.floor(unten - oben));
  }
  _monatPassen() {
    const m = this._app.querySelector(".monat");
    if (!m) return;
    const kompakt = getComputedStyle(m).getPropertyValue("--kompakt").trim() === "1";
    m.style.height = this._narrow ? `${this._freieHoehe(m) - (this._app.querySelector(".fab") ? 60 : 0)}px` : `${Math.max(520, this._freieHoehe(m))}px`;
    // Ändert sich die Größe später (Schrift geladen, Kopf umgebrochen), neu verteilen
    if (window.ResizeObserver && this._monatRO?.ziel !== m) {
      this._monatRO?.disconnect();
      this._monatRO = new ResizeObserver(() => { cancelAnimationFrame(this._monatRaf); this._monatRaf = requestAnimationFrame(() => this._monatPassen()); });
      this._monatRO.ziel = m;
      this._monatRO.observe(m.querySelector(".mtag") || m);
    }
    m.querySelectorAll(".mmehr").forEach((x) => x.remove());
    m.querySelectorAll(".me[hidden]").forEach((x) => { x.hidden = false; });
    if (!kompakt) return;
    const wort = this._narrow ? "" : " weitere";
    m.querySelectorAll(".mtag").forEach((z) => {
      const es = [...z.querySelectorAll(".me")];
      if (!es.length) return;
      const unten = z.getBoundingClientRect().bottom - 3;
      let weg = 0;
      // Höchstens 3 Einträge pro Tag, der Rest als „+n weitere“
      for (let i = es.length - 1; i >= 0; i--) if (i >= 3 || es[i].getBoundingClientRect().bottom > unten) { es[i].hidden = true; weg++; }
      if (!weg) return;
      const mm = document.createElement("span");
      mm.className = "mmehr";
      mm.textContent = `+${weg}${wort}`;
      z.appendChild(mm);
      while (mm.getBoundingClientRect().bottom > unten) {
        const sicht = es.filter((e) => !e.hidden);
        if (!sicht.length) break;
        sicht[sicht.length - 1].hidden = true; weg++;
        mm.textContent = `+${weg}${wort}`;
      }
    });
  }
  _wochePassen() {
    const c = this._app.querySelector("#wcal");
    if (!c) return;
    const von = +c.dataset.von, bis = +c.dataset.bis;
    const stunden = Math.max(1, bis - von);
    const kopfH = c.querySelector(".wsticky").offsetHeight;
    let hpx = +c.dataset.hpx;
    if (!this._narrow) {
      // PC: Zeitraum füllt genau die freie Höhe (mindestens 28 px pro Stunde, sonst Scrollen)
      hpx = Math.max(28, (this._freieHoehe(c) - kopfH) / stunden);
      c.style.setProperty("--hpx", `${hpx}px`);
      c.style.height = `${Math.ceil(kopfH + stunden * hpx)}px`;
      if (window.ResizeObserver && this._wocheRO?.ziel !== c) {
        this._wocheRO?.disconnect();
        this._wocheRO = new ResizeObserver(() => { cancelAnimationFrame(this._wocheRaf); this._wocheRaf = requestAnimationFrame(() => this._wochePassen()); });
        this._wocheRO.ziel = c;
        this._wocheRO.observe(c.querySelector(".wsticky"));
        this._wocheRO.observe(document.documentElement);
        if (this._app.firstElementChild) this._wocheRO.observe(this._app.firstElementChild);
      }
    } else if (c.classList.contains("drei")) {
      // Handy, 3 Tage: kein eigener Scrollbereich. Die Seite scrollt, der Tageskopf bleibt oben stehen,
      // und der ganze Zeitraum passt dann genau zwischen Tageskopf und Leiste unten.
      // Unterkante = so weit, wie die Seite höchstens hochscrollt (Abstand unten im Rahmen)
      const wrap = c.closest(".wrap");
      const pad = wrap ? parseFloat(getComputedStyle(wrap).paddingBottom) || 0 : 0;
      let danach = 0;
      for (let el = c.nextElementSibling; el; el = el.nextElementSibling) danach += el.offsetHeight;
      const unten = window.innerHeight - pad - danach - 4;
      hpx = Math.max(36, (unten - kopfH) / stunden);
      c.style.setProperty("--hpx", `${hpx}px`);
      c.style.height = "";
      if (!this._dreiGroesse) {
        this._dreiGroesse = true;
        window.addEventListener("resize", () => { cancelAnimationFrame(this._wocheRaf); this._wocheRaf = requestAnimationFrame(() => this._wochePassen()); });
      }
      return;
    } else {
      const voll = kopfH + c.querySelector(".wkoerper").offsetHeight;
      c.style.height = `${Math.min(voll, this._freieHoehe(c))}px`;
    }
    c.onscroll = () => { this._wScroll = c.scrollTop; };
    if (!this._narrow) { this._wScroll = c.scrollHeight > c.clientHeight + 1 ? this._wScroll : 0; }
    else if (this._wScroll === undefined) {
      const h = new Date().getHours();
      this._wScroll = h >= von + 3 ? Math.max(0, (h - 1 - von) * hpx) : 0;
    }
    c.scrollTop = this._wScroll || 0;
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

  // Woche wie im Google Kalender: 7 Tage als Spalten (Mo–So), Ganztags-Zeile, Stundenraster
  _wocheHtml(alle) {
    // Handy: 3 Tage ab heute, Wischen und Pfeile blättern um 3 Tage
    const drei = this._narrow;
    const start = drei ? (this._w3Start || ausIso(heute())) : montag(this._wStart || ausIso(heute()));
    const k = kw(start);
    const tage = [...Array(drei ? 3 : 7)].map((_, i) => iso(plusTage(start, i)));
    const termine = this._wTermine?.start === iso(start) ? this._wTermine.liste : null;
    if (!termine) this._wocheTermineLaden(start);
    const aufg = (tag) => this._sortiert(alle.filter((a) => a.datum === tag && (a.status === "offen" || (a.erledigt_am || "").slice(0, 10) === tag)));
    const d0 = ausIso(tage[0]), d7 = ausIso(tage[tage.length - 1]);
    const spanne = `${d0.getDate()}. ${d0.getMonth() !== d7.getMonth() ? MONATE[d0.getMonth()] + " " : ""}– ${d7.getDate()}. ${MONATE[d7.getMonth()]}`;
    const eingang = this._sortiert(alle.filter((a) => a.status === "offen" && !a.datum));
    return `<section class="gruppe" aria-labelledby="w-titel">
      ${this._narrow ? this._kalenderUmschalter() : ""}
      <div class="wkopf"><h2 id="w-titel">${this._narrow ? `<span class="wmon">${esc(d0.getMonth() !== d7.getMonth() ? `${MONATE[d0.getMonth()].slice(0, 3)}/${MONATE[d7.getMonth()].slice(0, 3)}` : MONATE[d7.getMonth()].slice(0, 3))}</span><span class="zahl">KW ${+k.slice(6)}</span><span class="sr">${esc(spanne)}</span>` : `${esc(spanne)}<span class="zahl">KW ${+k.slice(6)}</span>`}</h2>${this._narrow ? "" : this._kalenderUmschalter(true)}${this._kalNavi("woche", "Heute", drei ? iso(start) === heute() : iso(start) === iso(montag(new Date())), drei ? "Tage wechseln" : "Woche wechseln")}</div>
    </section>
    ${drei ? this._wocheLeiste(tage) : ""}
    ${this._wocheRaster(tage, termine || [], aufg)}
    ${termine === null ? `<p class="hinweis" role="status">Termine werden geladen …</p>` : ""}
    ${eingang.length ? `<section class="gruppe" aria-labelledby="ab-titel">
      <h2 id="ab-titel">Aus dem Eingang einplanen</h2>
      <div class="ablage">${eingang.map((a) => `<button type="button" class="wpunkt a" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}" draggable="true" data-ziehen="${a.id}" data-aktion="oeffnen" data-id="${a.id}">${esc(a.titel)}</button>`).join("")}</div>
    </section>` : ""}`;
  }

  // Ganztags-Zeile und Stundenraster der Woche; Schichten mit Uhrzeit als Band hinter den Terminen
  _wocheRaster(tage, termine, aufg) {
    const von = this._daten.einst?.tag_von ?? 7, bis = this._daten.einst?.tag_bis ?? 22;
    const hpx = this._narrow ? 44 : 48;
    const zeit = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5);
    const stunden = bis - von;
    const jetzt = new Date();
    const jetztMin = jetzt.getHours() * 60 + jetzt.getMinutes();
    const aussen = (s0, e0) => e0 <= von * 60 || s0 >= bis * 60;
    const spalten = tage.map((tag, i) => {
      const ganz = [], bloecke = [], baender = [];
      const ts = this._termineIn(termine, tag), as = aufg(tag);
      for (const t of ts) {
        if (t.ganztag) { ganz.push(`<button type="button" class="wc t" style="--c:${this._farbe(t.kalender)}" data-termin="${esc(`${t.kalender}|${t.uid}|${t.start}`)}" title="${esc(t.titel)}">${esc(t.titel)}</button>`); continue; }
        const s0 = t.start.slice(0, 10) < tag ? 0 : zeit(uhr(t.start));
        const e0 = Math.max(t.ende.slice(0, 10) > tag ? 1440 : zeit(uhr(t.ende)), s0 + 25);
        const text = `${uhr(t.start)}–${uhr(t.ende)}`;
        const attr = `data-termin="${esc(`${t.kalender}|${t.uid}|${t.start}`)}" aria-label="${esc(`${t.titel}, ${text}, ${this._kal(t.kalender).name}`)}"`;
        if (aussen(s0, e0)) { ganz.push(`<button type="button" class="wc t" style="--c:${this._farbe(t.kalender)}" ${attr}>${uhr(t.start)} ${esc(t.titel)}</button>`); continue; }
        bloecke.push({ s: s0, e: e0, html: (stil, hoch) => `<button type="button" class="block t" style="${stil};--k:${this._farbe(t.kalender)}" ${attr}><b>${esc(t.titel)}</b>${hoch ? `<span>${text}</span>` : ""}</button>` });
      }
      for (const a of as) {
        const farbe = bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)";
        if (!a.uhrzeit) { ganz.push(`<button type="button" class="wc a ${a.status === "erledigt" ? "fertig" : ""}" style="--c:${farbe}" data-aktion="oeffnen" data-id="${a.id}" draggable="${a.status === "offen"}" data-ziehen="${a.id}" title="${esc(a.titel)}">${this._kalAv(a)}${esc(a.titel)}</button>`); continue; }
        const s0 = zeit(a.uhrzeit), e0 = s0 + Math.max(a.dauer || 30, 25);
        const attr = `data-aktion="oeffnen" data-id="${a.id}" draggable="${a.status === "offen"}" data-ziehen="${a.id}" aria-label="${esc(`Aufgabe ${a.titel} um ${a.uhrzeit}`)}"`;
        if (aussen(s0, e0)) { ganz.push(`<button type="button" class="wc a" style="--c:${farbe}" ${attr}>${a.uhrzeit} ${this._kalAv(a)}${esc(a.titel)}</button>`); continue; }
        bloecke.push({ s: s0, e: e0, html: (stil, hoch) => `<button type="button" class="block a ${a.status === "erledigt" ? "fertig" : ""}" style="${stil};--k:${farbe}" ${attr}><b>${this._kalAv(a)}${esc(a.titel)}</b>${hoch ? `<span>${a.uhrzeit} · Aufgabe</span>` : ""}</button>` });
      }
      const schicht = [];
      for (const { a: sc, wer } of this._schichtenAm(tag)) {
        if (sc.von && sc.bis) {
          const s0 = zeit(sc.von); let e0 = zeit(sc.bis); if (e0 <= s0) e0 = 1440;
          if (!aussen(s0, e0)) { baender.push({ s: s0, e: e0, sc, wer }); continue; }
        }
        schicht.push({ sc, wer });
      }
      // Nachtschicht vom Vortag läuft bis in den Morgen
      for (const { a: sc, wer } of this._schichtenAm(iso(plusTage(ausIso(tag), -1)))) {
        if (!(sc.von && sc.bis)) continue;
        const s0 = zeit(sc.von), e0 = zeit(sc.bis);
        if (e0 <= s0 && e0 > von * 60) baender.push({ s: 0, e: e0, sc, wer, fort: true });
      }
      // 3-Tage-Ansicht: Schichten mit Uhrzeit zusätzlich als Chip oben, im Raster nur als Randstreifen
      if (tage.length === 3) for (const b of baender) if (!b.fort) schicht.push({ sc: b.sc, wer: b.wer });
      const sChips = schicht.map(({ sc, wer }) => `<span class="wc s" style="--sc:${sc.farbe}" title="${esc(`${wer ? wer + ": " : ""}${sc.name} ${this._schichtZeit(sc)}`.trim())}"><b>${esc(wer ? `${wer[0]} ${sc.kurz}` : sc.kurz)}</b><i class="nm">${esc(sc.name)}</i></span>`);
      const alleGanz = [...sChips, ...ganz];
      const sichtbar = alleGanz.slice(0, 3).join("") + (alleGanz.length > 3 ? `<button type="button" class="wc mehr" data-tagauf="${tag}">+${alleGanz.length - 3}</button>` : "");
      // Spalten für überschneidende Blöcke
      bloecke.sort((x, y) => x.s - y.s || y.e - x.e);
      let gruppe = [], gEnde = -1;
      const fertig = () => { const n = Math.max(...gruppe.map((x) => x.sp)) + 1; gruppe.forEach((x) => { x.n = n; }); gruppe = []; };
      for (const x of bloecke) {
        if (x.s >= gEnde && gruppe.length) fertig();
        const belegt = new Set(gruppe.filter((y) => y.e > x.s).map((y) => y.sp));
        x.sp = 0; while (belegt.has(x.sp)) x.sp++;
        gruppe.push(x); gEnde = Math.max(gEnde, x.e);
      }
      if (gruppe.length) fertig();
      const px = (m) => (Math.max(m, von * 60) - von * 60) / 60;
      const cp = (h, extra = "") => `calc(var(--hpx) * ${h.toFixed(4)}${extra})`;
      const bandHtml = baender.map((x, n) => {
        const top = px(x.s), h = px(Math.min(x.e, bis * 60)) - top;
        return `<div class="wband ${x.fort ? "fort" : ""} ${baender.length > 1 ? "geteilt" : ""}" style="--bi:${n};top:${cp(top)};height:${cp(h)};left:${n * 100 / baender.length}%;width:${100 / baender.length}%;--k:${x.sc.farbe}" title="${esc(`${x.wer ? x.wer + ": " : ""}${x.sc.name} ${this._schichtZeit(x.sc)}`.trim())}"><span>${x.wer ? `<b>${esc(x.wer[0])}</b> ` : ""}${esc(x.sc.name)}</span></div>`;
      }).join("");
      const blockHtml = bloecke.map((x) => {
        const top = px(x.s), hoeheH = px(Math.min(x.e, bis * 60)) - top;
        // 3-Tage-Ansicht: Überschneidungen leicht versetzt übereinander (wie Apple), sonst nebeneinander
        const lage = tage.length === 3
          ? `left:calc(${x.sp * 16}px + 1px);width:calc(100% - ${x.sp * 16}px - 2px);z-index:${2 + x.sp}`
          : `left:calc(${x.sp * 100 / x.n}% + 1px);width:calc(${100 / x.n}% - 2px)`;
        return x.html(`top:${cp(top)};height:max(${tage.length === 3 ? 24 : 20}px, ${cp(hoeheH, " - 1px")});${lage};--zl:${hoeheH * hpx >= 38 ? 2 : 1}`, hoeheH * hpx - 1 >= (tage.length === 3 ? 58 : 34) && (!this._narrow || tage.length === 3));
      }).join("");
      const heuteTag = tag === this._tag;
      const jetztHtml = heuteTag && jetztMin > von * 60 && jetztMin < bis * 60 ? `<div class="wjetzt" style="top:${cp(px(jetztMin))}" aria-hidden="true"></div>` : "";
      const d = ausIso(tag);
      return { kopf: `<button type="button" class="wkh ${heuteTag ? "heute" : ""} ${tag < this._tag ? "vorbei" : ""}" data-tagauf="${tag}" aria-label="${esc(datumText(tag) + ", Tag öffnen")}"><span class="wn">${WT_KURZ[wt(d)]}</span><b>${d.getDate()}</b></button>`,
        ganz: `<div class="wkg ${heuteTag ? "heute" : ""} ${tag < this._tag ? "vorbei" : ""}" data-tag="${tag}" data-wleer="${tag}">${sichtbar}</div>`,
        spalte: `<div style="--nb:${tage.length === 3 ? new Set(baender.map((b) => b.wer + b.sc.id)).size : 0}" class="wspalte ${heuteTag ? "heute" : ""} ${tag < this._tag ? "vorbei" : ""}" data-tag="${tag}" data-wleer="${tag}" style="height:${cp(stunden)}">${bandHtml}${blockHtml}${jetztHtml}</div>` };
    });
    return `<div class="wcal ${tage.length === 3 ? "drei" : ""} ${this._wRichtung ? (this._wRichtung > 0 ? "rein-r" : "rein-l") : ""}" id="wcal" style="--hpx:${hpx}px;--wn:${tage.length}" role="group" aria-label="Wochenkalender" data-von="${von}" data-bis="${bis}" data-hpx="${hpx}">
      <div class="wsticky">
        <div class="wzeile"><div class="wl"></div>${spalten.map((x) => x.kopf).join("")}</div>
        <div class="wzeile wganzz"><div class="wl">Ganztag</div>${spalten.map((x) => x.ganz).join("")}</div>
      </div>
      <div class="wzeile wkoerper"><div class="wl wstunden" style="height:calc(var(--hpx) * ${stunden})" aria-hidden="true">${[...Array(stunden)].map((_, i) => `<span style="top:calc(var(--hpx) * ${i})">${String(von + i).padStart(2, "0")}<small>:00</small></span>`).join("")}</div>${spalten.map((x) => x.spalte).join("")}</div>
    </div>`;
  }

  _termineIn(liste, tag) {
    return this._ohneSchichtTermine(liste).filter((t) => {
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
        html: `<span class="wpunkt a ${a.status === "erledigt" ? "fertig" : ""}" draggable="${a.status === "offen"}" data-ziehen="${a.id}" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}"><span class="zt">${a.uhrzeit}</span>${this._kalAv(a)}${esc(a.titel)}</span>` })),
    ].sort((x, y) => x.s.localeCompare(y.s));
    const ohne = as.filter((a) => !a.uhrzeit);
    const schs = this._schichtenAm(tag);
    const schChip = schs.map(({ a: sch, wer }) => `<span class="wpunkt s" style="--k:${sch.farbe}"><b>${esc(sch.kurz)}</b> ${wer ? `${esc(wer)}: ` : ""}${esc(sch.name)}${sch.von ? ` <span class="zt">${sch.von}–${sch.bis}</span>` : ""}</span>`).join("");
    if (!ganz.length && !zeitlich.length && !ohne.length && !schs.length) return `<p class="wleer">Nichts geplant.</p>`;
    return `<div class="chips">${schChip}
      ${ganz.map((t) => `<span class="wpunkt t" style="--k:${this._farbe(t.kalender)}">${esc(t.titel)}</span>`).join("")}
      ${zeitlich.map((x) => x.html).join("")}
      ${ohne.map((a) => `<span class="wpunkt a ${a.top ? "top" : ""} ${a.status === "erledigt" ? "fertig" : ""}" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}" draggable="${a.status === "offen"}" data-ziehen="${a.id}">${a.top ? `<span class="z">${a.top}</span>` : ""}${this._kalAv(a)}${esc(a.titel)}</span>`).join("")}
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
          aria-label="${esc(`Aufgabe ${a.titel} um ${a.uhrzeit}`)}"><b>${this._kalAv(a)}${esc(a.titel)}</b>${hoch ? `<span>${a.uhrzeit} · Aufgabe</span>` : ""}</button>` };
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
    const tagSchichten = this._schichtenAm(tag);
    if (tagSchichten.length) html += `<div class="ganztags">${tagSchichten.map(({ a: ts, wer }) => `<span class="wpunkt s" style="--k:${ts.farbe}"><b>${esc(ts.kurz)}</b> ${wer ? `${esc(wer)}: ` : ""}${esc(ts.name)}${ts.von ? ` · ${ts.von}–${ts.bis}` : ""}</span>`).join("")}</div>`;
    if (ganz.length) html += `<div class="ganztags">${ganz.map((t) => `<button type="button" class="wpunkt t" style="--k:${this._farbe(t.kalender)}" data-termin="${esc(`${t.kalender}|${t.uid}|${t.start}`)}" aria-label="${esc(`${t.titel}, ganztägig`)}">${esc(t.titel)}</button>`).join("")}</div>`;
    if (ohne.length) html += `<div class="ohnezeit">${ohne.map((a) => `<button type="button" class="wpunkt a ${a.top ? "top" : ""} ${a.status === "erledigt" ? "fertig" : ""}" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}" data-aktion="oeffnen" data-id="${a.id}" draggable="${a.status === "offen"}" data-ziehen="${a.id}">${a.top ? `<span class="z">${a.top}</span>` : ""}${this._kalAv(a)}${esc(a.titel)}</button>`).join("")}</div>`;
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
    const as = this._sortiert(this._kalenderAufgaben().filter((a) => a.datum === tag && (a.status === "offen" || (a.erledigt_am || "").slice(0, 10) === tag)));
    const d = ausIso(tag);
    const kannTermin = (this._daten.kalender || []).some((k) => k.schreiben);
    dlg.innerHTML = `<form method="dialog" class="tag-blatt">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <button type="button" class="rund l" data-tagweiter="-1" aria-label="Vorheriger Tag">${ICON.zurueck}</button>
        ${(() => { const kurz = `${WT_KURZ[wt(d)]}., ${d.getDate()}. ${MONATE[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`; const rel = ["Heute", "Morgen", "Gestern"].includes(datumText(tag)) ? datumText(tag) : ""; return `<h2 id="tag-titel">${esc(rel || kurz)}${rel ? `<small class="tag-unter">${esc(kurz)}</small>` : ""}</h2>`; })()}
        <span class="r tag-r"><button type="button" class="rund" data-tagweiter="1" aria-label="Nächster Tag">${ICON.vor}</button><button type="submit" class="knopf text fett">Fertig</button></span></div>
      ${quelle ? "" : `<p class="hinweis" role="status">Termine werden geladen …</p>`}
      ${this._narrow ? "" : `<p class="hinweis">Im Raster ein Zeitfenster ziehen, um etwas einzutragen.</p>`}
      ${as.length ? `<ul class="tag-aufgaben" aria-label="Aufgaben an diesem Tag">${as.map((a) => { const fertig = a.status === "erledigt"; return `<li class="${fertig ? "fertig" : ""}" style="--k:${bereichFarbe(a.bereich, this._daten.farben) || "var(--accent)"}">
        <button type="button" class="haken" role="checkbox" aria-checked="${fertig}" data-tag-haken="${a.id}" aria-label="${esc(a.titel)} erledigt">${fertig ? HAKEN : ""}</button>
        <button type="button" class="ta-titel" data-aktion="oeffnen" data-id="${a.id}">${a.uhrzeit ? `<span class="u">${a.uhrzeit}</span>` : ""}${esc(a.titel)}</button></li>`; }).join("")}</ul>` : ""}
      <div class="tag-inhalt">${this._tagInhalt(tag, ts, as, 52, true)}</div>
      ${kannTermin ? `<button type="button" class="knopf" data-tagtermin="1">${ICON.termin}Ganztägig oder mit allen Optionen</button>` : ""}
    </form>`;
    dlg.querySelectorAll("[data-tagweiter]").forEach((b) => b.addEventListener("click", () => this._tagZeigen(iso(plusTage(ausIso(tag), +b.dataset.tagweiter)))));
    dlg.querySelectorAll("[data-aktion=oeffnen]").forEach((b) => b.addEventListener("click", () => { const a = this._finde(b.dataset.id); if (a) this._oeffnen(a); }));
    dlg.querySelector("[data-tagtermin]")?.addEventListener("click", () => this._terminNeu(tag));
    dlg.querySelectorAll("[data-tag-haken]").forEach((b) => b.addEventListener("click", async () => {
      b.closest("li")?.classList.add("abgehakt");
      try { await this._aktion("haken", b.dataset.tagHaken); } finally { if (dlg.open) this._tagZeigen(tag); }
    }));
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

  // Handy: Mo–So als kleine Leiste, gezeigte Tage markiert, Schichten als Farbpunkte; Tipp springt hin
  _wocheLeiste(tage) {
    const mo = montag(ausIso(tage[1]));
    return `<div class="wleiste" role="group" aria-label="Tag wählen">${[...Array(7)].map((_, i) => {
      const t = iso(plusTage(mo, i)), d = ausIso(t);
      const sch = this._schichtenAm(t);
      return `<button type="button" data-wsprung="${t}" class="${tage.includes(t) ? "an" : ""} ${t === this._tag ? "heute" : ""} ${t < this._tag ? "vorbei" : ""}" aria-label="${esc(datumText(t))}"><small>${WT_KURZ[i]}</small><b>${d.getDate()}</b><span class="pk">${sch.map(({ a }) => `<i style="--sc:${a.farbe}"></i>`).join("")}</span></button>`;
    }).join("")}</div>`;
  }

  _wocheBlaettern(n, gewischt) {
    if (this._narrow) {
      this._w3Start = n === 0 ? null : plusTage(this._w3Start || ausIso(heute()), 3 * n);
      this._wRichtung = n;
      this._zeichnen();
      const st = this._w3Start || ausIso(heute());
      this._sagen(`${datumText(iso(st))} bis ${datumText(iso(plusTage(st, 2)))}`);
      return;
    }
    this._wStart = n === 0 ? null : plusTage(this._wStart || ausIso(heute()), 7 * n);
    this._zeichnen();
    const st = montag(this._wStart || ausIso(heute()));
    this._sagen(`${datumText(iso(st))} bis ${datumText(iso(plusTage(st, 6)))}`);
  }

  // ---------- Wetter (Tagesvorhersage aus der HA-Wetter-Entität) ----------
  _wetterEntitaet() {
    const st = this._hass?.states || {};
    const wahl = this._daten?.wetter || this._konf?.wetter;
    if (wahl === "-") return null;
    if (wahl && st[wahl]) return wahl;
    if (st["weather.forecast_home"]) return "weather.forecast_home";
    return Object.keys(st).find((k) => k.startsWith("weather.")) || null;
  }
  _wetterStart() {
    const id = this._wetterEntitaet();
    if (!id || this._wetterAbo?.id === id) return;
    this._wetterAbo?.ab?.then?.((f) => f()).catch?.(() => {});
    const abo = { id, ab: null };
    this._wetterAbo = abo;
    try {
      abo.ab = this._hass.connection.subscribeMessage((m) => {
        const neu = {};
        for (const f of m?.forecast || []) {
          const d = new Date(f.datetime);
          neu[iso(d)] = { z: f.condition, hoch: f.temperature, tief: f.templow };
        }
        this._wetter = neu;
        if (this._ansicht === "heute") this._zeichnen();
      }, { type: "weather/subscribe_forecast", entity_id: id, forecast_type: "daily" });
      abo.ab.catch?.(() => { this._wetterAbo = { id, ab: null }; });
    } catch (e) { /* ohne Wetter weiter */ }
  }
  // Einstellungen: Wetter-Entität wählen und Regeln für automatische Aufgaben
  _wetterRegelnHtml() {
    const d = this._daten, st = this._hass?.states || {};
    const name = (id) => st[id]?.attributes?.friendly_name || id;
    const wetter = Object.keys(st).filter((k) => k.startsWith("weather.")).sort();
    const regeln = d.regeln || [];
    const personen = [...(d.personen || []).map((p) => [p.id, p.name]), [GEMEINSAM, "Gemeinsam"]];
    const zText = (z) => ({ on: "An", off: "Aus", open: "Offen", closed: "Zu", home: "Zuhause", not_home: "Abwesend", unavailable: "Nicht verfügbar" }[z] || z);
    return `<fieldset><legend>Wetter</legend>
        <div class="feld"><label for="wetter-wahl">Wetter in den Tageskarten</label>
          <select id="wetter-wahl"><option value="">Automatisch${this._wetterEntitaet() ? ` (${esc(name(this._wetterEntitaet()))})` : ""}</option><option value="-" ${d.wetter === "-" ? "selected" : ""}>Kein Wetter</option>
          ${wetter.map((w) => `<option value="${esc(w)}" ${d.wetter === w ? "selected" : ""}>${esc(name(w))}</option>`).join("")}</select></div>
      </fieldset>
      <fieldset id="sensoren"><legend>Sensoren für Automationen</legend>
        <p class="hinweis">Der Planer stellt diese Werte als Sensoren in Home Assistant bereit, zum Beispiel für eine Heizungs- oder Weckautomation. Der Name bestimmt die Entitäts-ID.</p>
        ${(d.sensoren || []).length ? `<ul class="regel-liste">${d.sensoren.map((x) => { const ent = Object.keys(st).find((k) => k.startsWith("sensor.") && st[k].attributes?.friendly_name === x.name); return `<li>
          <span class="regel-text"><b>${esc(x.name)}</b><span class="hinweis">${esc(SENSOR_ARTEN[x.art] || x.art)} · ${esc((personen.find(([id]) => id === x.person) || [, "Gemeinsam"])[1])}${ent ? ` · ${esc(ent)} = ${esc(st[ent].state)}` : " · erscheint nach dem Speichern"}</span></span>
          <button type="button" class="knopf klein gefahr" data-sensor-weg="${esc(x.id)}">Löschen</button></li>`; }).join("")}</ul>` : ""}
        <details class="regel-neu"><summary class="knopf">Sensor hinzufügen</summary><div class="regel-form">
          <div class="feld"><label for="s-art">Was soll der Sensor zeigen?</label><select id="s-art">${Object.entries(SENSOR_ARTEN).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
          <div class="feld"><label for="s-wer">Für</label><select id="s-wer">${personen.map(([id, n]) => `<option value="${esc(id)}" ${id === d.ich ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
          <div class="feld"><label for="s-name">Name</label><input id="s-name" placeholder="z. B. Corin Schicht heute"></div>
          <button type="button" class="knopf primaer" id="s-speichern">Sensor speichern</button>
          <p class="fehler" id="s-fehler" role="alert"></p>
        </div></details>
      </fieldset>
      <fieldset id="regeln"><legend>Automatische Aufgaben</legend>
        <p class="hinweis">Wechselt ein Gerät oder Schalter in einen bestimmten Zustand, legt der Planer eine Aufgabe für heute an. Solange sie offen ist, kommt keine zweite dazu.</p>
        ${regeln.length ? `<ul class="regel-liste">${regeln.map((x) => `<li data-regel="${esc(x.id)}">
          <span class="regel-text"><b>${esc(x.titel)}</b><span class="hinweis">Wenn ${esc(name(x.entitaet))} → ${esc(zText(x.zu))}${x.erledigen_bei ? ` · erledigt bei ${esc(zText(x.erledigen_bei))}` : ""} · ${esc((personen.find(([id]) => id === x.person) || [, "Gemeinsam"])[1])}</span></span>
          <label class="schalter" title="Regel an/aus"><input type="checkbox" data-regel-an="${esc(x.id)}" ${x.aktiv !== false ? "checked" : ""} aria-label="Regel ${esc(x.titel)} aktiv"></label>
          <button type="button" class="knopf klein gefahr" data-regel-weg="${esc(x.id)}">Löschen</button></li>`).join("")}</ul>` : ""}
        <details class="regel-neu"><summary class="knopf">Regel hinzufügen</summary><div class="regel-form">
          <div class="feld"><label for="r-ent">Gerät oder Schalter</label><input id="r-ent" list="r-ent-liste" placeholder="z. B. Schalter Waschmaschine" autocomplete="off">
            <datalist id="r-ent-liste">${Object.keys(st).filter((k) => /^(switch|binary_sensor|input_boolean|sensor|light|cover|lock|button|input_button|person|device_tracker|media_player|climate|fan|vacuum)\./.test(k)).sort().map((k) => `<option value="${esc(k)}">${esc(name(k))}</option>`).join("")}</datalist></div>
          <div class="reihe"><div class="feld"><label for="r-zu">Wenn Zustand wird</label><input id="r-zu" list="r-zust" placeholder="on"></div>
            <div class="feld"><label for="r-weg">Erledigen bei (optional)</label><input id="r-weg" list="r-zust" placeholder="off"></div></div>
          <datalist id="r-zust"><option value="on">An</option><option value="off">Aus</option><option value="open">Offen</option><option value="closed">Zu</option><option value="home">Zuhause</option><option value="not_home">Abwesend</option></datalist>
          <p class="hinweis" id="r-jetzt"></p>
          <div class="feld"><label for="r-titel">Aufgabe</label><input id="r-titel" placeholder="z. B. Wäsche aufhängen"></div>
          <div class="reihe"><div class="feld"><label for="r-wer">Für</label><select id="r-wer">${personen.map(([id, n]) => `<option value="${esc(id)}" ${id === d.ich ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
            <div class="feld"><label for="r-ber">Bereich (optional)</label><input id="r-ber" placeholder="haushalt"></div></div>
          <button type="button" class="knopf primaer" id="r-speichern">Regel speichern</button>
          <p class="fehler" id="r-fehler" role="alert"></p>
        </div></details>
      </fieldset>`;
  }
  _regelnBinden(dlg) {
    const d = this._daten, st = this._hass?.states || {};
    const $ = (id) => dlg.querySelector(`#${id}`);
    const speichern = async (regeln, text) => {
      await this._ws({ type: "planer/allgemein", werte: { regeln } });
      d.regeln = regeln;
      this._sagen(text);
      const offen = $("regeln")?.querySelector("details")?.open;
      this._einstellungen();
      if (offen) this.shadowRoot.getElementById("einst").querySelector("#regeln details")?.setAttribute("open", "");
    };
    const sSpeichern = async (sensoren, text) => {
      await this._ws({ type: "planer/allgemein", werte: { sensoren } });
      d.sensoren = sensoren;
      this._sagen(text);
      this._einstellungen();
      setTimeout(() => { if (this.shadowRoot.getElementById("einst").open) this._einstellungen(); }, 1500); // Entitäts-ID nachladen
    };
    const sNameVorschlag = () => {
      const n = $("s-name"); if (!n || n.dataset.eigen) return;
      const wer = $("s-wer").selectedOptions[0]?.textContent.split(" ")[0] || "";
      n.value = `${wer} ${SENSOR_ARTEN[$("s-art").value]}`.trim();
    };
    $("s-art")?.addEventListener("change", sNameVorschlag);
    $("s-wer")?.addEventListener("change", sNameVorschlag);
    $("s-name")?.addEventListener("input", (e) => { e.target.dataset.eigen = "1"; });
    sNameVorschlag();
    $("s-speichern")?.addEventListener("click", async () => {
      const name = $("s-name").value.trim();
      if (!name) { $("s-fehler").textContent = "Bitte einen Namen eingeben."; return; }
      await sSpeichern([...(d.sensoren || []), { name, art: $("s-art").value, person: $("s-wer").value }], `Sensor „${name}“ angelegt`);
    });
    dlg.querySelectorAll("[data-sensor-weg]").forEach((b) => b.addEventListener("click", () => sSpeichern((d.sensoren || []).filter((x) => x.id !== b.dataset.sensorWeg), "Sensor gelöscht")));
    $("wetter-wahl")?.addEventListener("change", async (e) => {
      await this._ws({ type: "planer/allgemein", werte: { wetter: e.target.value || null } });
      d.wetter = e.target.value === "-" ? "-" : e.target.value || null;
      this._wetterAbo = null; this._wetter = null; this._wetterStart();
      this._sagen("Wetter gespeichert");
    });
    $("r-ent")?.addEventListener("input", (e) => {
      const s0 = st[e.target.value];
      $("r-jetzt").textContent = s0 ? `Gerade: ${s0.state}` : "";
    });
    $("r-speichern")?.addEventListener("click", async () => {
      const ent = $("r-ent").value.trim(), zu = $("r-zu").value.trim(), titel = $("r-titel").value.trim();
      if (!st[ent]) { $("r-fehler").textContent = "Dieses Gerät gibt es in Home Assistant nicht."; return; }
      if (!zu || !titel) { $("r-fehler").textContent = "Bitte Zustand und Aufgabe ausfüllen."; return; }
      const neu = { entitaet: ent, zu, erledigen_bei: $("r-weg").value.trim(), titel, person: $("r-wer").value, bereich: $("r-ber").value.trim().replace(/^#/, ""), aktiv: true };
      await speichern([...(d.regeln || []), neu], `Regel „${titel}“ gespeichert`);
    });
    dlg.querySelectorAll("[data-regel-weg]").forEach((b) => b.addEventListener("click", () => speichern((d.regeln || []).filter((x) => x.id !== b.dataset.regelWeg), "Regel gelöscht")));
    dlg.querySelectorAll("[data-regel-an]").forEach((c) => c.addEventListener("change", () => speichern((d.regeln || []).map((x) => (x.id === c.dataset.regelAn ? { ...x, aktiv: c.checked } : x)), c.checked ? "Regel an" : "Regel aus")));
  }

  _wetterHtml(tag) {
    const w = (this._wetter || {})[tag];
    if (!w) return "";
    const S = { "clear-night": "🌙", cloudy: "☁️", exceptional: "⚠️", fog: "🌫️", hail: "🌨️", lightning: "🌩️", "lightning-rainy": "⛈️", partlycloudy: "⛅", pouring: "🌧️", rainy: "🌦️", snowy: "❄️", "snowy-rainy": "🌨️", sunny: "☀️", windy: "💨", "windy-variant": "💨" };
    const T = { "clear-night": "klar", cloudy: "bewölkt", fog: "Nebel", hail: "Hagel", lightning: "Gewitter", "lightning-rainy": "Gewitter mit Regen", partlycloudy: "teils bewölkt", pouring: "starker Regen", rainy: "Regen", snowy: "Schnee", "snowy-rainy": "Schneeregen", sunny: "sonnig", windy: "windig", "windy-variant": "windig" };
    const r = (x) => (x == null ? "" : `${Math.round(x)}°`);
    return `<span class="wetter" title="${esc(T[w.z] || w.z || "")}"><span aria-hidden="true">${S[w.z] || "🌡️"}</span><b>${r(w.hoch)}</b>${w.tief != null ? `<small>${r(w.tief)}</small>` : ""}<span class="sr">${esc(`${T[w.z] || ""}, bis ${r(w.hoch)}${w.tief != null ? `, nachts ${r(w.tief)}` : ""}`)}</span></span>`;
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

  _gruppe(titel, liste, leer = "", art = "", zusatz = "") {
    const id = `g-${titel.replace(/\W+/g, "-").toLowerCase()}`;
    const knopf = "";
    return `<section class="gruppe ${art === "rot" ? "ueberfaellig" : ""}" aria-labelledby="${id}">
      <div class="gkopf"><h2 id="${id}">${esc(titel)} ${titel === "Top 3" ? "" : `<span class="zahl">${liste.length || ""}</span>`}${zusatz ? ` <span class="chip">${esc(zusatz)}</span>` : ""}</h2>${knopf}</div>
      ${liste.length ? `<ul class="liste">${liste.map((a) => this._zeile(a)).join("")}</ul>` : leer ? `<p class="leer">${esc(leer)}</p>` : ""}
    </section>`;
  }

  _zeile(a, wiederErledigt = false) {
    const fertig = a.status === "erledigt" || wiederErledigt;
    const meta = [];
    const ueberf = !fertig && this._ansicht === "heute" && a.datum && a.datum < this._tag;
    if (ueberf) {
      const n = Math.round((ausIso(this._tag) - ausIso(a.datum)) / 864e5);
      meta.push(`<span class="chip rot">${n <= 1 ? "seit gestern" : `seit ${n} Tagen`}</span>`);
    } else if (a.datum && this._ansicht !== "heute") meta.push(`<span class="chip ${a.datum < this._tag ? "warn" : ""}">${esc(datumText(a.datum))}</span>`);
    if (wiederErledigt) meta.push(`<span class="chip mint">nächstes Mal ${esc(datumText(a.datum))}</span>`);
    if (a.uhrzeit) meta.push(`<span class="chip zeit">${esc(a.uhrzeit)}${this._narrow ? "" : " Uhr"}</span>`);
    const farbe = bereichFarbe(a.bereich, this._daten.farben);
    // Kompakt: nur Datum/Uhrzeit und Bereich; alles Weitere im Detail beim Antippen
    if (a.bereich) meta.push(`<span class="chip" style="--b:${farbe}"><span class="punkt" aria-hidden="true"></span> ${esc(a.bereich)}</span>`);
    const morgen = fertig || this._narrow ? "" : `<button type="button" class="knopf klein" data-aktion="morgen" data-id="${a.id}" data-fokus="m-${a.id}" aria-label="${esc(a.titel)} auf morgen verschieben">Morgen</button>`;
    const mehr = `<button type="button" class="mehr-knopf" data-zmenue="${a.id}" data-fokus="zm-${a.id}" aria-haspopup="menu" aria-expanded="false" aria-label="Aktionen für ${esc(a.titel)}" title="Aktionen (Rechtsklick, lange drücken)">${ICON.mehr}</button>`;
    const wer = this._werZeigen(a.person);
    return `<li class="aufgabe ${ueberf ? "ueberf" : ""} ${a.top && !fertig ? "top" : ""} ${fertig ? "erledigt" : ""} ${a.bereich ? "farbig" : ""}" data-id="${a.id}" ${a.bereich ? `style="--b:${farbe}"` : ""}>
      <div class="wisch rechts" aria-hidden="true">${ICON.haken}Erledigt</div><div class="wisch links" aria-hidden="true">Verschieben${ICON.pfeil}</div>
      <div class="zeile">
        <button type="button" class="haken" role="checkbox" aria-checked="${fertig}" data-aktion="haken" data-id="${a.id}" data-fokus="h-${a.id}" aria-label="${esc(a.titel)} erledigt">${fertig ? HAKEN : ""}</button>
        ${a.top && !fertig ? `<span class="rang" aria-label="Top ${a.top}">${a.top}</span>` : ""}
        <button type="button" class="inhalt" data-aktion="oeffnen" data-id="${a.id}" data-fokus="o-${a.id}">
          <span class="titel">${esc(a.titel)}<span class="sr">${wer ? `, für ${esc(this._name(a.person))}` : ""}, bearbeiten</span></span>
          ${meta.length ? `<span class="meta">${meta.join("")}</span>` : ""}
        </button>
        ${wer ? this._avatar(a.person, "zeile-av") : ""}
        <div class="aktionen">${morgen}${mehr}</div>
      </div>
    </li>`;
  }

  _vorschau() {
    const root = this.shadowRoot;
    const s = root.getElementById("schnell");
    const v = root.getElementById("vorschau");
    if (!s || !v) return;
    if (!s.value.trim() || this._ansicht === "einkauf" || this._ansicht === "notizen") { v.innerHTML = ""; return; }
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
    this._app.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      this._filter = b.dataset.filter;
      try { localStorage.setItem("planer.filter", this._filter); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    this._app.querySelectorAll("[data-aktion]").forEach((b) => b.addEventListener("click", () => this._aktion(b.dataset.aktion, b.dataset.id)));
    this._app.querySelectorAll("li.aufgabe").forEach((li) => this._wischen(li));
    this._menueBinden();
    this._notizListeBinden(this._app);
    this._notizFilterBinden();
    this._einkaufBinden(root);
    this._app.querySelectorAll("[data-kal-ansicht]").forEach((b) => b.addEventListener("click", () => {
      this._kalAnsicht = b.dataset.kalAnsicht;
      try { localStorage.setItem("planer.kalansicht", this._kalAnsicht); } catch (e) { /* egal */ }
      this._zeichnen();
    }));
    this._schichtBinden();
    this._app.querySelectorAll("[data-monat]").forEach((b) => b.addEventListener("click", () => {
      const n = +b.dataset.monat;
      const jetzt = new Date();
      const e = this._mStart || new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
      this._mStart = n === 0 ? new Date(jetzt.getFullYear(), jetzt.getMonth(), 1) : new Date(e.getFullYear(), e.getMonth() + n, 1);
      this._mRichtung = n === 0 ? (e > this._mStart ? -1 : e < this._mStart ? 1 : 0) : n;
      this._zeichnen();
      this._mRichtung = 0;
      this._sagen(`${MONATE[this._mStart.getMonth()]} ${this._mStart.getFullYear()}`);
    }));
    this._app.querySelectorAll("[data-mtag]").forEach((b) => b.addEventListener("click", () => this._tagZeigen(b.dataset.mtag)));
    this._app.querySelectorAll("[data-tagauf]").forEach((b) => {
      b.addEventListener("click", () => this._tagZeigen(b.dataset.tagauf));
      b.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this._tagZeigen(b.dataset.tagauf); } });
    });
    this._app.querySelectorAll("[data-wleer]").forEach((el) => el.addEventListener("click", (ev) => { if (el._lang) { el._lang = false; return; } if (ev.target === el) this._tagZeigen(el.dataset.wleer); }));
    this._kalPassen();
    this._wRichtung = 0;
    this._app.querySelectorAll("[data-woche]").forEach((b) => b.addEventListener("click", () => {
      const n = +b.dataset.woche;
      this._wocheBlaettern(n);
    }));
    this._app.querySelectorAll("[data-wsprung]").forEach((b) => b.addEventListener("click", () => {
      const ziel = b.dataset.wsprung, alt = iso(this._w3Start || ausIso(heute()));
      this._w3Start = ziel === heute() ? null : ausIso(ziel);
      this._wRichtung = ziel > alt ? 1 : ziel < alt ? -1 : 0;
      this._zeichnen();
    }));
    // 3-Tage-Woche: lange auf eine freie Stelle drücken legt dort einen Eintrag an (volle halbe Stunde, 1 Std.)
    const wc3 = this._app.querySelector("#wcal.drei");
    if (wc3) wc3.querySelectorAll(".wspalte").forEach((sp) => {
      let t = null, y0 = 0, x0b = 0;
      const ab = () => { clearTimeout(t); t = null; };
      sp.addEventListener("touchstart", (e) => {
        if (e.target !== sp && !e.target.classList.contains("wband")) return;
        const r = sp.getBoundingClientRect();
        y0 = e.touches[0].clientY; x0b = e.touches[0].clientX;
        const y = y0 - r.top;
        t = setTimeout(() => {
          t = null; sp._lang = true; setTimeout(() => { sp._lang = false; }, 800);
          const hpx = parseFloat(getComputedStyle(wc3).getPropertyValue("--hpx")) || 44;
          const m = Math.round((+wc3.dataset.von * 60 + (y / hpx) * 60) / 30) * 30;
          const s0 = Math.min(Math.max(0, m), 23 * 60);
          navigator.vibrate?.(10);
          this._schnellEintrag(sp.dataset.tag, hhmm(s0), hhmm(Math.min(s0 + 60, 23 * 60 + 59)), () => {});
        }, 500);
      }, { passive: true });
      sp.addEventListener("touchmove", (e) => { if (t && Math.hypot(e.touches[0].clientX - x0b, e.touches[0].clientY - y0) > 10) ab(); }, { passive: true });
      sp.addEventListener("touchend", ab, { passive: true });
      sp.addEventListener("touchcancel", ab, { passive: true });
    });
    // Handy: in der Woche nach links/rechts wischen blättert um 3 Tage
    const wc = this._app.querySelector("#wcal");
    if (wc && this._narrow) {
      let x0 = null, y0 = 0;
      wc.addEventListener("touchstart", (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
      wc.addEventListener("touchend", (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) this._wocheBlaettern(dx < 0 ? 1 : -1, true);
      }, { passive: true });
    }
    // Ziehen auf einen Tag (Maus/Trackpad); am Handy und mit Tastatur über „Öffnen“ und Datum
    this._app.querySelectorAll("[data-ziehen]").forEach((el) => el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", el.dataset.ziehen);
      e.dataTransfer.effectAllowed = "move";
    }));
    this._app.querySelectorAll(".wtag,.wspalte,.wkg").forEach((tag) => {
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
    if (this._ansicht === "notizen") {
      const titel = s.value.trim();
      if (!titel) { this._sagen("Bitte einen Titel eingeben."); return; }
      const person = this._filter !== "ich" && this._filter !== "alle" ? this._filter : this._daten.ich;
      let neu;
      try { neu = await this._ws({ type: "planer/notiz_speichern", notiz: { titel, text: "", person, angeheftet: false } }); } catch (err) { return; }
      s.value = "";
      await this._lesen();
      this._notizOeffnen(neu, true);
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
    if (art === "schicht-arten") return this._schichtArten();
    if (art === "schicht-rhythmus") return this._schichtRhythmus();
    if (art === "schicht-einst") return this._schichtEinstellung();
    if (art === "schicht-neu") return this._schichtForm(null);
    if (art === "erweitert") return this._erweitert();
    if (art === "neu" && this._ansicht === "notizen") {
      const person = this._filter !== "ich" && this._filter !== "alle" ? this._filter : this._daten.ich;
      return this._notizOeffnen({ titel: "", text: "", person, angeheftet: false }, true);
    }
    if (art === "neu" || art === "eingabe-zu") {
      this._eingabeOffen = art === "neu";
      if (!this._eingabeOffen) { const s = this.shadowRoot.getElementById("schnell"); if (s) s.value = ""; }
      this._zeichnen();
      if (this._eingabeOffen) { this.shadowRoot.getElementById("schnell")?.focus(); this.scrollIntoView?.({ block: "start" }); }
      else this.shadowRoot.querySelector(".fab")?.focus();
      return;
    }
    if (art === "suche") return this._suche();
    if (art === "tags-einblenden") return this._ansichtSpeichern({ ausgeblendete_tags: [] });
    if (!a) return;
    if (art === "oeffnen") return this._oeffnen(a);
    if (art === "haken") {
      const jetztErledigt = !(a.status === "erledigt" || (a.wiederholung && (a.verlauf || []).includes(this._tag) && a.datum > this._tag));
      if (!jetztErledigt && a.wiederholung) { this._sagen("Wiederkehrende Aufgabe ist schon auf den nächsten Termin gesetzt."); return; }
      const vorher = { datum: a.datum || null, top: a.top || null };
      const li = this._abhakAnimation(a.id);
      const [neu] = await Promise.all([
        this._ws({ type: "planer/erledigen", aufgabe_id: a.id, erledigt: jetztErledigt }),
        jetztErledigt ? new Promise((ok) => setTimeout(ok, 380)).then(() => this._zuklappen(li)) : null,
      ]);
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
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}<button type="submit" class="knopf text l">Abbrechen</button><h2 id="wahl-titel">Verschieben</h2><span class="r"></span></div>
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
    if (!this._narrow) dlg.querySelector("[data-auf]").focus();
  }

  // Suche über Aufgaben, Termine (60 Tage zurück, 180 voraus) und die Einkaufsliste
  async _suche() {
    const dlg = this.shadowRoot.getElementById("suchdlg");
    dlg.innerHTML = `<form method="dialog" class="such-blatt" autocomplete="off">
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}<span class="l"></span><h2 id="such-titel">Suchen</h2><button type="submit" class="knopf text fett r">Fertig</button></div>
      <div class="suchfeld">${ICON.suche}<label class="sr" for="such-q">Suchbegriff</label><input id="such-q" type="search" placeholder="Aufgaben, Notizen, Termine, Einkauf" enterkeyhint="search"></div>
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
      const notizenTreffer = this._notizenSichtbar().filter((n) => passt(n.titel, n.text, n.ordner, ...this._notizTagsVon(n).map((t) => `#${t}`))).sort((a, b) => (b.geaendert || "").localeCompare(a.geaendert || "")).slice(0, 20);
      const teil = (titel, inhalt) => inhalt ? `<section class="gruppe"><h3>${titel}</h3><ul class="liste gruppiert">${inhalt}</ul></section>` : "";
      const html = teil("Aufgaben", aufg.map((a) => `<li><button type="button" class="treffer" data-sa="${a.id}"><span class="titel">${esc(a.titel)}</span><span class="unter">${a.status === "erledigt" ? "Erledigt" : a.datum ? esc(datumText(a.datum)) : "Ohne Datum"}${a.uhrzeit ? `, ${a.uhrzeit} Uhr` : ""}${a.bereich ? ` · ${esc(a.bereich)}` : ""}</span></button></li>`).join(""))
        + teil("Notizen", notizenTreffer.map((n) => `<li><button type="button" class="treffer" data-sn="${esc(n.id)}"><span class="titel">${esc(this._notizTitel(n))}</span><span class="unter">${esc(this._notizZeit(n.geaendert))}${n.ordner ? ` · ${esc(n.ordner)}` : ""}${n.text && n.titel ? ` · ${esc(n.text.split("\n").map(notizKlartext).filter(Boolean).join(" ").slice(0, 60))}` : ""}</span></button></li>`).join(""))
        + teil("Termine", termine.map((t) => `<li><button type="button" class="treffer" data-st="${esc(`${t.kalender}|${t.uid}|${t.start}`)}"><span class="titel">${esc(t.titel)}</span><span class="unter">${esc(datumText(t.start.slice(0, 10)))}${t.ganztag ? "" : `, ${uhr(t.start)} Uhr`} · ${esc(this._kal(t.kalender).name)}</span></button></li>`).join(""))
        + teil("Einkauf", einkauf.map((x) => `<li><button type="button" class="treffer" data-se="1"><span class="titel">${esc(x.text)}</span><span class="unter">${x.erledigt ? "Gekauft" : "Auf der Liste"}${x.beschreibung ? ` · ${esc(x.beschreibung)}` : ""}</span></button></li>`).join(""));
      erg.innerHTML = html || `<p class="leer">Nichts gefunden für „${esc(q.value.trim())}“.</p>`;
      erg.querySelectorAll("[data-sa]").forEach((b) => b.addEventListener("click", () => { const a = this._finde(b.dataset.sa); if (a) this._oeffnen(a); }));
      erg.querySelectorAll("[data-sn]").forEach((b) => b.addEventListener("click", () => { const n = this._notiz(b.dataset.sn); if (n) this._notizOeffnen(n); }));
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
    return li;
  }
  // Zeile weich zuklappen (Höhe → 0), die anderen rücken nach; danach neu zeichnen
  _zuklappen(li) {
    if (!li || !li.isConnected || matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
    return new Promise((fertig) => {
      li.style.height = `${li.offsetHeight}px`;
      li.style.overflow = "hidden";
      li.getBoundingClientRect();
      li.classList.add("klappt");
      li.style.height = "0px";
      setTimeout(fertig, 300);
    });
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
      if (li._lang) { x0 = null; return; }
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
        ${a.id ? '<button type="submit" class="knopf text l">Schließen</button>' : '<button type="button" class="knopf text l" id="b-abbrechen">Abbrechen</button>'}
        <h2 id="blatt-titel">${a.id ? `Aufgabe<span class="stand" id="b-stand" aria-live="polite"></span>` : "Neue Aufgabe"}</h2>
        ${a.id ? `<button type="button" class="knopf text fett r" id="b-erledigt">${a.status === "erledigt" ? "Wieder offen" : "Erledigt"}</button>` : '<button type="submit" class="knopf text fett r">Hinzufügen</button>'}
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
          <option value="">Keine</option>${[1, 2, 3].map((i) => `<option value="${i}" ${a.top === i ? "selected" : ""}>Rang ${i}</option>`).join("")}</select></div>
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
    $("b-erledigt")?.addEventListener("click", async () => {
      try { await dlg._vorZu?.(); } catch (e) { /* Speichern meldet selbst */ }
      this._zu(dlg);
      await this._aktion("haken", a.id);
      if (this._tagOffen) this._tagZeigen(this._tagOffen);
    });
    $("b-loeschen")?.addEventListener("click", async () => {
      if (!sicher) { sicher = true; $("b-loeschen").textContent = "Wirklich löschen?"; $("b-loeschen").focus(); return; }
      weg = true; clearTimeout(uhr);
      await laeuft;
      await this._ws({ type: "planer/loeschen", aufgabe_id: a.id });
      this._zu(dlg);
      this._sagen(`Gelöscht: ${a.titel}`);
      const kopie = this._aufgabeKopie(a);
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
    else if (!$("b-titel").value.trim()) $("b-titel").focus();
  }

  // ---------- Kontextmenü (iOS-Stil) ----------
  // Kleines Menü an einem Knopf. eintraege: { text, icon?, aktion(info), gefahr?, aktiv?, radio?, untermenue?, aus? },
  // { eingabe: true, text, knopf, max, wert?, aktion(wert) } für ein Textfeld, "-" als Trenner.
  // Schließt bei Tipp daneben, Escape oder Auswahl. Pfeiltasten, Pos1/Ende und Tab funktionieren.
  // punkt {x, y}: an dieser Stelle öffnen (Rechtsklick) statt unter dem Knopf.
  _menue(anker, eintraege, { titel = "", tastatur = false, punkt = null } = {}) {
    const st = this._menueStatus;
    // Tipp auf denselben Knopf bei offenem Menü schließt nur (nicht gleich wieder öffnen)
    if (st && st.anker === anker && Date.now() - st.zeit < 400) { this._menueStatus = null; return; }
    this._menueZu?.(false);
    const root = this.shadowRoot;
    const wirt = anker.closest("dialog") || root.getElementById("rahmen");
    const m = document.createElement("div");
    m.className = "menue";
    m.setAttribute("role", "menu");
    m.tabIndex = -1;
    if (titel) m.setAttribute("aria-label", titel);
    const punkte = [];
    const zu = (fokusZurueck) => {
      if (!m.isConnected) return;
      const drin = m.contains(root.activeElement);
      m.remove();
      document.removeEventListener("pointerdown", aussen, true);
      document.removeEventListener("keydown", taste, true);
      window.removeEventListener("resize", groesse);
      window.visualViewport?.removeEventListener("resize", platz);
      wirt.removeEventListener("scroll", rollen, true);
      wirt.removeEventListener("cancel", abbruch);
      if (anker.hasAttribute("aria-haspopup")) anker.setAttribute("aria-expanded", "false");
      if (this._menueZu === zu) this._menueZu = null;
      if (this._angehoben) { this._angehoben.classList.remove("angehoben"); this._angehoben = null; root.getElementById("rahmen")?.classList.remove("kontext-an"); }
      if (fokusZurueck !== false && drin) anker.focus({ preventScroll: true });
    };
    const waehlen = (e, ev) => {
      const info = { tastatur: ev?.detail === 0 };
      zu(!e.untermenue && info.tastatur);
      try { e.aktion?.(info); } catch (err) { console.error(err); }
    };
    for (const e of eintraege) {
      if (!e) continue;
      if (e === "-") {
        if (m.lastElementChild && !m.lastElementChild.classList.contains("menue-trenner")) {
          const t = document.createElement("div"); t.className = "menue-trenner"; t.setAttribute("role", "separator"); m.append(t);
        }
        continue;
      }
      if (e.kopf) {
        const k = document.createElement("div"); k.className = "menue-kopf"; k.setAttribute("role", "presentation"); k.textContent = e.kopf; m.append(k);
        continue;
      }
      if (e.eingabe) {
        const f = document.createElement("div");
        f.className = "menue-eingabe";
        f.innerHTML = `<input type="text" maxlength="${e.max || 40}" placeholder="${esc(e.text)}" aria-label="${esc(e.text)}" enterkeyhint="done" autocomplete="off" value="${esc(e.wert || "")}"><button type="button" class="knopf text fett">${esc(e.knopf || "OK")}</button>`;
        const inp = f.querySelector("input"), b = f.querySelector("button");
        const los = () => { const w = inp.value.trim(); if (!w) { inp.focus(); return; } zu(false); e.aktion(w); };
        inp.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); los(); } });
        b.addEventListener("click", los);
        m.append(f);
        punkte.push(inp, b);
        continue;
      }
      const b = document.createElement("button");
      b.type = "button";
      b.className = `menue-punkt${e.gefahr ? " gefahr" : ""}`;
      b.tabIndex = -1;
      b.setAttribute("role", e.aktiv === undefined ? "menuitem" : e.radio ? "menuitemradio" : "menuitemcheckbox");
      if (e.aktiv !== undefined) b.setAttribute("aria-checked", String(!!e.aktiv));
      if (e.untermenue) b.setAttribute("aria-haspopup", "menu");
      if (e.aus) b.disabled = true;
      b.innerHTML = `<span class="menue-haken" aria-hidden="true">${e.aktiv ? ICON.haken : ""}</span><span class="menue-text">${esc(e.text)}</span>${e.untermenue ? '<span class="menue-pfeil" aria-hidden="true">›</span>' : ""}${e.icon ? `<span class="menue-icon" aria-hidden="true">${e.icon}</span>` : ""}`;
      // Fokus (und damit die Bildschirmtastatur) bleibt im Textfeld
      b.addEventListener("pointerdown", (ev) => ev.preventDefault());
      b.addEventListener("click", (ev) => waehlen(e, ev));
      m.append(b);
      punkte.push(b);
    }
    if (m.lastElementChild?.classList.contains("menue-trenner")) m.lastElementChild.remove();
    const aktive = () => punkte.filter((x) => !x.disabled);
    const aussen = (ev) => {
      const ziel = ev.composedPath()[0];
      if (m.contains(ziel)) return;
      if (anker.contains(ziel)) this._menueStatus = { anker, zeit: Date.now() };
      zu(false);
    };
    const taste = (ev) => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); zu(true); return; }
      if (!m.contains(root.activeElement)) {
        // Fokus noch im Textfeld: Pfeil nach unten holt das Menü in den Fokus
        if (ev.key === "ArrowDown" && root.activeElement === anker) { ev.preventDefault(); aktive()[0]?.focus(); }
        return;
      }
      const liste = aktive(), i = liste.indexOf(root.activeElement);
      const imFeld = root.activeElement?.tagName === "INPUT";
      let ziel = null;
      if (ev.key === "ArrowDown") ziel = liste[(i + 1) % liste.length];
      else if (ev.key === "ArrowUp") ziel = liste[(i - 1 + liste.length) % liste.length];
      else if (ev.key === "Home" && !imFeld) ziel = liste[0];
      else if (ev.key === "End" && !imFeld) ziel = liste[liste.length - 1];
      else if (ev.key === "Tab") { ev.preventDefault(); zu(true); return; }
      if (ziel) { ev.preventDefault(); ziel.focus(); }
    };
    const platz = () => {
      if (!m.isConnected) return;
      const r = punkt ? { left: punkt.x, right: punkt.x, top: punkt.y, bottom: punkt.y } : anker.getBoundingClientRect();
      const vv = window.visualViewport;
      const oben0 = vv ? vv.offsetTop : 0, hoehe = vv ? vv.height : innerHeight, breite = vv ? vv.width : innerWidth;
      m.style.maxHeight = "";
      const w = Math.min(m.offsetWidth, breite - 16);
      let x = r.left;
      if (x + w > breite - 8) x = r.right - w;
      x = Math.max(8, Math.min(x, breite - w - 8));
      const unten = oben0 + hoehe - r.bottom - 12, darueber = r.top - oben0 - 12;
      const h = m.offsetHeight;
      let y;
      if (h <= unten || unten >= darueber) { y = r.bottom + 6; m.style.maxHeight = `${Math.max(120, unten)}px`; m.dataset.seite = "unten"; }
      else { y = Math.max(oben0 + 8, r.top - 6 - Math.min(h, darueber)); m.style.maxHeight = `${Math.max(120, darueber)}px`; m.dataset.seite = "oben"; }
      m.style.left = `${Math.round(x)}px`;
      m.style.top = `${Math.round(y)}px`;
    };
    // Bildschirmtastatur, Drehen oder Scrollen: Menü bleibt am Knopf
    const groesse = () => platz();
    const rollen = (ev) => { if (m.contains(ev.target)) return; if (punkt) zu(false); else platz(); };
    const abbruch = (ev) => { ev.preventDefault(); zu(true); };
    m.addEventListener("keydown", (ev) => { if (ev.key === " " && ev.target.tagName === "INPUT") ev.stopPropagation(); });
    wirt.append(m);
    platz();
    if (anker.hasAttribute("aria-haspopup")) anker.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", aussen, true);
    document.addEventListener("keydown", taste, true);
    window.addEventListener("resize", groesse);
    window.visualViewport?.addEventListener("resize", platz);
    wirt.addEventListener("scroll", rollen, true);
    wirt.addEventListener("cancel", abbruch);
    this._menueZu = zu;
    this._menueStatus = null;
    if (tastatur) (aktive().find((x) => x.getAttribute("aria-checked") === "true") || aktive()[0])?.focus();
    return zu;
  }

  // ---------- Notizen ----------
  _notiz(id) { return (this._daten?.notizen || []).find((n) => n.id === id); }
  _notizenSichtbar() {
    const d = this._daten;
    if (!d) return [];
    const f = this._filter;
    return (d.notizen || []).filter((n) => f === "alle" || (f === "ich" ? n.person === d.ich || n.person === GEMEINSAM : n.person === f));
  }
  _notizTitel(n) {
    return notizOhneFett((n.titel || "").trim()) || notizKlartext((n.text || "").trim().split("\n")[0]).slice(0, 80) || "Ohne Titel";
  }
  // „Heute 14:05“, „Gestern 09:30“, „12. Nov“ (mit Jahr, wenn nicht aktuell)
  _notizZeit(s) {
    if (!s) return "";
    const t = new Date(s);
    if (isNaN(t)) return "";
    const tag = iso(t);
    const hm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    if (tag === heute()) return `Heute ${hm}`;
    if (tag === iso(plusTage(new Date(), -1))) return `Gestern ${hm}`;
    const kurz = `${t.getDate()}. ${MONATE[t.getMonth()].slice(0, 3)}`;
    return t.getFullYear() === new Date().getFullYear() ? kurz : `${kurz} ${t.getFullYear()}`;
  }
  // Kurzform wie in Apple Notizen: Uhrzeit heute, „Gestern“, Wochentag, sonst Datum
  _notizKurz(s) {
    const t = new Date(s);
    if (!s || isNaN(t)) return "";
    const tag = this._notizTage(s);
    if (tag <= 0) return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
    if (tag === 1) return "Gestern";
    if (tag < 7) return WOCHENTAGE[(t.getDay() + 6) % 7];
    return `${String(t.getDate()).padStart(2, "0")}.${String(t.getMonth() + 1).padStart(2, "0")}.${t.getFullYear()}`;
  }
  // Kalendertage seit der Änderung (0 = heute); null ohne gültiges Datum
  _notizTage(s) {
    const t = new Date(s);
    if (!s || isNaN(t)) return null;
    const h = new Date(); h.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    return Math.round((h - t) / 864e5);
  }
  // Checklisten-Fortschritt: { n: Anzahl, ok: erledigt }
  _notizFortschritt(n) {
    let gesamt = 0, ok = 0;
    for (const z of (n.text || "").split("\n")) {
      if (z.startsWith("☐ ") || z === "☐") gesamt++;
      else if (z.startsWith("☑ ") || z === "☑") { gesamt++; ok++; }
    }
    return { n: gesamt, ok };
  }
  _notizTagsVon(n) { return notizTags(`${n.titel || ""}\n${n.text || ""}`); }
  // Notizen nach Ordner, #Tag und Suchwort
  _notizenGefiltert() {
    const w = (this._nSuche || "").trim().toLowerCase();
    return this._notizenSichtbar().filter((n) => {
      if (this._nOrdner && (n.ordner || "") !== this._nOrdner) return false;
      const tags = this._notizTagsVon(n);
      if (this._nTag && !tags.includes(this._nTag)) return false;
      if (!w) return true;
      return [n.titel, n.text, n.ordner, ...tags.map((t) => `#${t}`)].some((x) => String(x || "").toLowerCase().includes(w));
    });
  }
  _notizZeile(n) {
    const d = this._daten;
    const fort = this._notizFortschritt(n);
    const zeilen = (n.titel ? (n.text || "") : (n.text || "").split("\n").slice(1).join("\n")).split("\n").map((z) => z.trim()).filter(Boolean);
    const ersteRoh = zeilen.find((z) => notizZeileLesen(z).art !== "check");
    const erste = ersteRoh ? notizKlartext(ersteRoh) : "";
    const vor = [];
    if (fort.n) vor.push(`<span class="fort">${fort.ok}/${fort.n} erledigt</span>`);
    if (erste) vor.push(esc(erste));
    const wer = this._werZeigen(n.person);
    const tags = this._notizTagsVon(n);
    const id = esc(n.id);
    const farbe = /^#[0-9a-f]{6}$/i.test(n.farbe || "") ? n.farbe : "";
    const farbName = farbe ? (NOTIZ_FARBEN.find(([, f]) => f === farbe.toLowerCase())?.[0] || "Farbe") : "";
    return `<li class="nrow${farbe ? " nrow-farbe" : ""}" data-nid="${id}"${farbe ? ` style="--nf:${farbe}"` : ""}>
      <div class="nrow-aktionen" aria-hidden="true"><button type="button" class="nrow-an" data-nanheften="${id}" tabindex="-1">${n.angeheftet ? "Lösen" : "Anheften"}</button><button type="button" class="nrow-weg" data-nloeschen="${id}" tabindex="-1">Löschen</button></div>
      <button type="button" class="nrow-zeile" data-notiz="${id}" data-fokus="n-${id}">
        <span class="nrow-titel"><span>${esc(notizOhneFett(this._notizTitel(n)))}</span>${farbe ? `<span class="sr">, ${esc(farbName)}</span>` : ""}${n.angeheftet ? `<span class="notiz-pin" title="Angeheftet">${ICON.pin}<span class="sr">Angeheftet</span></span>` : ""}${wer ? `<span class="sr">, für ${esc(this._name(n.person))}</span>${this._avatar(n.person, "nrow-av")}` : ""}</span>
        <span class="nrow-unter"><span class="nrow-zeit">${esc(this._notizKurz(n.geaendert))}</span><span class="nrow-vor">${vor.join(" · ") || "Kein weiterer Text"}</span></span>
        ${n.ordner || tags.length ? `<span class="nrow-meta">${n.ordner ? `<span class="nrow-ordner">${ICON.ordner}<span class="sr">Ordner </span>${esc(n.ordner)}</span>` : ""}${tags.slice(0, 4).map((t) => `<span class="nrow-tag">#${esc(t)}</span>`).join("")}${tags.length > 4 ? `<span class="nrow-tag">+${tags.length - 4}</span>` : ""}</span>` : ""}
      </button>
      ${this._narrow ? "" : `<button type="button" class="mehr-knopf nrow-mehr" data-nmenue="${id}" data-fokus="nm-${id}" aria-haspopup="menu" aria-expanded="false" aria-label="Aktionen für ${esc(this._notizTitel(n))}" title="Aktionen (Rechtsklick)">${ICON.mehr}</button>`}
    </li>`;
  }
  _notizenHtml() {
    const sichtbar = this._notizenSichtbar();
    const hinweis = `<p class="hinweis notiz-hinweis">Ideen, Listen und Gedanken. Änderungen werden automatisch gespeichert.${this._narrow ? " Lange drücken für mehr." : " Rechtsklick für mehr."}</p>`;
    if (!sichtbar.length) return `${hinweis}<p class="leer">Noch keine Notizen. Schreib oben einen Titel oder tippe auf Plus.</p>`;
    this._notizFilterListen();
    const suche = `<div class="suchfeld nsuche">${ICON.suche}<label class="sr" for="n-suche">Notizen durchsuchen</label><input id="n-suche" type="search" data-fokus="n-suche" placeholder="Notizen durchsuchen" value="${esc(this._nSuche || "")}" enterkeyhint="search" autocomplete="off"></div>`;
    return `${suche}<div id="n-listen">${this._notizenListeHtml()}</div>`;
  }
  _notizenListeHtml() {
    const alle = [...this._notizenGefiltert()].sort((a, b) => (b.geaendert || "").localeCompare(a.geaendert || ""));
    if (!alle.length) return `<p class="leer">Keine passenden Notizen.</p>`;
    const jahr = new Date().getFullYear();
    const gruppen = new Map();
    const dazu = (name, n) => { if (!gruppen.has(name)) gruppen.set(name, []); gruppen.get(name).push(n); };
    for (const n of alle.filter((x) => x.angeheftet)) dazu("Angeheftet", n);
    for (const n of alle.filter((x) => !x.angeheftet)) {
      const t = this._notizTage(n.geaendert);
      if (t === null) dazu("Älter", n);
      else if (t <= 0) dazu("Heute", n);
      else if (t === 1) dazu("Gestern", n);
      else if (t <= 7) dazu("Vorherige 7 Tage", n);
      else if (t <= 30) dazu("Vorherige 30 Tage", n);
      else { const m = new Date(n.geaendert); dazu(m.getFullYear() === jahr ? MONATE[m.getMonth()] : `${MONATE[m.getMonth()]} ${m.getFullYear()}`, n); }
    }
    let i = 0;
    return [...gruppen].map(([name, liste]) => { const id = `n-g${i++}`; return `<section class="ngruppe" aria-labelledby="${id}">
      <h2 id="${id}">${esc(name)}</h2>
      <ul class="nliste">${liste.map((n) => this._notizZeile(n)).join("")}</ul>
    </section>`; }).join("");
  }
  _notizListeBinden(wurzel) {
    wurzel.querySelectorAll("[data-notiz]").forEach((b) => b.addEventListener("click", () => { const n = this._notiz(b.dataset.notiz); if (n) this._notizOeffnen(n); }));
    this._nOffen = null;
    wurzel.querySelectorAll("li.nrow").forEach((li) => this._notizWischen(li));
    this._notizKontextBinden(wurzel);
  }
  _notizFilterBinden() {
    const app = this._app;
    const q = app.querySelector("#n-suche");
    q?.addEventListener("input", () => {
      this._nSuche = q.value;
      const ziel = app.querySelector("#n-listen");
      if (!ziel) return;
      ziel.innerHTML = this._notizenListeHtml();
      this._notizListeBinden(ziel);
    });
    q?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); q.blur(); } });
  }

  // Wischen nach links zeigt „Anheften“ und „Löschen“ (nur Touch)
  _notizWischen(li) {
    const zeile = li.querySelector(".nrow-zeile");
    const BREIT = 168;
    const id = li.dataset.nid;
    const schliessen = (el) => { el.classList.remove("offen"); if (this._nOffen === el) this._nOffen = null; };
    let x0 = null, y0 = 0, dx = 0, aktiv = false, start = 0, nachWisch = false;
    li.addEventListener("click", (e) => {
      if (nachWisch) { nachWisch = false; e.stopPropagation(); e.preventDefault(); return; }
      if (li.classList.contains("offen") && !e.target.closest(".nrow-aktionen")) { e.stopPropagation(); e.preventDefault(); schliessen(li); }
    }, true);
    li.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || e.target.closest(".nrow-aktionen")) return;
      if (this._nOffen && this._nOffen !== li) schliessen(this._nOffen);
      x0 = e.clientX; y0 = e.clientY; dx = 0; aktiv = false; start = li.classList.contains("offen") ? -BREIT : 0;
    });
    li.addEventListener("pointermove", (e) => {
      if (x0 === null) return;
      if (li._lang) { x0 = null; return; }
      dx = e.clientX - x0;
      if (!aktiv && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - y0)) { aktiv = true; li.classList.add("zieht"); try { li.setPointerCapture(e.pointerId); } catch (err) { /* egal */ } }
      if (!aktiv) return;
      zeile.style.transform = `translateX(${Math.max(-BREIT - 40, Math.min(0, start + dx))}px)`;
    });
    const ende = () => {
      if (x0 === null) return;
      x0 = null;
      if (!aktiv) return;
      const lage = start + dx;
      aktiv = false; nachWisch = true;
      setTimeout(() => { nachWisch = false; }, 400);
      li.classList.remove("zieht");
      zeile.style.transform = "";
      if (lage < -BREIT / 2) { li.classList.add("offen"); this._nOffen = li; } else schliessen(li);
    };
    li.addEventListener("pointerup", ende);
    li.addEventListener("pointercancel", ende);
    li.querySelector("[data-nanheften]").addEventListener("click", () => { const n = this._notiz(id); if (n) this._notizAendern(n, { angeheftet: !n.angeheftet }, n.angeheftet ? "Anheften aufgehoben" : "Notiz angeheftet"); });
    li.querySelector("[data-nloeschen]").addEventListener("click", () => { const n = this._notiz(id); if (n) this._notizLoeschen(n); });
  }

  _notizOeffnen(n, fokusText = false) {
    const dlg = this.shadowRoot.getElementById("blatt");
    const d = this._daten;
    const personen = [...d.personen.map((p) => [p.id, p.name]), [GEMEINSAM, "Gemeinsam"]];
    let id = n.id || null;
    let angeheftet = !!n.angeheftet;
    let ordner = n.ordner || "", farbe = n.farbe || "", erledigteUnten = n.erledigte_unten !== false;
    const ruhig = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const CHECK_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="7" r="2.5"/><path d="M5 7l.8.8L7.3 6.3"/><circle cx="6" cy="17" r="2.5"/><path d="M11 7h9M11 17h9"/></svg>`;
    dlg.innerHTML = `<form method="dialog" id="nform" novalidate>
      <div class="blatt-kopf">${this._narrow ? '<div class="griff" aria-hidden="true"></div>' : ""}
        <span class="l stand" id="n-stand" aria-live="polite"></span>
        <h2 id="blatt-titel">Notiz</h2>
        <button type="submit" class="knopf text fett r">Fertig</button>
      </div>
      <div class="nz-leiste" id="n-leiste" role="toolbar" aria-label="Notiz bearbeiten">
        <button type="button" class="knopf klein" id="n-format" aria-haspopup="menu" aria-expanded="false"><span class="nz-aa" aria-hidden="true">Aa</span>Format</button>
        <button type="button" class="knopf klein" id="n-check" tabindex="-1">${CHECK_SVG}Checkliste</button>
        <span class="nz-leiste-luecke"></span>
        <span class="nz-geteilt" id="n-geteilt" hidden>${ICON.personen}Gemeinsam</span>
        <button type="button" class="knopf klein nz-mehr" id="n-mehr" tabindex="-1" aria-haspopup="menu" aria-expanded="false" aria-label="Mehr Optionen">${ICON.mehr}</button>
      </div>
      <div class="nz-meta" id="n-meta" hidden></div>
      <div class="nz-liste" id="n-zeilen" role="group" aria-label="Notiztext. Die erste Zeile ist der Titel."></div>
      <div class="nz-links" id="n-links" hidden></div>
      <div class="nz-toast" id="n-toast" role="status" hidden></div>
      <div class="reihe">
        <div class="feld"><label for="n-person">Für</label><select id="n-person">${personen.map(([pid, name]) => `<option value="${esc(pid)}" ${n.person === pid ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></div>
        <div class="feld"><span class="lbl" id="n-pin-l">Anheften</span><button type="button" class="knopf notiz-pinknopf" id="n-pin" aria-pressed="${angeheftet}" aria-labelledby="n-pin-l">${ICON.pin}<span id="n-pin-t">${angeheftet ? "Angeheftet" : "Nicht angeheftet"}</span></button></div>
      </div>
      <p class="fehler" id="n-fehler" role="alert"></p>
      <div class="fuss"><button type="button" class="knopf gefahr" id="n-loeschen" style="width:100%" ${id ? "" : "hidden"}>Notiz löschen</button></div>
    </form>`;
    const $ = (x) => dlg.querySelector(`#${x}`);
    const liste = $("n-zeilen");
    const ARIA = { h1: "Überschrift", h2: "Zwischenüberschrift", bullet: "Aufzählungspunkt", num: "Listenpunkt", check: "Checklistenpunkt", text: "Zeile" };
    const LISTEN = ["check", "bullet", "num"];

    // ---- Zeilenmodell: Zeile 1 ist der Titel, jede weitere Zeile ein eigenes Feld; Tabellen sind ein Block ----
    const wachsen = (ta) => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight}px`; };
    const alleWachsen = () => liste.querySelectorAll("textarea").forEach(wachsen);
    const istTitel = (el) => el === liste.firstElementChild;
    const feldVon = (el) => (el.dataset.art === "table" ? (el._zelle && el.querySelector(`tr:nth-child(${el._zelle[0] + 1}) td:nth-child(${el._zelle[1] + 1}) input`)) || el.querySelector("input") : el.querySelector("textarea"));
    const artSetzen = (el, art, ok = false) => {
      const ta = el.querySelector("textarea");
      el.querySelector(".nz-box")?.remove();
      el.querySelector(".nz-mark")?.remove();
      el.classList.remove("nz-h1", "nz-h2");
      if (art === "check") {
        const b = document.createElement("button");
        b.type = "button"; b.className = "nz-box"; b.setAttribute("role", "checkbox");
        b.addEventListener("pointerdown", (e) => e.preventDefault());
        b.addEventListener("click", () => haken(el, el.dataset.ok !== "1"));
        el.prepend(b);
        el.dataset.ok = ok ? "1" : "0";
        b.setAttribute("aria-checked", String(ok)); b.setAttribute("aria-label", `${ta.value || "Punkt"} erledigt`);
      } else delete el.dataset.ok;
      if (art === "bullet" || art === "num") {
        const s = document.createElement("span");
        s.className = "nz-mark"; s.setAttribute("aria-hidden", "true"); s.textContent = art === "bullet" ? "•" : "1.";
        el.prepend(s);
      }
      if (art === "h1" || art === "h2") el.classList.add(`nz-${art}`);
      el.dataset.art = art;
      ta.setAttribute("aria-label", ARIA[art] || "Zeile");
    };
    const textZeile = (wert, art = "text", ok = false, titel = false) => {
      const el = document.createElement("div");
      el.className = titel ? "nz nz-titel" : "nz";
      const ta = document.createElement("textarea");
      ta.rows = 1; ta.autocomplete = "off"; ta.setAttribute("enterkeyhint", "enter");
      ta.autocapitalize = "sentences";
      ta.value = wert;
      el.append(ta);
      if (titel) { ta.maxLength = 200; ta.placeholder = "Titel"; el.dataset.art = "text"; ta.setAttribute("aria-label", "Titel"); }
      else artSetzen(el, art, ok);
      return el;
    };
    const neueZeile = (z) => { const p = notizZeileLesen(z); return p.art === "table" ? tabelle([notizZellen(z)]) : textZeile(p.wert, p.art, p.ok); };
    // Zeilen zu Elementen; aufeinanderfolgende Tabellenzeilen werden eine Tabelle
    const bauen = (zeilen, ersteIstTitel) => {
      const raus = [];
      let tab = null;
      zeilen.forEach((z, i) => {
        if (ersteIstTitel && i === 0) { raus.push(textZeile(z, "text", false, true)); return; }
        if (notizZeileLesen(z).art === "table") { if (tab) tab.push(notizZellen(z)); else { tab = [notizZellen(z)]; raus.push(tab); } return; }
        tab = null;
        raus.push(neueZeile(z));
      });
      return raus.map((x) => (Array.isArray(x) ? tabelle(x) : x));
    };

    // ---- Tabellen ----
    const tabLesen = (el) => [...el.querySelectorAll("tr")].map((tr) => [...tr.querySelectorAll("input")].map((i) => i.value));
    const tabZeichnen = (el, zeilen, fokusRC) => {
      const sp = Math.max(1, ...zeilen.map((r) => r.length));
      zeilen = zeilen.map((r) => [...r, ...Array(sp - r.length).fill("")]);
      el.innerHTML = `<div class="nz-tab-scroll"><table class="nz-tabelle"><caption class="sr">Tabelle mit ${zeilen.length} Zeilen und ${sp} Spalten</caption><tbody>${zeilen.map((r, ri) => `<tr>${r.map((c, ci) => `<td><input type="text" class="nz-zelle" value="${esc(c)}" data-r="${ri}" data-c="${ci}" aria-label="Zeile ${ri + 1}, Spalte ${ci + 1}" autocomplete="off" enterkeyhint="next"></td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <div class="nz-tab-knoepfe"><button type="button" class="knopf klein" data-tab="zeile">${ICON.plus}Zeile</button><button type="button" class="knopf klein" data-tab="spalte">${ICON.plus}Spalte</button><button type="button" class="knopf klein nz-tab-mehr" data-tab="menue" aria-haspopup="menu" aria-expanded="false" aria-label="Tabelle bearbeiten">${ICON.mehr}</button></div>`;
      el._zelle = fokusRC || el._zelle || [0, 0];
      el._zelle = [Math.min(el._zelle[0], zeilen.length - 1), Math.min(el._zelle[1], sp - 1)];
      if (fokusRC) { const i = feldVon(el); i?.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (err) { /* egal */ } }
    };
    const tabelle = (zeilen) => {
      const el = document.createElement("div");
      el.className = "nz nz-tab"; el.dataset.art = "table";
      tabZeichnen(el, zeilen.length ? zeilen : [["", ""], ["", ""]]);
      return el;
    };
    const tabAktion = (el, art, info = {}) => {
      const z = tabLesen(el);
      const [r, c] = el._zelle || [z.length - 1, 0];
      const sp = z[0]?.length || 1;
      if (art === "zeile") { z.splice(r + 1, 0, Array(sp).fill("")); tabZeichnen(el, z, [r + 1, c]); }
      else if (art === "zeile-oben") { z.splice(r, 0, Array(sp).fill("")); tabZeichnen(el, z, [r, c]); }
      else if (art === "spalte") { z.forEach((x) => x.splice(c + 1, 0, "")); tabZeichnen(el, z, [r, c + 1]); }
      else if (art === "zeile-weg" || art === "spalte-weg" || art === "weg") {
        if (art === "zeile-weg") z.splice(r, 1);
        if (art === "spalte-weg") z.forEach((x) => x.splice(c, 1));
        if (art === "weg" || !z.length || !z[0].length) {
          const vorher = el.previousElementSibling;
          let nach = el.nextElementSibling;
          el.remove();
          if (!nach || nach.dataset.art === "table") { nach = textZeile(""); vorher.after(nach); }
          aktuell = nach;
          fokus(nach, 0);
          this._sagen("Tabelle gelöscht");
        } else tabZeichnen(el, z, [Math.min(r, z.length - 1), Math.min(c, z[0].length - 1)]);
      }
      merken(true);
      if (info.tastatur) feldVon(el)?.focus();
    };
    const tabMenue = (el, knopf, info) => this._menue(knopf, [
      { text: "Zeile darunter", icon: ICON.plus, aktion: (i) => tabAktion(el, "zeile", i) },
      { text: "Zeile darüber", icon: ICON.plus, aktion: (i) => tabAktion(el, "zeile-oben", i) },
      { text: "Spalte rechts", icon: ICON.plus, aktion: (i) => tabAktion(el, "spalte", i) },
      "-",
      { text: "Zeile löschen", gefahr: true, aktion: (i) => tabAktion(el, "zeile-weg", i) },
      { text: "Spalte löschen", gefahr: true, aktion: (i) => tabAktion(el, "spalte-weg", i) },
      { text: "Tabelle löschen", gefahr: true, icon: ICON.muell, aktion: (i) => tabAktion(el, "weg", i) },
    ], { titel: "Tabelle", tastatur: info.tastatur });

    const fokus = (el, pos) => {
      if (!el) return;
      if (el.dataset.art === "table") {
        const z = el.querySelectorAll("tr");
        el._zelle = pos === 0 ? [0, 0] : [z.length - 1, (z[z.length - 1]?.querySelectorAll("input").length || 1) - 1];
        const i = feldVon(el); i?.focus(); return;
      }
      const ta = el.querySelector("textarea"); ta.focus({ preventScroll: false });
      const p = pos === undefined ? ta.value.length : Math.min(pos, ta.value.length);
      try { ta.setSelectionRange(p, p); } catch (err) { /* egal */ }
    };
    // Nummern neu zählen (jede zusammenhängende Liste beginnt bei 1)
    const nummern = () => {
      let k = 0;
      for (const el of liste.children) {
        if (el.dataset.art !== "num") { k = 0; continue; }
        k++;
        const m = el.querySelector(".nz-mark");
        if (m) m.textContent = `${k}.`;
        el.querySelector("textarea").setAttribute("aria-label", `Punkt ${k}`);
      }
    };
    const PRAEFIX = { h1: "# ", h2: "## ", bullet: "• " };
    const zeilenLesen = () => {
      const raus = [];
      let k = 0;
      [...liste.children].forEach((el, i) => {
        const art = el.dataset.art;
        if (art === "table") {
          k = 0;
          for (const r of tabLesen(el)) raus.push(`| ${r.map((c) => c.replace(/\|/g, "/").replace(/\s+/g, " ")).join(" | ")} |`);
          return;
        }
        const w = el.querySelector("textarea").value.replace(/\r?\n/g, " ");
        if (i === 0) { raus.push(w); return; }
        k = art === "num" ? k + 1 : 0;
        raus.push((art === "check" ? (el.dataset.ok === "1" ? "☑ " : "☐ ") : art === "num" ? `${k}. ` : PRAEFIX[art] || "") + w);
      });
      return raus;
    };
    const startZeilen = (x) => { const z = x.titel ? [x.titel, ...(x.text || "").split("\n")] : (x.text || "").split("\n"); if (z.length < 2) z.push(""); return z; };
    liste.append(...bauen(startZeilen(n), true));
    nummern();

    // ---- Checkliste: abhaken, Erledigte nach unten ----
    const blockVon = (el) => {
      const ist = (x) => x && x.dataset.art === "check" && !istTitel(x);
      let a = el; while (ist(a.previousElementSibling)) a = a.previousElementSibling;
      const block = [];
      for (let x = a; ist(x); x = x.nextElementSibling) block.push(x);
      return block;
    };
    const flip = (els, tun) => {
      const vor = new Map(els.map((x) => [x, x.getBoundingClientRect().top]));
      const akt = this.shadowRoot.activeElement, a = akt?.selectionStart, b = akt?.selectionEnd;
      tun();
      if (akt && liste.contains(akt) && this.shadowRoot.activeElement !== akt) { akt.focus({ preventScroll: true }); try { akt.setSelectionRange(a, b); } catch (err) { /* egal */ } }
      if (ruhig) return;
      for (const x of els) {
        const dy = vor.get(x) - x.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) x.animate?.([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    };
    // Abgehakter Punkt ans Ende seiner Liste, wieder geöffneter vor den ersten erledigten
    const einsortieren = (el) => {
      if (!erledigteUnten || !el.isConnected || el.dataset.art !== "check") return false;
      const block = blockVon(el);
      const ok = el.dataset.ok === "1";
      const andere = block.filter((x) => x !== el);
      const ziel = ok ? null : andere.find((x) => x.dataset.ok === "1");
      if (ok ? block[block.length - 1] === el : (ziel ? el.nextElementSibling === ziel || block.indexOf(el) < block.indexOf(ziel) : true)) return false;
      flip(block, () => { if (ok) block[block.length - 1].after(el); else ziel.before(el); });
      return true;
    };
    const allesSortieren = () => {
      const bloecke = [];
      for (const el of liste.children) if (el.dataset.art === "check" && !istTitel(el) && el.previousElementSibling?.dataset.art !== "check") bloecke.push(blockVon(el));
      for (const block of bloecke) {
        const neu = [...block.filter((x) => x.dataset.ok !== "1"), ...block.filter((x) => x.dataset.ok === "1")];
        if (neu.every((x, i) => x === block[i])) continue;
        flip(block, () => { const vor = block[0].previousElementSibling; vor.after(...neu); });
      }
    };
    let sortierTimer = null;
    const haken = (el, ok, still = false) => {
      el.dataset.ok = ok ? "1" : "0";
      const b = el.querySelector(".nz-box"), ta = el.querySelector("textarea");
      b?.setAttribute("aria-checked", String(ok)); b?.setAttribute("aria-label", `${ta.value || "Punkt"} erledigt`);
      merken(true);
      if (!still) this._sagen(ok ? `${ta.value || "Punkt"} erledigt` : `${ta.value || "Punkt"} offen`);
      if (erledigteUnten) {
        clearTimeout(sortierTimer);
        sortierTimer = setTimeout(() => { if (einsortieren(el)) merken(true); }, ruhig ? 0 : 450);
      }
    };

    // ---- Links, Telefonnummern, E-Mail ----
    const linksZeigen = () => {
      const l = notizLinks(zeilenLesen().join("\n"));
      const box = $("n-links");
      box.hidden = !l.length;
      box.innerHTML = l.length ? `<span class="nz-links-t" id="n-links-t">Links</span><ul aria-labelledby="n-links-t">${l.slice(0, 12).map((x) => `<li><a class="nz-link" href="${esc(x.href)}" ${x.art === "web" ? 'target="_blank" rel="noopener noreferrer"' : ""}>${x.art === "tel" ? ICON.telefon : x.art === "mail" ? ICON.mail : ICON.link}<span>${esc(x.art === "web" ? x.text.replace(/^https?:\/\//i, "").replace(/\/$/, "") : x.text)}</span>${x.art === "tel" ? '<span class="sr"> anrufen</span>' : x.art === "mail" ? '<span class="sr"> E-Mail schreiben</span>' : '<span class="sr"> öffnen, neues Fenster</span>'}</a></li>`).join("")}</ul>` : "";
    };
    // ---- Kopfzeilen-Infos: Ordner, Farbe, Gemeinsam ----
    const metaZeigen = () => {
      const m = $("n-meta");
      const fName = NOTIZ_FARBEN.find(([, f]) => f === farbe)?.[0];
      m.hidden = !ordner && !farbe;
      m.innerHTML = `${ordner ? `<button type="button" class="nz-chip" id="n-meta-ordner" aria-haspopup="menu" aria-expanded="false" aria-label="Ordner ${esc(ordner)} ändern">${ICON.ordner}${esc(ordner)}</button>` : ""}${farbe ? `<button type="button" class="nz-chip" id="n-meta-farbe" aria-haspopup="menu" aria-expanded="false" aria-label="Farbe ${esc(fName || "")} ändern"><span class="nz-punkt" style="--nf:${esc(farbe)}" aria-hidden="true"></span>${esc(fName || "Farbe")}</button>` : ""}`;
      m.querySelector("#n-meta-ordner")?.addEventListener("click", (e) => ordnerMenue(e.currentTarget, { tastatur: e.detail === 0 }));
      m.querySelector("#n-meta-farbe")?.addEventListener("click", (e) => farbMenue(e.currentTarget, { tastatur: e.detail === 0 }));
      dlg.style.setProperty("--nf", farbe || "transparent");
      dlg.classList.toggle("nz-farbig", !!farbe);
      $("n-geteilt").hidden = $("n-person").value !== GEMEINSAM;
    };

    // ---- Bearbeiten ----
    let aktuell = null, letztesFeld = null;
    liste.addEventListener("focusin", (e) => {
      aktuell = e.target.closest(".nz") || aktuell;
      if (e.target.matches("textarea, input")) letztesFeld = e.target;
      if (e.target.classList.contains("nz-zelle")) aktuell._zelle = [+e.target.dataset.r, +e.target.dataset.c];
    });
    liste.addEventListener("click", (e) => {
      const k = e.target.closest("[data-tab]");
      if (!k) return;
      const el = k.closest(".nz");
      aktuell = el;
      if (k.dataset.tab === "menue") tabMenue(el, k, { tastatur: e.detail === 0 });
      else tabAktion(el, k.dataset.tab, { tastatur: e.detail === 0 });
    });
    liste.addEventListener("pointerdown", (e) => { if (e.target.closest("[data-tab]:not([data-tab=menue])")) e.preventDefault(); });
    liste.addEventListener("input", (e) => {
      const ta = e.target, el = ta.closest(".nz");
      if (!el || ta.tagName !== "TEXTAREA") return;
      if (ta.value.includes("\n")) {
        // Einfügen mehrerer Zeilen: auf Zeilen verteilen; in Listen bekommen neue Zeilen dieselbe Art
        const teile = ta.value.split(/\r?\n/);
        ta.value = teile[0];
        const art = el.dataset.art;
        const fort = LISTEN.includes(art) && !istTitel(el);
        const neu = bauen(teile.slice(1).map((t) => (fort && notizZeileLesen(t).art === "text" ? (art === "check" ? "☐ " : art === "num" ? "1. " : "• ") + t : t)), false);
        el.after(...neu);
        if (neu.length) fokus(neu[neu.length - 1]);
        nummern(); alleWachsen();
        return;
      }
      // Kurzbefehle am Zeilenanfang wie in Apple Notizen: „- “ Aufzählung, „1. “ Nummerierung, „[] “ Checkliste
      if (!istTitel(el) && el.dataset.art === "text") {
        const m = /^(?:([-*•]) |(1)\. |(\[ ?\]) )/.exec(ta.value);
        if (m && ta.selectionStart === m[0].length) {
          ta.value = ta.value.slice(m[0].length);
          artSetzen(el, m[1] ? "bullet" : m[2] ? "num" : "check");
          nummern(); fokus(el, 0);
        }
      }
      wachsen(ta);
    });
    liste.addEventListener("keydown", (e) => {
      const ta = e.target, el = ta.closest(".nz");
      if (!el || e.isComposing) return;
      if (ta.classList.contains("nz-zelle")) {
        const tr = ta.closest("tr"), td = ta.closest("td");
        const ri = [...tr.parentElement.children].indexOf(tr), ci = [...tr.children].indexOf(td);
        const zeilen = tr.parentElement.children;
        if (e.key === "Enter") {
          e.preventDefault();
          if (ri === zeilen.length - 1) { el._zelle = [ri, ci]; tabAktion(el, "zeile"); }
          else zeilen[ri + 1].children[ci]?.querySelector("input")?.focus();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          if (ri < zeilen.length - 1) zeilen[ri + 1].children[ci]?.querySelector("input")?.focus();
          else { let nach = el.nextElementSibling; if (!nach) { nach = textZeile(""); el.after(nach); } fokus(nach, 0); }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (ri > 0) zeilen[ri - 1].children[ci]?.querySelector("input")?.focus();
          else fokus(el.previousElementSibling);
        }
        return;
      }
      if (ta.tagName !== "TEXTAREA") return;
      const titel = istTitel(el);
      const art = el.dataset.art;
      if (e.key === "Enter") {
        e.preventDefault();
        if (LISTEN.includes(art) && !ta.value.trim()) { artSetzen(el, "text"); ta.value = ""; nummern(); merken(true); fokus(el); return; }
        const vor = ta.value.slice(0, ta.selectionStart), nach = ta.value.slice(ta.selectionEnd);
        ta.value = vor;
        const z = textZeile(nach, !titel && LISTEN.includes(art) ? art : "text");
        el.after(z);
        nummern(); alleWachsen(); fokus(z, 0); merken(true);
      } else if (e.key === "Backspace" && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        if (!titel && art !== "text") { e.preventDefault(); artSetzen(el, "text"); nummern(); merken(true); fokus(el, 0); }
        else if (!titel) {
          e.preventDefault();
          const vorher = el.previousElementSibling;
          if (vorher.dataset.art === "table") {
            if (!ta.value) { el.remove(); if (!vorher.nextElementSibling) vorher.after(textZeile("")); merken(true); }
            fokus(vorher);
            return;
          }
          const pt = vorher.querySelector("textarea"), l = pt.value.length;
          pt.value += ta.value;
          el.remove(); nummern(); alleWachsen(); fokus(vorher, l); merken(true);
        }
      } else if (e.key === "ArrowUp" && ta.selectionStart === 0 && el.previousElementSibling) { e.preventDefault(); fokus(el.previousElementSibling); }
      else if (e.key === "ArrowDown" && ta.selectionStart === ta.value.length && el.nextElementSibling) { e.preventDefault(); fokus(el.nextElementSibling, 0); }
      else if ((e.key === "b" || e.key === "B") && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); fett(); }
    });

    // Zeile, auf die eine Formatierung wirkt (nie der Titel, nie eine Tabelle: dann eine neue Zeile dahinter)
    const zielZeile = () => {
      let el = aktuell && liste.contains(aktuell) ? aktuell : liste.lastElementChild;
      if (istTitel(el)) {
        const nach = el.nextElementSibling;
        if (nach && nach.dataset.art !== "table") el = nach;
        else { const z = textZeile(""); el.after(z); el = z; }
      } else if (el.dataset.art === "table") { const z = textZeile(""); el.after(z); el = z; }
      return el;
    };
    const formatSetzen = (art) => {
      const el = zielZeile();
      const ta = el.querySelector("textarea");
      const pos = ta.selectionStart ?? ta.value.length;
      const neu = el.dataset.art === art && art !== "text" ? "text" : art;
      artSetzen(el, neu, false);
      aktuell = el;
      nummern(); alleWachsen(); merken(true); fokus(el, pos);
      this._sagen(neu === "text" ? "Normaler Text" : `${ARIA[neu]}`);
    };
    const fett = () => {
      const f = letztesFeld && liste.contains(letztesFeld) ? letztesFeld : null;
      if (!f) { this._sagen("Erst Text auswählen."); return; }
      const v = f.value;
      let a = f.selectionStart ?? v.length, b = f.selectionEnd ?? a;
      let neu, na, nb;
      if (b - a >= 4 && v.slice(a, a + 2) === "**" && v.slice(b - 2, b) === "**") { neu = v.slice(0, a) + v.slice(a + 2, b - 2) + v.slice(b); na = a; nb = b - 4; }
      else if (v.slice(a - 2, a) === "**" && v.slice(b, b + 2) === "**") { neu = v.slice(0, a - 2) + v.slice(a, b) + v.slice(b + 2); na = a - 2; nb = b - 2; }
      else { neu = `${v.slice(0, a)}**${v.slice(a, b)}**${v.slice(b)}`; na = a + 2; nb = b + 2; }
      f.value = neu;
      f.focus();
      try { f.setSelectionRange(na, nb); } catch (err) { /* egal */ }
      if (f.tagName === "TEXTAREA") wachsen(f);
      merken(true);
    };
    const tabelleEinfuegen = () => {
      let el = aktuell && liste.contains(aktuell) ? aktuell : liste.lastElementChild;
      const t = tabelle([["", ""], ["", ""]]);
      if (!istTitel(el) && el.dataset.art !== "table" && !el.querySelector("textarea").value.trim()) el.replaceWith(t);
      else el.after(t);
      const nach = t.nextElementSibling;
      if (!nach || nach.dataset.art === "table") t.after(textZeile(""));
      aktuell = t;
      nummern(); fokus(t, 0); merken(true);
      this._sagen("Tabelle mit 2 Spalten und 2 Zeilen eingefügt");
    };
    const aktuelleArt = () => { const el = aktuell && liste.contains(aktuell) ? aktuell : null; return !el || istTitel(el) ? "" : el.dataset.art; };
    const formatMenue = (knopf, info) => {
      const art = aktuelleArt();
      this._menue(knopf, [
        { text: "Überschrift", icon: '<span class="g-h1">T</span>', radio: true, aktiv: art === "h1", aktion: () => formatSetzen("h1") },
        { text: "Zwischenüberschrift", icon: '<span class="g-h2">T</span>', radio: true, aktiv: art === "h2", aktion: () => formatSetzen("h2") },
        { text: "Normaler Text", icon: '<span class="g-t">T</span>', radio: true, aktiv: art === "text", aktion: () => formatSetzen("text") },
        "-",
        { text: "Aufzählung", icon: '<span class="g-t">•</span>', radio: true, aktiv: art === "bullet", aktion: () => formatSetzen("bullet") },
        { text: "Nummerierte Liste", icon: '<span class="g-t">1.</span>', radio: true, aktiv: art === "num", aktion: () => formatSetzen("num") },
        { text: "Checkliste", icon: CHECK_SVG, radio: true, aktiv: art === "check", aktion: () => formatSetzen("check") },
        "-",
        { text: "Fett", icon: '<b class="g-t">B</b>', aktion: fett },
        { text: "Tabelle einfügen", icon: ICON.tabelle, aktion: tabelleEinfuegen },
      ], { titel: "Format", tastatur: info.tastatur });
    };

    // ---- Punkt als Aufgabe übernehmen ----
    const toast = (text, rueck) => {
      const t = $("n-toast");
      clearTimeout(t._zeit);
      t.innerHTML = `<span>${esc(text)}</span>${rueck ? '<button type="button" class="knopf text fett">Rückgängig</button>' : ""}`;
      t.hidden = false;
      t.querySelector("button")?.addEventListener("click", async () => { t.hidden = true; try { await rueck(); this._sagen("Rückgängig gemacht"); } catch (err) { /* angesagt */ } });
      t._zeit = setTimeout(() => { t.hidden = true; }, 6000);
    };
    const alsAufgabe = async () => {
      const el = aktuell && liste.contains(aktuell) ? aktuell : null;
      const f = el ? feldVon(el) : null;
      const titel = notizOhneFett(f?.value || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!titel) { toast("Tippe zuerst in die Zeile, die eine Aufgabe werden soll."); this._sagen("Keine Zeile ausgewählt"); return; }
      let neu;
      try { neu = await this._ws({ type: "planer/speichern", aufgabe: { titel, person: $("n-person").value, datum: null } }); } catch (err) { return; }
      const warOffen = el.dataset.art === "check" && el.dataset.ok !== "1";
      if (warOffen) haken(el, true, true);
      this._sagen(`Aufgabe angelegt: ${titel}, im Eingang`);
      toast(`Aufgabe „${titel}“ im Eingang`, async () => {
        if (neu?.id) await this._ws({ type: "planer/loeschen", aufgabe_id: neu.id });
        if (warOffen && el.isConnected) haken(el, false, true);
      });
    };

    // ---- Ordner und Farbe ----
    const ordnerSetzen = (o) => { ordner = String(o || "").trim().slice(0, 40); metaZeigen(); merken(true); this._sagen(ordner ? `In Ordner ${ordner}` : "Kein Ordner"); };
    const farbeSetzen = (f) => { farbe = f; metaZeigen(); merken(true); this._sagen(f ? `Farbe ${NOTIZ_FARBEN.find(([, x]) => x === f)?.[0] || ""}` : "Keine Farbe"); };
    const ordnerMenue = (knopf, info, zurueck) => {
      const alle = [...new Set((this._daten?.notizen || []).map((x) => x.ordner).filter(Boolean).concat(ordner ? [ordner] : []))].sort((a, b) => a.localeCompare(b, "de"));
      this._menue(knopf, [
        zurueck ? { text: "Zurück", icon: "‹", aktion: zurueck } : null,
        zurueck ? "-" : null,
        ...alle.map((o) => ({ text: o, icon: ICON.ordner, radio: true, aktiv: o === ordner, aktion: () => ordnerSetzen(o) })),
        { text: "Kein Ordner", radio: true, aktiv: !ordner, aktion: () => ordnerSetzen("") },
        "-",
        { eingabe: true, text: "Neuer Ordner", knopf: "Anlegen", max: 40, aktion: (w) => ordnerSetzen(w) },
      ], { titel: "Ordner", tastatur: info?.tastatur });
    };
    const farbMenue = (knopf, info, zurueck) => this._menue(knopf, [
      zurueck ? { text: "Zurück", icon: "‹", aktion: zurueck } : null,
      zurueck ? "-" : null,
      ...NOTIZ_FARBEN.map(([name, f]) => ({ text: name, icon: `<span class="nz-punkt" style="--nf:${f}"></span>`, radio: true, aktiv: farbe === f, aktion: () => farbeSetzen(f) })),
      "-",
      { text: "Keine Farbe", radio: true, aktiv: !farbe, aktion: () => farbeSetzen("") },
    ], { titel: "Farbe", tastatur: info?.tastatur });
    const mehrKnopf = $("n-mehr");
    const mehrMenue = (info) => this._menue(mehrKnopf, [
      { text: angeheftet ? "Loslösen" : "Anheften", icon: ICON.pin, aktion: pinUmschalten },
      { text: "Als Aufgabe übernehmen", icon: ICON.aufgaben, aktion: alsAufgabe },
      "-",
      { text: ordner ? `Ordner: ${ordner}` : "Ordner …", icon: ICON.ordner, untermenue: true, aktion: (i) => ordnerMenue(mehrKnopf, i, mehrMenue) },
      { text: "Farbe", icon: `<span class="nz-punkt" style="--nf:${farbe || "transparent"}"></span>`, untermenue: true, aktion: (i) => farbMenue(mehrKnopf, i, mehrMenue) },
      { text: "Erledigte nach unten", aktiv: erledigteUnten, aktion: () => {
        erledigteUnten = !erledigteUnten;
        if (erledigteUnten) allesSortieren();
        merken(true);
        this._sagen(erledigteUnten ? "Erledigte wandern nach unten" : "Erledigte bleiben an ihrem Platz");
      } },
      "-",
      { text: "Notiz löschen", icon: ICON.muell, gefahr: true, aktion: () => loeschen() },
    ], { titel: "Mehr", tastatur: info?.tastatur });

    // ---- Werkzeugleiste ----
    const leiste = $("n-leiste");
    const formatKnopf = $("n-format"), checkKnopf = $("n-check");
    [formatKnopf, checkKnopf, mehrKnopf].forEach((k) => k.addEventListener("pointerdown", (e) => e.preventDefault()));
    formatKnopf.addEventListener("click", (e) => formatMenue(formatKnopf, { tastatur: e.detail === 0 }));
    checkKnopf.addEventListener("click", () => formatSetzen("check"));
    mehrKnopf.addEventListener("click", (e) => mehrMenue({ tastatur: e.detail === 0 }));
    // Pfeiltasten wandern durch die Werkzeugleiste (ein Tab-Stopp)
    leiste.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
      const k = [formatKnopf, checkKnopf, mehrKnopf];
      let i = k.indexOf(this.shadowRoot.activeElement);
      if (i < 0) return;
      e.preventDefault();
      i = e.key === "Home" ? 0 : e.key === "End" ? k.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + k.length) % k.length;
      k.forEach((x, j) => { x.tabIndex = j === i ? 0 : -1; });
      k[i].focus();
    });

    // ---- Speichern ----
    let sicher = false;
    let zeitgeber = null, aenderung = false, geaendert = false, weg = false, laeuft = Promise.resolve(), inFlug = 0, letzteEingabe = 0, liveTimer = null;
    const stand = (t) => { $("n-stand").textContent = t; };
    const sammeln = () => { const z = zeilenLesen(); return { titel: z[0], text: z.slice(1).join("\n"), person: $("n-person").value, angeheftet, ordner, farbe, erledigte_unten: erledigteUnten }; };
    const sig = (x) => JSON.stringify([x.titel || "", x.text || "", !!x.angeheftet, x.ordner || "", x.farbe || "", x.erledigte_unten !== false, x.person || ""]);
    // Stände, die schon im Editor waren: kommen sie (verspätet) vom Server zurück, ist das keine fremde Änderung
    const gesehen = new Set([sig(n)]);
    // Speichern läuft nacheinander. Eine neue Notiz bekommt ihre ID von der ersten Antwort; spätere Speicherungen nutzen sie.
    const autoSpeichern = () => {
      clearTimeout(zeitgeber); zeitgeber = null;
      if (weg || !aenderung) return laeuft;
      const notiz = sammeln();
      if (!id && !notiz.titel.trim() && !notiz.text.trim()) { aenderung = false; stand(""); return laeuft; }
      aenderung = false;
      stand("Speichert …");
      inFlug++;
      laeuft = laeuft.then(async () => {
        if (weg) return;
        try {
          const neu = await this._hass.callWS({ type: "planer/notiz_speichern", notiz: id ? { ...notiz, id } : notiz });
          id = neu.id; geaendert = true;
          gesehen.add(sig(neu));
          $("n-loeschen").hidden = false;
          stand(aenderung ? "" : "Gespeichert");
        } catch (err) { aenderung = true; stand(""); $("n-fehler").textContent = err.message || "Speichern hat nicht geklappt."; }
      }).finally(() => { inFlug--; });
      return laeuft;
    };
    const merken = (sofort = false) => {
      aenderung = true; stand(""); $("n-fehler").textContent = "";
      clearTimeout(zeitgeber);
      linksZeigen();
      if (sofort) autoSpeichern(); else zeitgeber = setTimeout(autoSpeichern, 300);
    };
    const form = $("nform");
    form.addEventListener("input", (e) => {
      if (e.target.closest(".menue")) return;
      letzteEingabe = Date.now();
      merken(e.target.tagName === "SELECT");
    });
    form.addEventListener("change", (e) => {
      if (e.target.closest(".menue")) return;
      if (e.target.id === "n-person") metaZeigen();
      merken(true);
    });
    form.addEventListener("focusout", () => { if (aenderung) autoSpeichern(); });
    const pinUmschalten = () => {
      angeheftet = !angeheftet;
      $("n-pin").setAttribute("aria-pressed", String(angeheftet));
      $("n-pin-t").textContent = angeheftet ? "Angeheftet" : "Nicht angeheftet";
      this._sagen(angeheftet ? "Notiz angeheftet" : "Anheften aufgehoben");
      merken(true);
    };
    $("n-pin").addEventListener("click", pinUmschalten);

    // ---- Live: Änderungen von anderen (z. B. gemeinsame Notiz) übernehmen, wenn hier gerade nicht getippt wird ----
    const uebernehmen = (s) => {
      angeheftet = !!s.angeheftet; ordner = s.ordner || ""; farbe = s.farbe || ""; erledigteUnten = s.erledigte_unten !== false;
      $("n-pin").setAttribute("aria-pressed", String(angeheftet));
      $("n-pin-t").textContent = angeheftet ? "Angeheftet" : "Nicht angeheftet";
      if ([...$("n-person").options].some((o) => o.value === s.person)) $("n-person").value = s.person;
      metaZeigen();
      const jetzt = sammeln();
      if (jetzt.titel === (s.titel || "") && jetzt.text.replace(/\s+$/, "") === (s.text || "")) return;
      const akt = this.shadowRoot.activeElement;
      const hatteFokus = akt && liste.contains(akt);
      const idx = hatteFokus ? [...liste.children].indexOf(akt.closest(".nz")) : -1;
      const pos = hatteFokus ? akt.selectionStart : 0;
      liste.replaceChildren(...bauen(startZeilen(s), true));
      nummern(); alleWachsen(); linksZeigen();
      aktuell = null;
      if (idx >= 0) { const el = liste.children[Math.min(idx, liste.children.length - 1)]; fokus(el, el.dataset.art === "table" ? 0 : pos); }
      stand("Aktualisiert");
      this._sagen("Die Notiz wurde gerade woanders geändert und ist jetzt aktuell.");
    };
    const live = () => {
      clearTimeout(liveTimer);
      if (!dlg.open || weg || !id) return;
      const s = this._notiz(id);
      if (!s) return;
      const k = sig(s);
      if (gesehen.has(k)) return;
      const ruhe = Date.now() - letzteEingabe;
      if (aenderung || zeitgeber || inFlug || ruhe < 3000) { liveTimer = setTimeout(live, Math.max(400, 3000 - ruhe)); return; }
      gesehen.add(k);
      uebernehmen(s);
    };
    this._notizLive = live;

    // Beim Wegklicken/Schließen sofort sichern, nicht erst nach der Animation; ebenso wenn die App verlassen wird
    dlg._vorZu = () => { this._menueZu?.(false); return autoSpeichern(); };
    const weglegen = () => { if (document.visibilityState === "hidden" && dlg.open) dlg._vorZu?.(); };
    document.addEventListener("visibilitychange", weglegen);
    window.addEventListener("pagehide", weglegen);
    dlg.addEventListener("close", () => { document.removeEventListener("visibilitychange", weglegen); window.removeEventListener("pagehide", weglegen); }, { once: true });
    dlg.onclose = async () => {
      dlg._vorZu = null;
      this._menueZu?.(false);
      clearTimeout(liveTimer);
      if (this._notizLive === live) this._notizLive = null;
      dlg.classList.remove("nz-farbig");
      if (weg) return;
      await autoSpeichern();
      if (geaendert) { geaendert = false; await this._lesen(); }
    };
    const loeschen = async () => {
      weg = true; clearTimeout(zeitgeber);
      await laeuft;
      const kopie = sammeln();
      const titel = this._notizTitel(kopie);
      if (id) {
        try { await this._ws({ type: "planer/notiz_loeschen", notiz_id: id }); } catch (err) { weg = false; return; }
      }
      this._zu(dlg);
      this._sagen(`Gelöscht: ${titel}`);
      if (id) this._hinweis(`Gelöscht: ${titel}`, () => this._ws({ type: "planer/notiz_speichern", notiz: kopie }));
      await this._lesen();
    };
    $("n-loeschen").addEventListener("click", async () => {
      if (!sicher) { sicher = true; $("n-loeschen").textContent = "Wirklich löschen?"; $("n-loeschen").focus(); return; }
      await loeschen();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearTimeout(zeitgeber);
      await autoSpeichern();
      if ($("n-fehler").textContent) return;
      this._zu(dlg);
    });
    this._wischZu(dlg);
    metaZeigen();
    linksZeigen();
    dlg.showModal();
    alleWachsen();
    // Werkzeugleiste klebt unter der Kopfzeile
    leiste.style.top = `${dlg.querySelector(".blatt-kopf").offsetHeight}px`;
    // Nur bei neuen Notizen direkt ins Textfeld (öffnet die Tastatur); bestehende öffnen ohne Tastatur.
    if (fokusText || !id) fokus(n.titel ? liste.children[1] : liste.firstElementChild, 0);
    else { $("blatt-titel").setAttribute("tabindex", "-1"); $("blatt-titel").focus({ preventScroll: true }); }
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
    let y0 = null, t0 = 0, dy = 0;
    const vomKopf = (e) => !!e.target.closest(".blatt-kopf");
    dlg.addEventListener("touchstart", (e) => {
      // Ziehen am Kopf immer, sonst nur, wenn der Inhalt ganz oben steht
      y0 = dlg.scrollTop <= 0 || vomKopf(e) ? e.touches[0].clientY : null; t0 = Date.now(); dy = 0;
    }, { passive: true });
    dlg.addEventListener("touchmove", (e) => {
      if (y0 === null || e.target.closest("input[type=range],textarea,.tl-scroll")) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 0) { dlg.classList.add("zieht"); dlg.style.transform = `translateY(${dy}px)`; }
      else if (dy < -50 && vomKopf(e)) dlg.classList.add("voll");
    }, { passive: true });
    dlg.addEventListener("touchend", () => {
      if (y0 === null) return;
      const schnell = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6;
      dlg.classList.remove("zieht");
      dlg.style.transform = "";
      if (dy > 110 || schnell) this._zu(dlg);
      y0 = null; dy = 0;
    });
    dlg.addEventListener("close", () => dlg.classList.remove("voll"));
  }

  // Einstellungen › Sicherung: Liste, Jetzt sichern, Wiederherstellen mit Bestätigung im Dialog
  _sicherungBinden(dlg) {
    const liste = dlg.querySelector("#sich-liste"), fehler = dlg.querySelector("#sich-fehler");
    if (!liste) return;
    const text = (x) => {
      const z = new Date(x.zeit);
      const dat = z.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
      const uhr0 = z.toLocaleTimeString("de-DE", x.vorher ? { hour: "2-digit", minute: "2-digit", second: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
      return { titel: x.vorher ? `Vor Wiederherstellung, ${dat}` : dat, unter: `${uhr0} Uhr · ${x.groesse < 1024 ? `${x.groesse} B` : `${Math.round(x.groesse / 1024)} KB`}` };
    };
    const zeigen = (daten) => {
      liste.innerHTML = daten.length ? daten.map((x) => { const t = text(x); return `<li data-name="${esc(x.name)}">
          <span class="sich-text"><b>${esc(t.titel)}</b><span class="hinweis">${esc(t.unter)}</span></span>
          <button type="button" class="knopf klein" data-sich-her="${esc(x.name)}">Wiederherstellen</button></li>`; }).join("")
        : `<li class="hinweis">Noch keine Sicherung.</li>`;
    };
    const laden = async () => {
      try { zeigen(await this._hass.callWS({ type: "planer/sicherungen" })); fehler.textContent = ""; }
      catch (e) { liste.innerHTML = ""; fehler.textContent = e.message || "Sicherungen konnten nicht geladen werden."; }
    };
    laden();
    dlg.querySelector("#sich-jetzt").addEventListener("click", async (ev) => {
      const b = ev.currentTarget; b.disabled = true; fehler.textContent = "";
      try { const r = await this._hass.callWS({ type: "planer/sichern" }); zeigen(r.liste); this._sagen("Sicherung angelegt"); }
      catch (e) { fehler.textContent = e.message || "Sichern hat nicht geklappt."; }
      b.disabled = false;
    });
    liste.addEventListener("click", async (ev) => {
      const her = ev.target.closest("[data-sich-her]"), nein = ev.target.closest("[data-sich-nein]"), ja = ev.target.closest("[data-sich-ja]");
      if (nein) { laden(); return; }
      if (her) {
        const li = her.closest("li");
        li.classList.add("frage");
        li.innerHTML = `<span class="sich-text" role="alert"><b>Wirklich wiederherstellen?</b><span class="hinweis">Alle Aufgaben, Notizen und Schichten werden durch diesen Stand ersetzt. Der aktuelle Stand wird vorher automatisch gesichert.</span></span>
          <span class="sich-knoepfe"><button type="button" class="knopf klein" data-sich-nein="1">Abbrechen</button><button type="button" class="knopf klein primaer" data-sich-ja="${esc(her.dataset.sichHer)}">Ja, wiederherstellen</button></span>`;
        li.querySelector("[data-sich-nein]").focus();
        return;
      }
      if (ja) {
        ja.disabled = true; fehler.textContent = "";
        try {
          const r = await this._hass.callWS({ type: "planer/wiederherstellen", name: ja.dataset.sichJa });
          zeigen(r.liste); this._sagen("Sicherung wiederhergestellt"); await this._lesen();
        } catch (e) { fehler.textContent = e.message || "Wiederherstellen hat nicht geklappt."; laden(); }
      }
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
      ${d.admin ? this._wetterRegelnHtml() : ""}
      <fieldset id="sich"><legend>Sicherung</legend>
        <p class="hinweis">Der Planer sichert seine Daten jede Nacht um 03:30 in den Ordner planer_sicherungen (die letzten 14 bleiben).</p>
        <div class="sich-kopf"><button type="button" class="knopf" id="sich-jetzt">Jetzt sichern</button></div>
        <ul class="sich-liste" id="sich-liste" aria-label="Sicherungen"><li class="hinweis">Wird geladen …</li></ul>
        <p class="fehler" id="sich-fehler" role="alert"></p>
      </fieldset>
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
          <div class="reihe">
            <div class="feld"><label for="ab-${i}">Abfahrtserinnerung (Waze)</label><select id="ab-${i}" data-feld="abfahrt"><option value="">Aus</option><option value="1" ${e.abfahrt ? "selected" : ""}>An: Push, wenn es Zeit zum Losfahren ist</option></select></div>
            <div class="feld"><label for="ap-${i}">Puffer in Minuten</label><input id="ap-${i}" data-feld="abfahrt_puffer" type="number" min="0" max="180" step="5" inputmode="numeric" value="${e.abfahrt_puffer ?? 10}"></div>
          </div>
          <p class="hinweis">Für Termine mit Ort: Fahrzeit mit dem Auto ab deinem aktuellen Standort (sonst Zuhause) plus Puffer. Braucht die Integration „Waze Travel Time“ und ein Handy für Erinnerungen.</p>
          <div class="fuss"><button type="button" class="knopf" data-speichern="${i}">Für ${esc(p.name.split(" ")[0])} speichern</button></div>
        </section>`;
      }).join("")}
    </form>`;
    d.personen.forEach((p, i) => erinnBinden(dlg, `se${i}`, (t) => this._sagen(t)));
    this._sicherungBinden(dlg);
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
    this._regelnBinden(dlg);
    dlg.querySelector("#gk")?.addEventListener("change", async (e) => {
      await this._ws({ type: "planer/allgemein", werte: { gemeinsam_kalender: e.target.value || null } });
      this._sagen("Kalender für gemeinsame Termine gespeichert");
    });
    // Änderungen pro Person merken; „Fertig“ oder Schließen speichert sie mit
    dlg.querySelectorAll("section.person-einst").forEach((sec, i) => {
      const merk = () => { sec.dataset.geaendert = "1"; const b = sec.querySelector("[data-speichern]"); if (b) b.textContent = `Für ${d.personen[i].name.split(" ")[0]} speichern`; };
      sec.addEventListener("change", merk); sec.addEventListener("input", merk); sec.addEventListener("click", (e) => { if (e.target.closest(".chip, [data-erinn], button:not([data-speichern])")) merk(); });
    });
    const personSpeichern = async (b) => {
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
        abfahrt: !!sec.querySelector('[data-feld="abfahrt"]').value,
        abfahrt_puffer: String(Math.max(0, Math.min(180, parseInt(sec.querySelector('[data-feld="abfahrt_puffer"]').value, 10) || 0))),
      };
      if (kal.length) {
        werte.kalender_sehen = liste("sehen").length === alle("sehen") ? null : liste("sehen");
        werte.kalender_schreiben = liste("schreiben").length === alle("schreiben") ? null : liste("schreiben");
        werte.kalender_erinnern = liste("erinnern");
        werte.kalender_zeitleiste = liste("zeitleiste").length === alle("zeitleiste") ? null : liste("zeitleiste");
        werte.standard_kalender = sec.querySelector('[data-feld="standard_kalender"]').value || null;
      }
      await this._ws({ type: "planer/einstellung", person: d.personen[i].id, werte });
      delete sec.dataset.geaendert;
      b.textContent = "Gespeichert";
      this._sagen(`Einstellungen für ${d.personen[i].name} gespeichert`);
    };
    dlg.querySelectorAll("[data-speichern]").forEach((b) => b.addEventListener("click", () => personSpeichern(b)));
    dlg.addEventListener("close", async () => {
      const offen = [...dlg.querySelectorAll("section.person-einst[data-geaendert] [data-speichern]")];
      try { await Promise.all(offen.map(personSpeichern)); } catch (e) { this._sagen("Speichern hat nicht geklappt"); }
      await this._lesen(); this._termineLaden();
    }, { once: true });
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
      <div class="reihe t-zeiten">
        <div class="feld t-datum-f"><label for="t-datum">Datum</label><input id="t-datum" type="date" value="${esc(datum)}"></div>
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

const SENSOR_ARTEN = { schicht_heute: "Schicht heute", schicht_morgen: "Schicht morgen", naechste_schicht: "Nächster Schichtbeginn", offene_aufgaben: "Offene Aufgaben heute", ueberfaellig: "Überfällige Aufgaben" };

function CSS_escape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

if (!customElements.get("planer-panel")) customElements.define("planer-panel", PlanerPanel);
