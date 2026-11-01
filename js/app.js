// app.js — starts the app, picks which screen to show, and handles taps/typing.
//
// Screens are chosen by the part of the URL after "#":
//   #/                 → home (the week)          [Workouts tab]
//   #/new              → new workout (the + button) [Workouts tab]
//   #/new/<id>         → copy of a workout          [Workouts tab]
//   #/workout/<id>/edit → edit a workout            [Workouts tab]
//   #/workout/<id>     → do a workout (any day)     [Workouts tab]
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

// Planned sets card on the Workouts tab: which groups and muscles are expanded.
// Kept while the app is open, so going into a day and back leaves them as they were.
const openSets = { groups: new Set(), muscles: new Set() };

// Swap for today on the workout screen: whose exercise search is open, and what's typed.
let swap = { exerciseId: null, query: '' };

// Log screens: the search text (kept so Back returns to the same results),
// and the calendar month / tapped day on an exercise's log.
let logQuery = '';
let logState = { month: null, day: null };

// What the muscle map on Profile shows: 'growth' or 'level'.
let mapMode = 'growth';

// A past workout being edited (nothing is saved until Save changes):
//   { sessionId, exercises: [{ entry (the saved exercise, without its sets), rows: [{ weight (lbs or null), reps (text) }] }],
//     original (rows as they started, to tell if anything changed) }
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
    while (rows.length < (entry.targetSets || 0)) rows.push({ weight: null, reps: '' });
    return { entry, rows };
  });
  return { sessionId: session.id, exercises, original: JSON.stringify(exercises.map(e => e.rows)) };
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
  let screen;

  if (route.view === 'home') {
    screen = Views.home(openSets);
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
  } else {
    const workout = Store.getWorkout(route.workoutId);
    if (!workout) return go('#/');
    if (route.view === 'edit') {
      screen = Views.editWorkout(workout, picker);
    } else if (Store.isRestDay(workout.weekday) && Store.data.draft?.workoutId !== workout.id) {
      return go('#/'); // a workout on a rest day can't be started
    } else {
      // Only start a draft once there's something to log.
      const draft = workout.exercises.length ? Store.ensureDraft(workout) : null;
      screen = Views.workout(workout, draft, openExerciseId, swap);
    }
  }

  titleEl.textContent = screen.title;
  document.title = screen.title;
  backBtn.hidden = !screen.back;
  backBtn.dataset.href = screen.back || '';
  gearBtn.hidden = !screen.gear;
  historyLink.hidden = !screen.history;
  // The tab bar only shows on each tab's main screen; deeper screens use Back.
  const here = '#/' + location.hash.replace(/^#\/?/, '');
  const showTabs = TABS.some(tab => tab.href === here);
  tabBarEl.hidden = !showTabs;
  document.body.classList.toggle('no-tabbar', !showTabs);
  tabBarEl.innerHTML = tabBarHtml(route.tab);
  appEl.classList.remove('is-searching');
  appEl.innerHTML = screen.html;
  if (route.view === 'home' && !scrolledToToday) scrollToToday();
  showOverlay();
}

// When the app opens on the week, today's day is scrolled near the top (once per app open,
// so coming back to the week later doesn't jump around).
// (The browser's own "keep the old scroll position on reload" is turned off so it doesn't undo this.)
let scrolledToToday = false;
history.scrollRestoration = 'manual';
function scrollToToday() {
  scrolledToToday = true;
  requestAnimationFrame(() => { // once the week has been laid out
    const today = appEl.querySelector('.day-block.is-today');
    if (!today) return;
    const topbar = document.querySelector('.topbar').getBoundingClientRect().bottom;
    window.scrollTo(0, Math.max(0, today.getBoundingClientRect().top + window.scrollY - topbar - 12));
  });
}

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

function finishWorkout() {
  const draft = JSON.parse(JSON.stringify(Store.data.draft));
  const hadHit = Streak.summary().week.hit;
  const session = Store.finishDraft();
  if (!session) {
    toast('Fill in at least one set first');
    return;
  }
  toast('Workout saved 💪', { label: 'Undo', action: 'undo-finish' }, 5000);
  lastFinish = { sessionId: session.id, draft, hadHit };
  go('#/');
}

// ---------- Button taps ----------

