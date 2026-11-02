# GitFit

A simple gym tracker. No accounts, no server — your data is saved in the browser on your device.

## How to open it on your computer

1. Open the `GITFIT` folder in File Explorer.
2. Double-click `index.html`. It opens in your web browser.
3. To make it look like a phone: press **F12** (Developer Tools), then **Ctrl+Shift+M** (device toolbar) and pick an iPhone from the list at the top.

After you change any code, save the file and press **F5** in the browser to reload.

Data you enter on your computer stays in *that* browser. It won't appear on your phone — use Export/Import to move it.

## Project layout

```
index.html        The page shell: top bar + an empty <main> that screens are drawn into
manifest.json     Lets the app be "installed" to a phone home screen
css/styles.css    All styling. Colors are at the top under :root
js/library.js     Built-in exercise library and muscle list — add exercises here
js/storage.js     All saving/loading (localStorage), plus export/import
js/units.js       Converts weights/heights between saved units (lbs, inches) and shown units
js/stats.js       Works out per-muscle numbers (growth, sets per week) from saved workouts
js/streak.js      The weekly streak: which weeks were hit, frozen or missed, and the freezes
js/bodymap.js     The front/back muscle map drawing and its colors
js/standards.js   Published strength standards (strengthlevel.com) used by the map's Level mode
js/tabs.js        The bottom tab bar (Workouts, Profile) — add new tabs here; it shows only on each tab's main screen
js/views.js       Builds the HTML for each screen (the week, new/edit workout, workout, profile, …)
js/app.js         Picks the screen from the URL and handles taps, typing and forms
```

The rule of thumb: **storage.js** knows about data, **views.js** knows about HTML, **app.js** connects them.

## Units

All weights are **saved in lbs** and heights in **inches**, whatever the Units setting says. `units.js` converts them only for display, so switching units shows old lifts converted, not relabeled. When you show or read a weight anywhere new, go through `Units.showWeight()` / `Units.readWeight()`.

## Exercises and muscles

Exercises in your workouts point at an exercise in `library.js` (or one of your custom exercises) by its id. Each library exercise has **primary** muscles (count as 1 set each) and **secondary** muscles (count as 0.5 sets each), using the muscle ids from `MUSCLE_GROUPS` (the full muscle catalog). To add a built-in exercise, add a line to `LIBRARY`.

Exercise search shows nothing until you type, then only the best 8 matches. How matches are ranked is in `Library.search()`.

Every finished workout also stores each exercise's name and muscles, so weekly sets per muscle can be counted from `Store.data.sessions` later.

## Adding a setting

1. Add it with a default to `DEFAULT_SETTINGS` in `storage.js`.
2. Add a field for it in `Views.settings()` in `views.js` (inside `settings-form`). Settings open from the gear on the Profile tab.
3. Read it in `saveSettingsForm()` in `app.js`.

It's then saved automatically and included in backups.

## Adding features later

