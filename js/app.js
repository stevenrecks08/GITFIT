// app.js — starts the app, picks which screen to show, and handles taps/typing.
//
// Screens are chosen by the part of the URL after "#":
//   #/                 → home (the week)          [Workouts tab]
//   #/new              → new workout (the + button) [Workouts tab]
//   #/new/<id>         → copy of a workout          [Workouts tab]
//   #/workout/<id>/edit → edit a workout            [Workouts tab]
//   #/workout/<id>     → a workout: a look at it until it's started, then the real thing [Workouts tab]
//   #/quick           → the quick workout in progress (+ button → Quick workout) [Workouts tab]
//   #/history          → past workouts (link at the top of Workouts) [Workouts tab]
//   #/history/<id>     → fix or delete one past workout [Workouts tab]
//   #/profile          → profile                  [Profile tab]
//   #/settings         → settings (gear on Profile) [Profile tab]
//   (Profile also shows the muscle map; see bodymap.js and stats.js)
//   #/log              → search exercises to see their log [Profile tab]
//   #/log/<exercise>   → one exercise's log         [Profile tab]
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

// The New workout / Copy workout form: { name, weekday, copyFrom (workout id or null) }.
// null until that screen opens; kept while it's open so a redraw doesn't lose what's typed.
let newForm = null;

