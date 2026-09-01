# spanska8 — Victor's Spanish trainer

Static web app (no build step). `index.html` loads three scripts in order:
`data.js` → `data-kb.js` → `app.js`. All logic reads `DATA.areas`.

## Two sources of vocab — keep them separate

1. **`data.js`** — hand-curated thematic areas (Färger, Veckodagar…). **Edit
   directly** to fix or add curated content. Format: `{ es, sv }` inside
   `words:` / `sentences:` arrays.
2. **`data-kb.js`** — **AUTO-GENERATED, never edit by hand.** Built from
   Victor's KB files `~/victor-kb/school/spanska/vocab_*.md`, one area per file.
   It `push`es its areas onto `DATA.areas`, so `data.js` is never touched by the
   sync.

## Adding Spanish words

- **From Victor's KB:** add/edit a `~/victor-kb/school/spanska/vocab_*.md` file.
  Line format: `- **spanska**: svenska`. First `# heading` becomes the area
  name; `*Datum: YYYY-MM-DD*` is shown in the description. The sync cron picks
  it up automatically (see below), or run it now:
  `python3 ~/.hermes/profiles/2-victor/scripts/spanska-kb-gen.py`
- **Directly in the app:** edit `data.js`.

## After ANY change — always

```bash
cd ~/repos/spanska8
node run-tests.mjs          # must print "... 0 failed" (exit 0)
git add -A && git commit -m "..." && git push
```

Changes only appear in the live app after **commit + push** to
`git@github.com:acke/spanska8.git`.

## Automatic KB → app sync

A `no_agent` cron on the **2-victor** profile runs
`scripts/spanska-kb-sync.sh`: regenerates `data-kb.js`, and if it changed, runs
the tests and commits + pushes. If nothing changed it stays silent. So new KB
vocab flows to the app on its own; you only need the manual steps above when
editing `data.js` by hand.