- **Log** — Profile → Log searches exercises; each one's page (`Views.exerciseLog()`) shows an estimated 1-rep max graph, the actual 1-rep max (heaviest weight logged for a single rep, also drawn as a thin white line on the graph), a calendar, and a day's sets. Its data comes from `Store.exerciseHistory(refId)`, and the estimate from `estimateMax()` (Epley) in `storage.js`.
- **Muscle map** — on Profile. *Growth* = average % change in estimated max over 6 weeks for the exercises that train each muscle (needs 3+ weeks logged); Primary muscles count 1, secondary 0.5. *Level* = each muscle's best level (Beginner → Elite) among its primary exercises that have published standards, from their latest estimated max, your body weight and sex (`Stats.muscleLevels()`). The growth time span is at the top of `Stats` in `stats.js`; the color scale is `GROWTH_SCALE` in `bodymap.js`. Planned sets per muscle group from your weekly plan (`Stats.plannedSets()`) show under the week on the Workouts tab. Tap a group to see each of its muscles, and a muscle to see the exercises behind its number. A group counts each exercise once (at its biggest share in that group), so a group's number can be less than its muscles added up. Group bars fill at 16 sets; muscle bars share one scale (the most-trained muscle fills its bar).
- **The week (Workouts tab)** — `Views.home()` shows Monday → Sunday, split by thin lines, with each day's date (`dayDate()`) and workouts (`Store.data.workouts`, each with a `weekday`; any number per day). The + button opens a small menu: **New workout** opens `#/new` (title + day chips, `Views.newWorkout()`), then the workout's edit screen (`Views.editWorkout()`: title, day, exercises, Copy workout, Delete workout). Copy opens the same form filled in (`#/new/<id>`) and makes an independent copy. Tap a workout to start it on any day; hold one (350 ms) and drag it onto another day (drag code in `app.js`). A day with no workouts is automatically a rest day (`Store.isRestDay()`), shown with a "+ Add a workout to train this day" link.
- **Weekly streak** — on Profile. A week (Monday 3 am → next Monday 3 am) is hit when every planned set of that week's workouts is logged (has reps), counting only finished workouts, done on any day. A workout already logged that week is locked to the plan saved with it (`session.plan`); once a day has passed (3 am the next morning) it's locked as it was (`streak.locks`), so editing, deleting or moving a missed workout afterwards doesn't remove it from that week. Every 4 weeks in a row earns a freeze (max 2); a week that ends at 90%+ uses one instead of breaking the streak. The rules and numbers are at the top of `streak.js`; `Streak.update()` runs on every screen draw. **Swap for today** on the workout screen saves the swapped exercise as itself, under the planned exercise's id (`swappedFrom` = the planned one), so it counts for the streak without changing the plan, but only if its in the same muscle group as the planned one (`Library.groupOf()`: the group most of its primary muscles are in; Chest, Shoulders, Back, Arms, Forearms, Core and Legs are kept separate).
- **Finishing a workout** — if any set is still empty (no reps, or no weight on a non-bodyweight exercise), a pop-up lists them with Go back / Finish anyway (`Store.draftGaps()`, `Views.finishCheck()`). The "Workout saved" toast stays 5 seconds with an **Undo** button: it removes the session, puts the workout back as it was (`Store.undoFinish()`), and takes back this week's streak hit if that workout made it (`Streak.undoHit()`).
- **Workout timer** — starts when a workout is opened (planned or quick) and shows in muted text at the right of the top bar on the workout screen ("12:34", "1:02:34") and on the "Workout in progress" banner. It's worked out from the saved start time (`draft.startedAt`, `Store.draftElapsed()`), so it keeps counting while the app is closed; `updateTimers()` in `app.js` redraws it every second. The pause button saves `draft.pausedAt`; resuming adds the pause to `draft.pausedMs`, and paused time never counts. Typing a set's reps saves when (`loggedAt`). Finish on a workout over 3 hours asks "This workout ran 4h 12m. End it at your last logged set instead?" — "Use last set time" saves it as finished then (so it counts for that day and week; an already-ended week is re-judged), "Keep" keeps the full time. The time is saved as `session.durationMs` and shown in Past workouts ("· 52 min"); older workouts have none.
- **Quick workout** — + → Quick workout (`#/quick`) starts a one-off workout that isn't added to your week. It uses the normal workout screen (`Views.workout()` with `Store.draftWorkout()`, a stand-in workout built from the draft): an editable title (default "Quick workout"), "+ Add exercise" (the exercise search), each exercise starting with 1 set, "+ Add set" and Remove, and no target reps. It's saved like any workout (`session.quick`, no `workoutId`, empty `plan`), so it counts for the log, maxes, the muscle map and Past workouts (with a blue date and a "Quick" tag). After finishing, it shows under the day it was finished as a blue "✓ Done" card for the rest of that week. **Streak:** its sets only count as makeup — planned sets missed on days that had already passed when it was finished, in the same muscle group, up to the sets missed (`Streak.progress()`, which also returns what's still `missed` per group, ready for a "Missed this week" list). Other sets are logged but don't count for the streak.
- **Missed this week** — on the week, each workout on a day that has passed (3 am the next morning) shows "✓ Done", "✓ Done · caught up Fri" (finished after its own day: done late or made up), amber "Partial · 3/6 sets" or muted red "Missed · 0/7 sets" (`Streak.dayStates()`). Today and later days are never missed, and it all starts over each Monday. The card's left strip matches: green for upcoming or Done, amber for Partial, muted red for Missed. Partial and Missed cards have a small **Catch up** button under the status line: a quick workout ("Pull catch-up") with that workout's missed exercises, each with its missing sets and target reps (added to the quick workout in progress, if there is one). The quick workout's + Add exercise shows a **Missed this week** list at the top (`Store.missedThisWeek()`, `Views.missedPicker()`), grouped "Tue · Pull", with "2 sets missed"; tapping one adds it the same way. These exercises remember what they make up (`makeupFor`), so their sets make up that exercise first.
- **Past workouts** — the link at the top right of Workouts (`#/history`, `Views.history()`) lists every finished workout, newest first (Today, Yesterday, then dates), grouped under week headers ("This week", "Last week", then "Oct 19 – 25") with each week's workouts and sets totals. Tapping one opens it (`Views.pastWorkout()`) with every planned exercise and set, including empty ones so a forgotten set can be added. Save changes / Discard changes / Delete workout; Back with unsaved edits asks first. Edits live in `pastEdit` in `app.js` until saved (`Store.updateSession()` / `deleteSession()`), then `Streak.rejudge()` re-judges that week and every week after. Logs, the muscle map and "last time" are always worked out from sessions, so they follow by themselves.
- **Workout progress badge** — a collapsed exercise shows ✓ once every set is filled in (reps, and a weight unless bodyweight), "1/3" part way, and nothing before the first set (`Store.draftProgress()`).
- **More history** — every finished workout is in `Store.data.sessions` (oldest first), with date, workout name and each exercise's sets.
- New screens follow the same pattern: a function in `views.js` that returns `{ title, back, html }`, and a route in `app.js`.

## Getting it on your iPhone (later)

The phone needs to load the files from a web address. The easiest free option is GitHub Pages: put this folder in a GitHub repository, turn on Pages, then open the link in **Safari** → Share → **Add to Home Screen**.
