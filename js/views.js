// views.js — builds the HTML for each screen. No saving happens here.
// Each view returns { title, back, html } and optionally gear: true or history: true:
//   title = text in the top bar, back = where the Back button goes (or null),
//   gear = show the Settings gear in the top bar.
//   history = show the "Past workouts" link in the top bar.
// Buttons use data-action="..." and are handled in app.js.

// Makes user-typed text safe to put inside HTML.
function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// One set as "20×10" (weight in the chosen unit × reps). BW = bodyweight (no weight entered).
function formatSet(set) {
  const weight = set.weight == null ? 'BW' : Units.showWeight(set.weight);
  return `${weight}×${set.reps}`;
}

// Target reps as "8–12", or just "10" when min and max are the same.
function repRange(min, max) {
  return min === max ? String(min) : `${min}–${max}`;
}

// "Last: 20×10, 20×8, 20×7" or "No history yet"
function lastSummary(last) {
  return last ? `Last: ${last.sets.map(formatSet).join(', ')}` : 'No history yet';
}

function profileName() {
  return Store.data.settings.name.trim() || 'Your name';
}

// Placeholder avatar text: "Rex Stephenson" → "RS"
function initials(name) {
  return name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();
}

const SETS_SCALE = 16; // a full bar = 16+ sets a week

// The streak flame. Its colors come from CSS (.flame-outer / .flame-inner).
const FLAME_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path class="flame-outer" d="M12 1.5C13.6 5.6 19.5 8.6 19.5 14.6a7.5 7.5 0 0 1-15 0c0-3 1.5-5.4 3.6-7
      .1 2.4 1.2 4 2.7 4.7C10.1 8.7 10.6 4.9 12 1.5z"/>
    <path class="flame-inner" d="M12 22.1a3.9 3.9 0 0 1-3.9-3.9c0-2.4 1.9-3.9 3.2-5.8.4 1.9 1.9 2.6 2.9 3.8
      .9 1 1.7 1.6 1.7 2a3.9 3.9 0 0 1-3.9 3.9z"/>
  </svg>`;

// "4.5", "3", "0"
function setsText(sets) {
  return String(Number(sets.toFixed(1)));
}

const CHEVRON = `<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`;

// One bar row: chevron, name, bar (filled to fraction 0–1), number.
function setsRow(action, id, isOpen, label, fraction, sets, extraClass = '') {
  return `
    <button type="button" class="sets-row ${extraClass}" data-action="${action}" data-id="${id}" aria-expanded="${isOpen}">
      ${CHEVRON}
      <span class="sets-label">${label}</span>
      <span class="sets-bar"><i style="width:${Math.min(100, fraction * 100)}%"></i></span>
      <span class="sets-num">${setsText(sets)}</span>
    </button>`;
}

// Planned sets per muscle group for the week, each with a bar. Tapping a group shows
// its muscles; tapping a muscle shows the exercises behind its number.
//   planned = Stats.weekPlannedSets()   open = { groups: Set of names, muscles: Set of ids }
// Group bars fill at SETS_SCALE sets. Muscle bars share one scale across every group
// (the most-trained muscle fills its bar), so any two muscles can be compared.
function plannedSetsTable(planned, open) {
  const { groups, muscles, sources } = planned;
  const shown = MUSCLE_GROUPS.filter(g => groups[g.name]);
  if (!shown.length) return '<p class="empty">No exercises planned yet.</p>';
  const muscleScale = Math.max(...Object.values(muscles));

  const blocks = shown.map(group => {
    const groupOpen = open.groups.has(group.name);
    const muscleBlocks = Object.entries(group.muscles).map(([id, name]) => {
      const sets = muscles[id] || 0;
      const muscleOpen = open.muscles.has(id);
      const list = sources[id] || [];
      const detail = list.length
        ? `<ul class="sets-sources">${list.map(s => `
            <li><span class="src-name">${esc(s.name)}</span>
              <span class="src-role is-${s.role}">${s.role}</span>
              <span class="src-num">${setsText(s.sets)}</span></li>`).join('')}</ul>`
        : '<p class="sets-none">No planned exercise trains this.</p>';
      return `
        <div class="sets-block ${muscleOpen ? 'is-open' : ''}" data-block="${id}">
          ${setsRow('toggle-muscle', id, muscleOpen, name, sets / muscleScale, sets, 'is-muscle')}
          <div class="collapse"><div class="collapse-inner">${detail}</div></div>
        </div>`;
    }).join('');
    return `
      <div class="sets-block ${groupOpen ? 'is-open' : ''}" data-block="${group.name}">
        ${setsRow('toggle-group', group.name, groupOpen, group.name, groups[group.name] / SETS_SCALE, groups[group.name], 'is-group')}
        <div class="collapse"><div class="collapse-inner">${muscleBlocks}</div></div>
      </div>`;
  }).join('');
  return `<div class="card sets-table">${blocks}</div>`;
}

// "Oct 30"
function shortDate(date) {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// 'YYYY-MM-DD' → a Date at local midnight.
function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Line graph of estimated max, from the first point to today.
// points = [{ time (ms), value (in the chosen unit) }], oldest first.
// singles = the same shape, for logged 1-rep sets: drawn as a thin white line behind,
// with a small key under the graph. With no points, draws an empty graph with emptyNote written over it.
function maxChart(points, emptyNote, singles = []) {
  const W = 320, H = 170, L = 40, R = 10, T = 10, B = 24; // size and margins (SVG units)

  if (!points.length) {
    const grid = [0, 0.5, 1].map(f => {
      const y = T + f * (H - T - B);
      return `<line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/>`;
    }).join('');
    return `
      <div class="is-empty">
        <svg class="chart" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          ${grid}
          <text class="chart-label" x="${W - R}" y="${H - 6}" text-anchor="end">Today</text>
        </svg>
        <p class="empty-note"><span>${emptyNote}</span></p>
      </div>`;
  }

  const t0 = points[0].time;
  const t1 = Math.max(Date.now(), points[points.length - 1].time);
  const values = [...points, ...singles].map(p => p.value);
  const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.15, Math.max(...values) * 0.05, 1);
  const lo = Math.max(0, Math.min(...values) - pad);
  const hi = Math.max(...values) + pad;

  const x = t => (t1 === t0 ? (L + W - R) / 2 : L + (t - t0) / (t1 - t0) * (W - L - R));
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);

  const grid = [lo, (lo + hi) / 2, hi].map(v => `
    <line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="chart-label" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map(p => `<circle class="chart-dot" cx="${x(p.time).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5"/>`).join('');
  const singleLine = singles.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const singleDots = singles.map(p => `<circle class="chart-single-dot" cx="${x(p.time).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.5"/>`).join('');
  const key = singles.length ? `
    <p class="chart-key">
      <span><i class="key-estimate"></i>Estimated max</span>
      <span><i class="key-single"></i>Actual 1-rep</span>
    </p>` : '';
  const xLabels = t1 === t0
    ? `<text class="chart-label" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">Today</text>`
    : `<text class="chart-label" x="${L}" y="${H - 6}">${shortDate(t0)}</text>
       <text class="chart-label" x="${W - R}" y="${H - 6}" text-anchor="end">Today</text>`;

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated max over time">
      ${grid}
      ${singles.length ? `<path class="chart-single-line" d="${singleLine}"/>${singleDots}` : ''}
      <path class="chart-line" d="${line}"/>
      ${dots}
      ${xLabels}
    </svg>${key}`;
}

// Month calendar. Days in `logged` are tappable; all others are grayed out.
// minMonth/maxMonth ('YYYY-MM') limit the arrows. emptyNote is written over it when set.
function logCalendar(month, logged, selected, minMonth, maxMonth, emptyNote) {
  const first = fromDayKey(`${month}-01`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const blanks = (first.getDay() + 6) % 7; // weeks start on Monday
  const today = dayKey(new Date());

  let cells = '<span></span>'.repeat(blanks);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    const classes = ['cal-day', key === today ? 'is-today' : '', key === selected ? 'is-selected' : ''].join(' ');
    cells += logged.has(key)
      ? `<button type="button" class="${classes} is-logged" data-action="log-day" data-id="${key}">${d}</button>`
      : `<span class="${classes}">${d}</span>`;
  }

  return `
    <div class="card calendar" data-month="${month}">
      <div class="cal-head">
        <button type="button" class="btn btn-small" data-action="log-month" data-id="-1"
          ${month <= minMonth ? 'disabled' : ''} aria-label="Previous month">‹</button>
        <strong>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" class="btn btn-small" data-action="log-month" data-id="1"
          ${month >= maxMonth ? 'disabled' : ''} aria-label="Next month">›</button>
      </div>
      <div class="cal-grid ${emptyNote ? 'is-empty' : ''}">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="cal-weekday">${d}</span>`).join('')}
        ${cells}
        ${emptyNote ? `<p class="empty-note"><span>${emptyNote}</span></p>` : ''}
      </div>
    </div>`;
}

