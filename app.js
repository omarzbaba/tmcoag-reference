"use strict";
/* TM·Coag Reference — static, read-only viewer over embedded guideline knowledge.
   No server, no network, no patient data. Reads window.KB (see kb.js). */

const KB = window.KB || {};
const content = document.getElementById("content");
const searchEl = document.getElementById("search");
const state = { route: "asfa", q: "", sel: null };

// ---- tiny DOM helper ----
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const k in (attrs || {})) {
    if (k === "class") n.className = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; n.append(c.nodeType ? c : document.createTextNode(c)); }
  return n;
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const arr = (v) => Array.isArray(v) ? v : (typeof v === "string" && v.trim() ? [v] : []);
function hl(text, q) {
  const t = String(text == null ? "" : text);
  if (!q) return esc(t);
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(t);
  return esc(t.slice(0, i)) + "<mark>" + esc(t.slice(i, i + q.length)) + "</mark>" + esc(t.slice(i + q.length));
}
const htmlCard = (innerHtml) => el("section", { class: "card", html: innerHtml });
function list(items) { const ul = el("ul", { class: "tight" }); for (const it of arr(items)) ul.append(el("li", {}, it)); return ul; }

// ---- routing ----
function go(route) { state.route = route; state.sel = null; state.q = ""; searchEl.value = ""; location.hash = route; render(); }
window.addEventListener("hashchange", () => {
  const r = location.hash.replace("#", "");
  if (["asfa", "bloodprep", "coag", "reactions"].includes(r) && r !== state.route) { state.route = r; state.sel = null; render(); }
});
searchEl.addEventListener("input", () => { state.q = searchEl.value.trim(); state.sel = null; render(); });

function setNav() {
  document.querySelectorAll(".nav-item").forEach((a) =>
    a.classList.toggle("active", !state.q && a.dataset.route === state.route));
}

function render() {
  setNav();
  content.replaceChildren();
  content.scrollTo(0, 0);
  if (state.q.length >= 2) return renderSearch(state.q);
  if (state.sel) return state.sel();
  ({ asfa: renderASFA, bloodprep: renderBloodprep, coag: renderCoag, reactions: renderReactions }[state.route] || renderASFA)();
}

function head(title, sub) {
  content.append(el("header", { class: "page-head" }, el("h1", {}, title), sub ? el("p", {}, sub) : null));
}

// ================= ASFA =================
function catBadge(c) { return el("span", { class: "badge cat-" + (c || "").replace(/[^IV]/g, "") }, "Cat " + c); }
function gradeBadge(g) { return el("span", { class: "badge grade" }, g); }

function renderASFA() {
  head("🔄 ASFA apheresis indications", "Therapeutic apheresis categories (I–IV) and recommendation grades, per ASFA guidelines. Tap any condition for detail.");
  const a = KB.asfa || {};
  // legend
  const legend = el("section", { class: "card" }, el("h3", {}, "Category & grade key"));
  const lg = el("div", { class: "legend" });
  for (const c of ["I", "II", "III", "IV"]) lg.append(el("span", { class: "badge cat-" + c, title: (a.category_defs || {})[c] || "" }, "Cat " + c));
  legend.append(lg);
  const dl = el("dl", { class: "kvs" });
  for (const [k, v] of Object.entries(a.category_defs || {})) { dl.append(el("dt", {}, "Cat " + k)); dl.append(el("dd", {}, v)); }
  for (const [k, v] of Object.entries(a.grade_defs || {})) { dl.append(el("dt", {}, k)); dl.append(el("dd", {}, v)); }
  legend.append(dl);
  content.append(legend);

  const inds = arr(a.indications);
  content.append(el("p", { class: "muted" }, `${inds.length} indications`));
  const rows = el("div", { class: "rows" });
  for (const ind of inds) rows.append(asfaRow(ind, ""));
  content.append(rows);
}
function asfaRow(ind, q) {
  return el("div", { class: "row", onclick: () => { state.sel = () => asfaDetail(ind); render(); } },
    el("div", { class: "row-main" },
      el("div", { class: "row-title", html: hl(ind.disease, q) }),
      el("div", { class: "row-sub", html: hl([ind.indication, ind.procedure].filter(Boolean).join(" · "), q) })),
    el("div", { class: "row-badges" }, catBadge(ind.category), gradeBadge(ind.grade)));
}
function asfaDetail(ind) {
  const a = KB.asfa || {};
  content.append(el("button", { class: "back", onclick: () => go("asfa") }, "← All ASFA indications"));
  const card = el("section", { class: "card" });
  card.append(el("div", { class: "detail-head" }, el("h2", {}, ind.disease), catBadge(ind.category), gradeBadge(ind.grade)));
  const dl = el("dl", { class: "kvs" });
  const add = (k, v) => { if (v) { dl.append(el("dt", {}, k)); dl.append(el("dd", {}, v)); } };
  add("Indication", ind.indication);
  add("Procedure", ind.procedure);
  add("ASFA category", `${ind.category} — ${(a.category_defs || {})[ind.category] || ""}`);
  add("Recommendation grade", `${ind.grade} — ${(a.grade_defs || {})[ind.grade] || ""}`);
  if ((a.procedure_glossary || {})[ind.procedure]) add("Procedure note", a.procedure_glossary[ind.procedure]);
  add("ASFA reference", ind.page ? "Fact sheet p. " + ind.page : null);
  card.append(dl);
  content.append(card);
}

