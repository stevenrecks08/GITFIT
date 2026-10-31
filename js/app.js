// app.js — starts the app, picks which screen to show, and handles taps/typing.
//
// Screens are chosen by the part of the URL after "#":
//   #/                 → home (the week)          [Workouts tab]
//   #/day/<id>/edit    → edit a day               [Workouts tab]
//   #/day/<id>         → do a workout for that day [Workouts tab]
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

// The add/edit exercise panel on the edit-day screen:
//   exerciseId = the day's exercise being edited (null when adding a new one)
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

// Log screens: the search text (kept so Back returns to the same results),
// and the calendar month / tapped day on an exercise's log.
let logQuery = '';
let logState = { month: null, day: null };

// What the muscle map on Profile shows: 'growth', 'sets' or 'level'.
let mapMode = 'growth';

function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'day' && parts[1]) {
    return { view: parts[2] === 'edit' ? 'edit' : 'workout', dayId: parts[1], tab: 'workouts' };
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
  const route = currentRoute();
  let screen;

  if (route.view === 'home') {
    screen = Views.home();
  } else if (route.view === 'profile') {
    screen = Views.profile(mapMode);
  } else if (route.view === 'settings') {
    screen = Views.settings();
  } else if (route.view === 'log') {
    screen = Views.logSearch(logQuery);
  } else if (route.view === 'exercise-log') {
    screen = Views.exerciseLog(route.refId, logState);
  } else {
    const day = Store.getDay(route.dayId);
    if (!day) return go('#/');
    if (route.view === 'edit') {
      screen = Views.editDay(day, picker);
    } else if (day.rest) {
      return go('#/'); // rest days have no workout
    } else {
      // Only start a draft once there's something to log.
      const draft = day.exercises.length ? Store.ensureDraft(day) : null;
      screen = Views.workout(day, draft, openExerciseId);
    }
  }

  titleEl.textContent = screen.title;
  document.title = screen.title;
  backBtn.hidden = !screen.back;
  backBtn.dataset.href = screen.back || '';
  gearBtn.hidden = !screen.gear;
  tabBarEl.innerHTML = tabBarHtml(route.tab);
  appEl.innerHTML = screen.html;
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

// ---------- Button taps ----------

const actions = {
  'open-day'(id) {
    const draft = Store.data.draft;
    if (draft && draft.dayId !== id) {
      const other = Store.getDay(draft.dayId);
      if (!confirm(`You have an unfinished "${other ? dayLabel(other) : 'workout'}". Discard it and start this one?`)) return;
      Store.discardDraft();
    }
    go(`#/day/${id}`);
  },

  'edit-day'(id) {
    go(`#/day/${id}/edit`);
  },

  // Tapped one of the day's exercises: open it for editing at the sets & reps step.
  'edit-exercise'(id) {
    const ex = Store.getDay(currentRoute().dayId).exercises.find(e => e.id === id);
    picker = { exerciseId: id, refId: ex.refId, mode: 'details', query: '' };
    render();
    showPanel();
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
    Store.moveExercise(currentRoute().dayId, id, Number(button.dataset.dir));
    render();
  },

  'delete-exercise'(id) {
    if (!confirm('Delete this exercise from the day? (Past workouts stay saved.)')) return;
    Store.deleteExercise(currentRoute().dayId, id);
    picker = newPicker();
    render();
  },

  // Opens this exercise (closing any other), or closes it if it's already open.
  'toggle-exercise'(id) {
    openExerciseId = openExerciseId === id ? null : id;
    render();
    // Closing one above can shift this row off screen, so bring it back into view.
    document.getElementById(`ex-${id}`).scrollIntoView({ block: 'nearest' });
  },

  'finish'() {
    const session = Store.finishDraft();
    if (!session) {
      toast('Fill in at least one set first');
      return;
    }
    toast('Workout saved 💪');
    go('#/');
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

  'delete-all'() {
    if (!confirm('Delete ALL data? This removes every workout day, exercise, custom exercise, workout history and setting from this device. It cannot be undone.')) return;
    Store.deleteAll();
    toast('All data deleted');
    render();
  },
};

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

backBtn.addEventListener('click', () => go(backBtn.dataset.href));

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

  const field = input.dataset.field;
  if (!field) return;
  const value = field === 'weight' ? Units.readWeight(input.value) : input.value.trim();
  Store.updateDraftSet(input.dataset.ex, Number(input.dataset.set), field, value);
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

  // Type of day ("Legs"). Leaving it empty is allowed.
  if (input.id === 'day-name') {
    Store.renameDay(currentRoute().dayId, input.value.trim());
  }

  // Workout / Rest day choice on the edit screen.
  if (input.name === 'day-kind') {
    Store.setRestDay(currentRoute().dayId, input.value === 'rest');
    picker = newPicker();
    render();
  }

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

  // Sets & reps for the picked exercise → add it to the day (or save changes).
  if (form.id === 'exercise-form') {
    const repA = Math.max(1, parseInt(values.repMin, 10) || 1);
    const repB = Math.max(1, parseInt(values.repMax, 10) || repA);
    const fields = {
      refId: picker.refId,
      sets: Math.max(1, parseInt(values.sets, 10) || 1),
      repMin: Math.min(repA, repB), // swapped if typed backwards
      repMax: Math.max(repA, repB),
    };
    const dayId = currentRoute().dayId;
    const name = Library.forExercise(fields).name;
    if (picker.exerciseId) {
      Store.updateExercise(dayId, picker.exerciseId, fields);
      toast(`Saved ${name}`);
    } else {
      Store.addExercise(dayId, fields);
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
  logState = { month: null, day: null };
  render();
  window.scrollTo(0, 0);
});

try {
  Store.load();
} catch (err) {
  // Don't overwrite data we couldn't read — show the problem instead.
  appEl.innerHTML = `<p class="empty">Saved data could not be read: ${esc(err.message)}</p>`;
  throw err;
}
render();
