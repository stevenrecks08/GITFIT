// app.js — starts the app, picks which screen to show, and handles taps/typing.
//
// Screens are chosen by the part of the URL after "#":
//   #/                 → home (this week, Next Up, today's cardio) [Workouts tab]
//   #/cycle            → Edit cycle: the cycle in order and its planned sets [Workouts tab]
//   #/new              → new workout (the + button) [Workouts tab]
//   #/new/<id>         → copy of a workout          [Workouts tab]
//   #/workout/<id>     → a workout: look at it and change it until it's started, then the real thing [Workouts tab]
//   #/workout/<id>/<cycle item id> → the same, opened from that place in the cycle (it counts as that place)
//   #/quick           → the quick workout in progress (+ button → Quick workout) [Workouts tab]
//   #/history          → past workouts (link at the top of Workouts) [Workouts tab]
//   #/history/<id>     → fix or delete one past workout [Workouts tab]
//   #/profile          → profile                  [Profile tab]
//   #/settings         → settings (gear on Profile) [Profile tab]
//   (Profile also shows the muscle map; see bodymap.js and stats.js)
//   #/log              → search exercises to see their log [Profile tab]
//   #/log/<exercise>   → one exercise's log         [Profile tab]
//   #/body-weight      → every body weight logged, to edit or delete [Profile tab]
//   #/cardio           → this week's cardio, planned cardio, calendar and every entry [Cardio tab]
// Using the URL means the browser/phone Back gesture works for free.

const appEl = document.getElementById('app');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
const tabBarEl = document.getElementById('tabbar');
const gearBtn = document.getElementById('gear');
const toastEl = document.getElementById('toast');
const historyLink = document.getElementById('history-link');
const timerEl = document.getElementById('timer');
const timerBtn = document.getElementById('timer-btn');

// Pause and play icons for the timer button.
const PAUSE_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
const PLAY_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>`;

// Workout timer: every second, shows the time of the workout in progress wherever it's on the
// screen (the top bar on the workout screen, the banner on the week). The time is always worked
// out from the saved start (Store.draftElapsed), so nothing is lost while the app is closed.
function updateTimers() {
  const paused = Store.isDraftPaused();
  const time = formatClock(Store.draftElapsed());
  document.querySelectorAll('[data-timer]').forEach(el => { el.textContent = time; });
  document.querySelectorAll('[data-timer-paused]').forEach(el => { el.hidden = !paused; });
  timerBtn.innerHTML = paused ? PLAY_SVG : PAUSE_SVG;
  timerBtn.setAttribute('aria-label', paused ? 'Resume timer' : 'Pause timer');
}
setInterval(updateTimers, 1000);

// Over this long when Finish is tapped → ask whether it was left running by mistake.
const LONG_WORKOUT_MS = 3 * 60 * 60 * 1000;

// The New workout / Copy workout form: { name, copyFrom (workout id or null) }.
// null until that screen opens; kept while it's open so a redraw doesn't lose what's typed.
let newForm = null;

// The add/edit exercise panel on a workout's screen:
//   exerciseId = the workout's exercise being edited, in its own card (null when not editing one)
//   adding     = true while + Add exercise is open at the end of the list
//   refId      = the library/custom exercise picked
//   mode       = 'pick' (search library), 'custom' (create custom), 'details' (sets & reps)
//   mode also 'move' (the workouts to move the exercise to)
//   query      = text in the search box
//   group      = the muscle group chip picked in the search (kept while adding several)
//   custom     = the custom exercise being created: { name, startName, equipment, primary: [], secondary: [] }
let picker = newPicker();
function newPicker(adding = false, group = null) {
  return { exerciseId: null, adding, refId: null, mode: 'pick', query: '', group, custom: null };
}

// Has anything been entered on the custom exercise form? (A name carried over from a search doesn't count.)
function customFormChanged() {
  const c = picker.custom;
  if (!c.id) return Boolean(c.primary.length || c.secondary.length || c.name.trim() !== (c.startName || '').trim());
  const saved = Library.get(c.id);
  return ['name', 'equipment', 'primary', 'secondary'].some(key => JSON.stringify(c[key]) !== JSON.stringify(saved[key]));
}

// Redraws just the muscle chips and suggestions on the custom exercise form,
// so whatever search box you're typing in keeps focus.
function refreshMusclePickers() {
  for (const role of ['primary', 'secondary']) {
    const picked = picker.custom[role];
    document.getElementById(`picked-${role}`).innerHTML = Views.pickedMuscles(role, picked);
    const query = document.getElementById(`muscle-search-${role}`).value;
    document.getElementById(`suggest-${role}`).innerHTML = Views.muscleSuggestions(role, query, picked);
  }
}

// Scrolls the add/edit panel into view: the exercise's whole card, or the panel at the end of the list.
function showPanel() {
  const panel = document.getElementById('exercise-panel');
  (panel.closest('.preview-ex') || panel).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Which exercise is expanded on the workout screen (null = all collapsed).
let openExerciseId = null;

// True when the workout screen should open the first unfinished exercise the next time it's drawn:
// on arriving there, but not on each redraw (you may have closed it on purpose).
let autoOpenExercise = true;

// Where Back goes from a log or past workout opened from another screen, with how that screen was left:
//   [{ hash, openExerciseId, logState, scrollY }]  (a Log can open a workout, which can open a Log, …)
let returnStack = [];

// The screens whose Back can return to where they were opened from (with goAndReturn()).
const RETURN_VIEWS = ['past', 'exercise-log', 'workout'];

// Remembers this screen, then goes to another one that Back should return from.
function goAndReturn(hash) {
  returnStack.push({ hash: location.hash || '#/', openExerciseId, logState, scrollY: window.scrollY });
  go(hash);
}

// The summary of the workout just finished (Store.sessionSummary()). Kept in memory on purpose: it
// stays on the Workouts tab until Close, or until the app is fully closed.
let summary = null;

// The cycle's planned sets card on Edit cycle: which muscles are expanded. Kept while the
// app is open, so going into a workout and back leaves them as they were.
const openSets = new Set();
let setsInfoOpen = false; // whether its "i" is open

// "Actual sets, last 7 days" on Profile: which muscles are expanded.
const openActual = new Set();

// Past workouts: the calendar's month (null = this month) and the day tapped (or null).
let historyState = { month: null, day: null };

// The planned sets strip on a workout's screen: whether it's opened up and whether it shows the
// workout or the whole cycle, which muscles are expanded in it, and which muscles the last
// edit changed (shown in green until you leave the screen or edit something else).
const strip = { open: false, mode: 'workout', infoOpen: false };
const stripRows = new Set();
let plannedChanged = new Set();

// Swap for today on the workout screen: whose exercise search is open, and what's typed.
// creating = true while its custom exercise form is showing (the form itself uses picker).
let swap = { exerciseId: null, query: '' };

// "+ Add exercise" on a quick workout: whether its search is open, and what's typed.
// creating = true while its custom exercise form is showing (the form itself uses picker).
let quickAdd = { open: false, query: '' };

// Log screens: the search text (kept so Back returns to the same results),
// and the calendar month / tapped day on an exercise's log.
let logQuery = '';
let logState = { month: null, day: null, range: 'all' };

// The muscle map on Profile: what it shows ('growth' or 'level'), the tapped muscle (its card
// shows under the map, and stays when you open a log and come Back), and whether the "i" is open.
const map = { mode: 'growth', muscle: null, infoOpen: false };

// Body weight log: the day whose weight is open for editing (null = none).
let bwEditDay = null;

// The Cardio tab: the calendar's month (null = this month), the day tapped, and (once one's
// been tapped) graph, the distance picked on the Run times graph.
let cardioState = { month: null, day: null };

// The cardio pop-up, while it's open (see Views.cardioForm()):
//   { kind: 'entry' | 'plan', id (null = new), from: 'week' | 'log' | null, planId, day, weekdays,
//     afterLift, type, name, seconds, miles, feet, mph, incline, where, error }
let cardioForm = null;

function showCardioForm(form) {
  cardioForm = form;
  overlayEl.innerHTML = Views.cardioForm(form);
  overlayEl.className = 'overlay is-notice';
  overlayEl.hidden = false;
}

// A new entry's form: today, unless a planned item's details say otherwise.
function newCardioEntryForm(details = {}) {
  return { kind: 'entry', id: null, from: null, planId: null, day: Cardio.today(), type: 'walk', name: '', ...details };
}

function editCardioEntry(id, from) {
  const entry = Store.getCardioEntry(id);
  if (entry) showCardioForm({ ...entry, kind: 'entry', from });
}

// Reads the boxes into cardioForm, so a redraw (a new type, the error line) keeps what's typed.
// A converted number whose box wasn't changed keeps its saved value, not its rounded display
// value (e.g. 3 mph → 4.8 km/h → 2.98 mph).
function readCardioForm() {
  const f = cardioForm;
  const text = id => document.getElementById(`cardio-${id}`)?.value.trim() ?? null;
  const positive = n => (n > 0 ? n : null);
  const converted = (id, key, show, read) => {
    const typed = text(id);
    if (typed === null || typed === show.call(Units, f[key])) return;
    f[key] = positive(read.call(Units, typed));
  };
  // (The short pop-up for checking off a planned item doesn't have the name, type or date boxes.)
  f.name = text('name') ?? f.name;
  f.type = text('type') ?? f.type;
  if (f.kind === 'entry') f.day = text('date') ?? f.day;
  else {
    f.afterLift = document.getElementById('cardio-lifting').checked;
    f.weekdays = [...overlayEl.querySelectorAll('input[name="cardio-weekday"]:checked')].map(box => Number(box.value));
  }
  const minutes = text('minutes');
  if (minutes !== null) f.seconds = positive(Math.round((parseNumber(minutes) || 0) * 60) + Math.round(parseNumber(text('secs')) || 0));
  converted('miles', 'miles', Units.showDistance, Units.readDistance);
  converted('feet', 'feet', Units.showElevation, Units.readElevation);
  converted('mph', 'mph', Units.showSpeed, Units.readSpeed);
  if (text('incline') !== null) f.incline = parseNumber(text('incline'));
  if (f.type === 'run' && !f.where) f.where = 'outside';
}

// What's wrong with the pop-up's entries, or null if it can be saved.
function cardioFormProblem() {
  const f = cardioForm;
  if (f.kind === 'plan') return f.afterLift || f.weekdays.length ? null : 'Pick at least one day, or After every lift.';
  if (!f.day) return 'Pick a date.';
  if (f.day > dayKey(new Date())) return 'Pick today or an earlier date.';
  if (Cardio.isComplete(f)) return null;
  return f.type === 'run' ? 'A run needs a distance and a time.' : 'Type the minutes first.';
}

// A past workout being edited (nothing is saved until Save changes):
//   { sessionId, exercises: [{ entry (the saved exercise, without its sets), rows: [{ weight (lbs or null), reps (text) }] }],
//     original (rows as they started, to tell if anything changed),
//     editing (index of the exercise with its boxes open, or null) }
let pastEdit = null;

// Every exercise the workout planned, in plan order, with its saved sets plus empty rows up
// to its planned sets, so a set forgotten at the time can be added. Planned exercises that
// weren't logged at all show too, all empty.
function startPastEdit(session) {
  const byId = new Map(session.exercises.map(e => [e.exerciseId, e]));
  const list = [];
  for (const p of session.plan || []) {
    const saved = byId.get(p.exerciseId);
    if (saved) {
      list.push(saved);
      byId.delete(p.exerciseId);
    } else {
      const info = Library.forExercise({ refId: p.refId });
      list.push({ exerciseId: p.exerciseId, refId: p.refId, name: info.name, primary: info.primary,
        secondary: info.secondary, targetSets: p.sets, sets: [] });
    }
  }
  list.push(...byId.values()); // older workouts saved without a plan, or anything not in it

  const exercises = list.map(({ sets, ...entry }) => {
    const rows = sets.map(s => ({ weight: s.weight, reps: String(s.reps) }));
    while (rows.length < (entry.targetSets || 0)) rows.push({ weight: Store.startWeight(entry.refId, null), reps: '' });
    return { entry, rows };
  });
  return { sessionId: session.id, exercises, original: JSON.stringify(exercises.map(e => e.rows)), editing: null };
}

function pastEditChanged() {
  return Boolean(pastEdit) && JSON.stringify(pastEdit.exercises.map(e => e.rows)) !== pastEdit.original;
}

// Saves the title in a workout's pop-up (an empty title keeps the old one).
function saveWorkoutDetails() {
  const name = document.getElementById('workout-name').value.trim();
  if (name) Store.renameWorkout(currentRoute().workoutId, name);
}

// Makes a change to the workout's exercises, and notes which muscles' planned sets it changed.
function trackPlanned(change) {
  const workout = Store.getWorkout(currentRoute().workoutId);
  const before = Stats.plannedSets([workout]).muscles;
  change();
  const after = Stats.plannedSets([workout]).muscles;
  plannedChanged = new Set(Object.keys({ ...before, ...after }).filter(m => (before[m] || 0) !== (after[m] || 0)));
}

// What's in the sets & reps form on a workout's screen.
function exerciseFormFields(form) {
  const values = Object.fromEntries(new FormData(form));
  const repA = Math.max(1, parseInt(values.repMin, 10) || 1);
  const repB = Math.max(1, parseInt(values.repMax, 10) || repA);
  return {
    refId: picker.refId,
    sets: Math.max(1, parseInt(values.sets, 10) || 1),
    repMin: Math.min(repA, repB), // swapped if typed backwards
    repMax: Math.max(repA, repB),
  };
}

// Saves the sets & reps form: the exercise being edited, or a new one added to the workout.
function saveExerciseForm(form) {
  const fields = exerciseFormFields(form);
  const workoutId = currentRoute().workoutId;
  const name = Library.forExercise(fields).name;
  trackPlanned(() => {
    if (picker.exerciseId) Store.updateExercise(workoutId, picker.exerciseId, fields);
    else Store.addExercise(workoutId, fields);
  });
  toast(picker.exerciseId ? `Saved ${name}` : `Added ${name}`);
}

// Doing something else (Back, Start workout, another pencil, …) with the sets & reps form still
// open. Everything on this screen saves as it changes, so changes to an exercise save here too.
// An exercise only picked so far might just have been looked at, so that one asks first.
// `then` is what was tapped; it runs once that's settled.
function withFormSaved(then) {
  // A custom exercise isn't saved until its form is, so leaving a half-filled one asks first.
  if (document.getElementById('custom-form') && customFormChanged()) {
    afterFormQuestion = then;
    showDialog({
      title: 'Leave without saving?',
      lines: ['This custom exercise hasn\'t been saved.'],
      confirm: { label: 'Keep editing', action: 'dialog-cancel' },
      cancel: { label: 'Discard it', action: 'leave-skip' },
    });
    return;
  }
  const form = document.getElementById('exercise-form');
  if (!form) return then();
  if (!form.reportValidity()) return; // e.g. the sets box was left empty: says so and stays
  if (!picker.exerciseId) {
    const { name } = Library.forExercise({ refId: picker.refId });
    afterFormQuestion = then;
    showDialog({
      title: `Add ${name}?`,
      lines: [`You picked ${name} but didn't add it to this workout.`],
      confirm: { label: 'Add to workout', action: 'leave-add' },
      cancel: { label: 'Don\'t add', action: 'leave-skip' },
    });
    return;
  }
  const before = Store.getWorkout(currentRoute().workoutId).exercises.find(e => e.id === picker.exerciseId);
  const after = exerciseFormFields(form);
  if (['refId', 'sets', 'repMin', 'repMax'].some(key => before[key] !== after[key])) saveExerciseForm(form);
  then();
}