// ================= BLOOD PREP =================
function renderBloodprep() {
  head("🩸 Blood preparation for the OR", "Maximum Surgical Blood Ordering Schedule (institution-specific), antigen-negative donor frequencies, and Rh haplotype linkage.");
  const bp = KB.bloodprep || {};
  // MSBOS
  const sg = arr(bp.surgeries);
  const msbos = el("section", { class: "card" }, el("h2", {}, "MSBOS — surgical blood ordering"), el("p", { class: "muted" }, `${sg.length} procedures · T&S = type & screen, XM = crossmatch`));
  const rows = el("div", { class: "rows" });
  for (const s of sg.slice(0, 60)) rows.append(msbosRow(s, ""));
  msbos.append(rows);
  if (sg.length > 60) msbos.append(el("p", { class: "muted", style: "margin-top:10px" }, "Showing 60 — use search to find a specific procedure."));
  content.append(msbos);
  // antigens
  content.append(antigenCard(bp));
  // haplotypes note
  if (bp.rh_haplotypes) content.append(htmlCard(
    "<h2>Rh haplotype linkage</h2><p>D, C/c and E/e are inherited together as haplotypes (R⁰ Dce, R¹ DCe, R² DcE, r dce …), so the chance a donor is negative for a <em>combination</em> of Rh antigens is computed from haplotype frequencies — not by multiplying single-antigen rates. e.g. anti-c + anti-e is essentially impossible (needs Rᶻ/rʸ), far below the naive product.</p>"));
}
function approachPill(s) {
  if (s.approach === "xm") return el("span", { class: "badge pill sig" }, "XM " + (s.units || 0) + "u");
  if (s.approach === "ts") return el("span", { class: "badge pill ok" }, "T&S");
  return el("span", { class: "badge pill" }, "None");
}
function msbosRow(s, q) {
  return el("div", { class: "row" },
    el("div", { class: "row-main" },
      el("div", { class: "row-title", html: hl(s.name, q) }),
      el("div", { class: "row-sub", html: hl([s.group, s.division].filter(Boolean).join(" · "), q) })),
    el("div", { class: "row-badges" }, approachPill(s)));
}
function antigenCard(bp) {
  const card = el("section", { class: "card" }, el("h2", {}, "Antigen-negative donor frequency"), el("p", { class: "muted" }, "% of donors LACKING the antigen = compatible for a patient with that antibody."));
  const rows = el("div", { class: "rows" });
  for (const ag of arr(bp.antigens)) rows.append(antigenRow(ag, ""));
  card.append(rows);
  return card;
}
function antigenRow(ag, q) {
  const neg = ag.neg || {};
  return el("div", { class: "row" },
    el("div", { class: "row-main" },
      el("div", { class: "row-title", html: hl(ag.name + " (" + ag.code + ")", q) }),
      el("div", { class: "row-sub" }, (ag.system || "") + " · White " + (neg.white ?? "?") + "% · Black " + (neg.black ?? "?") + "% negative")),
    el("div", { class: "row-badges" }, ag.significant ? el("span", { class: "badge pill sig" }, "significant") : el("span", { class: "badge pill" }, "usually not sig")));
}

