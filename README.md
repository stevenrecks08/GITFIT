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
js/bodymap.js     The front/back muscle map drawing and its colors
js/standards.js   Published strength standards (strengthlevel.com) used by the map's Level mode
js/tabs.js        The bottom tab bar (Workouts, Profile) — add new tabs here
js/views.js       Builds the HTML for each screen (home, edit day, workout, profile)
js/app.js         Picks the screen from the URL and handles taps, typing and forms
```

The rule of thumb: **storage.js** knows about data, **views.js** knows about HTML, **app.js** connects them.

## Units

All weights are **saved in lbs** and heights in **inches**, whatever the Units setting says. `units.js` converts them only for display, so switching units shows old lifts converted, not relabeled. When you show or read a weight anywhere new, go through `Units.showWeight()` / `Units.readWeight()`.

## Exercises and muscles

Exercises on your days point at an exercise in `library.js` (or one of your custom exercises) by its id. Each library exercise has **primary** muscles (count as 1 set each) and **secondary** muscles (count as 0.5 sets each), using the muscle ids from `MUSCLE_GROUPS` (the full muscle catalog). To add a built-in exercise, add a line to `LIBRARY`.

Exercise search shows nothing until you type, then only the best 8 matches. How matches are ranked is in `Library.search()`.

Every finished workout also stores each exercise's name and muscles, so weekly sets per muscle can be counted from `Store.data.sessions` later.

## Adding a setting

1. Add it with a default to `DEFAULT_SETTINGS` in `storage.js`.
2. Add a field for it in `Views.settings()` in `views.js` (inside `settings-form`). Settings open from the gear on the Profile tab.
3. Read it in `saveSettingsForm()` in `app.js`.

It's then saved automatically and included in backups.

## Adding features later

- **Log** — Profile → Log searches exercises; each one's page (`Views.exerciseLog()`) shows an estimated 1-rep max graph, a calendar, and a day's sets. Its data comes from `Store.exerciseHistory(refId)`, and the estimate from `estimateMax()` (Epley) in `storage.js`.
- **Muscle map** — on Profile. *Growth* = average % change in estimated max over 6 weeks for the exercises that train each muscle (needs 3+ weeks logged); *Sets* = planned sets per week from your weekly plan (`Stats.plannedSets()`, also shown per muscle group on the home and edit-day screens). Primary muscles count 1, secondary 0.5. *Level* = each muscle's best level (Beginner → Elite) among its primary exercises that have published standards, from their latest estimated max, your body weight and sex (`Stats.muscleLevels()`). The growth time span is at the top of `Stats` in `stats.js`; the color scales are `GROWTH_SCALE` / `SETS_SCALE` in `bodymap.js`.
- **More history** — every finished workout is in `Store.data.sessions` (oldest first), with date, day name and each exercise's sets.
- New screens follow the same pattern: a function in `views.js` that returns `{ title, back, html }`, and a route in `app.js`.

## Getting it on your iPhone (later)

The phone needs to load the files from a web address. The easiest free option is GitHub Pages: put this folder in a GitHub repository, turn on Pages, then open the link in **Safari** → Share → **Add to Home Screen**.
