"use strict";
/* TM·Coag Reference — interactive static viewer over embedded guideline knowledge.
   No server, no network, no patient data. Reads window.KB (see kb.js). */

const KB = window.KB || {};
const content = document.getElementById("content");
const searchEl = document.getElementById("search");
const state = { route: "asfa", q: "", sel: null };
// module-local filters + the blood-prep calculator state
const flt = { asfaCat: "", asfaSys: "" };
const bp = { surgery: null, hgb: "", race: "other", abo: "", abs: new Set() };

// ---------- tiny DOM helper ----------
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const k in (attrs || {})) {
    if (k === "class") n.className = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
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
function list(items) { const ul = el("ul", { class: "tight" }); for (const it of arr(items)) ul.append(el("li", {}, it)); return ul; }
function defList(pairs, cls) {
  const dl = el("dl", { class: "kvs" });
  for (const [k, v] of pairs) { dl.append(el("dt", {}, cls ? el("span", { class: "badge " + (cls(k) || "grade") }, k) : k)); dl.append(el("dd", {}, v)); }
  return dl;
}
// a module toolbar: a live search box + optional chip rows; repaints `into` via paint(query)
function toolbar(placeholder, paint, chipRows) {
  const inp = el("input", { type: "search", class: "mod-search", placeholder, autocomplete: "off" });
  const results = el("div", {});
  const repaint = () => { results.replaceChildren(); paint(inp.value.trim(), results); };
  inp.addEventListener("input", repaint);
  const bar = el("div", { class: "toolbar" }, inp);
  const wrap = el("div", {}, bar, ...(chipRows ? chipRows(repaint) : []), results);
  repaint();
  return wrap;
}
function chip(label, active, onclick) {
  return el("button", { type: "button", class: "fchip" + (active ? " on" : ""), onclick }, label);
}

// ================= routing =================
function go(route) { state.route = route; state.sel = null; state.q = ""; searchEl.value = ""; location.hash = route; render(); }
window.addEventListener("hashchange", () => {
  const r = location.hash.replace("#", "");
  if (["asfa", "bloodprep", "coag", "reactions"].includes(r) && r !== state.route) { state.route = r; state.sel = null; render(); }
});
searchEl.addEventListener("input", () => { state.q = searchEl.value.trim(); state.sel = null; render(); });
function setNav() { document.querySelectorAll(".nav-item").forEach((a) => a.classList.toggle("active", !state.q && a.dataset.route === state.route)); }
function render() {
  setNav(); content.replaceChildren(); content.scrollTo(0, 0);
  if (state.q.length >= 2) return renderSearch(state.q);
  if (state.sel) return state.sel();
  ({ asfa: renderASFA, bloodprep: renderBloodprep, coag: renderCoag, reactions: renderReactions }[state.route] || renderASFA)();
}
function head(title, sub) { content.append(el("header", { class: "page-head" }, el("h1", {}, title), sub ? el("p", {}, sub) : null)); }

// ================= ASFA =================
const ASFA_SYS = [
  ["Neurologic", /encephal|myelitis|demyelinat|neuropath|neuritis|myasthen|guillain|cidp|sclerosis|neuromyelitis|pandas|rasmussen|stiff.person|lambert|chorea|paraprotein|cns|n-methyl|nmda|autoimmune enceph|polyradiculo|sydenham/i],
  ["Renal / GU", /renal|kidney|nephr|goodpasture|anti-gbm|glomerul|fsgs|hemolytic urem|\bhus\b|atyp.*hus|dialysis|focal segmental/i],
  ["Hematologic", /thrombotic|\bttp\b|thrombocytopenia|sickle|hyperviscos|hyperleuko|polycythemia|cryoglobulin|cold agglutin|hemolytic|aplastic|red cell|coagulation|microangiopath|\bhsct\b|hematopoietic|platelet|heparin|\bhit\b|waldenstrom|gammopath|myeloma|leukemia|erythrocyt|pure red/i],
  ["Rheum / Autoimmune", /lupus|\bsle\b|vasculitis|scleroderma|antiphospholipid|dermatomyositis|polymyositis|rheumatoid|behcet|sjogren|systemic sclerosis|iga vasculit|catastrophic/i],
  ["Dermatologic", /pemphig|dermatitis|psoriasis|scleromyxedema|toxic epidermal|cutaneous|\bctcl\b|epidermal necrolysis|atopic/i],
  ["Transplant / Cardiac", /transplant|rejection|desensitiz|cardiomyopath|cardiac|\bheart\b|\blung\b|graft/i],
  ["Metabolic / Lipid", /wilson|hypercholesterol|lipoprotein|refsum|phytanic|fabry|triglycerid|storage disease|familial/i],
  ["Infectious / Toxin", /sepsis|malaria|babesios|toxin|venom|poison|mushroom|infection|\bhiv\b/i],
  ["Endocrine", /thyroid|graves|thyrotox|diabet|hashimoto/i],
  ["Ophthalmic", /macular|retinopath|uveitis|optic/i],
  ["Hepatic / GI", /liver|hepatic|bowel|crohn|colitis|pancreatit|fulminant/i],
  ["Obstetric", /pregnan|hemolytic disease|maternal|rhd allo/i],
];
function asfaSystem(disease) { const d = disease || ""; for (const [name, re] of ASFA_SYS) if (re.test(d)) return name; return "Other"; }
function catBadge(c) { return el("span", { class: "badge cat-" + (c || "").replace(/[^IV]/g, "") }, "Cat " + c); }
function gradeBadge(g) { return el("span", { class: "badge grade" }, g); }

function renderASFA() {
  head("🔄 ASFA apheresis indications", "Search, filter by category (I–IV) or body system, and tap any condition for the full recommendation.");
  const a = KB.asfa || {};
  // legend (collapsible)
  content.append(el("details", { class: "card legend-card" },
    el("summary", {}, "Category & grade key"),
    defList([...Object.entries(a.category_defs || {}).map(([k, v]) => ["Cat " + k, v]), ...Object.entries(a.grade_defs || {}).map(([k, v]) => [k, v])])));
  const inds = arr(a.indications);
  const systems = [...new Set(inds.map((i) => asfaSystem(i.disease)))].sort();
  const paint = (q, into) => {
    let rows = inds.filter((i) => !flt.asfaCat || i.category === flt.asfaCat)
      .filter((i) => !flt.asfaSys || asfaSystem(i.disease) === flt.asfaSys)
      .filter((i) => !q || [i.disease, i.indication, i.procedure, i.category, i.grade].some((f) => String(f || "").toLowerCase().includes(q.toLowerCase())));
    into.append(el("p", { class: "muted" }, `${rows.length} indication${rows.length === 1 ? "" : "s"}`));
    const grid = el("div", { class: "cardgrid" });
    for (const ind of rows) grid.append(asfaCard(ind, q));
    into.append(rows.length ? grid : el("div", { class: "empty" }, "No matches."));
  };
  const chipRows = (repaint) => {
    const catRow = el("div", { class: "chiprow" }, el("span", { class: "chiplabel" }, "Category:"),
      chip("All", !flt.asfaCat, () => { flt.asfaCat = ""; repaint(); markChips(); }),
      ...["I", "II", "III", "IV"].map((c) => chip("Cat " + c, flt.asfaCat === c, () => { flt.asfaCat = flt.asfaCat === c ? "" : c; repaint(); markChips(); })));
    const sysRow = el("div", { class: "chiprow" }, el("span", { class: "chiplabel" }, "System:"),
      chip("All", !flt.asfaSys, () => { flt.asfaSys = ""; repaint(); markChips(); }),
      ...systems.map((s) => chip(s, flt.asfaSys === s, () => { flt.asfaSys = flt.asfaSys === s ? "" : s; repaint(); markChips(); })));
    function markChips() { /* chips re-rendered on next full render; cheap enough to repaint here */ }
    return [catRow, sysRow];
  };
  content.append(toolbar("Search ASFA conditions, indications…", paint, chipRows));
}
function asfaCard(ind, q) {
  return el("button", { type: "button", class: "tile", onclick: () => { state.sel = () => asfaDetail(ind); render(); } },
    el("div", { class: "tile-top" }, catBadge(ind.category), gradeBadge(ind.grade), el("span", { class: "badge pill" }, asfaSystem(ind.disease))),
    el("div", { class: "tile-title", html: hl(ind.disease, q) }),
    el("div", { class: "tile-sub", html: hl([ind.indication, ind.procedure].filter(Boolean).join(" · "), q) }));
}
function asfaDetail(ind) {
  const a = KB.asfa || {};
  content.append(el("button", { class: "back", onclick: () => go("asfa") }, "← All ASFA indications"));
  const card = el("section", { class: "card" });
  card.append(el("div", { class: "detail-head" }, el("h2", {}, ind.disease), catBadge(ind.category), gradeBadge(ind.grade), el("span", { class: "badge pill" }, asfaSystem(ind.disease))));
  const add = (k, v) => v ? [[k, v]] : [];
  card.append(defList([
    ...add("Indication", ind.indication),
    ...add("Procedure", ind.procedure),
    ...add("ASFA category", `${ind.category} — ${(a.category_defs || {})[ind.category] || ""}`),
    ...add("Recommendation grade", `${ind.grade} — ${(a.grade_defs || {})[ind.grade] || ""}`),
    ...add("Procedure note", (a.procedure_glossary || {})[ind.procedure]),
    ...add("ASFA reference", ind.page ? "Fact sheet p. " + ind.page : null),
  ]));
  content.append(card);
}

// ================= BLOOD PREP (interactive calculator) =================
const RH_SET = new Set(["D", "C", "c", "E", "e"]);
function negPct(ag, race) { const n = ag.neg || {}; const w = +n.white || 0, b = +n.black || 0; return race === "white" ? w : race === "black" ? b : Math.min(w, b); }
function rhNegFraction(targets, race) {
  const tg = targets.filter((a) => RH_SET.has(a));
  if (!tg.length) return 1;
  const rh = (KB.bloodprep || {}).rh_haplotypes; if (!rh) return 1;
  const fracFor = (table) => { let s = 0; for (const h of rh.haplotypes) { const ag = new Set(h.antigens); if (!tg.some((t) => ag.has(t))) s += Number(table[h.code] || 0); } return s * s; };
  if (rh.freq[race]) return fracFor(rh.freq[race]);
  return Math.min(...Object.values(rh.freq).map(fracFor));
}
function fmtPct(p) { if (p === 0) return "<0.1%"; if (p < 1) return (+p.toPrecision(2)) + "%"; return Math.round(p) + "%"; }
const HGB_RULES = {
  ge10: [0, 0, "Hemoglobin ≥10 g/dL — transfusion unlikely for most procedures."],
  "8to10": [0, 0, "Hemoglobin 8–9.9 g/dL — transfusion possible; keep a current type & screen."],
  "7to8": [1, 2, "Hemoglobin 7–7.9 g/dL — at/near the usual transfusion threshold; prepare units."],
  lt7: [2, 2, "Hemoglobin <7 g/dL — transfusion likely; ensure units are crossmatched and ready."],
};
function aboFraction(recipient, race) {
  const abo = (KB.bloodprep || {}).abo; if (!abo) return null;
  const groups = (abo.rbc_compatible || {})[recipient], freq = abo.freq || {};
  if (!groups || !Object.keys(freq).length) return null;
  const frac = (t) => groups.reduce((s, g) => s + Number(t[g] || 0), 0) / 100;
  if (freq[race]) return frac(freq[race]);
  const vals = Object.values(freq).map(frac);
  return vals.length ? Math.min(...vals) : null;
}
function computeBloodPrep() {
  const surgery = bp.surgery, race = bp.race || "other";
  const recipientAbo = bp.abo || "", aboFrac = recipientAbo ? aboFraction(recipientAbo, race) : null;
  const idx = Object.fromEntries((KB.bloodprep.antigens || []).map((a) => [a.code, a]));
  const chosen = [...bp.abs].map((c) => idx[c]).filter(Boolean);
  const significant = chosen.filter((a) => a.significant), nonSig = chosen.filter((a) => !a.significant);
  const findings = [], recs = [], caveats = [], flags = [];
  // 1) MSBOS baseline
  let baseUnits = 0;
  if (surgery) {
    if (surgery.approach === "none") findings.push(`${surgery.name}: no blood sample required (MSBOS).`);
    else if (surgery.approach === "ts") findings.push(`${surgery.name}: type & screen is usually sufficient (MSBOS).`);
    else { baseUnits = +surgery.units || 0; findings.push(`${surgery.name}: MSBOS suggests crossmatch ~${baseUnits} unit(s).`); }
  } else findings.push("No procedure selected — using type & screen baseline.");
  // 2) Hgb
  const [extra, forceTs, hgbNote] = HGB_RULES[bp.hgb] || [0, 0, ""];
  if (hgbNote) findings.push(hgbNote);
  let units = baseUnits + (baseUnits > 0 ? extra : 0);
  if (baseUnits === 0 && forceTs) units = forceTs;
  // 3) antibodies → compatible frequency (Rh linkage-aware)
  const sigRh = significant.filter((a) => RH_SET.has(a.code)), sigOther = significant.filter((a) => !RH_SET.has(a.code));
  let combined = 1; for (const a of sigOther) combined *= negPct(a, race) / 100;
  let rhLink = null;
  if (sigRh.length === 1) combined *= negPct(sigRh[0], race) / 100;
  else if (sigRh.length >= 2) {
    const codes = sigRh.map((a) => a.code); const frac = rhNegFraction(codes, race);
    let naive = 1; for (const a of sigRh) naive *= negPct(a, race) / 100;
    combined *= frac; rhLink = { frac, naive, codes };
  }
  if (nonSig.length) caveats.push(`${nonSig.map((a) => a.name).join(", ")}: usually not clinically significant — antigen-negative units generally not required unless reactive at 37 °C / AHG. Confirm clinical significance.`);
  let unitsToPrepare, combinedPct, unitsToScreen, combinedAllPct = null, unitsToScreenRandom = null;
  if (significant.length) {
    const ags = significant.map((a) => a.name.replace("Anti-", "")).join(", ");
    unitsToPrepare = Math.max(units, 2);
    combinedPct = combined * 100;
    unitsToScreen = combined > 0 ? Math.ceil(unitsToPrepare / combined) : null;
    findings.push(`Significant alloantibody(ies) present — units must be antigen-negative for: ${ags}.`);
    recs.push(`Crossmatch ${unitsToPrepare} antigen-negative unit(s) (negative for ${ags}); confirm AHG-crossmatch compatible.`);
    if (significant.length > 1) findings.push(`Combined, ~${fmtPct(combinedPct)} of random donors are compatible for all antibodies.`);
    if (rhLink) findings.push(`Rh antigens are inherited as linked haplotypes (R⁰/R¹/R²/r), so the combined Rh-negative frequency is derived from haplotype frequencies: ~${fmtPct(rhLink.frac * 100)} of donors are negative for ${rhLink.codes.join("/")} — not ~${fmtPct(rhLink.naive * 100)} that naively multiplying the single-antigen rates would suggest.`);
    if (unitsToScreen != null) recs.push(`Expect to screen ~${unitsToScreen} donor unit(s) to find ${unitsToPrepare} compatible (combined antigen-negative frequency ~${fmtPct(combinedPct)}).`);
    else flags.push("No compatible donors by these frequencies — reference lab / rare-donor program required.");
    // ABO layer: recipient's group limits the donor pool (RBC compatibility); ABO is
    // independent of the other systems, so it multiplies the antigen-negative frequency.
    if (recipientAbo && aboFrac != null && aboFrac < 1) {
      const combinedAll = combined * aboFrac;
      combinedAllPct = combinedAll * 100;
      unitsToScreenRandom = combinedAll > 0 ? Math.ceil(unitsToPrepare / combinedAll) : null;
      findings.push(`Recipient is group ${recipientAbo} — only ~${fmtPct(aboFrac * 100)} of random donors are ABO-compatible, so fully compatible (ABO + antigen-negative) ≈ ${fmtPct(combinedAllPct)} of all random donors` + (unitsToScreenRandom != null ? `; expect to screen ~${unitsToScreenRandom} random unit(s) (vs ~${unitsToScreen} within ABO-matched inventory).` : " — reference lab / rare-donor program required."));
      if (recipientAbo === "O" && combinedAllPct < 5) flags.push("Group-O recipient with a hard-to-match antibody — the ABO restriction compounds the rarity; involve the reference lab / rare-donor registry early.");
    }
    if (significant.some((a) => a.high_incidence) || combinedPct < 5) flags.push("VERY rare compatibility (high-incidence antigen or <5% compatible) — involve the blood-bank reference lab and rare-donor registry; allow lead time; consider autologous/family units.");
    else if (combinedPct < 15) flags.push("Limited compatible inventory (<15%) — notify the blood bank early and allow extra lead time.");
    caveats.push("Give antigen-negative units for clinically significant antibodies even if the current screen/titer is negative (anamnestic risk).");
  } else {
    unitsToPrepare = units; combinedPct = 100; unitsToScreen = units;
    recs.push(unitsToPrepare > 0 ? `Crossmatch ${unitsToPrepare} unit(s).` : "Type & screen only; no units need to be crossmatched up front.");
  }
  const approach = unitsToPrepare === 0 ? "Type & screen" : `Crossmatch ${unitsToPrepare} unit(s)`;
  return { approach, unitsToPrepare, unitsToScreen, combinedPct, recipientAbo, aboCompatiblePct: (recipientAbo && aboFrac != null) ? aboFrac * 100 : null, combinedAllPct, unitsToScreenRandom, perAntibody: chosen.map((a) => ({ name: a.name, code: a.code, system: a.system, pct: negPct(a, race), significant: !!a.significant })), findings, recs, caveats, flags, rhLink };
}
function renderBloodprep() {
  head("🩸 Blood preparation for the OR", "Pick a procedure, set hemoglobin & ancestry, then click the antibodies — the compatible-donor frequency accounts for Rh haplotype linkage.");
  const data = KB.bloodprep || {};
  const result = el("section", { class: "card result-card" });
  const repaint = () => { result.replaceChildren(); paintResult(result); };

  // --- procedure picker (searchable) ---
  const pick = el("section", { class: "card" }, el("h2", {}, "1 · Procedure (MSBOS)"));
  const chosen = el("div", { class: "chosen-surgery" });
  const renderChosen = () => { chosen.replaceChildren(bp.surgery
    ? el("div", { class: "chosen" }, el("strong", {}, bp.surgery.name), " ", approachPill(bp.surgery), el("button", { class: "chip-x", title: "clear", onclick: () => { bp.surgery = null; renderChosen(); repaint(); } }, "×"))
    : el("span", { class: "muted" }, "No procedure selected (type & screen baseline).")); };
  pick.append(chosen);
  pick.append(toolbar("Search procedures (e.g. hysterectomy, CABG, craniotomy)…", (q, into) => {
    if (!q) { into.append(el("p", { class: "muted" }, "Type to find a procedure…")); return; }
    const rows = arr(data.surgeries).filter((s) => [s.name, s.group, s.division].some((f) => String(f || "").toLowerCase().includes(q.toLowerCase()))).slice(0, 30);
    const box = el("div", { class: "rows" });
    for (const s of rows) box.append(el("div", { class: "row", onclick: () => { bp.surgery = s; renderChosen(); repaint(); } },
      el("div", { class: "row-main" }, el("div", { class: "row-title", html: hl(s.name, q) }), el("div", { class: "row-sub" }, [s.group, s.division].filter(Boolean).join(" · "))),
      el("div", { class: "row-badges" }, approachPill(s))));
    into.append(rows.length ? box : el("div", { class: "empty" }, "No procedure matches."));
  }));
  renderChosen();
  content.append(pick);

  // --- context: Hgb + race ---
  const ctx = el("section", { class: "card" }, el("h2", {}, "2 · Context"));
  const hgbRow = el("div", { class: "chiprow" }, el("span", { class: "chiplabel" }, "Hemoglobin:"),
    chip("—", !bp.hgb, () => { bp.hgb = ""; sync(); }), ...arr(data.hgb_bands).map((b) => chip(b.label, bp.hgb === b.value, () => { bp.hgb = b.value; sync(); })));
  const raceRow = el("div", { class: "chiprow" }, el("span", { class: "chiplabel" }, "Ancestry:"),
    ...arr(data.races).map((r) => chip(r.label, bp.race === r.value, () => { bp.race = r.value; sync(); })));
  const aboRow = el("div", { class: "chiprow" }, el("span", { class: "chiplabel" }, "Recipient ABO:"),
    chip("—", !bp.abo, () => { bp.abo = ""; sync(); }),
    ...["O", "A", "B", "AB"].map((g) => chip(g, bp.abo === g, () => { bp.abo = bp.abo === g ? "" : g; sync(); })));
  ctx.append(hgbRow, raceRow, aboRow);
  content.append(ctx);

  // --- antibodies (clickable boxes grouped by system) ---
  const abCard = el("section", { class: "card" }, el("h2", {}, "3 · Alloantibodies present"), el("p", { class: "muted" }, "Click each antibody the patient has. Rh antigens (D/C/c/E/e) are computed via haplotype linkage when 2+ are selected."));
  const groups = {};
  for (const ag of arr(data.antigens)) (groups[ag.system] = groups[ag.system] || []).push(ag);
  for (const sys of Object.keys(groups)) {
    const row = el("div", { class: "abgroup" }, el("span", { class: "chiplabel" }, sys + ":"));
    for (const ag of groups[sys]) row.append(el("button", { type: "button", class: "abchip" + (bp.abs.has(ag.code) ? " on" : "") + (ag.significant ? "" : " minor"), title: `${negPct(ag, bp.race)}% antigen-negative`, onclick: (e) => { bp.abs.has(ag.code) ? bp.abs.delete(ag.code) : bp.abs.add(ag.code); e.currentTarget.classList.toggle("on"); repaint(); } }, ag.name.replace("Anti-", "anti-")));
    abCard.append(row);
  }
  content.append(abCard);

  // --- live result ---
  function sync() { render(); }   // full re-render (clears content first) to reflect chip states
  paintResult(result);
  content.append(result);

  function paintResult(into) {
    const r = computeBloodPrep();
    into.append(el("h2", {}, "Recommendation"));
    const sig = r.perAntibody.some((a) => a.significant);
    const kpiNodes = [
      kpi(r.approach, "approach"),
      kpi(r.unitsToPrepare, r.unitsToPrepare === 1 ? "unit to prepare" : "units to prepare"),
    ];
    if (sig) kpiNodes.push(kpi(fmtPct(r.combinedPct), "antigen-neg (within ABO inv.)"));
    if (sig && r.unitsToScreen != null) kpiNodes.push(kpi("~" + r.unitsToScreen, "units to screen"));
    if (r.combinedAllPct != null) {
      kpiNodes.push(kpi(fmtPct(r.aboCompatiblePct), "ABO-compatible (grp " + r.recipientAbo + ")"));
      kpiNodes.push(kpi(fmtPct(r.combinedAllPct), "of ALL random donors"));
      if (r.unitsToScreenRandom != null) kpiNodes.push(kpi("~" + r.unitsToScreenRandom, "random units to screen"));
    }
    into.append(el("div", { class: "kpis" }, kpiNodes));
    if (r.perAntibody.length) {
      const t = el("div", { class: "rows" });
      for (const a of r.perAntibody) t.append(el("div", { class: "row" }, el("div", { class: "row-main" }, el("div", { class: "row-title" }, a.name), el("div", { class: "row-sub" }, a.system)),
        el("div", { class: "row-badges" }, el("span", { class: "badge " + (a.significant ? "pill sig" : "pill") }, fmtPct(a.pct) + " neg"))));
      into.append(el("h3", {}, "Antibodies"), t);
    }
    for (const f of r.flags) into.append(el("div", { class: "block no", style: "margin-top:10px" }, "⚑ " + f));
    if (r.recs.length) { into.append(el("h3", {}, "Plan")); into.append(list(r.recs)); }
    if (r.findings.length) { into.append(el("h3", {}, "Reasoning")); into.append(list(r.findings)); }
    if (r.caveats.length) { into.append(el("h3", {}, "Notes")); into.append(list(r.caveats)); }
    into.append(el("p", { class: "tiny muted" }, "Decision support only. MSBOS is institution-specific; antigen frequencies are population estimates. The blood bank / pathologist remains the final decision-maker."));
  }
}
function approachPill(s) {
  if (s.approach === "xm") return el("span", { class: "badge pill sig" }, "XM " + (s.units || 0) + "u");
  if (s.approach === "ts") return el("span", { class: "badge pill ok" }, "T&S");
  return el("span", { class: "badge pill" }, "None");
}
function kpi(value, label) { return el("div", { class: "kpi" }, el("div", { class: "kpi-val" }, value), el("div", { class: "kpi-lab" }, label)); }

// ================= COAG CDS =================
function renderCoag() {
  head("🧾 Coag Reporter", "Build a coagulation interpretation report with clickable buttons. The test-indication CDS reference is below.");
  content.append(el("section", { class: "card reporter-embed" },
    el("iframe", { src: "CoagReporter.html", class: "reporter-frame", title: "Coag Reporter" }),
    el("p", { class: "tiny muted", style: "margin:8px 4px 0" }, "Running inside the dashboard. ",
      el("a", { href: "CoagReporter.html", target: "_blank", rel: "noopener" }, "Open full-screen ↗"))));
  // CDS test-indication reference (collapsed)
  const tests = (KB.coag || {}).tests || {};
  const det = el("details", { class: "card legend-card" }, el("summary", {}, `Coagulation test CDS — when each test is / isn't indicated (${Object.keys(tests).length} tests)`));
  det.append(toolbar("Search coagulation tests…", (q, into) => {
    const rows = Object.entries(tests).filter(([n, t]) => !q || [n, t.indicated, t.not_indicated, t.pearls].some((f) => JSON.stringify(f || "").toLowerCase().includes(q.toLowerCase())));
    into.append(el("p", { class: "muted" }, `${rows.length} test${rows.length === 1 ? "" : "s"}`));
    for (const [name, t] of rows) into.append(coagCard(name, t, q));
    if (!rows.length) into.append(el("div", { class: "empty" }, "No matching test."));
  }));
  content.append(det);
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
function renderReactions() {
  head("⚠️ Transfusion reactions & biovigilance", "NHSN / AABB / ISBT case definitions with Definitive / Probable / Possible criteria, severity, and imputability. Search, or tap a reaction.");
  const r = KB.reactions || {};
  // the three NHSN axes, as reference cards
  content.append(el("details", { class: "card legend-card" },
    el("summary", {}, "The three NHSN axes (certainty · severity · imputability) — overview"),
    r._axes_note ? el("div", { class: "block note" }, r._axes_note) : null,
    el("h3", {}, "Diagnostic certainty — case definition"), defList(arr(r.diagnostic_certainty).map((l) => [l.level, l.desc]), (k) => CERT_CLASS[k]),
    el("h3", {}, "Severity"), defList(arr(r.severity).map((g) => [g.grade, g.desc])),
    el("h3", {}, "Imputability — relatedness"), defList(arr(r.imputability).map((l) => [l.level, l.desc]), (k) => IMPUT_CLASS[k])));
  if (r.general_workup) content.append(el("section", { class: "card" }, el("h2", {}, "Suspected reaction — first steps"), list(r.general_workup)));
  content.append(toolbar("Search reactions (e.g. TACO, fever, hypotension)…", (q, into) => {
    const rows = arr(r.reactions).filter((rx) => !q || [rx.name, rx.category, rx.definition, rx.onset, rx.signs, rx.mechanism].some((f) => JSON.stringify(f || "").toLowerCase().includes(q.toLowerCase())));
    into.append(el("p", { class: "muted" }, `${rows.length} reaction type${rows.length === 1 ? "" : "s"} — tap for the full case definition`));
    const grid = el("div", { class: "cardgrid" });
    for (const rx of rows) grid.append(reactionCard(rx, q));
    into.append(rows.length ? grid : el("div", { class: "empty" }, "No matching reaction."));
  }));
  if (r.other_unknown) content.append(el("section", { class: "card" }, el("h3", {}, "Other / Unknown"), el("p", { class: "muted" }, r.other_unknown)));
}
function reactionCard(rx, q) {
  return el("button", { type: "button", class: "tile", onclick: () => { state.sel = () => reactionDetail(rx); render(); } },
    el("div", { class: "tile-top" }, el("span", { class: "badge pill" }, rx.category || ""), rx.acuity ? el("span", { class: "badge grade" }, rx.acuity) : null, rx.frequency ? el("span", { class: "badge pill" }, rx.frequency) : null),
    el("div", { class: "tile-title", html: hl(rx.name, q) }),
    el("div", { class: "tile-sub", html: hl(rx.onset || "", q) }));
}
function sevClass(g) { return /Grade 1/.test(g) ? "cat-I" : /Grade 2/.test(g) ? "cat-III" : /Grade [34]/.test(g) ? "cat-IV" : "grade"; }
function axis2(rows, clsFn) {
  const t = el("div", { class: "axis2" });
  for (const [k, v] of rows) t.append(el("div", { class: "axis2-row" }, el("span", { class: "axis2-k badge " + (clsFn ? (clsFn(k) || "grade") : "grade") }, k), el("span", { class: "axis2-v" }, v)));
  return t;
}
function reactionDetail(rx) {
  const R = KB.reactions || {};
  content.append(el("button", { class: "back", onclick: () => go("reactions") }, "← All transfusion reactions"));
  const card = el("section", { class: "card" });
  card.append(el("div", { class: "detail-head" }, el("h2", {}, rx.name), rx.acuity ? el("span", { class: "badge pill" }, rx.acuity) : null, rx.frequency ? el("span", { class: "badge grade" }, rx.frequency) : null));
  if (rx.definition) card.append(el("p", {}, rx.definition));
  card.append(defList([["Category", rx.category], ["Onset", rx.onset], ["Mechanism", rx.mechanism]].filter(([, v]) => v)));

  // ① Diagnostic certainty — 3-column case-definition table (NHSN)
  if (rx.certainty) {
    card.append(el("h3", {}, "① Diagnostic certainty — NHSN case definition"));
    const c = rx.certainty, grid = el("div", { class: "cert3" });
    for (const [label, val, cls] of [["Definitive", c.definitive, "cat-IV"], ["Probable", c.probable, "cat-III"], ["Possible", c.possible, "cat-II"]]) {
      const na = !val || val === "N/A";
      grid.append(el("div", { class: "cert3-col" + (na ? " na" : "") },
        el("div", { class: "cert3-head " + cls }, label),
        el("div", { class: "cert3-body" + (na ? " muted" : "") }, na ? "Not applicable for this reaction" : val)));
    }
    card.append(grid);
  }
  // ② Severity grading
  card.append(el("h3", {}, "② Severity grading"));
  card.append(axis2(arr(R.severity).map((g) => [g.grade, g.desc]), sevClass));
  // ③ Imputability — relatedness
  card.append(el("h3", {}, "③ Imputability — relatedness to the transfusion"));
  card.append(axis2(arr(R.imputability).map((l) => [l.level, l.desc]), (k) => IMPUT_CLASS[k]));
  if (rx.imputability_notes) card.append(el("div", { class: "block note", style: "margin-top:8px" }, "Imputability note — " + rx.imputability_notes));

  // clinical detail
  const sec = (title, items) => { if (arr(items).length) { card.append(el("h3", {}, title)); card.append(list(items)); } };
  sec("Signs & symptoms", rx.signs); sec("Workup", rx.workup); sec("Management", rx.management); sec("Prevention", rx.prevention);
  content.append(card);
}

// ================= GLOBAL SEARCH =================
function matches(text, q) { return JSON.stringify(text == null ? "" : text).toLowerCase().includes(q.toLowerCase()); }
function renderSearch(q) {
  head("Search", `Results for “${q}” across all modules`);
  let total = 0;
  const group = (title, nodes) => { if (nodes.length) { total += nodes.length; const grid = el("div", { class: "cardgrid" }); nodes.forEach((n) => grid.append(n)); content.append(el("section", { class: "card" }, el("h2", {}, `${title} (${nodes.length})`)), grid); } };
  group("🔄 ASFA indications", arr((KB.asfa || {}).indications).filter((i) => [i.disease, i.indication, i.procedure, i.category, i.grade].some((f) => matches(f, q))).slice(0, 40).map((i) => asfaCard(i, q)));
  const bpData = KB.bloodprep || {};
  group("🩸 MSBOS procedures", arr(bpData.surgeries).filter((s) => [s.name, s.group, s.division].some((f) => matches(f, q))).slice(0, 40).map((s) => el("button", { type: "button", class: "tile", onclick: () => go("bloodprep") }, el("div", { class: "tile-top" }, approachPill(s)), el("div", { class: "tile-title", html: hl(s.name, q) }), el("div", { class: "tile-sub" }, [s.group, s.division].filter(Boolean).join(" · ")))));
  const coag = Object.entries((KB.coag || {}).tests || {}).filter(([n, t]) => matches(n, q) || matches(t, q)).map(([n, t]) => coagCard(n, t, q));
  if (coag.length) { total += coag.length; content.append(el("section", { class: "card" }, el("h2", {}, `🧪 Coag tests (${coag.length})`))); coag.forEach((c) => content.append(c)); }
  group("⚠️ Transfusion reactions", arr((KB.reactions || {}).reactions).filter((rx) => [rx.name, rx.category, rx.definition, rx.signs, rx.mechanism].some((f) => matches(f, q))).map((rx) => reactionCard(rx, q)));
  if (!total) content.append(el("div", { class: "empty" }, `No matches for “${q}”.`));
}

// ---------- boot ----------
(function boot() {
  if (!window.KB || !Object.keys(KB).length) { content.append(el("div", { class: "empty" }, "Knowledge not loaded. Run build.py to generate kb.js, then reload.")); return; }
  const r = location.hash.replace("#", "");
  if (["asfa", "bloodprep", "coag", "reactions"].includes(r)) state.route = r;
  render();
})();
