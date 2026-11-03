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

Before you type, exercise search shows muscle group chips and your recent exercises (`Views.libraryResults()`). Once you type, it shows only the best 8 matches. How matches are ranked is in `Library.search()`.

Every finished workout also stores each exercise's name and muscles, so weekly sets per muscle can be counted from `Store.data.sessions` later.

## Adding a setting

1. Add it with a default to `DEFAULT_SETTINGS` in `storage.js`.
2. Add a field for it in `Views.settings()` in `views.js` (inside `settings-form`). Settings open from the gear on the Profile tab.
3. Read it in `saveSettingsForm()` in `app.js`.

It's then saved automatically and included in backups.

## Adding features later

- **Log** — Profile → Log lists the exercises you've logged, most recent first, and searches the rest; each one's page (`Views.exerciseLog()`) shows an estimated 1-rep max graph (3 months, 1 year or all time; tap a dot for that day), the actual 1-rep max (heaviest weight logged for a single rep, also drawn as a thin white line on the graph), a calendar, and a day's sets with a link to the full workout. Log buttons on the workout screens and past workouts open it too, and Back returns to where you were (`returnStack` in `app.js`). Its data comes from `Store.exerciseHistory(refId)`, and the estimate from `estimateMax()` (Epley) in `storage.js`.
- **Before a workout** — tapping a workout opens a look at it (`Views.workoutPreview()`): last time's sets, notes and Log buttons, with nothing to type in. Start workout asks first, then starts the workout and its timer.
- **During a workout** — the first unfinished exercise opens by itself, and the top strip shows sets so far. Next appears when an exercise is filled in, and suggests going heavier if every set reached the top of its range (`Store.readyForMoreWeight()`). + Add exercise for today adds to this workout only (`draft.added`): logged, but not in your plan. Tapping a weight selects it so typing replaces it.
- **Notes** — one per exercise (`Store.exerciseNote()`), kept until you change it, on the workout screens.
- **Finish summary** — after finishing, the Workouts tab shows `Views.summary()` (from `Store.sessionSummary()`): time, sets, exercises, weight lifted, new bests and this week's sets. It's only in memory, so it stays until Close or until the app is fully closed.
- **Planks** — timed: seconds are saved as the set's reps, with no weight and no estimated max. The map's Growth mode uses the longest hold (40 → 50 sec = +25%). The list of timed exercises is `TIMED_EXERCISES` in `library.js`.
- **Body weight** — Settings or the card on Profile (`Store.setBodyWeight()`). Each change is logged under that day (`bodyWeightLog`) and graphed on Profile.
- **Backups** — Profile shows a reminder when there's been no backup for 30 days (`BACKUP_REMINDER_DAYS` in `views.js`).
- **Custom exercises** — listed in Settings, and can be deleted there or on their edit form. They're only marked `deleted`, so past workouts and logs keep their name.
- **First-time setup** — `Views.setup()` shows until `settings.setupDone`; anyone with older saved data skips it. It asks for the weekly goal, the one answer that can't be skipped.
- **Muscle map** — on Profile. *Growth* = average % change in estimated max (max reps on bodyweight exercises, longest hold on planks) over 6 weeks for the exercises that train each muscle as a primary muscle (needs 3+ weeks logged); secondary muscles don't count, so a muscle only trained as a secondary stays gray. *Level* = each muscle's best level (Beginner → Elite) among its primary exercises that have published standards, from their latest estimated max, your body weight and sex (`Stats.muscleLevels()`). The growth time span is at the top of `Stats` in `stats.js`; the color scale is `GROWTH_SCALE` in `bodymap.js`. Planned sets per muscle group from your weekly plan (`Stats.plannedSets()`) show under the week on the Workouts tab. Tap a group to see each of its muscles, and a muscle to see the exercises behind its number. A group counts each exercise once (at its biggest share in that group), so a group's number can be less than its muscles added up. Group bars fill at 16 sets; muscle bars share one scale (the most-trained muscle fills its bar).
- **The week (Workouts tab)** — `Views.home()` shows Monday → Sunday, split by thin lines, with each day's date (`dayDate()`) and workouts (`Store.data.workouts`, each with a `weekday`; any number per day). The + button opens a small menu: **New workout** opens `#/new` (title + day chips, `Views.newWorkout()`), then the workout's edit screen (`Views.editWorkout()`: title, day, exercises, Copy workout, Delete workout). Copy opens the same form filled in (`#/new/<id>`) and makes an independent copy. Tap a workout to open it on any day; hold one (350 ms) and drag it onto another day (drag code in `app.js`). A day with no workouts is automatically a rest day (`Store.isRestDay()`), shown with a "+ Add a workout to train this day" link.
- **Weekly streak** — on Profile. You pick a weekly goal, 1 to 7 days (`settings.weeklyGoal`: in the first-time setup and Settings; older data is asked once, `Views.goalPrompt()`). A week (Monday 3 am → next Monday 3 am) is hit when the different days with a finished workout reach the goal (`Streak.daysIn()`). Any finished workout counts, planned, quick or on a rest day, and two on one day count as one. It's judged against the goal when the week ends, so during the week raising or lowering the goal counts straight away. Every 4 weeks in a row earns a freeze (max 2); a week that ends short uses one instead of breaking the streak. Weeks judged before version 11 used the old set-counting rules and stay as they were. The rules are at the top of `streak.js`; `Streak.update()` runs on every screen draw. **Swap for today** on the workout screen saves the swapped exercise as itself, under the planned exercise's id (`swappedFrom` = the planned one), so it counts toward the planned sets on the week view without changing the plan, but only if it's in the same muscle group as the planned one (`Library.groupOf()`: the group most of its primary muscles are in; Chest, Shoulders, Back, Arms, Forearms, Core and Legs are kept separate). The swap search also has **+ Create custom exercise**, the same form as on the edit screen: saving it adds it to your exercises and swaps it in (a different muscle group asks first).
- **Finishing a workout** — if any set is still empty (no reps, or no weight on a non-bodyweight exercise), a pop-up lists them with Go back / Finish anyway (`Store.draftGaps()`, `Views.finishCheck()`). The "Workout saved" toast stays 5 seconds with an **Undo** button: it removes the session, puts the workout back as it was (`Store.undoFinish()`), and takes back this week's streak hit if that workout made it (`Streak.update()`).
- **Workout timer** — starts when a workout is started (Start workout, or opening a quick workout) and shows in bold green at the right of the top bar on the workout screen ("12:34", "1:02:34") and on the "Workout in progress" banner. It's worked out from the saved start time (`draft.startedAt`, `Store.draftElapsed()`), so it keeps counting while the app is closed; `updateTimers()` in `app.js` redraws it every second. The pause button saves `draft.pausedAt`; resuming adds the pause to `draft.pausedMs`, and paused time never counts. Typing a set's reps saves when (`loggedAt`). Finish on a workout over 3 hours asks "This workout ran 4h 12m. End it at your last logged set instead?" — "Use last set time" saves it as finished then (so it counts for that day and week; an already-ended week is re-judged), "Keep" keeps the full time. The time is saved as `session.durationMs` and shown in Past workouts ("· 52 min"); older workouts have none.
- **Quick workout** — + → Quick workout (`#/quick`) starts a one-off workout that isn't added to your week. It uses the normal workout screen (`Views.workout()` with `Store.draftWorkout()`, a stand-in workout built from the draft): an editable title (default "Quick workout"), "+ Add exercise" (the exercise search, which can also create a custom exercise and add it), each exercise starting with 1 set, "+ Add set", "− Remove set" (takes off the last set, once there's more than one) and Remove exercise, and no target reps. It's saved like any workout (`session.quick`, no `workoutId`, empty `plan`), so it counts for the log, maxes, the muscle map and Past workouts (with a blue date and a "Quick" tag). After finishing, it shows under the day it was finished as a blue "✓ Done" card for the rest of that week. **Streak:** it counts as a day like any workout. **Week view:** its sets can make up planned sets missed on days that had already passed when it was finished, in the same muscle group, up to the sets missed (`Streak.progress()`).
- **Missed this week** — on the week, each workout on a day that has passed (3 am the next morning) shows "✓ Done", "✓ Done · caught up Fri" (finished after its own day: done late or made up), amber "Partial · 3/6 sets" or muted red "Missed · 0/7 sets" (`Streak.dayStates()`). Today and later days are never missed, and it all starts over each Monday. The card's left strip matches: green for upcoming or Done, amber for Partial, muted red for Missed. Partial and Missed cards have a small **Catch up** button under the status line: a quick workout ("Pull catch-up") with that workout's missed exercises, each with its missing sets and target reps (added to the quick workout in progress, if there is one). The quick workout's + Add exercise shows a **Missed this week** list at the top (`Store.missedThisWeek()`, `Views.missedPicker()`), grouped "Tue · Pull", with "2 sets missed"; tapping one adds it the same way. These exercises remember what they make up (`makeupFor`), so their sets make up that exercise first.
- **Past workouts** — the link at the top right of Workouts (`#/history`, `Views.history()`) lists every finished workout, newest first (Today, Yesterday, then dates), grouped under week headers ("This week", "Last week", then "Oct 19 – 25") with each week's workouts and sets totals. Tapping one opens it (`Views.pastWorkout()`), looking like the workout start page: every planned exercise with its logged sets, a Log button and a pencil. The pencil opens that exercise's boxes, including empty sets so a forgotten one can be added. Save changes and Discard changes show once something's being edited; Delete workout is always there, and Back with unsaved edits asks first. Edits live in `pastEdit` in `app.js` until saved (`Store.updateSession()` / `deleteSession()`), then `Streak.rejudge()` re-judges that week and every week after. Logs, the muscle map and "last time" are always worked out from sessions, so they follow by themselves.
- **Extra sets** — every workout screen has "+ Add set", which copies the weight of the set above (if that's empty, the new set is too, except a bodyweight exercise, which gets your body weight). On a planned workout it adds a bonus set for today (`extra: true` on the draft row, not on the plan); "− Remove set" only shows for those, so a planned set can't be removed (just leave it empty). They're saved and show in the log and maxes, but the week view still counts each exercise at most its planned sets. Swapping an exercise starts its sets over, without the extras.
- **Bodyweight exercises** — a new set on an exercise with the Bodyweight equipment starts with your body weight from Settings (`Store.startWeight()`), and you can type over it (a weighted pull-up, say). With no body weight in Settings it stays empty and saves as "BW". Their Log shows **max reps** (the most reps in one set, with a graph) instead of an estimated max, and new bests in the finish summary are max reps too (`Library.isRepsOnly()`). The weight is still saved with each set. The map's Growth mode works out their % change from max reps too (8 → 10 reps = +25%). Sets saved before this stay as they were.
- **Workout progress badge** — a collapsed exercise shows ✓ once every set is filled in (reps, and a weight unless bodyweight), "1/3" part way, and nothing before the first set (`Store.draftProgress()`).
- **More history** — every finished workout is in `Store.data.sessions` (oldest first), with date, workout name and each exercise's sets.
- New screens follow the same pattern: a function in `views.js` that returns `{ title, back, html }`, and a route in `app.js`.

## Getting it on your iPhone (later)

The phone needs to load the files from a web address. The easiest free option is GitHub Pages: put this folder in a GitHub repository, turn on Pages, then open the link in **Safari** → Share → **Add to Home Screen**.
