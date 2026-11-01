# GitFit — notes for Claude

## What this is

GitFit is a personal gym tracker for one person (Rex), used mainly on an **iPhone in Safari, added to the home screen** as a web app. You create workouts (title + exercises), each assigned to a weekday (any number per day), log sets during a workout (and can swap an exercise for today only), and see progress:
- **Workouts tab:** the week Monday → Sunday (the same 7-day week, not a flip-through calendar) with each day's workouts; a + button (bottom right) to create a workout; tap a workout to start it on any day; hold and drag it to another day; tap a day's switch (iPhone-style; on = training day with a dumbbell in the knob, off = rest day with a moon; asks first) to make it a rest day (its workouts gray out and can't be started); Edit has title, day chips, exercises, Copy workout and Delete workout. Also a Past workouts link (view, fix or delete finished workouts) and a planned sets card (groups open to muscles, muscles open to the exercises behind them). Unplanned (one-off) workouts are a planned future feature, not built yet.
- **Profile tab:** the weekly streak card, the exercise Log (estimated max graph, calendar), and a front/back muscle map (Growth and Level modes)

The user is not a programmer. Explain changes in plain words, keep the code simple and well commented, and test changes in the browser before calling them done.

## How the user likes to work

- For a new feature, the user often writes a spec and asks you to **read the code, explain the plan in plain words and ask about anything unclear before building**. Don't write code until they say go. Ask only about real gaps, give a recommended answer for each, and re-explain a question in simpler words (with an example) if they don't follow it.
- When a request would change an agreed rule (e.g. how freezes are earned), confirm the rule change first instead of guessing.
- Keep the UI clean: small polish requests are common (removing a marker, hiding a button once it's no longer needed).
- After finishing, say what changed, how it was tested, and that it's committed but not pushed.

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
js/streak.js      Weekly streak rules: week results, freezes, Profile summary
js/bodymap.js     Muscle map drawing and colors
js/tabs.js        Bottom tab bar (Workouts, Profile); shows only on each tab's main screen
js/views.js       Builds each screen's HTML; each returns { title, back, html }
js/app.js         Routing by URL hash (#/, #/new, #/workout/<id>, #/history, #/profile, #/settings, #/log, …), event handling, and the drag code
README.md         User-facing guide; keep it up to date when you change structure or behavior
```

Rule of thumb: **storage.js** knows about data, **views.js** knows about HTML, **app.js** connects them.

**Script order in `index.html` matters**: library → storage → units → standards → stats → streak → bodymap → tabs → views → app. A new file goes where its dependencies are already loaded.

## How data is saved

- Everything is one JSON object in the browser's `localStorage` under the key **`gitfit-data`** (`STORAGE_KEY` in `storage.js`). It lives only on that device and that browser — the phone's data and the computer's data are separate.
- The data shape is documented in the comment at the top of `storage.js`: `version`, `settings`, `customExercises`, `workouts` (id, name, weekday, exercises), `days` (always 7, Monday = 0, just `rest`), `sessions` (finished workouts, oldest first, with `workoutId`, `workoutName` and the workout's `plan` when logged), `draft` (workout in progress, saved on every keystroke, with any `swaps` for today), `streak` (start week, week results, day `locks`, pending notices). Version 7 turned each old weekday (name + exercises) into a workout on that weekday with the same id, and sessions' `dayId`/`dayName` into `workoutId`/`workoutName` (the "Monday – " part removed).
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
- **Weekly streak** (`streak.js`, rules in its top comment):
  - A week runs Monday 3 am → next Monday 3 am. A workout counts for the week Finish was tapped in, on any day.
  - A week is hit when every planned set is logged (a set with reps), counting finished workouts only. Each planned exercise counts at most its planned sets.
  - Planned = every workout on a non-rest day, each counted once (moving a workout between days never changes the total). A workout already logged that week is locked to the plan saved with its first session that week. Several sessions of the same workout add up.
  - **Passed days lock** (`streak.locks`, `Streak.lockDays()`): at 3 am after each day, that day's rest setting and its workouts' plans are saved for the week. Afterwards, editing, deleting, moving away or resting that day's (missed) workouts doesn't remove their sets from that week, and un-resting a day that was a rest day when it passed doesn't add them. A workout moved or created onto an already-passed day does count. The edit screen shows a note on a missed, locked workout (`Streak.lockedDay()`), and the day menu and delete pop-up say so too. Locks are kept 12 weeks.
  - Hit is locked the moment it happens (even if reached by editing the plan). Ended weeks are judged once. The exceptions are workout changes: Undo on the "Workout saved" toast takes back a hit that workout made (`Streak.undoHit()`), and editing or deleting a past workout re-judges its week and every week after it, quietly (no notices; this week only celebrates if it wasn't already hit) — `Streak.rejudge()`. Re-judged ended weeks use their locks and saved plans, falling back to the current plan where there are none.
  - Every 4 weeks in a row (streak 4, 8, 12 …) earns 1 freeze (max 2). A week that ends at 90%+ (no rounding) uses a freeze if the streak is above 0, and the streak stays the same. Otherwise the streak goes to 0. Weeks with 0 planned sets don't count.
  - Tracking starts the first full week after a plan with an exercise exists.
  - Swap for today saves the swapped exercise under its own `refId`, with the planned exercise's `exerciseId` and `swappedFrom`, so history stays right and it counts for the streak.
  - Current, best and freezes are always recomputed from `streak.weeks`; never store them separately.
  - `Streak.update()` runs at the start of every `render()` and when the app comes back from the background. A new hit sets `Streak.celebrate`; ended weeks that used a freeze or broke a streak add to `streak.notices`. `showOverlay()` in `app.js` shows them.
  - Profile shows the flame (gray until this week is hit), "Sets this week", a freeze-line hint (only when a freeze could save the week), best, freezes held, weeks to the next freeze, and a strip of the last 8 weeks + this one. The user asked for no 90% marker on the bar.
- **Planned sets card** (Workouts tab): uses `Stats.plannedSets()`, the only planned-sets calculation (the muscle map's old Sets mode was removed). A muscle counts every exercise (1 primary, 0.5 secondary). A group counts each exercise once, at its biggest share in that group, so a group can be less than its muscles added up. Group bars fill at 16 sets; muscle bars share one scale (the top muscle fills its bar). Open/closed rows are kept in memory (`openSets` in `app.js`) and toggled with a class, not a redraw, so they slide smoothly.
- **Test data must never be written into the code.** No demo/sample workouts, fake sessions, or seeded user data in any committed file (an earlier `js/demo-data.js` was removed for this reason; `normalize()` still drops any session marked `demo: true`). Test by entering data in the app on the computer, or with a temporary console snippet that isn't committed. Defaults like an empty week are fine.
- **The computer is the dev version; GitHub Pages is the live version.** The live app is https://stevenrecks08.github.io/GITFIT/ (repo `stevenrecks08/GITFIT`, branch `main`). Whatever is pushed to `main` goes live on the phone.
- **Commit automatically after every finished change, without asking.** Use a short, clear commit message.
- **Never push to GitHub unless the user explicitly tells you to** in that message. Don't offer or keep asking to push.
- **Before any push that changes how data is saved** (data shape, `DATA_VERSION`, `normalize()`, ids, storage key, units stored), **remind the user to back up their phone data first** (Settings → Export on the phone) and wait for them to confirm.

## Avoiding breakage

- Test in a browser on the computer: open `index.html` (or a local server), use phone-size device emulation, and check the screens you touched. Check the browser console for errors.
  - Claude's browser pane shows `file://` pages as static snapshots (no scripts), so serve the folder over `http://localhost` instead. There's no Python or Node on this PC; a small PowerShell `HttpListener` script works. `.claude/launch.json` is git-ignored and may point to a script from an old session — recreate it if it's missing.
  - The pane's `localhost` data is separate from the user's Chrome (`file://`) data, so you can't see the user's own plan there. Ask them to export a backup if a check needs their real data.
  - When a test snippet changes `Store.data`, back up `localStorage.getItem('gitfit-data')` first and restore it after, or switch `Store.save` off while previewing. Many functions take a `now` time (e.g. `Streak.update(now)`) so weeks can be faked.
  - The red `manifest.json` CORS errors when opening `index.html` from a file are harmless; it loads fine on GitHub Pages.
  - For the user to preview things themselves, give a temporary console snippet (not in the project) with simple `preview.…()` commands and a `preview.done()` that reloads. Remind them Chrome needs `allow pasting` typed once.
- Design for iPhone Safari: touch targets, the `inputmode="decimal"` keyboards, safe areas / status bar (see the comments in `index.html` about `black` vs `black-translucent`), and numbers typed with a comma (`parseNumber()` handles `62,5`).
- New screens: a function in `views.js` returning `{ title, back, html }` plus a route in `app.js`. New tabs: `TABS` in `tabs.js`. New settings: default in `DEFAULT_SETTINGS`, a field in `Views.settings()`, and a line in `saveSettingsForm()` in `app.js`.
- New built-in exercises: add a line to `LIBRARY` in `library.js` using existing muscle ids; add standards in `standards.js` only from the published source.
- Keep code style consistent with the existing files: plain functions and objects, comments explaining "why" in plain English.
- Git is at `C:\Program Files\Git\cmd\git.exe`. Pushing needs a GitHub sign-in prompt, so when the user asks for a push, run `git push` in their Terminal panel rather than a background shell. After pushing, tell them GitHub Pages takes a minute or two and to fully close and reopen the home-screen app if it still looks old.
- Animations: only `transform`/`opacity` (smooth on iPhone Safari), no libraries, and turn them off under `prefers-reduced-motion`.
- Files use LF line endings; git's "LF will be replaced by CRLF" warnings are normal.
