// views.js — builds the HTML for each screen. No saving happens here.
// Each view returns { title, back, html } and optionally gear: true:
//   title = text in the top bar, back = where the Back button goes (or null),
//   gear = show the Settings gear in the top bar.
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

const Views = {

  // ---------- Home: the week, Monday to Sunday ----------
  home() {
    const { draft } = Store.data;
    const draftDay = draft && Store.getDay(draft.dayId);
    const today = todayWeekday();

    const resume = draftDay ? `
      <div class="card banner stack">
        <div><strong>Workout in progress:</strong> ${esc(dayLabel(draftDay))}</div>
        <button class="btn btn-primary" data-action="open-day" data-id="${draftDay.id}">Resume</button>
      </div>` : '';

    const dayCards = Store.week().map(day => {
      const todayTag = day.weekday === today ? '<span class="tag tag-today">Today</span>' : '';

      // Rest days can't be started, so the name isn't a button.
      if (day.rest) {
        return `
          <div class="card day-card is-rest">
            <div class="day-open">
              <span class="day-name">${WEEKDAYS[day.weekday]} – <span class="rest-word">Rest</span> ${todayTag}</span>
              <span class="day-meta">Recovery day — no workout</span>
            </div>
            <button class="btn btn-small" data-action="edit-day" data-id="${day.id}">Edit</button>
          </div>`;
      }

      const last = Store.lastSessionForDay(day.id);
      const count = day.exercises.length;
      const meta = !day.name && !count ? 'Not set up yet — tap Edit'
        : `${count} exercise${count === 1 ? '' : 's'}` + (last ? ` · last ${formatDate(last.date)}` : '');
      return `
        <div class="card day-card">
          <button class="day-open" data-action="open-day" data-id="${day.id}">
            <span class="day-name">${esc(dayLabel(day))} ${todayTag}</span>
            <span class="day-meta">${meta}</span>
          </button>
          <button class="btn btn-small" data-action="edit-day" data-id="${day.id}">Edit</button>
        </div>`;
    }).join('');

    return {
      title: 'GitFit',
      back: null,
      gear: true,
      html: `
        ${resume}
        <h2>This week</h2>
        ${dayCards}

        <h2>Backup</h2>
        <div class="row">
          <button class="btn" data-action="export">Export</button>
          <button class="btn" data-action="import">Import</button>
        </div>
        <p class="muted" style="font-size:14px">
          Your data lives only on this device. Export now and then to keep a copy safe.
        </p>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      `,
    };
  },

  // ---------- Edit a day: rest or workout, type of day, exercise list ----------
  editDay(day, editingId) {
    const kindOption = (value, label, detail) => `
      <label class="choice">
        <input type="radio" name="day-kind" value="${value}" ${(value === 'rest') === day.rest ? 'checked' : ''}>
        <span><strong>${label}</strong><span class="muted">${detail}</span></span>
      </label>`;
    const kindChoices = `
      <div class="choices">
        ${kindOption('workout', 'Workout', 'Train this day')}
        ${kindOption('rest', 'Rest day', 'No workout')}
      </div>`;

    if (day.rest) {
      return {
        title: `Edit ${WEEKDAYS[day.weekday]}`,
        back: '#/',
        html: `
          ${kindChoices}
          <p class="empty">${WEEKDAYS[day.weekday]} is a rest day.
            ${day.exercises.length ? 'Its exercises are kept — switch back to Workout to see them.' : ''}</p>`,
      };
    }

    const editing = day.exercises.find(e => e.id === editingId);
    const form = editing || { name: '', muscle: '', sets: 3, repMin: 8, repMax: 12 };

    const rows = day.exercises.length ? day.exercises.map((ex, i) => `
      <div class="card ex-row ${ex.id === editingId ? 'is-editing' : ''}">
        <button class="ex-info" data-action="edit-exercise" data-id="${ex.id}">
          <span class="ex-name">${esc(ex.name)}</span>
          <span class="ex-meta">${ex.sets} × ${repRange(ex.repMin, ex.repMax)} · ${esc(ex.muscle)}</span>
        </button>
        <button class="btn btn-small" data-action="move-exercise" data-id="${ex.id}" data-dir="-1"
          aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn btn-small" data-action="move-exercise" data-id="${ex.id}" data-dir="1"
          aria-label="Move down" ${i === day.exercises.length - 1 ? 'disabled' : ''}>↓</button>
      </div>`).join('')
      : `<p class="empty">No exercises yet.</p>`;

    const muscleOptions = MUSCLE_GROUPS.map(m =>
      `<option ${m === form.muscle ? 'selected' : ''}>${m}</option>`).join('');

    return {
      title: `Edit ${WEEKDAYS[day.weekday]}`,
      back: '#/',
      html: `
        ${kindChoices}

        <h2>Type of day</h2>
        <input id="day-name" value="${esc(day.name)}" placeholder="e.g. Legs, Push, Upper (arm focus)" autocomplete="off">

        <h2>Exercises</h2>
        ${rows}

        <h2>${editing ? 'Edit exercise' : 'Add exercise'}</h2>
        <form id="exercise-form" class="card stack">
          <div>
            <label for="ex-name">Name</label>
            <input id="ex-name" name="name" value="${esc(form.name)}" placeholder="e.g. Bench press" autocomplete="off" required>
          </div>
          <div>
            <label for="ex-muscle">Muscle group</label>
            <select id="ex-muscle" name="muscle">${muscleOptions}</select>
          </div>
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
          <button class="btn btn-primary">${editing ? 'Save changes' : 'Add exercise'}</button>
          ${editing ? `
            <div class="row">
              <button type="button" class="btn" data-action="cancel-edit">Cancel</button>
              <button type="button" class="btn btn-danger" data-action="delete-exercise" data-id="${editing.id}">Delete</button>
            </div>` : ''}
        </form>
      `,
    };
  },

  // ---------- Workout: compact list, one exercise expanded at a time ----------
  workout(day, draft, openId) {
    const title = day.name || WEEKDAYS[day.weekday];
    if (!day.exercises.length) {
      return {
        title,
        back: '#/',
        html: `
          <p class="empty">This day has no exercises yet.</p>
          <button class="btn btn-primary" data-action="edit-day" data-id="${day.id}">Add exercises</button>`,
      };
    }

    const unit = Units.weightUnit();
    const cards = day.exercises.map(ex => {
      const last = Store.lastResult(ex.id);
      const isOpen = ex.id === openId;
      const isDone = !isOpen && Store.draftHasReps(ex.id);

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

        body = `
          <div class="ex-body">
            <div class="ex-sub">Target ${ex.sets} × ${repRange(ex.repMin, ex.repMax)}${last ? ` · last done ${formatDate(last.date)}` : ''}</div>
            <div class="set-grid">
              <div class="col-head">Set</div>
              <div class="col-head">Weight (${unit})</div>
              <div class="col-head">Reps</div>
              ${setRows}
            </div>
          </div>`;
      }

      return `
        <div class="card workout-ex ${isOpen ? 'is-open' : ''}" id="ex-${ex.id}">
          <button class="ex-toggle" data-action="toggle-exercise" data-id="${ex.id}" aria-expanded="${isOpen}">
            <span class="ex-toggle-main">
              <span class="ex-title">${esc(ex.name)}</span>
              <span class="ex-sub">${lastSummary(last)}</span>
            </span>
            <span class="tag">${esc(ex.muscle)}</span>
            <span class="check" ${isDone ? '' : 'hidden'} aria-label="Done">✓</span>
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

  // ---------- Settings ----------
  // Every field lives in one form; app.js saves the whole form on any change.
  // To add a setting, add a section here (and see DEFAULT_SETTINGS in storage.js).
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
      back: '#/',
      html: `
        <form id="settings-form">
          <h2>Units</h2>
          <div class="choices">
            ${unitOption('imperial', 'Imperial', 'lbs, ft/in')}
            ${unitOption('metric', 'Metric', 'kg, cm')}
          </div>

          <h2>Body</h2>
          <div class="card stack">
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
          </div>
        </form>
        <p class="muted" style="font-size:14px">Changes save automatically and are included in backups.</p>
      `,
    };
  },
};
