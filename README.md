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
js/storage.js     All saving/loading (localStorage), plus export/import
js/units.js       Converts weights/heights between saved units (lbs, inches) and shown units
js/tabs.js        The bottom tab bar (Workouts, Profile) — add new tabs here
js/views.js       Builds the HTML for each screen (home, edit day, workout, profile)
js/app.js         Picks the screen from the URL and handles taps, typing and forms
```

The rule of thumb: **storage.js** knows about data, **views.js** knows about HTML, **app.js** connects them.

## Units

All weights are **saved in lbs** and heights in **inches**, whatever the Units setting says. `units.js` converts them only for display, so switching units shows old lifts converted, not relabeled. When you show or read a weight anywhere new, go through `Units.showWeight()` / `Units.readWeight()`.

## Adding a setting

1. Add it with a default to `DEFAULT_SETTINGS` in `storage.js`.
2. Add a field for it in `Views.profile()` in `views.js` (inside `settings-form`).
3. Read it in `saveSettingsForm()` in `app.js`.

It's then saved automatically and included in backups.

## Adding features later

- **History** — every finished workout is in `Store.data.sessions` (oldest first), with date, day name and each exercise's sets. Add a `Views.history()` function and a `#/history` route in `currentRoute()`.
- **Graphs / progress** — loop over `Store.data.sessions`, pick out one `exerciseId`, and chart the weight or reps over time.
- New screens follow the same pattern: a function in `views.js` that returns `{ title, back, html }`, and a route in `app.js`.

## Getting it on your iPhone (later)

The phone needs to load the files from a web address. The easiest free option is GitHub Pages: put this folder in a GitHub repository, turn on Pages, then open the link in **Safari** → Share → **Add to Home Screen**.