// ================= COAG CDS =================
function renderCoag() {
  head("🧪 Coagulation test CDS", "When each coagulation test is — and isn't — indicated, with pearls.");
  const tests = (KB.coag || {}).tests || {};
  for (const [name, t] of Object.entries(tests)) content.append(coagCard(name, t, ""));
}
function coagCard(name, t, q) {
  const card = el("section", { class: "card" }, el("h2", { html: hl(name, q) }));
  const split = el("div", { class: "split" });
  if (t.indicated) split.append(el("div", { class: "block yes" }, el("h4", {}, "Indicated"), list(t.indicated)));
  if (t.not_indicated) split.append(el("div", { class: "block no" }, el("h4", {}, "Not indicated / low yield"), list(t.not_indicated)));
  card.append(split);
  if (t.pearls) { card.append(el("h3", {}, "Pearls")); card.append(list(t.pearls)); }
  return card;
}

// ================= TRANSFUSION REACTIONS =================
const IMPUT_CLASS = { "Definite (certain)": "cat-IV", "Probable (likely)": "cat-III", "Possible": "cat-II", "Doubtful (unlikely)": "grade", "Ruled out (excluded)": "cat-I", "Not determined": "grade" };
const CERT_CLASS = { "Definitive": "cat-IV", "Probable": "cat-III", "Possible": "cat-II", "Not determined (Unknown)": "grade" };
function defList(pairs, cls) {
  const dl = el("dl", { class: "kvs" });
  for (const [k, v] of pairs) { dl.append(el("dt", {}, cls ? el("span", { class: "badge " + (cls(k) || "grade") }, k) : k)); dl.append(el("dd", {}, v)); }
  return dl;
}
function renderReactions() {
  head("⚠️ Transfusion reactions & biovigilance", "NHSN Hemovigilance / AABB / ISBT case definitions with Definitive / Probable / Possible criteria, severity grading, and imputability.");
  const r = KB.reactions || {};
  if (r._axes_note) content.append(el("section", { class: "card" }, el("div", { class: "block note" }, r._axes_note)));
  // 1) diagnostic certainty (how well the case meets the definition)
  content.append(el("section", { class: "card" }, el("h2", {}, "Diagnostic certainty — case definition"),
    defList(arr(r.diagnostic_certainty).map((l) => [l.level, l.desc]), (k) => CERT_CLASS[k])));
  // 2) severity
  content.append(el("section", { class: "card" }, el("h2", {}, "Severity grading"),
    defList(arr(r.severity).map((g) => [g.grade, g.desc]))));
  // 3) imputability (relatedness)
  content.append(el("section", { class: "card" }, el("h2", {}, "Imputability — relatedness to the transfusion"),
    defList(arr(r.imputability).map((l) => [l.level, l.desc]), (k) => IMPUT_CLASS[k])));
  // first steps
  if (r.general_workup) content.append(el("section", { class: "card" }, el("h2", {}, "Suspected reaction — first steps"), list(r.general_workup)));
  // reaction list
  content.append(el("p", { class: "muted" }, `${arr(r.reactions).length} reaction types — tap for the full case definition`));
  const rows = el("div", { class: "rows" });
  for (const rx of arr(r.reactions)) rows.append(reactionRow(rx, ""));
  content.append(rows);
  if (r.other_unknown) content.append(el("section", { class: "card" }, el("h3", {}, "Other / Unknown"), el("p", { class: "muted" }, r.other_unknown)));
}
function reactionRow(rx, q) {
  return el("div", { class: "row", onclick: () => { state.sel = () => reactionDetail(rx); render(); } },
    el("div", { class: "row-main" },
      el("div", { class: "row-title", html: hl(rx.name, q) }),
      el("div", { class: "row-sub", html: hl([rx.category, rx.onset].filter(Boolean).join(" · "), q) })),
    el("div", { class: "row-badges" }, el("span", { class: "badge pill" }, rx.acuity || ""), rx.frequency ? el("span", { class: "badge grade" }, rx.frequency) : null));
}
function reactionDetail(rx) {
  content.append(el("button", { class: "back", onclick: () => go("reactions") }, "← All transfusion reactions"));
  const card = el("section", { class: "card" });
  card.append(el("div", { class: "detail-head" }, el("h2", {}, rx.name),
    rx.acuity ? el("span", { class: "badge pill" }, rx.acuity) : null,
    rx.frequency ? el("span", { class: "badge grade" }, rx.frequency) : null));
  if (rx.definition) card.append(el("p", {}, rx.definition));
  const dl = el("dl", { class: "kvs" });
  const add = (k, v) => { if (v) { dl.append(el("dt", {}, k)); dl.append(el("dd", {}, v)); } };
  add("Category", rx.category); add("Onset", rx.onset); add("Mechanism", rx.mechanism);
  card.append(dl);
  if (rx.certainty) {
    card.append(el("h3", {}, "NHSN case definition — diagnostic certainty"));
    const c = rx.certainty, cert = el("div", { class: "certainty" });
    const lvl = (label, val, cls) => {
      const na = !val || val === "N/A";
      cert.append(el("div", { class: "cert" },
        el("span", { class: "badge " + (na ? "grade" : cls) }, label),
        el("span", { class: "cert-txt" + (na ? " muted" : "") }, na ? "Not applicable for this reaction" : val)));
    };
    lvl("Definitive", c.definitive, "cat-IV");
    lvl("Probable", c.probable, "cat-III");
    lvl("Possible", c.possible, "cat-II");
    card.append(cert);
  }
  const sec = (title, items, cls) => { if (arr(items).length) { card.append(el("h3", {}, title)); const u = list(items); if (cls) u.classList.add(cls); card.append(u); } };
  sec("Signs & symptoms", rx.signs);
  sec("Workup", rx.workup);
  sec("Management", rx.management);
  sec("Prevention", rx.prevention);
  if (rx.imputability_notes) { card.append(el("h3", {}, "Imputability note")); card.append(el("div", { class: "block note" }, rx.imputability_notes)); }
  content.append(card);
}

