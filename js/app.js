// app.js — starts the app, picks which screen to show, and handles taps/typing.
//
// Screens are chosen by the part of the URL after "#":
//   #/                 → home (the week)          [Workouts tab]
//   #/day/<id>/edit    → edit a day               [Workouts tab]
//   #/day/<id>         → do a workout for that day [Workouts tab]
//   #/profile          → profile + settings       [Profile tab]
// Using the URL means the browser/phone Back gesture works for free.

const appEl = document.getElementById('app');
const titleEl = document.getElementById('title');
const backBtn = document.getElementById('back');
const tabBarEl = document.getElementById('tabbar');
const toastEl = document.getElementById('toast');

// Which exercise is open in the edit form (only used on the edit screen).
let editingExerciseId = null;
// Which exercise is expanded on the workout screen (null = all collapsed).
let openExerciseId = null;

function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'day' && parts[1]) {
    return { view: parts[2] === 'edit' ? 'edit' : 'workout', dayId: parts[1], tab: 'workouts' };
  }
  if (parts[0] === 'profile') return { view: 'profile', tab: 'profile' };
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
    screen = Views.profile();
  } else {
    const day = Store.getDay(route.dayId);
    if (!day) return go('#/');
    if (route.view === 'edit') {
      screen = Views.editDay(day, editingExerciseId);
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

  'edit-exercise'(id) {
    editingExerciseId = id;
    render();
    document.getElementById('exercise-form').scrollIntoView({ behavior: 'smooth' });
  },

  'cancel-edit'() {
    editingExerciseId = null;
    render();
  },

  'move-exercise'(id, button) {
    Store.moveExercise(currentRoute().dayId, id, Number(button.dataset.dir));
    render();
  },

  'delete-exercise'(id) {
    if (!confirm('Delete this exercise from the day? (Past workouts stay saved.)')) return;
    Store.deleteExercise(currentRoute().dayId, id);
    editingExerciseId = null;
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
};

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  actions[button.dataset.action](button.dataset.id, button);
});

backBtn.addEventListener('click', () => go(backBtn.dataset.href));

// ---------- Typing ----------

// Workout inputs: save each keystroke into the draft.
// Weights are typed in the chosen unit but saved in lbs.
appEl.addEventListener('input', event => {
  const input = event.target;
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
  });

  // Update the name and avatar at the top without redrawing (which would
  // take focus away from the box you just tapped into).
  document.getElementById('profile-name').textContent = profileName();
  document.querySelector('.avatar').textContent = initials(profileName());
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
    editingExerciseId = null;
    render();
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

  if (form.id === 'exercise-form') {
    const repA = Math.max(1, parseInt(values.repMin, 10) || 1);
    const repB = Math.max(1, parseInt(values.repMax, 10) || repA);
    const fields = {
      name: values.name.trim(),
      muscle: values.muscle,
      sets: Math.max(1, parseInt(values.sets, 10) || 1),
      repMin: Math.min(repA, repB), // swapped if typed backwards
      repMax: Math.max(repA, repB),
    };
    if (!fields.name) return;
    const dayId = currentRoute().dayId;
    if (editingExerciseId) {
      Store.updateExercise(dayId, editingExerciseId, fields);
      editingExerciseId = null;
    } else {
      Store.addExercise(dayId, fields);
    }
    render();
    document.getElementById('ex-name').focus();
  }
});

// ---------- Start ----------

window.addEventListener('hashchange', () => {
  editingExerciseId = null;
  openExerciseId = null;
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