// The add/edit exercise panel on the edit-workout screen:
//   exerciseId = the workout's exercise being edited (null when adding a new one)
//   refId      = the library/custom exercise picked
//   mode       = 'pick' (search library), 'custom' (create custom), 'details' (sets & reps)
//   query      = text in the search box
//   custom     = the custom exercise being created: { name, equipment, primary: [], secondary: [] }
let picker = newPicker();
function newPicker() {
  return { exerciseId: null, refId: null, mode: 'pick', query: '', custom: null };
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

// Scrolls the add/edit panel into view (after picking, the form can be far down).
function showPanel() {
  document.getElementById('exercise-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Which exercise is expanded on the workout screen (null = all collapsed).
let openExerciseId = null;

// True when the workout screen should open the first unfinished exercise the next time it's drawn:
// on arriving there, but not on each redraw (you may have closed it on purpose).
let autoOpenExercise = true;

// Where Back goes from a log or past workout opened from another screen, with how that screen was left:
//   [{ hash, openExerciseId, logState, scrollY }]  (a Log can open a workout, which can open a Log, …)
let returnStack = [];

// Remembers this screen, then goes to another one that Back should return from.
function goAndReturn(hash) {
  returnStack.push({ hash: location.hash || '#/', openExerciseId, logState, scrollY: window.scrollY });
  go(hash);
}

// The summary of the workout just finished (Store.sessionSummary()). Kept in memory on purpose: it
// stays on the Workouts tab until Close, or until the app is fully closed.
let summary = null;

// Planned sets card on the Workouts tab: which groups and muscles are expanded.
// Kept while the app is open, so going into a day and back leaves them as they were.
const openSets = { groups: new Set(), muscles: new Set() };

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

// What the muscle map on Profile shows: 'growth' or 'level'.
let mapMode = 'growth';

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

// Saves the title box on the edit-workout screen (an empty title keeps the old one).
function saveWorkoutName() {
  const input = document.getElementById('workout-name');
  const name = input?.value.trim();
  if (!name) return;
  Store.renameWorkout(currentRoute().workoutId, name);
  titleEl.textContent = `Edit ${name}`;
}

// Only one workout can be in progress. Asks before throwing away the one there is;
// returns true if it was discarded (or there was none).
function discardOtherDraft() {
  const other = Store.draftWorkout();
  if (!confirm(`You have an unfinished "${other ? other.name : 'workout'}". Discard it and start this one?`)) return false;
  Store.discardDraft();
  return true;
}

// Opens or closes the + button's menu (New workout / Quick workout).
function setFabMenu(open) {
  const menu = document.getElementById('fab-menu');
  if (!menu) return;
  menu.classList.toggle('is-open', open);
  menu.setAttribute('aria-hidden', !open);
  document.querySelector('.fab').setAttribute('aria-expanded', open);
}

// Scrolls the quick workout's + Add exercise panel to just under the top bar.
// Opens the custom exercise form from a workout's search (Swap for today or a quick workout's
// + Add exercise). It's the same form as the edit screen, named from whatever was typed.
function openCustomForm(query) {
  picker = newPicker();
  picker.mode = 'custom';
  picker.custom = { id: null, name: query.trim(), equipment: EQUIPMENT[0], primary: [], secondary: [] };
  render();
  document.getElementById('custom-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showQuickPanel() {
  document.getElementById('quick-add-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'workout' && parts[1]) {
    return { view: parts[2] === 'edit' ? 'edit' : 'workout', workoutId: parts[1], tab: 'workouts' };
  }
  if (parts[0] === 'quick') return { view: 'quick', tab: 'workouts' };
  if (parts[0] === 'new') {
    // #/new/day/<weekday> = "+ Add workout" on a day; #/new/<id> = a copy of that workout
    if (parts[1] === 'day') return { view: 'new', copyFrom: null, weekday: Number(parts[2]), tab: 'workouts' };
    return { view: 'new', copyFrom: parts[1] || null, tab: 'workouts' };
  }
  if (parts[0] === 'history') {
    return parts[1] ? { view: 'past', sessionId: parts[1], tab: 'workouts' } : { view: 'history', tab: 'workouts' };
  }
  if (parts[0] === 'profile') return { view: 'profile', tab: 'profile' };
  if (parts[0] === 'settings') return { view: 'settings', tab: 'profile' };
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
    screen = summary ? Views.summary(summary) : Views.home(openSets);
  } else if (route.view === 'history') {
    screen = Views.history();
  } else if (route.view === 'past') {
    const session = Store.getSession(route.sessionId);
    if (!session) return go('#/history');
    if (!pastEdit || pastEdit.sessionId !== session.id) pastEdit = startPastEdit(session);
    screen = Views.pastWorkout(session, pastEdit);
  } else if (route.view === 'profile') {
    screen = Views.profile(mapMode);
  } else if (route.view === 'settings') {
    screen = Views.settings();
  } else if (route.view === 'log') {
    screen = Views.logSearch(logQuery);
  } else if (route.view === 'exercise-log') {
    screen = Views.exerciseLog(route.refId, logState);
  } else if (route.view === 'new') {
    if (!newForm) {
      const source = route.copyFrom && Store.getWorkout(route.copyFrom);
      newForm = source
        ? { name: source.name, weekday: source.weekday, copyFrom: source.id }
        : { name: '', weekday: route.weekday ?? todayWeekday(), copyFrom: null };
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
    if (route.view === 'edit') {
      screen = Views.editWorkout(workout, picker);
    } else if (Store.data.draft?.workoutId === workout.id && workout.exercises.length) {
      // This workout has been started: the real thing.
      const draft = Store.ensureDraft(workout);
      if (autoOpenExercise) openExerciseId = Store.firstUnfinished();
      autoOpenExercise = false;
      screen = Views.workout(Store.draftWorkout(), draft, openExerciseId, swap, quickAdd, picker);
    } else {
      // Not started: just a look. Start workout is what starts it (and the timer).
      screen = Views.workoutPreview(workout);
    }
  }

  // Opened from another screen: Back returns there.
  if (['past', 'exercise-log'].includes(route.view) && returnStack.length) {
    screen.back = returnStack[returnStack.length - 1].hash;
  }

  titleEl.textContent = screen.title;
  document.title = screen.title;
  backBtn.hidden = !screen.back;
  backBtn.dataset.href = screen.back || '';
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
// button (e.g. Undo) that runs that action; it stays up for `ms`.
function toast(message, button = null, ms = 2200) {
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
//   { sessionId, draft (copy from before finishing), hadHit (this week was already hit before) }
let lastFinish = null;

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
  const hadHit = Streak.summary().week.hit;
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
  lastFinish = { sessionId: session.id, draft, hadHit, rejudgeFrom: earlierWeek ? session.date : null };
  go('#/');
}

// ---------- Button taps ----------

const actions = {
  // Tapped a workout on the week: opens it to look at (or resumes it, if it's the one in progress).
  'open-workout'(id) {
    if (dragJustEnded()) return;
    go(`#/workout/${id}`);
  },

  // Start workout: asks first, since this starts the timer (and replaces any other workout in progress).
  'start-workout'(id) {
    const other = Store.data.draft && Store.draftWorkout();
    const lines = ['The timer starts now, and you can log your sets.'];
    if (Store.data.draft) lines.push(`Your unfinished "${other ? other.name : 'workout'}" will be discarded.`);
    showDialog({
      title: `Start ${Store.getWorkout(id).name}?`,
      lines,
      confirm: { label: 'Start workout', action: 'start-workout-confirm', id },
      cancel: { label: 'Not yet', action: 'dialog-cancel' },
    });
  },

  'start-workout-confirm'(id) {
    hideDialog();
    Store.discardDraft();
    Store.ensureDraft(Store.getWorkout(id));
    autoOpenExercise = true;
    render();
    window.scrollTo(0, 0);
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
      const shown = Number(Units.showWeight(ready));
      toast(`Hit ${ex.repMax} every set. Try ${shown + (Units.isMetric() ? 2.5 : 5)} ${Units.weightUnit()} next time.`, null, 4000);
    }
  },

  // A Log button: opens that exercise's log, and Back returns here.
  'view-log'(refId) {
    goAndReturn(`#/log/${encodeURIComponent(refId)}`);
  },

  // A muscle group chip in an exercise search: shows that group (tap again to go back).
  'browse-group'(group, button) {
    const picked = button.classList.contains('is-picked');
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

  // Graph length on an exercise's log.
  'log-range'(range) {
    logState.range = range;
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
    const draft = Store.data.draft;
    if (!draft?.quick) {
      if (draft && !discardOtherDraft()) return;
      Store.startQuick();
    }
    go('#/quick');
  },

  // With a Missed this week list showing, the panel scrolls into view instead of jumping to
  // the search box (which would push the list off the top of the screen).
  'quick-add-open'() {
    quickAdd = { open: true, query: '' };
    render();
    if (document.querySelector('.missed-picker')) showQuickPanel();
    else document.getElementById('quick-search').focus();
  },

  // Tapped a missed exercise in the list: add it with its missing sets and target reps.
  'quick-missed'(key) {
    const [workoutId, exerciseId] = key.split('|');
    const e = Store.missedThisWeek(workoutId)[0]?.exercises.find(m => m.makeupFor.exerciseId === exerciseId);
    if (!e) return;
    openExerciseId = Store.quickAddExercise(e.refId, e);
    quickAdd = { open: false, query: '' };
    render();
    document.getElementById(`ex-${openExerciseId}`).scrollIntoView({ block: 'nearest' });
  },

  // Catch up on a Partial / Missed workout: a quick workout with its missed exercises added
  // (added to the quick workout in progress, if there is one).
  'catch-up'(workoutId) {
    if (dragJustEnded()) return;
    const missed = Store.missedThisWeek(workoutId)[0];
    const draft = Store.data.draft;
    if (!draft?.quick) {
      if (draft && !discardOtherDraft()) return;
      Store.startQuick();
      if (missed) Store.renameQuick(`${missed.name} catch-up`);
    }
    for (const e of missed?.exercises || []) Store.quickAddExercise(e.refId, e);
    if (missed) toast(`Added ${missed.exercises.length} missed exercise${missed.exercises.length === 1 ? '' : 's'}`);
    go('#/quick');
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
    const rows = Store.data.draft.entries[id];
    if (rows[rows.length - 1].reps !== '' && !confirm('Remove the last set and the reps typed in it?')) return;
    Store.removeDraftSet(id);
    render();
  },

  'quick-remove'(id) {
    if (Store.draftHasReps(id) && !confirm('Remove this exercise and the sets typed for it?')) return;
    Store.quickRemoveExercise(id);
    openExerciseId = null;
    render();
  },

  'edit-workout'(id) {
    if (dragJustEnded()) return;
    go(`#/workout/${id}/edit`);
  },

  // The + button on the week.
  // "+ Add workout" under an empty day: the New workout form with that day picked.
  'new-workout-on'(weekday) {
    go(`#/new/day/${weekday}`);
  },

  'new-workout'() {
    go('#/new');
  },

  'copy-workout'(id) {
    go(`#/new/${id}`);
  },

  // Tapped one of the workout's exercises: open it for editing at the sets & reps step.
  'edit-exercise'(id) {
    const ex = Store.getWorkout(currentRoute().workoutId).exercises.find(e => e.id === id);
    picker = { exerciseId: id, refId: ex.refId, mode: 'details', query: '' };
    render();
    showPanel();
  },

  // Done on the edit screen. Everything is saved as you change it, so this mostly just goes back.
  // The title box saves when you leave it; save it here too in case you're still in it.
  'save-workout'() {
    saveWorkoutName();
    go('#/');
  },

  'delete-workout'(id) {
    const workout = Store.getWorkout(id);
    const lockedOn = Streak.lockedDay(id);
    const lines = [`${workout.name} will be removed from your week. Workouts you've already finished with it stay in Past workouts and your logs.`];
    if (lockedOn) lines.push(`${lockedOn} has passed and you haven't done it yet this week, so its sets still count in this week's streak.`);
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

  'cancel-edit'() {
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
    picker.custom = { id: null, name: picker.query.trim(), equipment: EQUIPMENT[0], primary: [], secondary: [] };
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

  'move-exercise'(id, button) {
    Store.moveExercise(currentRoute().workoutId, id, Number(button.dataset.dir));
    render();
  },

  'delete-exercise'(id) {
    if (!confirm('Delete this exercise from the day? (Past workouts stay saved.)')) return;
    Store.deleteExercise(currentRoute().workoutId, id);
    picker = newPicker();
    render();
  },

  // Opens this exercise (closing any other), or closes it if it's already open.
  'toggle-exercise'(id) {
    openExerciseId = openExerciseId === id ? null : id;
    swap = { exerciseId: null, query: '' };
    render();
    // Closing one above can shift this row off screen, so bring it back into view.
    document.getElementById(`ex-${id}`).scrollIntoView({ block: 'nearest' });
  },

  // Planned sets card: tap a group to show its muscles, a muscle to show its exercises.
  // Only the row's class changes (no redraw), so CSS can slide it open smoothly.
  'toggle-group'(name, button) {
    toggleSetsBlock(openSets.groups, name, button);
  },

  'toggle-muscle'(id, button) {
    toggleSetsBlock(openSets.muscles, id, button);
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
  // Any sets already typed for this exercise are cleared. A swap into a different muscle group
  // won't count for the streak, so that asks first.
  'swap-pick'(refId) {
    const workout = Store.getWorkout(currentRoute().workoutId);
    const planned = Library.forExercise(workout.exercises.find(e => e.id === swap.exerciseId));
    const picked = Library.forExercise({ refId });
    const from = Library.groupOf(planned);
    const to = Library.groupOf(picked);
    if (from && to !== from) {
      showDialog({
        title: 'This swap won\'t count',
        lines: [
          `${picked.name} is ${to ? `a ${to}` : 'not a ' + from} exercise, and ${planned.name} is ${from}. A swap only counts toward your streak when it's in the same muscle group.`,
          `Its sets will still be logged (history, maxes and the muscle map), but the planned ${planned.name} sets will count as missed.`,
        ],
        confirm: { label: 'Swap anyway', action: 'swap-confirm', id: refId },
        cancel: { label: 'Cancel', action: 'dialog-cancel' },
      });
      return;
    }
    actions['swap-confirm'](refId);
  },

  'swap-confirm'(refId) {
    hideDialog();
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
    if (!gaps.length) return finishWorkout();
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
    finishWorkout();
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
    else if (!lastFinish.hadHit) Streak.undoHit(); // the hit came from this workout
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
    if (!confirm('Discard this workout? Anything typed will be lost.')) return;
    Store.discardDraft();
    go('#/');
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

  // Muscle map toggle: Growth or Sets.
  'map-mode'(mode) {
    mapMode = mode;
    render();
  },

  // Tapped a muscle on the map: highlight it (front and back) and show its number
  // in a small popup above it. Tapping it again closes the popup.
  'muscle'(id, shape) {
    const map = document.getElementById('body-map');
    const pop = document.getElementById('map-pop');
    const wasSelected = shape.classList.contains('is-selected');
    closeMusclePopup();
    if (wasSelected) return;

    map.querySelectorAll(`[data-id="${id}"]`).forEach(s => s.classList.add('is-selected'));
    pop.textContent = Views.musclePopup(id, mapMode);
    pop.hidden = false;

    const box = shape.getBoundingClientRect();
    const area = map.getBoundingClientRect();
    const left = box.left + box.width / 2 - area.left - pop.offsetWidth / 2;
    const above = box.top - area.top - pop.offsetHeight - 6;
    pop.style.left = `${Math.max(0, Math.min(area.width - pop.offsetWidth, left))}px`;
    pop.style.top = `${above >= 0 ? above : box.bottom - area.top + 6}px`;
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
    if (!confirm('Delete ALL data? This removes every workout day, exercise, custom exercise, workout history and setting from this device. It cannot be undone.')) return;
    Store.deleteAll();
    toast('All data deleted');
    render();
  },
};

// Opens or closes one row of the planned sets card and remembers it.
function toggleSetsBlock(openSet, id, button) {
  const isOpen = !openSet.has(id);
  if (isOpen) openSet.add(id); else openSet.delete(id);
  button.setAttribute('aria-expanded', isOpen);
  button.closest('.sets-block').classList.toggle('is-open', isOpen);
}

function closeMusclePopup() {
  const pop = document.getElementById('map-pop');
  if (!pop) return;
  pop.hidden = true;
  document.querySelectorAll('#body-map .is-selected').forEach(s => s.classList.remove('is-selected'));
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.dataset.action !== 'muscle') closeMusclePopup(); // tap anywhere else closes it
  if (!event.target.closest('.fab-menu, .fab')) setFabMenu(false);      // same for the + menu
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
  go(backBtn.dataset.href);
});

// ---------- Dragging a workout to another day (Workouts tab) ----------
// Press and hold a workout (HOLD_MS) to pick it up, then drag it onto another day and let go.
// Moving your finger before then scrolls the page as usual. A copy of the card follows
// your finger (moved with transform only, so it stays smooth on iPhone) and the day under
// it lights up. Near the top or bottom of the screen the page scrolls.
const HOLD_MS = 350;
const EDGE_PX = 90;
let drag = null; // { id, card, ghost, startX, startY, x, y, offsetX, offsetY, active, timer, overDay }
let dragEndedAt = 0;

// True just after a drag, so letting go doesn't also count as a tap on the workout.
function dragJustEnded() {
  return Date.now() - dragEndedAt < 400;
}

appEl.addEventListener('pointerdown', event => {
  const card = event.target.closest('.workout-card');
  if (!card || !card.dataset.workout || event.button > 0) return; // (quick workout cards don't move)
  drag = { id: card.dataset.workout, card, startX: event.clientX, startY: event.clientY,
    x: event.clientX, y: event.clientY, active: false, overDay: null };
  drag.timer = setTimeout(pickUp, HOLD_MS);
});

function pickUp() {
  const rect = drag.card.getBoundingClientRect();
  drag.active = true;
  drag.offsetX = drag.startX - rect.left;
  drag.offsetY = drag.startY - rect.top;
  drag.ghost = drag.card.cloneNode(true);
  drag.ghost.classList.add('drag-ghost');
  drag.ghost.style.width = `${rect.width}px`;
  document.body.append(drag.ghost);
  drag.card.classList.add('is-dragging');
  document.body.classList.add('is-dragging');
  navigator.vibrate?.(15); // a small buzz where supported
  moveGhost();
  requestAnimationFrame(edgeScroll);
}

function moveGhost() {
  drag.ghost.style.transform = `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px) scale(1.03)`;
  // The day under the finger (the ghost ignores taps, so it doesn't get in the way).
  const day = document.elementFromPoint(drag.x, drag.y)?.closest('.day-block');
  if (day !== drag.overDay) {
    drag.overDay?.classList.remove('is-drop-target');
    day?.classList.add('is-drop-target');
    drag.overDay = day;
  }
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
    drag.overDay?.classList.remove('is-drop-target');
    document.body.classList.remove('is-dragging');
    const weekday = drop && drag.overDay ? Number(drag.overDay.dataset.weekday) : null;
    const workout = Store.getWorkout(drag.id);
    if (weekday != null && workout && workout.weekday !== weekday) {
      Store.moveWorkout(drag.id, weekday);
      toast(`Moved ${workout.name} to ${WEEKDAYS[weekday]}`);
      render();
    }
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

// Holding a workout picks it up; don't also open the long-press menu.
appEl.addEventListener('contextmenu', event => {
  if (event.target.closest('.workout-card')) event.preventDefault();
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
    document.getElementById('lib-results').innerHTML = Views.libraryResults(input.value);
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
  refreshWorkoutProgress(input.dataset.ex);
});

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
    sex: values.sex,
  });
  // Body weight is logged with today's date, so only when the box really changed
  // (not its rounded display value when some other setting changes).
  if (values.bodyWeight.trim() !== Units.showWeight(Store.data.settings.bodyWeightLbs)) {
    Store.setBodyWeight(Units.readWeight(values.bodyWeight));
  }
}

// Saves when you leave a box (or pick an option).
appEl.addEventListener('change', async event => {
  const input = event.target;

  if (input.form && input.form.id === 'settings-form') {
    saveSettingsForm(input.form);
    return;
  }

  // Workout title on the edit screen (an empty title keeps the old one).
  if (input.id === 'workout-name') saveWorkoutName();

  // Day chips on the edit screen: moves the workout to that day.
  if (input.name === 'workout-day') {
    Store.moveWorkout(currentRoute().workoutId, Number(input.value));
  }

  // Day chips on the New workout form.
  if (input.name === 'new-workout-day') newForm.weekday = Number(input.value);

  if (input.id === 'custom-equipment') {
    picker.custom.equipment = input.value;
  }

  if (input.id === 'import-file') {
    const file = input.files[0];
    if (!file) return;
    if (!confirm('Importing replaces ALL data on this device with the backup. Continue?')) {
      input.value = '';
      return;
    }
    try {
      Store.importBackup(await file.text());
      toast('Backup imported');
      render();
    } catch (err) {
      alert('Could not import: ' + err.message);
      input.value = '';
    }
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

  // New workout (or a copy) → create it, then open it to add or change exercises.
  if (form.id === 'new-workout-form') {
    const name = values.name.trim();
    if (!name) {
      toast('Give the workout a title');
      return;
    }
    const source = newForm.copyFrom && Store.getWorkout(newForm.copyFrom);
    const workout = Store.addWorkout(name, newForm.weekday, source ? source.exercises : []);
    toast(source ? `Copied to ${WEEKDAYS[workout.weekday]}` : `Created ${name}`);
    go(`#/workout/${workout.id}/edit`);
    return;
  }

  // Sets & reps for the picked exercise → add it to the workout (or save changes).
  if (form.id === 'exercise-form') {
    const repA = Math.max(1, parseInt(values.repMin, 10) || 1);
    const repB = Math.max(1, parseInt(values.repMax, 10) || repA);
    const fields = {
      refId: picker.refId,
      sets: Math.max(1, parseInt(values.sets, 10) || 1),
      repMin: Math.min(repA, repB), // swapped if typed backwards
      repMax: Math.max(repA, repB),
    };
    const workoutId = currentRoute().workoutId;
    const name = Library.forExercise(fields).name;
    if (picker.exerciseId) {
      Store.updateExercise(workoutId, picker.exerciseId, fields);
      toast(`Saved ${name}`);
    } else {
      Store.addExercise(workoutId, fields);
      toast(`Added ${name}`);
    }
    picker = newPicker();
    render();
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
    // Opened from Swap for today: save it, then swap it in (a different muscle group asks first, as usual).
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
  if (!back && !['past', 'exercise-log'].includes(view)) returnStack = [];

  picker = newPicker();
  openExerciseId = back ? back.openExerciseId : null;
  autoOpenExercise = !back;
  swap = { exerciseId: null, query: '' };
  quickAdd = { open: false, query: '' };
  logState = back ? back.logState : { month: null, day: null, range: 'all' };
  newForm = null;
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
