# GitFit — notes for Claude

## What this is

GitFit is a personal gym tracker for one person (Rex), used mainly on an **iPhone in Safari, added to the home screen** as a web app. You plan a weekly split (one day per weekday), log sets during a workout, and see progress: an exercise log with estimated max graph and calendar, and a front/back muscle map (Growth and Level modes).

The user is not a programmer. Explain changes in plain words, keep the code simple and well commented, and test changes in the browser before calling them done.

## Tech and file structure

Plain HTML, CSS and JavaScript. **No build step, no framework, no npm, no server, no accounts.** Every JS file is a plain `<script>` that defines globals (`Store`, `Units`, `Library`, `Stats`, `Views`, …).

```
index.html        Page shell: top bar, empty <main id="app">, tab bar, and the <script> tags
manifest.json     Home-screen "install" info
css/styles.css    All styling; colors are tokens under :root
js/library.js     Muscle catalog (MUSCLE_GROUPS), EQUIPMENT, built-in exercise LIBRARY, search
js/storage.js     ALL saving/loading (localStorage), data shape, upgrades (normalize), export/import, estimateMax
js/units.js       Converts saved units (lbs, inches) to/from the shown unit
js/standards.js   Strength standards from strengthlevel.com for the map's Level mode
js/stats.js       Per-muscle numbers: growth, levels, planned sets
js/bodymap.js     Muscle map drawing and colors
js/tabs.js        Bottom tab bar (Workouts, Profile); shows only on each tab's main screen
js/views.js       Builds each screen's HTML; each returns { title, back, html }
js/app.js         Routing by URL hash (#/, #/day/<id>, #/profile, #/settings, #/log, …) and event handling
README.md         User-facing guide; keep it up to date when you change structure or behavior
```

Rule of thumb: **storage.js** knows about data, **views.js** knows about HTML, **app.js** connects them.

**Script order in `index.html` matters**: library → storage → units → standards → stats → bodymap → tabs → views → app. A new file goes where its dependencies are already loaded.

## How data is saved

- Everything is one JSON object in the browser's `localStorage` under the key **`gitfit-data`** (`STORAGE_KEY` in `storage.js`). It lives only on that device and that browser — the phone's data and the computer's data are separate.
- The data shape is documented in the comment at the top of `storage.js`: `version`, `settings`, `customExercises`, `days` (always 7, Monday = 0), `sessions` (finished workouts, oldest first), `draft` (workout in progress, saved on every keystroke).
- Only `storage.js` reads or writes `localStorage`. Other files go through `Store`.
- **Changing the data shape**: bump `DATA_VERSION` and add an upgrade step in `normalize()` so older saved data (and old backup files) still load. Never drop or rename saved fields without migrating them. Update the shape comment at the top of `storage.js`.
- Muscle ids and exercise ids (`refId`) are saved in user data. **Never rename or remove an existing id** without a migration (see `RENAMED_MUSCLES` for how a rename was handled). Adding new ones is fine.
- Finished sessions copy in each exercise's name and muscles so history stays right if the exercise changes later.
- Backup = Settings → Export (JSON file) / Import (`Store.exportBackup()` / `importBackup()`). Imports run through `normalize()` too.

## Key rules

- **Weights are stored in one unit (lbs) and converted for display.** Heights are stored in inches. The Units setting only changes what's shown. Always use `Units.showWeight()` / `Units.readWeight()` (and the height equivalents) when showing or reading a weight — never save kg.
- **Dumbbell weights are per dumbbell** (the weight of one dumbbell, not both added together). The strength standards in `standards.js` are per dumbbell too; barbell weights include the bar.
- **Estimated max uses the Epley formula**: `weight × (1 + reps ÷ 30)` — `estimateMax()` in `storage.js`. Sets with no weight (bodyweight) or no reps have no estimate. Use this function everywhere; don't add a second formula.
- **Muscle list and set counting**: the muscle catalog is `MUSCLE_GROUPS` in `library.js`:
  - Chest: upper chest, mid chest, lower chest
  - Shoulders: front delts, side delts, rear delts
  - Back: lats, upper back, traps, lower back
  - Arms: biceps, brachialis, triceps
  - Forearms: brachioradialis, forearm flexors, forearm extensors
  - Core: abs, obliques
  - Legs: quads, hamstrings, glutes, adductors, calves

  Each exercise has **primary** muscles (each set counts as **1 set**) and **secondary** muscles (each set counts as **0.5 set**). A muscle can't be both primary and secondary on one exercise.
- **Test data must never be written into the code.** No demo/sample workouts, fake sessions, or seeded user data in any committed file (an earlier `js/demo-data.js` was removed for this reason; `normalize()` still drops any session marked `demo: true`). Test by entering data in the app on the computer, or with a temporary console snippet that isn't committed. Defaults like an empty week are fine.
- **The computer is the dev version; GitHub Pages is the live version.** The live app is https://stevenrecks08.github.io/GITFIT/ (repo `stevenrecks08/GITFIT`, branch `main`). Whatever is pushed to `main` goes live on the phone.
- **Commit automatically after every finished change, without asking.** Use a short, clear commit message.
- **Never push to GitHub unless the user explicitly tells you to** in that message. Don't offer or keep asking to push.
- **Before any push that changes how data is saved** (data shape, `DATA_VERSION`, `normalize()`, ids, storage key, units stored), **remind the user to back up their phone data first** (Settings → Export on the phone) and wait for them to confirm.

## Avoiding breakage

- Test in a browser on the computer: open `index.html` (or a local server), use phone-size device emulation, and check the screens you touched. Check the browser console for errors.
- Design for iPhone Safari: touch targets, the `inputmode="decimal"` keyboards, safe areas / status bar (see the comments in `index.html` about `black` vs `black-translucent`), and numbers typed with a comma (`parseNumber()` handles `62,5`).
- New screens: a function in `views.js` returning `{ title, back, html }` plus a route in `app.js`. New tabs: `TABS` in `tabs.js`. New settings: default in `DEFAULT_SETTINGS`, a field in `Views.settings()`, and a line in `saveSettingsForm()` in `app.js`.
- New built-in exercises: add a line to `LIBRARY` in `library.js` using existing muscle ids; add standards in `standards.js` only from the published source.
- Keep code style consistent with the existing files: plain functions and objects, comments explaining "why" in plain English.
- Git is at `C:\Program Files\Git\cmd\git.exe`. Pushing needs a GitHub sign-in prompt, so when the user asks for a push, run `git push` in their Terminal panel rather than a background shell.