// ================= GLOBAL SEARCH =================
function matches(text, q) { return String(text == null ? "" : text).toLowerCase().includes(q.toLowerCase()); }
function anyMatch(q, ...fields) { return fields.some((f) => Array.isArray(f) ? f.some((x) => matches(x, q)) : matches(f, q)); }

function renderSearch(q) {
  head("Search", `Results for “${q}” across all modules`);
  let total = 0;
  const group = (title, nodes) => { if (nodes.length) { total += nodes.length; const sec = el("section", { class: "card" }, el("h2", {}, `${title} (${nodes.length})`)); const rows = el("div", { class: "rows" }); nodes.forEach((n) => rows.append(n)); sec.append(rows); content.append(sec); } };

  const asfa = arr((KB.asfa || {}).indications).filter((i) => anyMatch(q, i.disease, i.indication, i.procedure, i.category, i.grade)).slice(0, 40).map((i) => asfaRow(i, q));
  group("🔄 ASFA indications", asfa);

  const bp = KB.bloodprep || {};
  const surg = arr(bp.surgeries).filter((s) => anyMatch(q, s.name, s.group, s.division)).slice(0, 40).map((s) => msbosRow(s, q));
  group("🩸 MSBOS procedures", surg);
  const ags = arr(bp.antigens).filter((a) => anyMatch(q, a.name, a.code, a.system)).map((a) => antigenRow(a, q));
  group("🩸 Antigens", ags);

  const coag = Object.entries((KB.coag || {}).tests || {}).filter(([n, t]) => anyMatch(q, n, t.indicated, t.not_indicated, t.pearls)).map(([n, t]) => coagCard(n, t, q));
  if (coag.length) { total += coag.length; content.append(el("section", { class: "card" }, el("h2", {}, `🧪 Coag tests (${coag.length})`))); coag.forEach((c) => content.append(c)); }

  const rx = arr((KB.reactions || {}).reactions).filter((r) => anyMatch(q, r.name, r.category, r.definition, r.signs, r.mechanism)).map((r) => reactionRow(r, q));
  group("⚠️ Transfusion reactions", rx);

  if (!total) content.append(el("div", { class: "empty" }, `No matches for “${q}”.`));
}

// ---- boot ----
(function boot() {
  if (!window.KB || !Object.keys(KB).length) {
    content.append(el("div", { class: "empty" }, "Knowledge not loaded. Run build.py to generate kb.js, then reload."));
    return;
  }
  const r = location.hash.replace("#", "");
  if (["asfa", "bloodprep", "coag", "reactions"].includes(r)) state.route = r;
  render();
})();
