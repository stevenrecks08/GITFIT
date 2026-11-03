# GitFit — notes for Claude

## What this is

GitFit is a personal gym tracker for one person (Rex), used mainly on an **iPhone in Safari, added to the home screen** as a web app. You create workouts (title + exercises), each assigned to a weekday (any number per day), log sets during a workout (and can swap an exercise for today only), and see progress:
- **Workouts tab:** the week Monday → Sunday (the same 7-day week, not a flip-through calendar; date range next to "This week") with each day's date next to its name, a thin line between days, and the workouts as cards with a left strip colored by state (green for upcoming or Done, amber for Partial, muted red for Missed, blue for quick), a pencil icon to edit, and a green "✓ Done" once finished this week (resets each Monday 3 am); today is highlighted (green pill, green left edge); the app always opens at the top (the user didn't want it scrolling to today); a day with no workouts is automatically a rest day (muted name, blue "Rest day" label, compact) with a small "+ Add a workout to train this day" link (opens New workout with that day picked, `#/new/day/<weekday>`) — there is no rest-day switch any more (removed at the user's request); a + button (bottom right) opening a small menu: New workout or Quick workout; tap a workout to open a read-only look at it (`Views.workoutPreview()`: Start workout and an edit pencil on top, then dashed cards with last sets, notes and Log buttons), where Start workout (with a confirm pop-up) really starts it on any day; hold and drag it to another day; Edit has title, day chips, exercises, Copy workout and Delete workout. Also a Past workouts link (view, fix or delete finished workouts) and a planned sets card (groups open to muscles, muscles open to the exercises behind them). **Quick workout** (`#/quick`): a one-off workout not added to the week — editable title, + Add exercise (its search can also create a custom exercise, `quickAdd.creating`), 1 set each with + Add set and − Remove set, no targets; saved as a session with `quick: true` (no workoutId, empty plan), counted for logs, maxes and the map, shown in Past workouts with a blue date and a Quick tag, and under the day it was finished as a blue Done card that week. **Missed this week**: workouts on passed days show ✓ Done (green, "· caught up Fri" if finished after their day), Partial · n/m sets (amber `--partial`) or Missed · 0/m sets (muted red `--missed`) with a Catch up button (a quick workout pre-filled with the missed exercises, or added to one in progress); a quick workout's + Add exercise lists missed exercises by day at the top. All from `Streak.dayStates()` / `Store.missedThisWeek()`.
- **During a workout:** a green-tinted top bar with a bold timer and an "In progress" strip with sets so far; the first unfinished exercise opens by itself; a Next button appears once an exercise is filled in (the last one says Done), and if every set hit the top of its range a small message suggests going heavier (`Store.readyForMoreWeight()`). + Add exercise for today (`draft.added`, `ex.today`) is logged but isn't in the plan. Each exercise has one note (`exerciseNotes`, kept until changed) and a Log button; Back from a log returns to where it was opened, as it was left (`returnStack` in `app.js`).
- **After finishing:** a summary (`Views.summary()`, `Store.sessionSummary()`) with time, sets, weight lifted, new bests (only if there are any, each opening its log; a first-ever exercise doesn't count) and this week's days. It's kept in memory only (`summary` in `app.js`): it stays on the Workouts tab until Close or until the app is fully closed. The user asked for this.
- **Planks are timed** (`TIMED_EXERCISES` in `library.js`, just planks, at the user's request): seconds are saved as the set's `reps`, the weight box shows a locked "—", and the log shows the longest hold instead of an estimated max. Growth uses the longest hold (40 → 50 sec = +25%).
- **Profile tab:** a backup reminder (no backup in 30 days), the weekly streak card, the exercise Log (a list of what you've logged; estimated max graph with 3 months / 1 year / all time and tappable dots, calendar, a day's sets with a link to the full workout), a body weight card (the only place to enter it, not Settings or the first-time setup; each change is logged by day and graphed, `bodyWeightLog`; its Body weight log button opens `#/body-weight`, a list of every weight and date with Edit and Delete, and the current body weight is always the newest entry), and a front/back muscle map (Growth and Level modes)
- **Exercise search** shows muscle group chips and recent exercises before you type. **First-time setup** (`Views.setup()`, `settings.setupDone`) shows on a brand new or fully deleted app; only the weekly goal is required. **Custom exercises** are listed in Settings and can be deleted: they're only marked `deleted`, so history keeps their name, and they come out of search and every workout.
- The user decided against a rest timer, a warm-up set feature, keeping the screen awake, and logging forgotten workouts on past dates. Don't re-suggest them.

The user is not a programmer. Explain changes in plain words, keep the code simple and well commented, and test changes in the browser before calling them done.

## How the user likes to work

- For a new feature, the user often writes a spec and asks you to **read the code, explain the plan in plain words and ask about anything unclear before building**. Don't write code until they say go. Ask only about real gaps, give a recommended answer for each, and re-explain a question in simpler words (with an example) if they don't follow it.
- When a request would change an agreed rule (e.g. how freezes are earned), confirm the rule change first instead of guessing.
- Keep the UI clean: small polish requests are common (removing a marker, hiding a button once it's no longer needed). The user prefers a bright look: keep controls and text readable, don't dim things to make them "quiet".
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
- The data shape is documented in the comment at the top of `storage.js`: `version`, `settings`, `customExercises`, `workouts` (id, name, weekday, exercises), `days` (always 7, `rest`; no longer used — a day with no workouts is a rest day), `sessions` (finished workouts, oldest first, with `workoutId`, `workoutName` and the workout's `plan` when logged), `draft` (workout in progress, saved on every keystroke, with any `swaps` for today; a quick workout's draft has `quick: true`, `name` and its own `exercises` list), `streak` (start week, week results, this week's day `locks`, pending notices). Version 7 turned each old weekday (name + exercises) into a workout on that weekday with the same id, and sessions' `dayId`/`dayName` into `workoutId`/`workoutName` (the "Monday – " part removed). Version 8 added quick workouts. Version 9 added the workout timer: `draft.pausedAt` / `pausedMs`, each draft set's `loggedAt`, and `session.durationMs`. Version 10 added `bodyWeightLog`, `exerciseNotes`, `draft.added`, `settings.setupDone` and `settings.lastBackupAt`. Version 11 added `settings.weeklyGoal` (null on older data, so the app asks once) and `days`/`goal` on new streak weeks.
- Only `storage.js` reads or writes `localStorage`. Other files go through `Store`.
- **Changing the data shape**: bump `DATA_VERSION` and add an upgrade step in `normalize()` so older saved data (and old backup files) still load. Never drop or rename saved fields without migrating them. Update the shape comment at the top of `storage.js`.
- Muscle ids and exercise ids (`refId`) are saved in user data. **Never rename or remove an existing id** without a migration (see `RENAMED_MUSCLES` for how a rename was handled). Adding new ones is fine.
- Finished sessions copy in each exercise's name and muscles so history stays right if the exercise changes later.
- Backup = Settings → Export (JSON file) / Import (`Store.exportBackup()` / `importBackup()`). Imports run through `normalize()` too.

## Key rules

- **Weights are stored in one unit (lbs) and converted for display.** Heights are stored in inches. The Units setting only changes what's shown. Always use `Units.showWeight()` / `Units.readWeight()` (and the height equivalents) when showing or reading a weight — never save kg.
- **Dumbbell weights are per dumbbell** (the weight of one dumbbell, not both added together). The strength standards in `standards.js` are per dumbbell too; barbell weights include the bar.
- **Estimated max uses the Epley formula**: `weight × (1 + reps ÷ 30)` — `estimateMax()` in `storage.js`. Sets with no weight or no reps have no estimate. Use this function everywhere; don't add a second formula.
- **Bodyweight exercises start with your body weight**: new sets on an exercise with the Bodyweight equipment are filled in from your latest logged body weight (`Store.startWeight()`), over last time's weight, and can be typed over. With no body weight set they stay empty ("BW"), so they have no estimate. The exception is planks (timed, no weight). Their log and finish-summary bests show **max reps**, not an estimated max (`Library.isRepsOnly()`, `topReps` in `Store.exerciseHistory()`), at the user's request; they plan to work out a system for added weight (like a weighted pull-up) later. Growth mode works out their % change from max reps (8 → 10 reps = +25%), shown as a percent like any other exercise.
- **New sets**: a planned set starts with last time's weight. + Add set copies the set above; if that's empty, so is the new one (bodyweight exercises still get body weight).
- **Muscle list and set counting**: the muscle catalog is `MUSCLE_GROUPS` in `library.js`:
  - Chest: upper chest, mid chest, lower chest
  - Shoulders: front delts, side delts, rear delts
  - Back: lats, upper back, traps, lower back
  - Arms: biceps, brachialis, triceps
  - Forearms: brachioradialis, forearm flexors, forearm extensors
  - Core: abs, obliques
  - Legs: quads, hamstrings, glutes, adductors, calves

  Each exercise has **primary** muscles (each set counts as **1 set**) and **secondary** muscles (each set counts as **0.5 set**). A muscle can't be both primary and secondary on one exercise. Secondary muscles only affect planned sets: the map's Growth and Level modes use primary muscles only (the user's choice), and the streak's muscle groups go by primary too. Secondary means a muscle that moves a joint under load, or a lower back holding a heavy free bar; grip and general stabilizing aren't listed.
- **Weekly streak** (`streak.js`, rules in its top comment):
  - The weekly goal is `settings.weeklyGoal` (1 to 7), asked in the first-time setup and changeable in Settings. Data from before version 11 has none, so `Views.goalPrompt()` asks once before anything else, and `Streak.update()` waits for the answer.
  - A week runs Monday 3 am → next Monday 3 am. A week is hit when the different days with a finished workout (`Streak.daysIn()`) reach the goal. Any finished workout counts: planned, quick or on a rest day. Two on one day count as one. A workout counts on the day Finish was tapped, and days change at 3 am.
  - The goal can change any time; a week is judged against the goal when it ends, saved on its result (`days`, `goal`). This week stays live: it's hit (and celebrates) the moment it reaches the goal, and goes back if the goal is raised past it or a workout is undone or deleted.
  - Every 4 weeks in a row (streak 4, 8, 12 …) earns 1 freeze (max 2). A week that ends short uses a freeze if one is held and the streak is above 0, and the streak stays the same. Otherwise the streak goes to 0.
  - Tracking starts the week the first workout is logged (`streak.start`), and that week counts. No plan is needed.
  - Editing or deleting a past workout re-judges its week and every week after it, quietly (no notices; this week only celebrates if it wasn't already hit), each against its saved goal: `Streak.rejudge()`.
  - **Weeks from before version 11** were judged by the old set-counting rules (`logged`, `planned`, maybe `empty`). The user chose to keep them: they have no saved `goal` and are never re-judged, including a hit already on the week of the upgrade.
  - Current, best and freezes are always recomputed from `streak.weeks`; never store them separately.
  - `Streak.update()` runs at the start of every `render()`, when a goal changes, and when the app comes back from the background. A new hit sets `Streak.celebrate`; ended weeks that used a freeze or broke a streak add to `streak.notices`. `showOverlay()` in `app.js` shows them.
  - Profile shows the flame (gray until this week is hit), "Days this week X / Y", best, freezes held, weeks to the next freeze, and a strip of the last 8 weeks + this one. The finish summary shows "Days this week" too. The user asked for no marker on the bar.
- **Week view sets** (`Streak.progress()` / `dayStates()`, separate from the streak; only for Done / Partial / Missed / caught up, Catch up and the Missed this week list):
  - Planned = every workout, each counted once (a day with no workouts is a rest day). A workout already logged that week is locked to the plan saved with its first session that week. Several sessions of the same workout add up, and each planned exercise counts at most its planned sets.
  - **Passed days lock** (`streak.locks`, `Streak.lockDays()`): at 3 am after each day, that day's workouts and their plans are saved for this week only. A workout moved or created onto an already-passed day does count.
  - Swap for today saves the swapped exercise under its own `refId`, with the planned exercise's `exerciseId` and `swappedFrom`, so history stays right. It counts toward the planned sets only if it's in the same muscle group as the planned exercise. Its search can also create a custom exercise (`swap.creating`, using the same form and `picker` as the edit screen), which is then swapped in.
  - **Muscle groups** (`Library.groupOf()`): an exercise's group is the group most of its primary muscles are in (tie → the first primary listed), with all 7 groups kept separate (Chest, Shoulders, Back, Arms, Forearms, Core, Legs). Deadlift = Legs, Hammer Curl = Arms.
  - **Quick workout makeup sets**: after planned sets are counted, planned sets still missing on days that had passed (3 am the next morning) when the quick workout was finished can be filled by its sets of the same group, oldest quick workout first, capped at the sets missed. A quick exercise added from Catch up or the Missed this week list has `makeupFor` ({ workoutId, exerciseId }) and makes that exercise up first, then other same-group missed sets oldest first. Today and later days can't be made up early.
- **Extra sets**: + Add set on a planned workout adds a draft row with `extra: true` (today only, the plan doesn't change; `ensureDraft()` keeps them after the planned rows). − Remove set only takes off extra rows there, never a planned set; on a quick workout it takes off any set but the last one left. The planned-sets cap on the week view still applies, so extras never count toward it. The flag stays in the draft and isn't saved on the session.
- **Workout timer**: always worked out from saved times (`Store.draftElapsed()`: now or the pause, minus `startedAt` and `pausedMs`), never a running counter, so it survives closing the app. It starts when Start workout is confirmed (or a quick workout is opened) and shows boldly in the top bar of the workout screen, and on the in-progress banner. Leaving the screen doesn't pause it; only the pause button does. Over 3 hours at Finish → "Use last set time" (saves the workout at the last set's `loggedAt`, so it counts for that day/week; an ended week is re-judged) or "Keep". Duration shows in Past workouts.
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