// What to do once the "Add this exercise?" question above is answered.
let afterFormQuestion = null;

// Only one workout can be in progress. Asks before throwing away the one there is,
// then does `then` if it was discarded.
function discardOtherDraft(then) {
  const other = Store.draftWorkout();
  askFirst({
    title: 'Discard your workout?',
    lines: [`You have an unfinished "${other ? other.name : 'workout'}". Discard it and start this one?`],
    confirmLabel: 'Discard and start',
    danger: true,
  }, () => {
    Store.discardDraft();
    then();
  });
}

// Opens or closes the + button's menu (New workout / Quick workout).
function setFabMenu(open) {
  const menu = document.getElementById('fab-menu');
  if (!menu) return;
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', !open);
  document.querySelector('.fab').setAttribute('aria-expanded', open);
}

// Opens the custom exercise form from a workout's search (Swap for today or a quick workout's
// + Add exercise). It's the same form as the edit screen, named from whatever was typed.
function openCustomForm(query) {
  picker = newPicker();
  picker.mode = 'custom';
  picker.custom = { id: null, name: query.trim(), startName: query.trim(), equipment: EQUIPMENT[0], primary: [], secondary: [] };
  render();
  document.getElementById('custom-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Shows a yes/no pop-up (see Views.confirmDialog).
function showDialog(options) {
  overlayEl.innerHTML = Views.confirmDialog(options);
  overlayEl.className = 'overlay is-notice';
  overlayEl.hidden = false;
}

function hideDialog() {
  overlayEl.hidden = true;
  overlayEl.innerHTML = '';
}

// A yes/no pop-up that runs `then` if the answer is yes. (The app's own pop-up, not the browser's.)
//   options = { title, lines, confirmLabel, danger }
function askFirst(options, then) {
  afterYes = then;
  showDialog({
    ...options,
    confirm: { label: options.confirmLabel, action: 'dialog-yes' },
    cancel: { label: 'Cancel', action: 'dialog-cancel' },
  });
}
let afterYes = null;

function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'workout' && parts[1]) {
    // slotId = the place in the cycle it was opened from, if any
    return { view: 'workout', workoutId: parts[1], slotId: parts[2] || null, tab: 'workouts' };
  }
  if (parts[0] === 'quick') return { view: 'quick', tab: 'workouts' };
  if (parts[0] === 'cycle') return { view: 'cycle', tab: 'workouts' };
  if (parts[0] === 'new') {
    // #/new/<id> = a copy of that workout
    return { view: 'new', copyFrom: parts[1] || null, tab: 'workouts' };
  }
  if (parts[0] === 'history') {
    return parts[1] ? { view: 'past', sessionId: parts[1], tab: 'workouts' } : { view: 'history', tab: 'workouts' };
  }
  if (parts[0] === 'profile') return { view: 'profile', tab: 'profile' };
  if (parts[0] === 'settings') return { view: 'settings', tab: 'profile' };
  if (parts[0] === 'body-weight') return { view: 'body-weight', tab: 'profile' };
  if (parts[0] === 'cardio') return { view: 'cardio', tab: 'cardio' };
  if (parts[0] === 'log') {
    return parts[1]
      ? { view: 'exercise-log', refId: decodeURIComponent(parts[1]), tab: 'profile' }
      : { view: 'log', tab: 'profile' };
  }
  return { view: 'home', tab: 'workouts' };
}

function go(hash) {
  location.hash = hash;
}