const actions = {
  // Tapped a workout on the week: start it (or resume it), whatever day it is today.
  'open-workout'(id) {
    if (dragJustEnded()) return;
    const draft = Store.data.draft;
    if (draft && draft.workoutId !== id) {
      const other = Store.getWorkout(draft.workoutId);
      if (!confirm(`You have an unfinished "${other ? other.name : 'workout'}". Discard it and start this one?`)) return;
      Store.discardDraft();
    }
    go(`#/workout/${id}`);
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

  // Tapped a day's switch: flips it between training day and rest day straight away.
  // It only asks first if that would throw away a workout in progress from that day.
  'day-menu'(id) {
    const weekday = Number(id);
    const draftWorkout = Store.data.draft && Store.getWorkout(Store.data.draft.workoutId);
    if (!Store.isRestDay(weekday) && draftWorkout?.weekday === weekday) {
      showDialog({
        title: `Make ${WEEKDAYS[weekday]} a rest day?`,
        lines: [`Your unfinished ${draftWorkout.name} workout is on ${WEEKDAYS[weekday]}, and it will be discarded.`],
        confirm: { label: 'Make it a rest day', action: 'toggle-rest', id: weekday },
        cancel: { label: 'Cancel', action: 'dialog-cancel' },
        danger: true,
      });
      return;
    }
    actions['toggle-rest'](weekday);
  },

  'toggle-rest'(id) {
    const weekday = Number(id);
    const day = WEEKDAYS[weekday];
    hideDialog();
    Store.setRestDay(weekday, !Store.isRestDay(weekday));
    const rest = Store.isRestDay(weekday);
    // A passed day stays as it was for this week's streak, so say so.
    toast(Streak.hasPassed(weekday)
      ? `${day} has passed: this week's streak keeps it as it was. Counts from next week.`
      : rest ? `${day} is a rest day` : `${day} is a training day`);
    // Slide the switch first, then redraw the week once it has moved.
    const toggle = document.querySelector(`.day-toggle[data-id="${weekday}"]`);
    toggle?.classList.toggle('is-on', !rest);
    toggle?.setAttribute('aria-checked', String(!rest));
    setTimeout(render, reduceMotion.matches ? 0 : 200);
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
    const workout = Store.getWorkout(Store.data.draft.workoutId);
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

  'finish-anyway'() {
    overlayEl.hidden = true;
    overlayEl.innerHTML = '';
    finishWorkout();
  },

  'finish-back'() {
    closeOverlay();
  },

  // ---------- Past workouts ----------

  'open-session'(id) {
    go(`#/history/${id}`);
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
    go('#/history');
  },

  'past-discard'() {
    go('#/history');
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
    go('#/history');
  },

  'dialog-cancel'() {
    hideDialog();
  },

  // Undo on the "Workout saved" toast: back to the workout, as it was.
  'undo-finish'() {
    if (!lastFinish) return;
    Store.undoFinish(lastFinish.sessionId, lastFinish.draft);
    if (!lastFinish.hadHit) Streak.undoHit(); // the hit came from this workout
    if (overlayEl.classList.contains('is-celebration')) {
      overlayEl.hidden = true;
      overlayEl.innerHTML = '';
    }
    const workoutId = lastFinish.draft.workoutId;
    lastFinish = null;
    hideToast();
    go(`#/workout/${workoutId}`);
  },

  'discard'() {
    if (!confirm('Discard this workout? Anything typed will be lost.')) return;
    Store.discardDraft();
    go('#/');
  },

  'export'() {
    Store.exportBackup();
  },

  'import'() {
    document.getElementById('import-file').click();
  },

  // Tapped an exercise in the Log search results.
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
  if (!card || event.button > 0) return;
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

  const field = input.dataset.field;
  if (!field) return;
  const value = field === 'weight' ? Units.readWeight(input.value) : input.value.trim();
  // A past workout's sets are only kept in memory until Save changes.
  if (input.dataset.past != null) {
    pastEdit.exercises[Number(input.dataset.past)].rows[Number(input.dataset.set)][field] = value;
    return;
  }
  Store.updateDraftSet(input.dataset.ex, Number(input.dataset.set), field, value);
});

// Tapping the exercise search moves it to the top of the screen, so the results
// show below it instead of under the keyboard. The extra space (is-searching) lets
// the page scroll that far even before there are results.
appEl.addEventListener('focusin', event => {
  if (event.target.id !== 'lib-search' && event.target.id !== 'swap-search') return;
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
    bodyWeightLbs: Units.readWeight(values.bodyWeight),
    sex: values.sex,
  });
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
  picker = newPicker();
  openExerciseId = null;
  swap = { exerciseId: null, query: '' };
  logState = { month: null, day: null };
  newForm = null;
  pastEdit = null;
  render();
  window.scrollTo(0, 0);
});

// A home-screen app usually comes back from the background instead of reloading, so
// check the streak then too (a week may have ended while it was away).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
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