// The sets done on one day (all workouts that day), plus that day's estimated max.
function logDayCard(entries, key) {
  const sets = entries.flatMap(h => h.sets);
  const maxes = entries.filter(h => h.best).map(h => h.best.max);
  const unit = Units.weightUnit();
  const rows = sets.map((set, i) => `
    <span>${i + 1}</span>
    <span>${set.weight == null ? 'BW' : `${Units.showWeight(set.weight)} ${unit}`}</span>
    <span>${set.reps}</span>`).join('');

  return `
    <div class="card log-day">
      <p class="log-day-date">${fromDayKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      <div class="log-sets">
        <span class="log-sets-head">Set</span><span class="log-sets-head">Weight</span><span class="log-sets-head">Reps</span>
        ${rows}
      </div>
      ${maxes.length ? `<p class="log-day-max">Estimated max: <strong>${Units.showWeight(Math.max(...maxes))} ${unit}</strong></p>` : ''}
    </div>`;
}

// Seven tappable day chips (Mon … Sun) as radio buttons named `name`, with `selected` checked.
function weekdayPicker(name, selected) {
  return `
    <div class="weekday-pick" role="radiogroup">
      ${WEEKDAYS.map((day, i) => `
        <label class="weekday-chip">
          <input type="radio" name="${name}" value="${i}" ${i === selected ? 'checked' : ''}>
          <span>${day.slice(0, 3)}</span>
        </label>`).join('')}
    </div>`;
}

// The training day / rest day switch on each day of the week, like an iPhone settings switch:
// on (green, dumbbell in the knob) = training day, off (gray, moon in the knob) = rest day.
// Tapping it asks first (the day-menu pop-up in app.js).
const KNOB_ICONS = {
  train: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  rest: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
};
function dayToggle(weekday, dayName, rest) {
  return `
    <button type="button" class="day-toggle ${rest ? '' : 'is-on'}" role="switch" aria-checked="${!rest}"
      aria-label="${dayName} is a training day" data-action="day-menu" data-id="${weekday}">
      <span class="day-toggle-knob">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KNOB_ICONS[rest ? 'rest' : 'train']}</svg>
      </span>
    </button>`;
}