function render() {
  Streak.update(); // decides any week that just ended, and catches a week that was just hit
  const route = currentRoute();
  const setup = !Store.data.settings.setupDone;
  if (summary && !Store.getSession(summary.sessionId)) summary = null; // that workout was deleted
  let screen;

  if (setup) {
    screen = Views.setup();
  } else if (route.view === 'home') {
    screen = summary ? Views.summary(summary) : Views.home();
  } else if (route.view === 'cycle') {
    screen = Views.cycleEdit(openSets, setsInfoOpen);
  } else if (route.view === 'history') {
    screen = Views.history(historyState);
  } else if (route.view === 'past') {
    const session = Store.getSession(route.sessionId);
    if (!session) return go('#/history');
    if (!pastEdit || pastEdit.sessionId !== session.id) pastEdit = startPastEdit(session);
    screen = Views.pastWorkout(session, pastEdit);
  } else if (route.view === 'profile') {
    screen = Views.profile(map, openActual);
  } else if (route.view === 'settings') {
    screen = Views.settings();
  } else if (route.view === 'body-weight') {
    screen = Views.bodyWeightLog(bwEditDay);
  } else if (route.view === 'cardio') {
    screen = Views.cardio(cardioState);
  } else if (route.view === 'log') {
    screen = Views.logSearch(logQuery);
  } else if (route.view === 'exercise-log') {
    screen = Views.exerciseLog(route.refId, logState);
  } else if (route.view === 'new') {
    if (!newForm) {
      const source = route.copyFrom && Store.getWorkout(route.copyFrom);
      newForm = source ? { name: source.name, copyFrom: source.id } : { name: '', copyFrom: null };
    }
    screen = Views.newWorkout(newForm);
  } else if (route.view === 'quick') {
    const quick = Store.draftWorkout();
    if (!quick?.quick) return go('#/'); // no quick workout in progress (finished or discarded)
    if (autoOpenExercise) openExerciseId = Store.firstUnfinished();
    autoOpenExercise = false;
    screen = Views.workout(quick, Store.data.draft, openExerciseId, swap, quickAdd, picker);
  } else {
    const workout = Store.getWorkout(route.workoutId);
    if (!workout) return go('#/');
    if (Store.data.draft?.workoutId === workout.id && (workout.exercises.length || Store.data.draft.added.length)) {
      // This workout has been started: the real thing.
      const draft = Store.ensureDraft(workout);
      if (autoOpenExercise) openExerciseId = Store.firstUnfinished();
      autoOpenExercise = false;
      screen = Views.workout(Store.draftWorkout(), draft, openExerciseId, swap, quickAdd, picker);
    } else {
      // Not started: look at it and change it. Start workout is what starts it (and the timer).
      screen = Views.workoutPreview(workout, { picker, strip, stripRows, changed: plannedChanged });
    }
  }

  // Opened from another screen (a log or past workout from anywhere, a workout from Edit cycle):
  // Back returns there.
  if (RETURN_VIEWS.includes(route.view) && returnStack.length) {
    screen.back = returnStack[returnStack.length - 1].hash;
  }

  titleEl.textContent = screen.title;
  document.title = screen.title;
  backBtn.hidden = !screen.back;
  backBtn.dataset.href = screen.back || '';
  // "‹ Back" has its own row above the title, so the top bar is taller (--header-h in the CSS)
  document.body.classList.toggle('has-back', Boolean(screen.back));
  gearBtn.hidden = !screen.gear;
  historyLink.hidden = !screen.history;
  timerEl.hidden = !(screen.timer && Store.data.draft);
  document.body.classList.toggle('in-workout', Boolean(screen.timer && Store.data.draft));
  // The tab bar only shows on each tab's main screen; deeper screens use Back.
  const here = '#/' + location.hash.replace(/^#\/?/, '');
  const showTabs = !setup && TABS.some(tab => tab.href === here);
  tabBarEl.hidden = !showTabs;
  document.body.classList.toggle('no-tabbar', !showTabs);
  tabBarEl.innerHTML = tabBarHtml(route.tab);
  appEl.classList.remove('is-searching');
  appEl.innerHTML = screen.html;
  updateTimers();
  showOverlay();
}

// The app always opens at the top of the page: the browser's own "keep the old scroll
// position on reload" is turned off. (The user asked for this instead of scrolling to today.)
history.scrollRestoration = 'manual';

// ---------- Streak celebration and notices (full-screen, over any screen) ----------

const overlayEl = document.getElementById('overlay');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Shows the celebration if a week was just hit, otherwise any streak notice waiting.
function showOverlay() {
  if (!overlayEl.hidden) return;
  if (Streak.celebrate != null) {
    const streak = Streak.celebrate;
    Streak.celebrate = null;
    overlayEl.innerHTML = Views.celebration(streak);
    overlayEl.className = 'overlay is-celebration';
    overlayEl.hidden = false;
    overlayEl.dataset.openedAt = Date.now();
    countUp(overlayEl.querySelector('.celebrate-num'), streak);
  } else if (Store.data.streak.notices.length) {
    overlayEl.innerHTML = Views.streakNotice(Store.data.streak.notices);
    overlayEl.className = 'overlay is-notice';
    overlayEl.hidden = false;
  }
}

function closeOverlay() {
  overlayEl.hidden = true;
  overlayEl.innerHTML = '';
  showOverlay(); // a notice may be waiting behind a celebration
}

// Counts the number up from 0 after the flame pops in, slowing down at the end.
function countUp(el, to) {
  if (reduceMotion.matches) return; // the final number is already showing
  const delay = 350;
  const duration = Math.min(1400, 400 + to * 60);
  const started = performance.now() + delay;
  el.textContent = '0';
  const tick = now => {
    const t = Math.min(1, Math.max(0, (now - started) / duration));
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// A short message at the bottom. With button = { label, action }, it also shows a
// button (e.g. Undo) that runs that action; it stays up for `ms` (2.5 seconds unless a longer
// time is given, as "Workout saved" does so there's time to tap Undo).
const TOAST_MS = 2500;
function toast(message, button = null, ms = TOAST_MS) {
  lastFinish = null; // a new message replaces any Undo
  toastEl.textContent = message;
  if (button) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-btn';
    btn.dataset.action = button.action;
    btn.textContent = button.label;
    toastEl.append(btn);
  }
  toastEl.classList.toggle('has-button', Boolean(button));
  toastEl.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hideToast, ms);
}

function hideToast() {
  clearTimeout(toast.timer);
  toastEl.hidden = true;
  toastEl.textContent = '';
  toastEl.classList.remove('has-button');
  lastFinish = null; // Undo is only offered while its toast shows
}

// The workout just finished, kept while its Undo toast shows:
//   { sessionId, draft (copy from before finishing) }
let lastFinish = null;

// Before finishing: any weight that looks like a typo (1350 instead of 135) is asked about first.
function checkWeightsThenFinish() {
  const checks = Store.draftWeightChecks();
  if (!checks.length) return finishWorkout();
  const unit = Units.weightUnit();
  showDialog({
    title: checks.length === 1 ? 'Is this weight right?' : 'Are these weights right?',
    lines: checks.map(c => `${c.name}: ${Units.showWeight(c.weight)} ${unit}. ${c.heaviest
      ? `Your heaviest so far is ${Units.showWeight(c.heaviest)} ${unit}.` : 'That\'s very heavy for a first time.'}`),
    confirm: { label: 'Yes, finish', action: 'weights-ok' },
    cancel: { label: 'Go back and fix it', action: 'weights-fix', id: checks[0].id },
  });
}

// endAt (ms, optional) = end it at that time instead of now ("Use last set time").
// A workout left running for over 3 hours asks first (unless `checked`, i.e. already answered).
function finishWorkout(endAt = null, checked = false) {
  const elapsed = Store.draftElapsed();
  const lastSet = Store.lastSetTime();
  if (!checked && elapsed > LONG_WORKOUT_MS && lastSet) {
    const at = new Date(lastSet).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    showDialog({
      title: 'Still working out?',
      lines: [`This workout ran ${formatHoursMinutes(elapsed)}. End it at your last logged set (${at}) instead?`],
      confirm: { label: 'Use last set time', action: 'finish-last-set', id: String(lastSet) },
      cancel: { label: `Keep ${formatHoursMinutes(elapsed)}`, action: 'finish-keep' },
    });
    return;
  }

  const draft = JSON.parse(JSON.stringify(Store.data.draft));
  const session = Store.finishDraft(endAt);
  if (!session) {
    toast('Fill in at least one set first');
    return;
  }
  // Ended at a last set in a week that's already over: that week is judged again with it.
  const earlierWeek = weekKey(new Date(session.date).getTime()) < weekKey(Date.now());
  if (earlierWeek) Streak.rejudge(session.date);
  summary = Store.sessionSummary(session);
  toast('Workout saved 💪', { label: 'Undo', action: 'undo-finish' }, 5000);
  lastFinish = { sessionId: session.id, draft, rejudgeFrom: earlierWeek ? session.date : null };
  go('#/');
}

// ---------- Button taps ----------

const actions = {
  // Tapped a workout on the week: opens it to look at (or resumes it, if it's the one in progress).
  // (Also a row in the planned sets lists. On this workout's own screen, that just closes the strip.)
  'open-workout'(id) {
    if (dragJustEnded()) return;
    if (currentRoute().workoutId === id) {
      strip.open = false;
      return render();
    }
    // (From Edit cycle's planned sets, Back returns to Edit cycle.)
    withFormSaved(() => (currentRoute().view === 'cycle' ? goAndReturn : go)(`#/workout/${id}`));
  },

  // Start workout (on a workout's screen, or on Next Up): starts it and its timer straight away,
  // since opening the workout was already a tap. It only asks if another workout in progress would
  // be thrown away. It counts as the place in the cycle it was opened from (Next Up's, or the one
  // in the address), so Next Up carries on from there once it's finished.
  'start-workout'(id, button) {
    const key = `${id}|${button?.dataset.slot || currentRoute().slotId || ''}`;
    withFormSaved(() => {
      if (!Store.data.draft) return actions['start-workout-confirm'](key);
      const other = Store.draftWorkout();
      showDialog({
        title: `Start ${Store.getWorkout(id).name}?`,
        lines: [`Your unfinished "${other ? other.name : 'workout'}" will be discarded.`],
        confirm: { label: 'Start workout', action: 'start-workout-confirm', id: key },
        cancel: { label: 'Not yet', action: 'dialog-cancel' },
      });
    });
  },

  // key = 'workout id|cycle item id' (the cycle item may be empty)
  'start-workout-confirm'(key) {
    const [id, slot] = key.split('|');
    hideDialog();
    picker = newPicker();
    Store.discardDraft();
    const place = Store.cyclePlaceFor(id, slot || null);
    Store.ensureDraft(Store.getWorkout(id), place);
    autoOpenExercise = true;
    const hash = `#/workout/${id}${place ? `/${place}` : ''}`;
    if (location.hash !== hash) return go(hash); // (from Next Up: on to the workout's screen)
    render();
    window.scrollTo(0, 0);
  },

  // Tapped a workout on Edit cycle (or Next Up's name): opens it as that place in the cycle.
  // From Edit cycle, Back returns there.
  'open-slot'(itemId) {
    if (dragJustEnded()) return;
    const item = Store.getCycleItem(itemId);
    if (!item) return;
    const hash = `#/workout/${item.workoutId}/${item.id}`;
    if (currentRoute().view === 'cycle') goAndReturn(hash);
    else go(hash);
  },

  // "Do a different workout" under Next Up: a sheet with every workout in the cycle.
  'other-open'() {
    overlayEl.innerHTML = Views.otherWorkoutSheet();
    overlayEl.className = 'overlay is-notice';
    overlayEl.hidden = false;
  },

  // A day with a workout on the week strip: Past workouts, with that day open on its calendar.
  'week-day'(day) {
    historyState = { month: day.slice(0, 7), day };
    go('#/history');
  },

  // ✕ on a place in the cycle (with Edit on). A workout that's nowhere else in the cycle would be
  // deleted with it, so that asks first.
  'cycle-remove'(itemId) {
    const item = Store.getCycleItem(itemId);
    if (!Store.isOnlyPlaceFor(itemId)) {
      Store.removeFromCycle(itemId);
      toast(item.kind === 'rest' ? 'Rest day removed' : `Removed ${Store.getWorkout(item.workoutId).name} from this place`);
      return render();
    }
    const workout = Store.getWorkout(item.workoutId);
    const lines = [`It's only in your cycle once, so ${workout.name} will be deleted. Workouts you've already finished with it stay in Past workouts and your logs.`];
    if (Store.data.draft?.workoutId === workout.id) lines.push('You\'re in the middle of this workout: what you\'ve logged today will be discarded.');
    askFirst({ title: `Delete ${workout.name}?`, lines, confirmLabel: 'Delete workout', danger: true }, () => {
      Store.removeFromCycle(itemId);
      toast(`Deleted ${workout.name}`);
      render();
    });
  },

  // + Add workout (with Edit on): one of your workouts again, or a new one.
  'cycle-add-open'() {
    overlayEl.innerHTML = Views.cycleAddPicker();
    overlayEl.className = 'overlay is-notice';
    overlayEl.hidden = false;
  },

  'cycle-add-workout'(workoutId) {
    hideDialog();
    Store.addToCycle(workoutId);
    toast(`Added ${Store.getWorkout(workoutId).name} to the end of your cycle`);
    render();
  },

  'cycle-add-rest'() {
    Store.addToCycle(null);
    toast('Rest day added to the end of your cycle');
    render();
  },

  // Next on a filled-in exercise: closes it and opens the next one. If every set hit the top of
  // its rep range, a small message suggests going heavier next time.
  'next-exercise'(id) {
    const list = Store.draftWorkout().exercises;
    const next = list[list.findIndex(e => e.id === id) + 1];
    const ready = Store.readyForMoreWeight(id);
    openExerciseId = next ? next.id : null;
    swap = { exerciseId: null, query: '' };
    render();
    (next ? document.getElementById(`ex-${next.id}`) : document.querySelector('.finish-bar')).scrollIntoView({ block: 'nearest' });
    if (ready) {
      const ex = list.find(e => e.id === id);
      toast(`Hit ${ex.repMax} every set. Try ${heavierText(ready)} next time.`);
    }
  },

  // A Log button: opens that exercise's log, and Back returns here.
  'view-log'(refId) {
    withFormSaved(() => goAndReturn(`#/log/${encodeURIComponent(refId)}`));
  },

  // A muscle group chip in an exercise search: shows that group (tap again to go back).
  'browse-group'(group, button) {
    const picked = button.classList.contains('is-picked');
    if (button.dataset.target === 'pick-exercise') picker.group = picked ? null : group; // stays while adding several
    button.closest('.lib-results').innerHTML = Views.libraryResults('', button.dataset.target, picked ? null : group);
  },

  'close-summary'() {
    summary = null;
    hideToast();
    render();
    window.scrollTo(0, 0);
  },

  // Get started (or skip) on the first-time setup. What's typed saves as it changes,
  // but save the box you're still in too.
  'setup-done'() {
    saveSettingsForm(document.getElementById('settings-form'));
    Store.updateSettings({ setupDone: true });
    if (currentRoute().view === 'home') render();
    else go('#/');
    window.scrollTo(0, 0); // Get started is far down the page; the Workouts tab opens at the top
  },

  // Delete a custom exercise: it comes out of search and any workout using it, so that's said first.
  'delete-custom'(id) {
    const e = Library.get(id);
    const used = Store.workoutsUsing(id).map(w => w.name);
    const lines = [];
    if (used.length) lines.push(`It's in ${used.join(', ')}, and will be removed from ${used.length === 1 ? 'that workout' : 'those workouts'}.`);
    lines.push('Workouts you\'ve already finished and its log stay as they are.');
    showDialog({
      title: `Delete ${e.name}?`,
      lines,
      confirm: { label: 'Delete exercise', action: 'delete-custom-confirm', id },
      cancel: { label: 'Cancel', action: 'dialog-cancel' },
      danger: true,
    });
  },

  'delete-custom-confirm'(id) {
    const name = Library.get(id).name;
    hideDialog();
    Store.deleteCustomExercise(id);
    picker = newPicker();
    toast(`Deleted ${name}`);
    render();
  },

  // Body weight log: opens one day's weight in a box, ready to type over.
  'bw-edit'(day) {
    bwEditDay = day;
    render();
    document.getElementById('bw-edit-weight').select();
  },

  'bw-edit-cancel'() {
    bwEditDay = null;
    render();
  },

  'bw-delete'(day) {
    const entry = Store.data.bodyWeightLog.find(e => e.day === day);
    showDialog({
      title: `Delete ${Units.showWeight(entry.lbs)} ${Units.weightUnit()}?`,
      lines: [`This removes the weight logged on ${shortDate(fromDayKey(day))} from your log and graph.`],
      confirm: { label: 'Delete weight', action: 'bw-delete-confirm', id: day },
      cancel: { label: 'Cancel', action: 'dialog-cancel' },
      danger: true,
    });
  },

  'bw-delete-confirm'(day) {
    hideDialog();
    Store.deleteBodyWeight(day);
    bwEditDay = null;
    toast('Weight deleted');
    render();
  },

  // Graph length on an exercise's log.
  'log-range'(range) {
    logState.range = range;
    render();
  },

  // The switch on a bodyweight exercise's log: reps with no added weight, or Weighted.
  'log-tab'(tab) {
    logState.weighted = tab === 'weighted';
    logState.day = null;
    render();
  },

  // Show all, under the list of times an exercise was done.
  'log-show-all'() {
    logState.showAll = true;
    render();
  },

  // Resume on the "Workout in progress" banner for a quick workout.
  'resume-quick'() {
    go('#/quick');
  },

  // The + button: opens (or closes) the small menu: New workout / Quick workout.
  'fab-menu'() {
    setFabMenu(!document.getElementById('fab-menu').classList.contains('is-open'));
  },

  // Quick workout: a one-off that's logged but not added to the week.
  // (One already in progress is resumed; another workout in progress is discarded after asking.)
  'quick-start'() {
    setFabMenu(false);
    const begin = () => {
      if (!Store.data.draft?.quick) Store.startQuick();
      go('#/quick');
    };
    const draft = Store.data.draft;
    if (draft && !draft.quick) discardOtherDraft(begin);
    else begin();
  },

  'quick-add-open'() {
    quickAdd = { open: true, query: '' };
    render();
    document.getElementById('quick-search').focus();
  },

  'quick-add-cancel'() {
    quickAdd = { open: false, query: '' };
    render();
  },

  'quick-new-custom'() {
    quickAdd.creating = true;
    openCustomForm(quickAdd.query);
  },

  // Tapped an exercise in the quick workout's search: add it with one set and open it.
  'quick-pick'(refId) {
    openExerciseId = Store.quickAddExercise(refId);
    quickAdd = { open: false, query: '' };
    render();
    document.getElementById(`ex-${openExerciseId}`).scrollIntoView({ block: 'nearest' });
  },

  'add-set'(id) {
    Store.addDraftSet(id);
    render();
  },

  // Takes off the last set; asks first if reps were already typed in it.
  'remove-set'(id) {
    const remove = () => {
      Store.removeDraftSet(id);
      render();
    };
    const rows = Store.data.draft.entries[id];
    if (rows[rows.length - 1].reps === '') return remove();
    askFirst({ title: 'Remove the last set?', lines: ['The reps typed in it will be removed too.'], confirmLabel: 'Remove set', danger: true }, remove);
  },

  'quick-remove'(id) {
    const remove = () => {
      Store.quickRemoveExercise(id);
      openExerciseId = null;
      render();
    };
    if (!Store.draftHasReps(id)) return remove();
    askFirst({ title: 'Remove this exercise?', lines: ['The sets typed for it will be removed too.'], confirmLabel: 'Remove exercise', danger: true }, remove);
  },

  // The pencil at the top of a workout's screen: its title, day, Copy and Delete, in a pop-up.
  'workout-details'(id) {
    withFormSaved(() => {
      picker = newPicker();
      render();
      overlayEl.innerHTML = Views.workoutDetails(Store.getWorkout(id));
      overlayEl.className = 'overlay is-notice';
      overlayEl.hidden = false;
    });
  },

  'details-done'() {
    saveWorkoutDetails();
    hideDialog();
    render();
  },

  // New workout (the + menu, or + Add workout on the cycle). Every workout goes in the cycle,
  // so a full cycle can't take another.
  'new-workout'() {
    hideDialog();
    if (!Store.cycleHasRoom()) {
      toast(`Your cycle has ${MAX_CYCLE_WORKOUTS} workouts, the most it can hold`);
      return;
    }
    go('#/new');
  },

  'copy-workout'(id) {
    saveWorkoutDetails();
    hideDialog();
    if (!Store.cycleHasRoom()) {
      toast(`Your cycle has ${MAX_CYCLE_WORKOUTS} workouts, the most it can hold`);
      return render();
    }
    go(`#/new/${id}`);
  },

  // The pencil on an exercise: opens its sets & reps inside its card, or closes them if they're open.
  'edit-exercise'(id) {
    const wasOpen = picker.exerciseId === id;
    withFormSaved(() => {
      const ex = Store.getWorkout(currentRoute().workoutId).exercises.find(e => e.id === id);
      picker = wasOpen ? newPicker() : { ...newPicker(), exerciseId: id, refId: ex.refId, mode: 'details' };
      render();
      if (!wasOpen) showPanel();
    });
  },

  // + Add exercise at the end of the list.
  'add-exercise'() {
    withFormSaved(() => {
      picker = newPicker(true);
      render();
      showPanel();
    });
  },

  'close-add'() {
    picker = newPicker();
    render();
  },

  // The − and + beside the sets box.
  'sets-step'(step) {
    const input = document.getElementById('ex-sets');
    input.value = Math.min(20, Math.max(1, (parseInt(input.value, 10) || 0) + Number(step)));
  },

  // The answers to "Add this exercise?" (see withFormSaved).
  'leave-add'() {
    saveExerciseForm(document.getElementById('exercise-form'));
    picker = newPicker();
    hideDialog();
    render();
    afterFormQuestion();
  },

  'leave-skip'() {
    picker = newPicker();
    swap.creating = false;
    quickAdd.creating = false;
    hideDialog();
    render();
    afterFormQuestion();
  },

  // The planned sets strip: open or close it (only its class changes, so it slides smoothly).
  'strip-toggle'() {
    strip.open = !strip.open;
    const el = document.getElementById('sets-strip');
    el.classList.toggle('is-open', strip.open);
    el.querySelector('.strip-bar').setAttribute('aria-expanded', strip.open);
  },

  // The "i" by planned sets, on the Workouts tab or in the strip.
  'sets-info'(_, button) {
    const open = button.getAttribute('aria-expanded') !== 'true';
    if (button.closest('.sets-strip')) strip.infoOpen = open;
    else setsInfoOpen = open;
    document.getElementById('sets-info').hidden = !open;
    button.setAttribute('aria-expanded', open);
  },

  // Its switch between this workout and the whole cycle.
  'strip-mode'(mode) {
    strip.mode = mode;
    document.getElementById('sets-strip').outerHTML =
      plannedStrip(Store.getWorkout(currentRoute().workoutId), strip, stripRows, plannedChanged);
  },

  'delete-workout'(id) {
    const workout = Store.getWorkout(id);
    const places = Store.data.cycle.filter(item => item.workoutId === id).length;
    const lines = [`${workout.name} will be removed from your cycle${places > 1 ? ` (all ${places} places)` : ''}. Workouts you've already finished with it stay in Past workouts and your logs.`];
    if (Store.data.draft?.workoutId === id) lines.push('You\'re in the middle of this workout: what you\'ve logged today will be discarded.');
    showDialog({
      title: `Delete ${workout.name}?`,
      lines,
      confirm: { label: 'Delete workout', action: 'delete-workout-confirm', id },
      cancel: { label: 'Cancel', action: 'dialog-cancel' },
      danger: true,
    });
  },

  'delete-workout-confirm'(id) {
    const name = Store.getWorkout(id).name;
    hideDialog();
    Store.deleteWorkout(id);
    toast(`Deleted ${name}`);
    go('#/');
  },

  // Cancel in the panel. While adding, that's back to the search; on an exercise, it closes.
  'cancel-edit'() {
    picker = newPicker(!picker.exerciseId, picker.group);
    render();
    if (picker.adding) showPanel();
  },

  // "Move to another workout" on an exercise: first saves what's in its form, then lists the workouts.
  'move-open'() {
    withFormSaved(() => {
      picker = { ...picker, mode: 'move' };
      render();
      showPanel();
    });
  },

  'move-cancel'() {
    picker = { ...picker, mode: 'details' };
    render();
    showPanel();
  },

  'move-confirm'(toWorkoutId) {
    const { workoutId } = currentRoute();
    const { exerciseId, refId } = picker;
    trackPlanned(() => Store.moveExerciseToWorkout(workoutId, exerciseId, toWorkoutId));
    toast(`Moved ${Library.forExercise({ refId }).name} to ${Store.getWorkout(toWorkoutId).name}`);
    picker = newPicker();
    render();
  },

  // Tapped an exercise in the library search results.
  'pick-exercise'(refId) {
    picker.refId = refId;
    picker.mode = 'details';
    render();
    showPanel();
  },

  // Back to the library to pick a different exercise.
  'change-exercise'() {
    picker.mode = 'pick';
    render();
    showPanel();
  },

  'new-custom'() {
    picker.mode = 'custom';
    picker.custom = { id: null, name: picker.query.trim(), startName: picker.query.trim(), equipment: EQUIPMENT[0], primary: [], secondary: [] };
    render();
    showPanel();
  },

  // Open the picked custom exercise in the custom form to change its name/muscles.
  'edit-custom'() {
    const e = Library.get(picker.refId);
    picker.mode = 'custom';
    picker.custom = { id: e.id, name: e.name, equipment: e.equipment, primary: [...e.primary], secondary: [...e.secondary] };
    render();
    showPanel();
  },

  // Tapped a suggested muscle. A muscle is primary or secondary, not both,
  // so adding it to one list takes it out of the other.
  'add-muscle'(id, button) {
    const role = button.dataset.role;
    const other = role === 'primary' ? 'secondary' : 'primary';
    picker.custom[other] = picker.custom[other].filter(m => m !== id);
    picker.custom[role].push(id);
    refreshMusclePickers();
  },

  'remove-muscle'(id, button) {
    const role = button.dataset.role;
    picker.custom[role] = picker.custom[role].filter(m => m !== id);
    refreshMusclePickers();
  },

  // Leaving the custom form: back to the library, or back to sets & reps when editing.
  'cancel-custom'() {
    // (if this form was opened from a workout's search: back to that search)
    swap.creating = false;
    quickAdd.creating = false;
    picker.mode = picker.custom.id ? 'details' : 'pick';
    render();
  },

  'delete-exercise'(id) {
    const ex = Store.getWorkout(currentRoute().workoutId).exercises.find(e => e.id === id);
    const { name } = Library.forExercise(ex);
    showDialog({
      title: `Delete ${name}?`,
      lines: ['It comes out of this workout. Workouts you\'ve already finished keep it, and so does its log.'],
      confirm: { label: 'Delete exercise', action: 'delete-exercise-confirm', id },
      cancel: { label: 'Cancel', action: 'dialog-cancel' },
      danger: true,
    });
  },

  'delete-exercise-confirm'(id) {
    trackPlanned(() => Store.deleteExercise(currentRoute().workoutId, id));
    hideDialog();
    picker = newPicker();
    render();
  },

  // Opens this exercise (closing any other), or closes it if it's already open.
  'toggle-exercise'(id) {
    if (dragJustEnded()) return;
    openExerciseId = openExerciseId === id ? null : id;
    swap = { exerciseId: null, query: '' };
    render();
    // Closing one above can shift this row off screen, so bring it back into view.
    document.getElementById(`ex-${id}`).scrollIntoView({ block: 'nearest' });
  },

  // Planned sets: tap a muscle to show the exercises behind its number.
  // Only the row's class changes (no redraw), so CSS can slide it open smoothly.
  'toggle-muscle'(id, button) {
    const table = button.closest('.sets-table').dataset.table;
    toggleSetsBlock(table === 'strip' ? stripRows : table === 'actual' ? openActual : openSets, id, button);
  },

  // Swap for today: open the exercise search under this exercise.
  'swap-open'(id) {
    swap = { exerciseId: id, query: '' };
    render();
    document.getElementById('swap-search').focus();
  },

  'swap-cancel'() {
    swap = { exerciseId: null, query: '' };
    render();
  },

  'swap-new-custom'() {
    swap.creating = true;
    openCustomForm(swap.query);
  },

  // Tapped an exercise in the swap search: do it instead of the planned one, this workout only.
  // Any sets already typed for this exercise are cleared.
  'swap-pick'(refId) {
    const workout = Store.getWorkout(currentRoute().workoutId);
    Store.swapExercise(workout, swap.exerciseId, refId);
    toast(`Swapped for today: ${Library.forExercise({ refId }).name}`);
    swap = { exerciseId: null, query: '' };
    render();
  },

  // Back to the planned exercise.
  'swap-undo'(id) {
    const workout = Store.getWorkout(currentRoute().workoutId);
    Store.swapExercise(workout, id, workout.exercises.find(e => e.id === id).refId);
    render();
  },

  // Finish workout: if any set is still empty, ask first (Go back / Finish anyway).
  'finish'() {
    const workout = Store.draftWorkout();
    if (!workout.exercises.some(ex => Store.draftHasReps(ex.id))) {
      toast('Fill in at least one set first');
      return;
    }
    const gaps = Store.draftGaps();
    if (!gaps.length) return checkWeightsThenFinish();
    overlayEl.innerHTML = Views.finishCheck(gaps);
    overlayEl.className = 'overlay is-notice';
    overlayEl.hidden = false;
  },

  // The "ran over 3 hours" question: end at the last set, or keep the full time.
  'finish-last-set'(time) {
    hideDialog();
    finishWorkout(Number(time), true);
  },

  'finish-keep'() {
    hideDialog();
    finishWorkout(null, true);
  },

  // Pause / resume button next to the timer.
  'timer-toggle'() {
    if (!Store.data.draft) return;
    if (Store.isDraftPaused()) Store.resumeDraft();
    else Store.pauseDraft();
    updateTimers();
  },

  'finish-anyway'() {
    overlayEl.hidden = true;
    overlayEl.innerHTML = '';
    checkWeightsThenFinish();
  },

  // The answers to "Is this weight right?" at Finish.
  'weights-ok'() {
    hideDialog();
    finishWorkout();
  },

  // Back to the workout, with the exercise that looked wrong open.
  'weights-fix'(id) {
    hideDialog();
    openExerciseId = id;
    render();
    document.getElementById(`ex-${id}`).scrollIntoView({ block: 'start' });
  },

  // The yes on a pop-up from askFirst().
  'dialog-yes'() {
    hideDialog();
    afterYes();
  },

  'finish-back'() {
    closeOverlay();
  },

  // ---------- Past workouts ----------

  // From an exercise's log, Back returns to that log; from anywhere else, to Past workouts.
  'open-session'(id) {
    if (currentRoute().view === 'exercise-log') goAndReturn(`#/history/${id}`);
    else go(`#/history/${id}`);
  },

  // The pencil on a past workout's exercise: opens its boxes (closing any other), or closes them.
  // What's typed stays in pastEdit until Save changes.
  'past-edit-exercise'(index) {
    const x = Number(index);
    pastEdit.editing = pastEdit.editing === x ? null : x;
    render();
  },

  // Saves the edited sets, then re-checks the streak from that workout's week.
  // (Logs, the muscle map and "last time" are read from the workouts, so they follow on their own.)
  'past-save'() {
    const session = Store.getSession(pastEdit.sessionId);
    const toNumber = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
    const exercises = pastEdit.exercises.map(({ entry, rows }) => ({
      ...entry,
      sets: rows.map(r => ({ weight: r.weight, reps: toNumber(r.reps) })).filter(s => s.reps !== null),
    }));
    if (!exercises.some(e => e.sets.length)) {
      toast('Every set is empty. Use Delete workout to remove it.');
      return;
    }
    if (pastEditChanged()) {
      Store.updateSession(session.id, exercises);
      Streak.rejudge(session.date);
      toast('Changes saved');
    }
    go(backBtn.dataset.href);
  },

  'past-discard'() {
    go(backBtn.dataset.href);
  },

  'past-delete'() {
    showDialog({
      title: 'Delete this workout?',
      lines: [
        'It will be removed from your exercise logs, the muscle map and "last time" numbers.',
        'Your streak will be re-checked from this workout\'s week on, so a week it helped hit may become missed (or use a freeze), and your streak and freezes may change.',
        'This can\'t be undone.',
      ],
      confirm: { label: 'Delete workout', action: 'past-delete-confirm' },
      cancel: { label: 'Cancel', action: 'dialog-cancel' },
      danger: true,
    });
  },

  'past-delete-confirm'() {
    const session = Store.getSession(pastEdit.sessionId);
    hideDialog();
    Store.deleteSession(session.id);
    Streak.rejudge(session.date);
    toast('Workout deleted');
    go('#/history');
  },

  // "Leave without saving?" → yes.
  'past-leave'() {
    hideDialog();
    go(backBtn.dataset.href);
  },

  'dialog-cancel'() {
    hideDialog();
  },

  // Undo on the "Workout saved" toast: back to the workout, as it was.
  'undo-finish'() {
    if (!lastFinish) return;
    Store.undoFinish(lastFinish.sessionId, lastFinish.draft);
    if (lastFinish.rejudgeFrom) Streak.rejudge(lastFinish.rejudgeFrom); // its earlier week, without it again
    else Streak.update(); // takes back this week's hit if that workout made it
    if (overlayEl.classList.contains('is-celebration')) {
      overlayEl.hidden = true;
      overlayEl.innerHTML = '';
    }
    const draft = lastFinish.draft;
    lastFinish = null;
    summary = null;
    hideToast();
    go(draft.quick ? '#/quick' : `#/workout/${draft.workoutId}`);
  },

  'discard'() {
    askFirst({ title: 'Discard this workout?', lines: ['Anything typed will be lost.'], confirmLabel: 'Discard workout', danger: true }, () => {
      Store.discardDraft();
      go('#/');
    });
  },

  'export'() {
    Store.exportBackup();
    render(); // shows the new "Last backup" and takes down the reminder
  },

  'import'() {
    document.getElementById('import-file').click();
  },

  // Tapped an exercise in the Log's list or search results.
  'open-log'(refId) {
    go(`#/log/${encodeURIComponent(refId)}`);
  },

  // Calendar arrows: dir is -1 (previous month) or 1 (next month).
  'log-month'(dir) {
    const shown = document.querySelector('.calendar').dataset.month;
    const date = fromDayKey(`${shown}-01`);
    date.setMonth(date.getMonth() + Number(dir));
    logState.month = dayKey(date).slice(0, 7);
    render();
  },

  // Tapped a highlighted day: show its sets (tap again to hide them).
  'log-day'(key) {
    logState.month = key.slice(0, 7);
    logState.day = logState.day === key ? null : key;
    render();
    document.querySelector('.log-day')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // Calendar arrows on Past workouts: dir is -1 (previous month) or 1 (next month).
  'history-month'(dir) {
    const shown = document.querySelector('.calendar').dataset.month;
    const date = fromDayKey(`${shown}-01`);
    date.setMonth(date.getMonth() + Number(dir));
    historyState.month = dayKey(date).slice(0, 7);
    render();
  },

  // Tapped a highlighted day on Past workouts: list its workouts (tap again to hide them).
  'history-day'(key) {
    historyState.month = key.slice(0, 7);
    historyState.day = historyState.day === key ? null : key;
    render();
    document.querySelector('.log-day')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // ---------- Cardio ----------

  // + Add cardio: a one-off entry (the + menu, or the Cardio log).
  'add-cardio'() {
    setFabMenu(false);
    showCardioForm(newCardioEntryForm());
  },

  // Tapped an unchecked row (Today's cardio, or after a workout): logs it with the planned numbers. If they aren't enough
  // for an entry, a short pop-up asks for just what's missing (see Views.cardioForm()), and it
  // stays unchecked unless that's saved. Its first box is ready to type in.
  'cardio-check'(id) {
    const [planId, day] = id.split('|');
    const details = Cardio.details(Store.getCardioPlan(planId));
    if (!Cardio.isComplete(details)) {
      const date = fromDayKey(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      showCardioForm(newCardioEntryForm({ ...details, planId, day,
        quick: Cardio.missingFields(details), // kept as it opened, so a box doesn't vanish once it's filled in
        quickNote: [date, Cardio.summary(details)].filter(Boolean).join(' · ') }));
      overlayEl.querySelector('input')?.focus();
      return;
    }
    Store.saveCardioEntry(null, { ...details, planId, day });
    render();
  },

  // Tapped a checked row (Today's cardio, or after a workout).
  'cardio-entry'(id) {
    editCardioEntry(id, 'week');
  },

  'cardio-log-edit'(id) {
    editCardioEntry(id, 'log');
  },

  'cardio-log-delete'(id) {
    askFirst({
      title: 'Delete this cardio?',
      lines: [`${Cardio.name(Store.getCardioEntry(id))} will be removed from your Cardio log.`],
      confirmLabel: 'Delete cardio',
      danger: true,
    }, () => {
      Store.deleteCardioEntry(id);
      render();
    });
  },

  'cardio-entry-delete'() {
    actions['cardio-log-delete'](cardioForm.id);
  },

  'cardio-uncheck'() {
    Store.deleteCardioEntry(cardioForm.id);
    hideDialog();
    render();
  },

  'cardio-where'(where) {
    readCardioForm();
    cardioForm.where = where;
    showCardioForm(cardioForm);
  },

  // A distance button on a run: fills in the distance. The name changes with it if it's empty or
  // still another button's name, but one you typed yourself stays.
  'cardio-distance'(miles) {
    readCardioForm();
    const picked = RUN_DISTANCES.find(d => d.miles === Number(miles));
    cardioForm.miles = picked.miles;
    if (!cardioForm.name || RUN_DISTANCES.some(d => d.name === cardioForm.name)) cardioForm.name = picked.name;
    showCardioForm(cardioForm);
  },

  'cardio-save'() {
    readCardioForm();
    const f = cardioForm;
    f.error = cardioFormProblem();
    if (f.error) return showCardioForm(f);
    const details = Cardio.details(f);
    if (f.kind === 'plan') {
      Store.saveCardioPlan(f.id, { ...details, weekdays: f.afterLift ? [] : f.weekdays, afterLift: f.afterLift });
    } else {
      Store.saveCardioEntry(f.id, { ...details, day: f.day, planId: f.planId ?? null });
    }
    hideDialog();
    render();
  },

  'cardio-cancel'() {
    hideDialog();
  },

  // The switch on the Run times graph.
  'cardio-graph'(label) {
    cardioState.graph = label;
    render();
  },

  // Tapped a dot on the Run times graph: goes to that day on the calendar, with its entries showing.
  'cardio-dot'(key) {
    cardioState.month = key.slice(0, 7);
    cardioState.day = key;
    render();
    document.querySelector('.calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // Calendar arrows on the Cardio log: dir is -1 (previous month) or 1 (next month).
  'cardio-month'(dir) {
    const shown = document.querySelector('.calendar').dataset.month;
    const date = fromDayKey(`${shown}-01`);
    date.setMonth(date.getMonth() + Number(dir));
    cardioState.month = dayKey(date).slice(0, 7);
    render();
  },

  // Tapped a highlighted day: show its entries (tap again to hide them).
  'cardio-day'(key) {
    cardioState.month = key.slice(0, 7);
    cardioState.day = cardioState.day === key ? null : key;
    render();
    document.querySelector('.log-day')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  'cardio-plan-new'() {
    showCardioForm({ kind: 'plan', id: null, type: 'walk', name: '', weekdays: [], afterLift: false });
  },

  'cardio-plan-edit'(id) {
    showCardioForm({ ...Store.getCardioPlan(id), kind: 'plan' });
  },

  'cardio-plan-delete'(id) {
    askFirst({
      title: 'Delete this planned cardio?',
      lines: [`${Cardio.name(Store.getCardioPlan(id))} will come off your week. Anything you already logged stays in your Cardio log.`],
      confirmLabel: 'Delete planned cardio',
      danger: true,
    }, () => {
      Store.deleteCardioPlan(id);
      render();
    });
  },

  // Muscle map toggle: Growth or Sets.
  'map-mode'(mode) {
    map.mode = mode;
    render();
  },

  // Tapped a muscle on the map: highlight it (front and back) and show its card under the map.
  // Tapping it again closes the card.
  'muscle'(id) {
    map.muscle = map.muscle === id ? null : id;
    render();
    document.getElementById('muscle-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  'muscle-close'() {
    map.muscle = null;
    render();
  },

  // The "i" next to the map's caption: how the numbers are worked out.
  'map-info'(_, button) {
    map.infoOpen = !map.infoOpen;
    document.getElementById('map-info').hidden = !map.infoOpen;
    button.setAttribute('aria-expanded', map.infoOpen);
  },

  // Tap anywhere on the celebration to close it (not in the first moment, so a
  // tap that was already on its way doesn't close it before it's seen).
  'dismiss-celebration'() {
    if (Date.now() - Number(overlayEl.dataset.openedAt) < 700) return;
    closeOverlay();
  },

  // OK on a streak notice: it has been seen, so it won't show again.
  'dismiss-notice'() {
    Store.data.streak.notices = [];
    Store.save();
    closeOverlay();
  },

  'delete-all'() {
    askFirst({
      title: 'Delete ALL data?',
      lines: ['This removes every workout, custom exercise, workout history and setting from this device. It cannot be undone.'],
      confirmLabel: 'Delete everything',
      danger: true,
    }, () => {
      Store.deleteAll();
      toast('All data deleted');
      render();
      window.scrollTo(0, 0);
    });
  },
};

// Opens or closes one row of the planned sets card and remembers it.
function toggleSetsBlock(openSet, id, button) {
  const isOpen = !openSet.has(id);
  if (isOpen) openSet.add(id); else openSet.delete(id);
  button.setAttribute('aria-expanded', isOpen);
  button.closest('.sets-block').classList.toggle('is-open', isOpen);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!event.target.closest('.fab-menu, .fab')) setFabMenu(false); // tap anywhere else closes the + menu
  if (!button) return;
  actions[button.dataset.action](button.dataset.id, button);
});

// Back from a past workout with unsaved edits asks first.
backBtn.addEventListener('click', () => {
  if (currentRoute().view === 'past' && pastEditChanged()) {
    showDialog({
      title: 'Unsaved changes',
      lines: ['You changed this workout but didn\'t save. Leave and lose those changes?'],
      confirm: { label: 'Discard changes', action: 'past-leave' },
      cancel: { label: 'Keep editing', action: 'dialog-cancel' },
      danger: true,
    });
    return;
  }
  withFormSaved(() => go(backBtn.dataset.href));
});

// ---------- Dragging a place in the cycle, or an exercise to another place in its workout ----------
// Press and hold a card (HOLD_MS) to pick it up, then drag it and let go.
// Moving your finger before then scrolls the page as usual. A copy of the card follows
// your finger (moved with transform only, so it stays smooth on iPhone) and the other cards make
// room as you go. Near the top or bottom of the screen the page scrolls.
// An exercise's card is tall, so while one is held every card shrinks to its name
// (body.is-reordering). That works on a workout's screen and during the workout, where the order
// saves to the plan too (only its heading row can be held, since the rest of an open exercise is
// boxes to type in). On the Workouts tab, the cycle's workouts and rest days move the same way.
const HOLD_MS = 350;
const EDGE_PX = 90;
// { id, card, cycle (true for a place in the cycle), list (the cards it moves among), startOrder,
//   ghost, startX, startY, x, y, offsetX, offsetY, active, timer }
let drag = null;
let dragEndedAt = 0;

// True just after a drag, so letting go doesn't also count as a tap on the workout.
function dragJustEnded() {
  return Date.now() - dragEndedAt < 400;
}

appEl.addEventListener('pointerdown', event => {
  if (event.button > 0) return;
  const planned = event.target.closest('#plan-list .preview-ex');
  // Buttons and notes work as usual, and nothing moves while an exercise is being edited.
  const canHoldPlanned = planned && !picker.exerciseId && !event.target.closest('button, input, textarea, summary, a');
  // (The ✕ on a place in the cycle is a button, so it doesn't pick the place up.)
  const cycleItem = event.target.closest('#cycle-list .cycle-item');
  const card = canHoldPlanned ? planned
    : cycleItem && !event.target.closest('.cycle-remove') ? cycleItem
    : event.target.closest('#exercise-list .ex-toggle')?.parentElement;
  if (!card || card.parentElement.children.length < 2) return;
  drag = { id: card.dataset.planEx || card.dataset.cycleItem, card, cycle: card === cycleItem, list: card.parentElement,
    startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false };
  drag.timer = setTimeout(pickUp, HOLD_MS);
});

// Picks up a card: every exercise card shrinks to its name, and the page moves so that the held
// card is back under the finger.
function pickUp() {
  drag.active = true;
  drag.startOrder = planOrder();
  document.body.classList.add('is-dragging', 'is-reordering');
  let rect = drag.card.getBoundingClientRect();
  window.scrollBy(0, rect.top + rect.height / 2 - drag.y);
  rect = drag.card.getBoundingClientRect();
  drag.offsetX = drag.startX - rect.left;
  drag.offsetY = rect.height / 2;
  drag.ghost = drag.card.cloneNode(true);
  drag.ghost.classList.add('drag-ghost');
  drag.ghost.style.width = `${rect.width}px`;
  document.body.append(drag.ghost);
  drag.card.classList.add('is-dragging');
  navigator.vibrate?.(15); // a small buzz where supported
  moveGhost();
  requestAnimationFrame(edgeScroll);
}

// The exercises (or places in the cycle) being reordered, in the order they're on the screen.
function planOrder() {
  return [...drag.list.children].map(card => card.dataset.planEx || card.dataset.cycleItem);
}

// Saves the order after a drag: the cycle's, or a workout's (to the plan, or just this workout if
// it's a quick workout).
function savePlanOrder(order) {
  if (drag.cycle) return Store.setCycleOrder(order);
  if (currentRoute().view === 'quick') return Store.setQuickOrder(order);
  Store.setExerciseOrder(currentRoute().workoutId, order);
  if (Store.data.draft?.workoutId === currentRoute().workoutId) toast('Order saved');
}

// Makes room for the held exercise where the finger is. Only the other cards are moved:
// moving the card under the finger could make the iPhone lose track of the touch.
function reorderUnderFinger() {
  const { list } = drag;
  const others = [...list.children].filter(card => card !== drag.card);
  const after = others.findIndex(card => {
    const rect = card.getBoundingClientRect();
    return drag.y < rect.top + rect.height / 2;
  });
  const place = after === -1 ? others.length : after;
  if ([...list.children].indexOf(drag.card) === place) return;
  others.slice(0, place).forEach(card => list.insertBefore(card, drag.card));
  others.slice(place).forEach(card => list.append(card));
  [...list.children].forEach((card, i) => { card.querySelector('.ex-num, .cycle-num').textContent = i + 1; });
}

function moveGhost() {
  drag.ghost.style.transform = `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px) scale(1.03)`;
  reorderUnderFinger();
}

// Keeps scrolling while the finger is held near the top or bottom edge.
function edgeScroll() {
  if (!drag?.active) return;
  const speed = drag.y < EDGE_PX ? -8 : drag.y > innerHeight - EDGE_PX ? 8 : 0;
  if (speed) {
    window.scrollBy(0, speed);
    moveGhost();
  }
  requestAnimationFrame(edgeScroll);
}

function endDrag(drop) {
  if (!drag) return;
  clearTimeout(drag.timer);
  if (drag.active) {
    dragEndedAt = Date.now();
    drag.ghost.remove();
    drag.card.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging', 'is-reordering');
    const order = planOrder();
    if (drop && order.join() !== drag.startOrder.join()) savePlanOrder(order);
    // The cards open back up: keep the one that was moved under the finger.
    render();
    const moved = document.querySelector(`[data-plan-ex="${drag.id}"], [data-cycle-item="${drag.id}"]`);
    if (moved) window.scrollBy(0, moved.getBoundingClientRect().top - drag.y + 30);
  }
  drag = null;
}

window.addEventListener('pointermove', event => {
  if (!drag) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (drag.active) moveGhost();
  else if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 8) endDrag(false); // it's a scroll
});
window.addEventListener('pointerup', () => endDrag(true));
window.addEventListener('pointercancel', () => endDrag(false));

// Holding a card picks it up; don't also open the long-press menu.
appEl.addEventListener('contextmenu', event => {
  if (event.target.closest('#cycle-list .cycle-item, #plan-list .preview-ex, #exercise-list .ex-toggle')) event.preventDefault();
});

// Once a workout is picked up, the page mustn't scroll under the finger
// (iPhone Safari needs this on touchmove, and it must not be passive).
window.addEventListener('touchmove', event => {
  if (drag?.active) event.preventDefault();
}, { passive: false });

// ---------- Typing ----------

// Workout inputs: save each keystroke into the draft.
// Weights are typed in the chosen unit but saved in lbs.
appEl.addEventListener('input', event => {
  const input = event.target;

  // An exercise's note: saved as you type, and shown on its small line.
  if (input.dataset.note != null) {
    Store.setExerciseNote(input.dataset.note, input.value);
    input.closest('.ex-note').querySelector('.note-text').textContent = input.value.trim() ? `Note: ${input.value.trim()}` : '+ Add note';
    return;
  }

  // Library search: redraw only the results so the search box keeps focus.
  if (input.id === 'log-search') {
    logQuery = input.value;
    document.getElementById('log-results').innerHTML = Views.libraryResults(input.value, 'open-log');
    return;
  }

  if (input.id === 'lib-search') {
    picker.query = input.value;
    document.getElementById('lib-results').innerHTML = Views.libraryResults(input.value, 'pick-exercise', picker.group);
    return;
  }

  if (input.id === 'swap-search') {
    swap.query = input.value;
    document.getElementById('swap-results').innerHTML = Views.libraryResults(input.value, 'swap-pick');
    return;
  }

  // Muscle search on the custom exercise form.
  if (input.dataset.muscleSearch) {
    const role = input.dataset.muscleSearch;
    document.getElementById(`suggest-${role}`).innerHTML =
      Views.muscleSuggestions(role, input.value, picker.custom[role]);
    return;
  }

  // Remember the custom exercise's name, in case the form is redrawn.
  if (input.id === 'custom-name') {
    picker.custom.name = input.value;
    return;
  }

  if (input.id === 'new-workout-name') {
    newForm.name = input.value;
    return;
  }

  if (input.id === 'quick-search') {
    quickAdd.query = input.value;
    document.getElementById('quick-results').innerHTML = Views.libraryResults(input.value, 'quick-pick');
    return;
  }

  // Quick workout title: saved as you type (an empty title becomes "Quick workout" when finished).
  if (input.id === 'quick-name') {
    Store.renameQuick(input.value);
    titleEl.textContent = input.value.trim() || 'Quick workout';
    return;
  }

  const field = input.dataset.field;
  if (!field) return;
  const value = field === 'weight' ? Units.readWeight(input.value) : input.value.trim();
  // A past workout's sets are only kept in memory until Save changes.
  if (input.dataset.past != null) {
    pastEdit.exercises[Number(input.dataset.past)].rows[Number(input.dataset.set)][field] = value;
    return;
  }
  Store.updateDraftSet(input.dataset.ex, Number(input.dataset.set), field, value);
  if (field === 'weight' && value != null) fillWeightDown(input.dataset.ex, Number(input.dataset.set), value);
  if (field === 'reps') refreshSetNumber(input.dataset.ex, Number(input.dataset.set), value !== '');
  refreshWorkoutProgress(input.dataset.ex);
});

// A weight typed on a set also goes on the sets below it, except any with reps already logged.
// Any of them can still be typed over afterward.
function fillWeightDown(exerciseId, setIndex, lbs) {
  Store.data.draft.entries[exerciseId].forEach((set, i) => {
    if (i <= setIndex || set.reps !== '') return;
    Store.updateDraftSet(exerciseId, i, 'weight', lbs);
    const box = document.querySelector(`[data-ex="${exerciseId}"][data-set="${i}"][data-field="weight"]`);
    if (box) box.value = Units.showWeight(lbs);
  });
}

// A set's number turns into a green ✓ once its reps are typed, and back if they're cleared.
// Swapped in place (setNumber() in views.js), so the keyboard stays open.
function refreshSetNumber(exerciseId, index, done) {
  const el = document.querySelector(`[data-set-num="${exerciseId}|${index}"]`);
  if (el) el.outerHTML = setNumber(exerciseId, index, done);
}

// As sets are typed in: the Next button and the sets counter, without a redraw (which would
// close the keyboard).
function refreshWorkoutProgress(exerciseId) {
  const next = document.querySelector(`#ex-${exerciseId} .next-ex`);
  if (next) next.hidden = !Store.draftProgress(exerciseId).complete;
  const { filled, total } = Store.draftTotals();
  document.querySelector('[data-sets-done]').textContent = `${filled} / ${total} sets`;
  document.querySelector('[data-sets-bar]').style.width = `${total ? filled / total * 100 : 0}%`;
}

// Tapping the exercise search moves it to the top of the screen, so the results
// show below it instead of under the keyboard. The extra space (is-searching) lets
// the page scroll that far even before there are results.
appEl.addEventListener('focusin', event => {
  // Tapping a weight selects the whole number, so typing replaces it. (A moment later, or the
  // iPhone's own tap handling clears the selection again.)
  if (event.target.dataset.field === 'weight') {
    setTimeout(() => event.target.select(), 0);
    return;
  }
  if (!['lib-search', 'swap-search', 'quick-search'].includes(event.target.id)) return;
  appEl.classList.add('is-searching');
  const pin = () => event.target.scrollIntoView({ block: 'start' });
  pin();
  setTimeout(pin, 350); // again once the iPhone keyboard has finished opening
});

// Reads the settings form and saves it.
function saveSettingsForm(form) {
  const values = Object.fromEntries(new FormData(form));

  // Units changed: save only that and redraw so the boxes show the new units.
  // (Re-reading the boxes here would save their rounded display values,
  // e.g. 180 lbs → 81.6 kg → 179.9 lbs.)
  if (values.units !== Units.current()) {
    Store.updateSettings({ units: values.units });
    render();
    return;
  }

  Store.updateSettings({
    name: values.name.trim(),
    heightIn: Units.readHeight({ ft: values.heightFt, in: values.heightIn, cm: values.heightCm }),
    sex: values.sex || null,
  });
  // A new weekly goal counts from next week: this week keeps the goal it started with
  // (streak.thisWeekGoal). Before the first workout is logged, nothing is tracked yet, so it
  // counts straight away (Streak.update() takes care of both).
  const goal = Number(values.weeklyGoal) || null;
  if (goal && goal !== Store.data.settings.weeklyGoal) {
    Streak.update(); // (notes this week's goal first, if it hasn't been yet)
    Store.updateSettings({ weeklyGoal: goal });
    Streak.update();
    if (currentRoute().view === 'settings') render(); // shows "A change starts next week" etc.
    showOverlay();
  }
  // The body weight box is only on the first-time setup. It's logged under today, and only when
  // the box really changed (not its rounded display value). Emptied again: nothing is logged.
  if (values.bodyWeight !== undefined && values.bodyWeight.trim() !== Units.showWeight(Store.data.settings.bodyWeightLbs)) {
    const lbs = Units.readWeight(values.bodyWeight);
    if (lbs > 0) Store.setBodyWeight(lbs);
    else Store.deleteBodyWeight(dayKey(new Date()));
  }
}

// Saves when you leave a box (or pick an option).
appEl.addEventListener('change', async event => {
  const input = event.target;

  if (input.form && input.form.id === 'settings-form') {
    saveSettingsForm(input.form);
    return;
  }

  if (input.id === 'custom-equipment') {
    picker.custom.equipment = input.value;
  }

  if (input.id === 'import-file') {
    const file = input.files[0];
    if (!file) return;
    input.value = ''; // so the same file can be picked again
    askFirst({
      title: 'Import this backup?',
      lines: ['Importing replaces ALL data on this device with the backup.'],
      confirmLabel: 'Import backup',
      danger: true,
    }, async () => {
      try {
        Store.importBackup(await file.text());
        toast('Backup imported');
        render();
      } catch {
        showDialog({ title: 'Could not import', lines: ['That file couldn\'t be read as a GitFit backup. Nothing was changed.'], confirm: { label: 'OK', action: 'dialog-cancel' } });
      }
    });
  }
});

// The cardio pop-up. It's in the overlay, not the page, so it has its own listeners.
overlayEl.addEventListener('input', event => {
  if (!['cardio-miles', 'cardio-minutes', 'cardio-secs'].includes(event.target.id)) return;
  const pace = document.getElementById('cardio-pace');
  if (!pace) return;
  readCardioForm();
  const text = Cardio.paceText(cardioForm.miles, cardioForm.seconds);
  pace.textContent = text ? `Pace: ${text}` : '';
  // Typing another distance takes the highlight off a distance button, and the button's name
  // with it, so a 4 mile run isn't left called "Marathon".
  overlayEl.querySelectorAll('.cardio-distance').forEach(button => {
    button.classList.toggle('is-active', Number(button.dataset.id) === cardioForm.miles);
  });
  const fromButton = RUN_DISTANCES.find(d => d.name === cardioForm.name);
  if (event.target.id === 'cardio-miles' && fromButton && fromButton.miles !== cardioForm.miles) {
    cardioForm.name = '';
    const nameBox = document.getElementById('cardio-name'); // (the short pop-up has none)
    if (nameBox) nameBox.value = '';
  }
});

overlayEl.addEventListener('change', event => {
  const input = event.target;
  // A new type asks for different numbers. Any it shares with the old type stay.
  if (input.id === 'cardio-type') {
    readCardioForm();
    showCardioForm(cardioForm);
  }
  // "Every lifting day" or particular days, not both.
  if (input.id === 'cardio-lifting' && input.checked) {
    overlayEl.querySelectorAll('input[name="cardio-weekday"]').forEach(box => { box.checked = false; });
  }
  if (input.name === 'cardio-weekday' && input.checked) {
    document.getElementById('cardio-lifting').checked = false;
  }
});

// ---------- Forms ----------

appEl.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));

  // Today's body weight on Profile.
  if (form.id === 'bw-form') {
    const lbs = Units.readWeight(values.weight);
    if (!lbs) {
      toast('Type your weight first');
      return;
    }
    Store.setBodyWeight(lbs);
    toast('Body weight logged');
    render();
    return;
  }

  // Fixing one weight on the body weight log. Only saved if the box really changed
  // (not its rounded display value, e.g. in kg).
  if (form.id === 'bw-edit-form') {
    const lbs = Units.readWeight(values.weight);
    if (!(lbs > 0)) {
      toast('Type your weight first');
      return;
    }
    const entry = Store.data.bodyWeightLog.find(e => e.day === bwEditDay);
    if (values.weight.trim() !== Units.showWeight(entry.lbs)) {
      Store.editBodyWeight(bwEditDay, lbs);
      toast('Weight updated');
    }
    bwEditDay = null;
    render();
    return;
  }

  // New workout (or a copy) → create it, then open it to add or change exercises.
  if (form.id === 'new-workout-form') {
    const name = values.name.trim();
    if (!name) {
      toast('Give the workout a title');
      return;
    }
    if (!Store.cycleHasRoom()) {
      toast(`Your cycle has ${MAX_CYCLE_WORKOUTS} workouts, the most it can hold`);
      return;
    }
    const source = newForm.copyFrom && Store.getWorkout(newForm.copyFrom);
    const workout = Store.addWorkout(name, source ? source.exercises : []);
    toast(source ? `Copied to the end of your cycle` : `Added ${name} to the end of your cycle`);
    go(`#/workout/${workout.id}`);
    return;
  }

  // Sets & reps for the picked exercise → add it to the workout (or save changes).
  // After adding, the search stays open for the next one.
  if (form.id === 'exercise-form') {
    saveExerciseForm(form);
    picker = newPicker(!picker.exerciseId, picker.group);
    render();
    if (picker.adding) showPanel();
  }

  // New custom exercise → save it, then go on to sets & reps.
  if (form.id === 'custom-form') {
    // Enter in a muscle search box adds the top suggestion instead of saving.
    const muscleSearch = document.activeElement?.dataset?.muscleSearch;
    if (muscleSearch) {
      document.querySelector(`#suggest-${muscleSearch} [data-action="add-muscle"]`)?.click();
      return;
    }

    const { primary, secondary } = picker.custom;
    if (!primary.length) {
      toast('Add at least one primary muscle');
      document.getElementById('muscle-search-primary').focus();
      return;
    }
    const fields = {
      name: values.name.trim(),
      equipment: values.equipment,
      primary: [...primary],
      secondary: [...secondary],
    };
    // Opened from Swap for today: save it, then swap it in.
    if (swap.creating) {
      const refId = Store.addCustomExercise(fields).id;
      swap.creating = false;
      picker = newPicker();
      render();
      actions['swap-pick'](refId);
      return;
    }
    // Opened from a quick workout's + Add exercise: save it, then add it to the workout.
    if (quickAdd.creating) {
      const refId = Store.addCustomExercise(fields).id;
      picker = newPicker();
      actions['quick-pick'](refId); // (this also closes the form)
      return;
    }
    if (picker.custom.id) {
      Store.updateCustomExercise(picker.custom.id, fields);
      toast(`Saved ${fields.name}`);
    } else {
      picker.refId = Store.addCustomExercise(fields).id;
    }
    picker.mode = 'details';
    render();
    showPanel();
  }
});

// ---------- Start ----------

window.addEventListener('hashchange', () => {
  // Coming Back from a log or past workout opened from another screen: that screen as it was left.
  const top = returnStack[returnStack.length - 1];
  const back = top && top.hash === (location.hash || '#/') ? returnStack.pop() : null;
  const { view } = currentRoute();
  if (!back && !RETURN_VIEWS.includes(view)) returnStack = [];
  if (view !== 'cardio') cardioState = { month: null, day: null };
  // (Past workouts keeps its calendar while one of its workouts is open.)
  if (!['history', 'past'].includes(view)) historyState = { month: null, day: null };

  if (!['profile', 'exercise-log'].includes(view)) map.muscle = null;
  picker = newPicker();
  plannedChanged = new Set();
  strip.open = false;
  openExerciseId = back ? back.openExerciseId : null;
  autoOpenExercise = !back;
  swap = { exerciseId: null, query: '' };
  quickAdd = { open: false, query: '' };
  logState = back ? back.logState : { month: null, day: null, range: 'all' };
  newForm = null;
  bwEditDay = null;
  // Unsaved edits to a past workout are kept while one of its Log buttons is being looked at.
  if (view !== 'past' && !returnStack.some(entry => entry.hash.startsWith('#/history/'))) pastEdit = null;
  render();
  window.scrollTo(0, back ? back.scrollY : 0);
});

// A home-screen app usually comes back from the background instead of reloading, so
// check the streak then too (a week may have ended while it was away).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  updateTimers(); // straight away, not a second later
  if (Streak.update()) render();
  else showOverlay();
});

try {
  Store.load();
} catch (err) {
  // Don't overwrite data we couldn't read — show the problem instead.
  appEl.innerHTML = `<p class="empty">Saved data could not be read: ${esc(err.message)}</p>`;
  throw err;
}
render();
