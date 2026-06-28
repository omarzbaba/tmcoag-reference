# TM·Coag Reference

A **static, offline, read-only** quick-reference for transfusion medicine & coagulation:

- **🔄 ASFA apheresis** — 166 indications with category (I–IV) and recommendation grade, plus the category/grade key.
- **🩸 Blood prep (OR)** — MSBOS surgical blood-ordering schedule, antigen-negative donor frequencies, and the Rh haplotype-linkage note.
- **🧪 Coag CDS** — when each coagulation test is / isn't indicated, with pearls.
- **⚠️ Transfusion reactions** — CDC NHSN Hemovigilance / AABB / ISBT case definitions for 13 reaction types, with the **imputability** scale and severity grading.

One global search box covers all four modules.

> **No patient data.** This tool contains only published/curated guideline knowledge. The build (`build.py`) reads *only* the project's `knowledge/` files and refuses anything with patient-data keys — the app's `data/` directory is never touched.
>
> Educational reference only. Institution policy and the blood bank medical director / treating physician remain the final decision-makers. The MSBOS is institution-specific — verify against current policy.

## Open it

- **Easiest:** double-click **`tmcoag-reference.html`** — one self-contained file, works offline, nothing to install.
- **Dev / multi-file:** open `index.html` (loads `styles.css`, `kb.js`, `app.js`).

## Rebuild (after editing the source guidelines)

```bash
python3 build.py
```

Regenerates `kb.js` and `tmcoag-reference.html` from the source knowledge at
`../tm-coag-logger/tmcoag/knowledge/` (override with `TMCOAG_KNOWLEDGE=/path`).

## Share it privately (no public exposure)

Free GitHub Pages is always public, so to keep it private:

1. **Private repo + invite** *(recommended)* — create a **private** GitHub repo, push this folder, and add the colleagues as collaborators (Settings → Collaborators). They click the repo link → **Code ▸ Download ZIP** (or clone) → open `tmcoag-reference.html`. Updates: re-push; they re-download.
2. **Just send the file** — e-mail / share `tmcoag-reference.html`. It's self-contained and opens offline. Simplest, but no version history.
3. **Serve over Tailscale** — host alongside the TM·Coag Logger on the private tailnet (requires the colleagues to be on the tailnet).

To create the private repo (once you're ready):

```bash
cd ~/Projects/tmcoag-reference
git init && git add -A && git commit -m "TM·Coag reference site"
gh repo create tmcoag-reference --private --source=. --push
gh repo edit --add-collaborator <github-username>   # for each colleague
```

## Files

| File | Purpose |
|---|---|
| `tmcoag-reference.html` | **the shareable artifact** — everything inlined, offline |
| `index.html` / `styles.css` / `app.js` | multi-file source |
| `kb.js` | generated embedded knowledge (do not edit) |
| `build.py` | regenerates `kb.js` + the single file from source knowledge |