const Views = {

  // ---------- Home: the week, Monday to Sunday, with each day's workouts ----------
  // openSets = which planned-sets rows are expanded: { groups: Set, muscles: Set }
  // Tap a day's switch to make it a rest day (or not); tap a workout to start it (any day);
  // hold a workout and drag it to move it to another day (see the drag code in app.js).
  home(openSets) {
    const { draft } = Store.data;
    const draftWorkout = draft && Store.getWorkout(draft.workoutId);
    const today = todayWeekday();

    const resume = draftWorkout ? `
      <div class="card banner stack">
        <div><strong>Workout in progress:</strong> ${esc(draftWorkout.name)}</div>
        <button class="btn btn-primary" data-action="open-workout" data-id="${draftWorkout.id}">Resume</button>
      </div>` : '';

    const days = WEEKDAYS.map((dayName, weekday) => {
      const rest = Store.isRestDay(weekday);
      const workouts = Store.workoutsOn(weekday);
      const cards = workouts.map(w => {
        const last = Store.lastSessionFor(w.id);
        const count = w.exercises.length;
        const meta = `${count} exercise${count === 1 ? '' : 's'}` + (last ? ` · last ${formatDate(last.date)}` : '');
        // On a rest day the workout stays, grayed out, and can't be started.
        return `
          <div class="card workout-card" data-workout="${w.id}">
            <button class="workout-open" data-action="open-workout" data-id="${w.id}" ${rest ? 'disabled' : ''}>
              <span class="workout-name">${esc(w.name)}</span>
              <span class="day-meta">${meta}</span>
            </button>
            <button class="btn btn-small" data-action="edit-workout" data-id="${w.id}">Edit</button>
          </div>`;
      }).join('');
      return `
        <section class="day-block ${rest ? 'is-rest' : ''}" data-weekday="${weekday}">
          <div class="day-head">
            <span class="day-head-name">${dayName}</span>
            ${weekday === today ? '<span class="tag tag-today">Today</span>' : ''}
            ${rest ? '<span class="rest-word">Rest day</span>' : ''}
            ${dayToggle(weekday, dayName, rest)}
          </div>
          ${cards || `<p class="day-empty">${rest ? 'Recovery day' : 'Nothing planned'}</p>`}
        </section>`;
    }).join('');

    return {
      title: 'GitFit',
      back: null,
      history: true,
      html: `
        ${resume}
        <h2>This week</h2>
        ${Store.data.workouts.length
          ? '<p class="muted week-hint">Tap a workout to start it. Hold and drag it to move it to another day.</p>'
          : '<p class="muted week-hint">Tap + to create your first workout.</p>'}
        <div class="week">${days}</div>

        <h2>Planned sets per week</h2>
        ${plannedSetsTable(Stats.weekPlannedSets(), openSets)}

        <button type="button" class="fab" data-action="new-workout" aria-label="New workout">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.6"
            stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      `,
    };
  },

  // ---------- New workout (the + button), or a copy of one ----------
  // form = { name, weekday, copyFrom (workout id, or null) }
  newWorkout(form) {
    const source = form.copyFrom && Store.getWorkout(form.copyFrom);
    const count = source ? source.exercises.length : 0;
    return {
      title: source ? 'Copy workout' : 'New workout',
      back: source ? `#/workout/${source.id}/edit` : '#/',
      html: `
        <form id="new-workout-form" class="stack" autocomplete="off">
          <h2>Title</h2>
          <input id="new-workout-name" name="name" value="${esc(form.name)}" placeholder="e.g. Push, Legs, Upper (arm focus)" required>
          <h2>Day</h2>
          ${weekdayPicker('new-workout-day', form.weekday)}
          ${source ? `<p class="muted">Copies all ${count} exercise${count === 1 ? '' : 's'} from ${esc(source.name)}. The copy is its own workout: changing one won't change the other.</p>` : ''}
          <button type="submit" class="btn btn-primary">${source ? 'Create copy' : 'Create workout'}</button>
        </form>`,
    };
  },

  // ---------- Edit a workout: title, day, exercise list, copy, delete ----------
  // picker = what the add/edit exercise panel shows (see app.js)
  editWorkout(workout, picker) {
    const editing = workout.exercises.find(e => e.id === picker.exerciseId);

    // A missed workout on a day that has passed still counts this week as it was.
    const lockedOn = Streak.lockedDay(workout.id);
    const lockNote = lockedOn ? `
      <div class="card lock-note">
        <strong>${lockedOn} has passed</strong>
        <p>You haven't done this workout yet this week, so this week's streak still counts its sets as they were on ${lockedOn}.
          Changing or deleting it now won't remove them; changes count from next week.
          If you still want to do it this week, do it first (you can tap it on any day), then change it.</p>
      </div>` : '';

    const rows = workout.exercises.length ? workout.exercises.map((ex, i) => {
      const info = Library.forExercise(ex);
      return `
        <div class="card ex-row ${ex.id === picker.exerciseId ? 'is-editing' : ''}">
          <span class="ex-num">${i + 1}</span>
          <button class="ex-info" data-action="edit-exercise" data-id="${ex.id}">
            <span class="ex-name">${esc(info.name)}</span>
            <span class="ex-meta">${ex.sets} × ${repRange(ex.repMin, ex.repMax)} · ${esc(Library.primaryLabel(info))}</span>
          </button>
          <button class="btn btn-small" data-action="move-exercise" data-id="${ex.id}" data-dir="-1"
            aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-small" data-action="move-exercise" data-id="${ex.id}" data-dir="1"
            aria-label="Move down" ${i === workout.exercises.length - 1 ? 'disabled' : ''}>↓</button>
        </div>`;
    }).join('')
      : `<p class="empty">No exercises yet.</p>`;

    // The add/edit panel has three steps: pick from library → (or create custom) → sets & reps.
    let panel;
    if (picker.mode === 'custom') panel = this.customExerciseForm(picker);
    else if (picker.mode === 'details') panel = this.exerciseDetailsForm(picker, editing);
    else panel = this.exercisePicker(picker, editing);

    return {
      title: `Edit ${workout.name}`,
      back: '#/',
      html: `
        ${lockNote}
        <h2>Title</h2>
        <input id="workout-name" value="${esc(workout.name)}" placeholder="e.g. Push, Legs, Upper (arm focus)" autocomplete="off">

        <h2>Day</h2>
        ${weekdayPicker('workout-day', workout.weekday)}

        <h2>Exercises</h2>
        ${rows}

        <h2>${editing ? 'Edit exercise' : 'Add exercise'}</h2>
        <div id="exercise-panel">${panel}</div>

        <div class="finish-bar stack">
          <button type="button" class="btn btn-primary" data-action="save-workout">Done</button>
          <button type="button" class="btn" data-action="copy-workout" data-id="${workout.id}">Copy workout</button>
          <button type="button" class="btn btn-danger" data-action="delete-workout" data-id="${workout.id}">Delete workout</button>
        </div>
      `,
    };
  },

  // Step 1: search the library and tap an exercise.
  exercisePicker(picker, editing) {
    return `
      <div class="card stack">
        <input type="search" id="lib-search" value="${esc(picker.query)}"
          placeholder="Search name, muscle or equipment" autocomplete="off" aria-label="Search exercises">
        <div id="lib-results" class="lib-results">${this.libraryResults(picker.query)}</div>
        <button type="button" class="btn" data-action="new-custom">+ Create custom exercise</button>
        ${editing ? '<button type="button" class="btn" data-action="cancel-edit">Cancel</button>' : ''}
      </div>`;
  },

  // The search results list. Redrawn on its own while you type, so the search box keeps focus.
  // Nothing is listed until you start typing, then only the best few matches.
  // action = what tapping a result does (picking for a day, or opening its log).
  libraryResults(query, action = 'pick-exercise') {
    if (!query.trim()) return '';
    const { results, total } = Library.search(query);
    if (!results.length) {
      return `<p class="empty">No matches.${action === 'pick-exercise' ? ' Create it as a custom exercise.' : ''}</p>`;
    }
    const more = total > results.length
      ? `<p class="lib-more">Showing the best ${results.length} of ${total} — keep typing to narrow it down.</p>` : '';
    return results.map(e => `
      <button type="button" class="lib-item" data-action="${action}" data-id="${e.id}">
        <span class="lib-name">${esc(e.name)} ${e.custom ? '<span class="tag">Custom</span>' : ''}</span>
        <span class="lib-meta">${esc(e.equipment)} · ${esc(Library.primaryLabel(e))}</span>
      </button>`).join('') + more;
  },

  // Step 2: sets and reps for the picked exercise.
  exerciseDetailsForm(picker, editing) {
    const info = Library.forExercise({ refId: picker.refId });
    const form = editing || { sets: 3, repMin: 8, repMax: 12 };
    return `
      <form id="exercise-form" class="card stack">
        <div class="picked">
          <div class="picked-info">
            <strong>${esc(info.name)}</strong>
            <span class="muted">${esc(info.equipment)}</span>
            <span class="muscle-line"><b>Primary:</b> ${esc(muscleNames(info.primary) || '—')}</span>
            ${info.secondary.length ? `<span class="muscle-line"><b>Secondary:</b> ${esc(muscleNames(info.secondary))}</span>` : ''}
          </div>
          <button type="button" class="btn btn-small" data-action="change-exercise">Change</button>
        </div>
        ${info.custom ? `<button type="button" class="btn" data-action="edit-custom">Edit custom exercise</button>` : ''}
        <div>
          <label for="ex-sets">Sets</label>
          <input id="ex-sets" name="sets" type="number" inputmode="numeric" min="1" max="20" value="${form.sets}" required>
        </div>
        <div>
          <label for="ex-rep-min">Target reps (e.g. 8 to 12)</label>
          <div class="row range-row">
            <input id="ex-rep-min" name="repMin" type="number" inputmode="numeric" min="1" max="100"
              value="${form.repMin}" aria-label="Minimum reps" required>
            <span class="range-sep">to</span>
            <input name="repMax" type="number" inputmode="numeric" min="1" max="100"
              value="${form.repMax}" aria-label="Maximum reps" required>
          </div>
        </div>
        <button class="btn btn-primary">${editing ? 'Save changes' : 'Add to workout'}</button>
        <div class="row">
          <button type="button" class="btn" data-action="cancel-edit">Cancel</button>
          ${editing ? `<button type="button" class="btn btn-danger" data-action="delete-exercise" data-id="${editing.id}">Delete</button>` : ''}
        </div>
      </form>`;
  },

  // Or: create (or edit) a custom exercise. Muscles are found by typing, like exercises.
  // (A tappable body diagram can replace the muscle search later.)
  customExerciseForm(picker) {
    const c = picker.custom;
    const isEdit = Boolean(c.id);
    const equipmentOptions = EQUIPMENT.map(e =>
      `<option ${e === c.equipment ? 'selected' : ''}>${e}</option>`).join('');
    const musclePicker = (role, title, detail) => `
      <div class="muscle-picker ${role === 'secondary' ? 'is-secondary' : ''}">
        <label for="muscle-search-${role}">${title} <span class="muted">— ${detail}</span></label>
        <div class="picked-muscles" id="picked-${role}">${this.pickedMuscles(role, c[role])}</div>
        <input type="search" id="muscle-search-${role}" data-muscle-search="${role}" autocomplete="off"
          placeholder="Type a muscle, e.g. chest">
        <div class="muscle-suggestions" id="suggest-${role}"></div>
      </div>`;
    return `
      <form id="custom-form" class="card stack">
        <div>
          <label for="custom-name">Exercise name</label>
          <input id="custom-name" name="name" value="${esc(c.name)}" placeholder="e.g. Landmine Press" autocomplete="off" required>
        </div>
        <div>
          <label for="custom-equipment">Equipment</label>
          <select id="custom-equipment" name="equipment">${equipmentOptions}</select>
        </div>
        ${musclePicker('primary', 'Primary muscles', '1 set each')}
        ${musclePicker('secondary', 'Secondary muscles', '½ set each')}
        ${isEdit ? `<p class="muted note">Changes apply in every workout that uses this exercise.
          Past workouts keep the muscles they were logged with.</p>` : ''}
        <button class="btn btn-primary">${isEdit ? 'Save changes' : 'Save exercise'}</button>
        <button type="button" class="btn" data-action="cancel-custom">${isEdit ? 'Cancel' : 'Back to library'}</button>
      </form>`;
  },

  // The muscles already picked, as chips you tap to remove.
  pickedMuscles(role, ids) {
    if (!ids.length) return '<span class="muted none-picked">None yet</span>';
    return ids.map(id => `
      <button type="button" class="chip-btn is-picked" data-action="remove-muscle" data-role="${role}" data-id="${id}"
        aria-label="Remove ${MUSCLES[id]}">${MUSCLES[id]} <span aria-hidden="true">×</span></button>`).join('');
  },

  // Muscles matching what you've typed, as chips you tap to add.
  muscleSuggestions(role, query, exclude) {
    if (!query.trim()) return '';
    const ids = Library.searchMuscles(query, exclude);
    if (!ids.length) return '<p class="empty">No muscle matches that.</p>';
    return ids.map(id => `
      <button type="button" class="chip-btn" data-action="add-muscle" data-role="${role}" data-id="${id}">
        + ${MUSCLES[id]} <span class="chip-group">${MUSCLE_GROUP_OF[id]}</span></button>`).join('');
  },

  // ---------- Workout: compact list, one exercise expanded at a time ----------
  // swap = the Swap for today search: { exerciseId (whose search is open, or null), query }
  workout(workout, draft, openId, swap) {
    const title = workout.name;
    if (!workout.exercises.length) {
      return {
        title,
        back: '#/',
        html: `
          <p class="empty">This workout has no exercises yet.</p>
          <button class="btn btn-primary" data-action="edit-workout" data-id="${workout.id}">Add exercises</button>`,
      };
    }

    const unit = Units.weightUnit();
    const cards = workout.exercises.map((ex, i) => {
      // A swapped exercise shows as itself, with its own history.
      const swapped = Store.swappedRef(ex.id);
      const info = Library.forExercise({ refId: swapped || ex.refId });
      const last = Store.lastFor(ex);
      const isOpen = ex.id === openId;
      // Collapsed rows show ✓ once every set is filled in, "1/3" part way, nothing before the first set.
      const progress = Store.draftProgress(ex.id);
      const badge = isOpen || !progress.filled ? ''
        : progress.complete ? '<span class="check" aria-label="Done">✓</span>'
        : `<span class="set-count" aria-label="${progress.filled} of ${progress.total} sets done">${progress.filled}/${progress.total}</span>`;

      // Collapsed: just the summary row. Expanded: the summary row plus the sets.
      let body = '';
      if (isOpen) {
        const setRows = draft.entries[ex.id].map((set, i) => {
          const lastReps = last?.sets[i]?.reps;
          return `
            <div class="set-num">${i + 1}</div>
            <input type="text" inputmode="decimal" value="${Units.showWeight(set.weight)}" placeholder="${unit}"
              data-ex="${ex.id}" data-set="${i}" data-field="weight" aria-label="Set ${i + 1} weight in ${unit}">
            <input type="text" inputmode="numeric" value="${esc(set.reps)}" placeholder="${lastReps ?? ''}"
              data-ex="${ex.id}" data-set="${i}" data-field="reps" aria-label="Set ${i + 1} reps">`;
        }).join('');

        // Swap for today: a button, or the exercise search once it's tapped.
        // Once swapped, only Undo swap shows (undo, then swap again to pick a different one).
        const swapPanel = swap.exerciseId === ex.id ? `
          <div class="swap-panel stack">
            <input type="search" id="swap-search" value="${esc(swap.query)}"
              placeholder="Swap for today: search exercises" autocomplete="off" aria-label="Search exercises to swap in">
            <div id="swap-results" class="lib-results">${this.libraryResults(swap.query, 'swap-pick')}</div>
            <button type="button" class="btn" data-action="swap-cancel">Cancel</button>
          </div>` : `
          <div class="row swap-row">
            ${swapped
              ? `<button type="button" class="btn btn-small" data-action="swap-undo" data-id="${ex.id}">Undo swap</button>`
              : `<button type="button" class="btn btn-small" data-action="swap-open" data-id="${ex.id}">Swap for today</button>`}
          </div>`;

        body = `
          <div class="ex-body">
            <div class="ex-sub">Target ${ex.sets} × ${repRange(ex.repMin, ex.repMax)}${last ? ` · last done ${formatDate(last.date)}` : ''}</div>
            <div class="set-grid">
              <div class="col-head">Set</div>
              <div class="col-head">Weight (${unit})</div>
              <div class="col-head">Reps</div>
              ${setRows}
            </div>
            ${swapPanel}
          </div>`;
      }

      const plannedName = swapped ? Library.forExercise(ex).name : '';
      return `
        <div class="card workout-ex ${isOpen ? 'is-open' : ''}" id="ex-${ex.id}">
          <button class="ex-toggle" data-action="toggle-exercise" data-id="${ex.id}" aria-expanded="${isOpen}">
            <span class="ex-num">${i + 1}</span>
            <span class="ex-toggle-main">
              <span class="ex-title">${esc(info.name)}</span>
              ${swapped ? `<span class="ex-sub swap-note">Swapped for today · planned: ${esc(plannedName)}</span>` : ''}
              <span class="ex-sub">${lastSummary(last)}</span>
            </span>
            <span class="tag">${esc(Library.primaryLabel(info))}</span>
            ${badge}
          </button>
          ${body}
        </div>`;
    }).join('');

    return {
      title,
      back: '#/',
      html: `
        ${cards}
        <div class="finish-bar stack">
          <button class="btn btn-primary" data-action="finish">Finish workout</button>
          <button class="btn btn-danger" data-action="discard">Discard workout</button>
        </div>
      `,
    };
  },

  // ---------- Profile: avatar + name. Settings open from the gear in the top bar. ----------
  // mapMode = which numbers the muscle map shows: 'growth' or 'level'
  profile(mapMode) {
    const s = Store.data.settings;
    const name = profileName();
    const height = Units.showHeight(s.heightIn);
    const stats = [
      s.heightIn == null ? '' : Units.isMetric() ? `${height.cm} cm` : `${height.ft}′${height.in}″`,
      s.bodyWeightLbs == null ? '' : `${Units.showWeight(s.bodyWeightLbs)} ${Units.weightUnit()}`,
    ].filter(Boolean).join(' · ');

    return {
      title: 'Profile',
      back: null,
      gear: true,
      html: `
        <div class="profile-head">
          <div class="avatar" aria-hidden="true">${esc(initials(name))}</div>
          <p class="profile-name">${esc(name)}</p>
          ${stats ? `<p class="muted profile-stats">${stats}</p>` : ''}
        </div>
        ${this.streakCard()}
        <a class="btn" href="#/log">Log</a>
        ${this.muscleMap(mapMode)}
      `,
    };
  },

  // ---------- Weekly streak (on Profile) ----------
  // The flame is gray until this week is hit, then green.
  streakCard() {
    const { started, start, totals, week, recent } = Streak.summary();
    const fill = week.planned ? Math.min(100, week.logged / week.planned * 100) : 0;
    const startLabel = start
      ? fromDayKey(start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const headline = started ? `${totals.current}-week streak`
      : start ? `Streak starts ${startLabel}` : 'Plan a workout to start a streak';
    const sub = started
      ? (week.hit ? 'This week is done 🔥' : 'Log every planned set to hit this week')
      : start ? 'This week is practice' : 'Create a workout on the Workouts tab';

    // How many sets the freeze line (90%) is this week. Only shown when a freeze could
    // actually save the week: tracking, streak above 0, a freeze held, week not hit yet.
    // (The tiny subtraction stops 72 × 0.9 = 64.80000001 from rounding up wrong.)
    const freezeSets = Math.ceil(week.planned * FREEZE_LINE - 1e-9);
    const freezeHint = !started || week.hit || !week.planned || !totals.freezes || !totals.current ? ''
      : week.logged >= freezeSets ? 'Freeze line reached. Finish the rest to hit the week.'
      : `Log ${freezeSets} of ${week.planned} to keep your streak with a freeze.`;

    // How to earn the next freeze (one every WEEKS_PER_FREEZE weeks in a row).
    const toNext = WEEKS_PER_FREEZE - totals.current % WEEKS_PER_FREEZE;
    const earnNote = !started ? `Hit ${WEEKS_PER_FREEZE} weeks in a row to earn a freeze.`
      : totals.freezes >= MAX_FREEZES ? `Freezes full. You earn one every ${WEEKS_PER_FREEZE} weeks in a row.`
      : `${toNext} more week${toNext === 1 ? '' : 's'} in a row to earn a freeze.`;

    const icons = { hit: '✓', frozen: '❄︎', missed: '✕', empty: '–', current: '', untracked: '' };
    const names = { hit: 'hit', frozen: 'saved by a freeze', missed: 'missed', empty: 'nothing planned',
      current: 'in progress', untracked: 'not tracked' };
    const strip = recent.map(w => `
      <div class="wk is-${w.status} ${w.isThisWeek ? 'is-this-week' : ''}"
        aria-label="Week of ${shortDate(fromDayKey(w.key))}: ${names[w.status]}">
        <span class="wk-box" aria-hidden="true">${icons[w.status]}</span>
        <span class="wk-date" aria-hidden="true">${w.isThisWeek ? 'Now' : shortDate(fromDayKey(w.key))}</span>
      </div>`).join('');

    return `
      <div class="card streak-card">
        <div class="streak-top">
          <span class="streak-flame ${week.hit ? 'is-lit' : ''}">${FLAME_SVG}</span>
          <span class="streak-count">${started ? totals.current : 0}</span>
          <span class="streak-words">
            <strong>${headline}</strong>
            <span class="muted">${sub}</span>
          </span>
        </div>

        <div class="week-sets">
          <span>Sets this week</span>
          <strong>${week.logged} / ${week.planned}</strong>
        </div>
        <div class="week-bar ${week.hit ? 'is-full' : ''}" role="img"
          aria-label="${week.logged} of ${week.planned} planned sets logged">
          <i style="width:${fill}%"></i>
        </div>
        ${freezeHint ? `<p class="freeze-hint">❄&#xFE0E; ${freezeHint}</p>` : ''}

        <div class="streak-stats">
          <span>Best <strong>${totals.best}</strong></span>
          <span>❄&#xFE0E; Freezes <strong>${totals.freezes} / ${MAX_FREEZES}</strong></span>
        </div>
        <p class="earn-note">${earnNote}</p>

        <div class="week-strip">${strip}</div>
      </div>`;
  },

  // Full-screen celebration when a week is hit; a bigger one every MILESTONE_WEEKS weeks.
  // The number starts at its final value; app.js counts it up from 0.
  celebration(streak) {
    const milestone = streak % MILESTONE_WEEKS === 0;
    const messages = ['Every planned set, logged.', 'Another full week in the books.',
      'Consistency wins. Keep it burning.', 'You showed up all week.'];
    const message = streak === 1 ? 'Week one done — your streak has started!'
      : milestone ? `${streak} weeks in a row. That's a milestone!`
      : messages[streak % messages.length];
    // Did this week earn a freeze? (Not if 2 were already held.)
    const weeks = Store.data.streak.weeks;
    const earned = Streak.totals().freezes > Streak.totals(weeks.slice(0, -1)).freezes;
    const sparks = milestone
      ? Array.from({ length: 14 }, (_, i) =>
        `<span class="spark" style="transform:rotate(${i * 360 / 14}deg)"><i style="animation-delay:${0.25 + (i % 3) * 0.08}s"></i></span>`).join('')
      : '';
    return `
      <div class="celebrate ${milestone ? 'is-milestone' : ''}" data-action="dismiss-celebration" role="dialog"
        aria-label="${streak}-week streak">
        <div class="celebrate-art">
          <span class="celebrate-glow"></span>
          ${sparks}
          <span class="celebrate-flame">${FLAME_SVG}</span>
        </div>
        <p class="celebrate-num">${streak}</p>
        <p class="celebrate-label">week streak</p>
        ${milestone ? '<p class="celebrate-badge">Milestone</p>' : ''}
        <p class="celebrate-msg">${message}</p>
        ${earned ? '<p class="celebrate-freeze">❄&#xFE0E; +1 streak freeze earned</p>' : ''}
        <p class="celebrate-hint">Tap to continue</p>
      </div>`;
  },

  // What happened to the streak while the app was closed (freeze used / streak ended).
  // ---------- Past workouts: every finished workout, newest first ----------
  history() {
    const today = dayKey(new Date());
    const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const when = date => {
      const key = dayKey(date);
      return key === today ? 'Today' : key === yesterday ? 'Yesterday' : formatDate(date);
    };
    const cards = [...Store.data.sessions].reverse().map(s => {
      const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
      return `
        <button class="card past-card" data-action="open-session" data-id="${esc(s.id)}">
          <span class="past-when">${when(s.date)}</span>
          <span class="day-name">${esc(s.workoutName || 'Workout')}</span>
          <span class="day-meta">${s.exercises.length} exercise${s.exercises.length === 1 ? '' : 's'} · ${sets} set${sets === 1 ? '' : 's'}</span>
        </button>`;
    }).join('');
    return {
      title: 'Past workouts',
      back: '#/',
      html: cards || '<p class="empty">No finished workouts yet.</p>',
    };
  },

  // ---------- One past workout, opened to fix its weights and reps ----------
  // edit = the changes being made (see pastEdit in app.js): { exercises: [{ entry, rows }] }
  pastWorkout(session, edit) {
    const unit = Units.weightUnit();
    const cards = edit.exercises.map((e, x) => {
      const rows = e.rows.map((set, i) => `
        <div class="set-num">${i + 1}</div>
        <input type="text" inputmode="decimal" value="${Units.showWeight(set.weight)}" placeholder="${unit}"
          data-past="${x}" data-set="${i}" data-field="weight" aria-label="Set ${i + 1} weight in ${unit}">
        <input type="text" inputmode="numeric" value="${esc(set.reps)}"
          data-past="${x}" data-set="${i}" data-field="reps" aria-label="Set ${i + 1} reps">`).join('');
      const swappedFrom = e.entry.swappedFrom ? Library.forExercise({ refId: e.entry.swappedFrom }).name : '';
      return `
        <div class="card workout-ex is-open">
          <div class="ex-toggle">
            <span class="ex-num">${x + 1}</span>
            <span class="ex-toggle-main">
              <span class="ex-title">${esc(e.entry.name)}</span>
              ${swappedFrom ? `<span class="ex-sub swap-note">Swapped · planned: ${esc(swappedFrom)}</span>` : ''}
            </span>
          </div>
          <div class="ex-body">
            <div class="set-grid">
              <div class="col-head">Set</div>
              <div class="col-head">Weight (${unit})</div>
              <div class="col-head">Reps</div>
              ${rows}
            </div>
          </div>
        </div>`;
    }).join('');

    return {
      title: session.workoutName || 'Workout',
      back: '#/history',
      html: `
        <p class="past-date">${new Date(session.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <p class="muted past-hint">Sets with no reps aren't saved.</p>
        ${cards}
        <div class="finish-bar stack">
          <button class="btn btn-primary" data-action="past-save">Save changes</button>
          <button class="btn" data-action="past-discard">Discard changes</button>
          <button class="btn btn-danger" data-action="past-delete">Delete workout</button>
        </div>
      `,
    };
  },

  // A yes/no pop-up drawn into the overlay.
  // confirm/cancel = { label, action, id (optional, passed to the action) }; danger = the confirm button is red.
  confirmDialog({ title, lines, confirm, cancel, danger = false }) {
    return `
      <div class="card notice" role="dialog" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2>
        ${lines.map(line => `<p>${esc(line)}</p>`).join('')}
        <div class="stack">
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="${confirm.action}" data-id="${esc(confirm.id ?? '')}">${esc(confirm.label)}</button>
          <button type="button" class="btn" data-action="${cancel.action}">${esc(cancel.label)}</button>
        </div>
      </div>`;
  },

  // Asked when Finish workout is tapped with sets still empty.
  // gaps = Store.draftGaps(): [{ name, problems: ['Set 3: no reps', …] }]
  finishCheck(gaps) {
    return `
      <div class="card notice finish-check" role="dialog" aria-label="Finish workout?">
        <h2>Some sets are empty</h2>
        <p class="muted">Sets with no reps won't be saved.</p>
        ${gaps.map(g => `
          <div class="gap">
            <strong>${esc(g.name)}</strong>
            <ul>${g.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
          </div>`).join('')}
        <div class="stack">
          <button type="button" class="btn btn-primary" data-action="finish-back">Go back</button>
          <button type="button" class="btn" data-action="finish-anyway">Finish anyway</button>
        </div>
      </div>`;
  },

  streakNotice(lines) {
    return `
      <div class="card notice" role="dialog" aria-label="Streak update">
        <h2>Streak update</h2>
        ${lines.map(line => `<p>${esc(line)}</p>`).join('')}
        <button type="button" class="btn btn-primary" data-action="dismiss-notice">OK</button>
      </div>`;
  },

  // ---------- Muscle map (on Profile) ----------
  muscleMap(mode) {
    const values = mode === 'level' ? Stats.muscleLevels() : Stats.muscleGrowth();
    const colors = {};
    for (const id in MUSCLES) colors[id] = MapColors[mode](values[id]);

    const modes = { growth: 'Growth', level: 'Level' };
    const toggle = Object.entries(modes).map(([m, label]) => `
      <button type="button" class="segment ${m === mode ? 'is-active' : ''}" data-action="map-mode" data-id="${m}"
        aria-pressed="${m === mode}">${label}</button>`).join('');

    let legend, caption;
    if (mode === 'level') {
      caption = Store.data.settings.bodyWeightLbs
        ? `Strength level vs. published standards (${STANDARDS_SOURCE})`
        : 'Add your body weight in Settings to see levels';
      legend = `
        <div class="legend-levels">${LEVELS.map((label, i) =>
          `<span><i style="background:${LEVEL_COLORS[i]}"></i>${label}</span>`).join('')}</div>
        <p class="legend-empty"><i style="background:${MAP_EMPTY}"></i>No logged exercise with a standard</p>`;
    } else {
      caption = `Change in estimated max, last ${Stats.GROWTH_WEEKS} weeks`;
      legend = `
        <div class="legend-bar" style="background: linear-gradient(90deg, ${MapColors.growth(-GROWTH_SCALE)}, ${MapColors.growth(0)}, ${MapColors.growth(GROWTH_SCALE)})"></div>
        <div class="legend-labels"><span>−${GROWTH_SCALE}%</span><span>Flat</span><span>+${GROWTH_SCALE}%</span></div>
        <p class="legend-empty"><i style="background:${MAP_EMPTY}"></i>Less than ${Stats.MIN_WEEKS} weeks of data</p>`;
    }

    return `
      <h2>Muscle map</h2>
      <div class="card">
        <div class="segmented">${toggle}</div>
        <p class="map-caption">${caption}</p>
        <div class="body-map" id="body-map">
          ${bodyMapSvg(colors, null)}
          <div class="map-pop" id="map-pop" role="status" hidden></div>
        </div>
        <div class="legend">${legend}</div>
      </div>`;
  },

  // Popup text for a tapped muscle: "Biceps: +8% in 6 weeks"
  // or "Upper chest: Intermediate (Incline Barbell Bench Press)"
  musclePopup(id, mode) {
    const name = MUSCLES[id];
    if (mode === 'level') {
      if (!Store.data.settings.bodyWeightLbs) return `${name}: add your body weight in Settings`;
      const value = Stats.muscleLevels()[id];
      if (value) return `${name}: ${LEVELS[value.level]} (${value.exercise})`;
      return Stats.hasStandards(id) ? `${name}: no logged exercise with a standard yet` : `${name}: no exercises with standards`;
    }
    const pct = Stats.muscleGrowth()[id];
    if (pct == null) return `${name}: not enough data yet`;
    const rounded = Math.round(pct);
    return `${name}: ${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}% in ${Stats.GROWTH_WEEKS} weeks`;
  },

  // ---------- Log: search for an exercise to see its history ----------
  logSearch(query) {
    return {
      title: 'Log',
      back: '#/profile',
      html: `
        <div class="card stack">
          <input type="search" id="log-search" value="${esc(query)}"
            placeholder="Search name, muscle or equipment" autocomplete="off" aria-label="Search exercises">
          <div id="log-results" class="lib-results">${this.libraryResults(query, 'open-log')}</div>
        </div>
      `,
    };
  },

  // ---------- One exercise's log: estimated max graph, calendar, a day's sets ----------
  // state = { month: 'YYYY-MM' shown in the calendar (null = latest), day: 'YYYY-MM-DD' tapped (or null) }
  exerciseLog(refId, state) {
    const history = Store.exerciseHistory(refId);
    const info = Library.get(refId);
    const name = info ? info.name : 'Unknown exercise';
    // With no history, the graph and calendar still show, empty, with a note over them.
    const first = history[0];
    const last = history[history.length - 1];
    const heading = `
      <h1 class="log-name">${esc(name)}</h1>
      <p class="log-first">${first ? `First logged ${fromDayKey(first.dayKey).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Not logged yet'}</p>`;

    const unit = Units.weightUnit();
    const weighted = history.filter(h => h.best);
    const latest = weighted[weighted.length - 1];
    const points = weighted.map(h => ({ time: new Date(h.date).getTime(), value: Number(Units.showWeight(h.best.max)) }));
    // Actual max: the heaviest weight ever logged for a single rep (the first day it was lifted).
    // singlePoints = the heaviest single of each workout that had one, for the graph's white line.
    let single = null;
    const singlePoints = [];
    for (const h of history) {
      const heaviest = Math.max(0, ...h.sets.filter(set => set.reps === 1 && set.weight).map(set => set.weight));
      if (!heaviest) continue;
      singlePoints.push({ time: new Date(h.date).getTime(), value: Number(Units.showWeight(heaviest)) });
      if (!single || heaviest > single.weight) single = { weight: heaviest, date: h.date };
    }
    const maxSection = `
      <div class="card">
        <p class="log-label">Current estimated max</p>
        <p class="log-max ${latest ? '' : 'is-blank'}">${latest ? `${Units.showWeight(latest.best.max)} <span>${unit}</span>` : '—'}</p>
        <p class="log-sub">${latest ? `Best set on ${shortDate(latest.date)}: ${formatSet(latest.best.set)}` : '&nbsp;'}</p>
        <div class="log-actual">
          <p class="log-label">Actual 1-rep max</p>
          <p class="log-max is-small ${single ? '' : 'is-blank'}">${single ? `${Units.showWeight(single.weight)} <span>${unit}</span>` : '—'}</p>
          <p class="log-sub">${single ? `Lifted for 1 rep on ${shortDate(single.date)}` : 'Log a set of 1 rep to fill this in'}</p>
        </div>
        ${maxChart(points, history.length ? 'No sets with weight yet' : 'No history yet', singlePoints)}
        <p class="log-formula">Estimated with the Epley formula: weight × (1 + reps ÷ 30)</p>
      </div>`;

    const logged = new Set(history.map(h => h.dayKey));
    const thisMonth = dayKey(new Date()).slice(0, 7);
    const firstMonth = first ? first.dayKey.slice(0, 7) : thisMonth;
    const lastMonth = last ? last.dayKey.slice(0, 7) : thisMonth;
    const month = state.month || lastMonth;

    return {
      title: 'Log',
      back: '#/log',
      html: `
        ${heading}
        ${maxSection}
        <h2>History</h2>
        ${logCalendar(month, logged, state.day, firstMonth, lastMonth > thisMonth ? lastMonth : thisMonth, history.length ? '' : 'No history yet')}
        ${state.day ? logDayCard(history.filter(h => h.dayKey === state.day), state.day)
          : history.length ? '<p class="muted log-hint">Tap a highlighted day to see its sets.</p>' : ''}
      `,
    };
  },

  // ---------- Settings (opened from the gear on Profile) ----------
  // Every setting lives in one form; app.js saves the whole form on any change.
  // To add a setting, add a field here (and see DEFAULT_SETTINGS in storage.js).
  settings() {
    const s = Store.data.settings;
    const metric = Units.isMetric();
    const height = Units.showHeight(s.heightIn);
    const unitOption = (value, label, detail) => `
      <label class="choice">
        <input type="radio" name="units" value="${value}" ${s.units === value ? 'checked' : ''}>
        <span><strong>${label}</strong><span class="muted">${detail}</span></span>
      </label>`;

    const heightFields = metric ? `
      <div class="row range-row">
        <input id="height" name="heightCm" type="text" inputmode="decimal" value="${height.cm}" placeholder="0">
        <span class="range-sep">cm</span>
      </div>` : `
      <div class="row range-row">
        <input id="height" name="heightFt" type="text" inputmode="numeric" value="${height.ft}" placeholder="0" aria-label="Feet">
        <span class="range-sep">ft</span>
        <input name="heightIn" type="text" inputmode="decimal" value="${height.in}" placeholder="0" aria-label="Inches">
        <span class="range-sep">in</span>
      </div>`;

    return {
      title: 'Settings',
      back: '#/profile',
      html: `
        <form id="settings-form">
          <h2>Units</h2>
          <div class="choices">
            ${unitOption('imperial', 'Imperial', 'lbs, ft/in')}
            ${unitOption('metric', 'Metric', 'kg, cm')}
          </div>

          <h2>About you</h2>
          <div class="card stack">
            <div>
              <label for="name">Name</label>
              <input id="name" name="name" value="${esc(s.name)}" placeholder="Your name" autocomplete="name">
            </div>
            <div>
              <label for="height">Height</label>
              ${heightFields}
            </div>
            <div>
              <label for="body-weight">Body weight</label>
              <div class="row range-row">
                <input id="body-weight" name="bodyWeight" type="text" inputmode="decimal"
                  value="${Units.showWeight(s.bodyWeightLbs)}" placeholder="0">
                <span class="range-sep">${Units.weightUnit()}</span>
              </div>
            </div>
            <div>
              <label>Sex <span class="muted">(for strength levels)</span></label>
              <div class="choices">
                ${['male', 'female'].map(value => `
                  <label class="choice">
                    <input type="radio" name="sex" value="${value}" ${s.sex === value ? 'checked' : ''}>
                    <span><strong>${value === 'male' ? 'Male' : 'Female'}</strong></span>
                  </label>`).join('')}
              </div>
            </div>
          </div>
        </form>
        <p class="muted" style="font-size:14px">Changes save automatically and are included in backups.</p>

        <h2>Backup</h2>
        <div class="row">
          <button class="btn" data-action="export">Export</button>
          <button class="btn" data-action="import">Import</button>
        </div>
        <p class="muted" style="font-size:14px">
          Your data lives only on this device. Export now and then to keep a copy safe.
        </p>
        <input type="file" id="import-file" accept=".json,application/json" hidden>

        <h2>Danger zone</h2>
        <button class="btn btn-danger" data-action="delete-all">Delete all data</button>
      `,
    };
  },
};
