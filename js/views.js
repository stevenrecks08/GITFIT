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

function profileName() {
  return Store.data.settings.name.trim() || 'Your name';
}

// Placeholder avatar text: "Rex Stephenson" → "RS"
function initials(name) {
  return name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();
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
// With no points, draws an empty graph with emptyNote written over it.
function maxChart(points, emptyNote) {
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
  const values = points.map(p => p.value);
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
  const xLabels = t1 === t0
    ? `<text class="chart-label" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">Today</text>`
    : `<text class="chart-label" x="${L}" y="${H - 6}">${shortDate(t0)}</text>
       <text class="chart-label" x="${W - R}" y="${H - 6}" text-anchor="end">Today</text>`;

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated max over time">
      ${grid}
      <path class="chart-line" d="${line}"/>
      ${dots}
      ${xLabels}
    </svg>`;
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
      html: `
        ${resume}
        <h2>This week</h2>
        ${dayCards}
      `,
    };
  },

  // ---------- Edit a day: rest or workout, type of day, exercise list ----------
  // picker = what the add/edit exercise panel shows (see app.js)
  editDay(day, picker) {
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

    const editing = day.exercises.find(e => e.id === picker.exerciseId);

    const rows = day.exercises.length ? day.exercises.map((ex, i) => {
      const info = Library.forExercise(ex);
      return `
        <div class="card ex-row ${ex.id === picker.exerciseId ? 'is-editing' : ''}">
          <button class="ex-info" data-action="edit-exercise" data-id="${ex.id}">
            <span class="ex-name">${esc(info.name)}</span>
            <span class="ex-meta">${ex.sets} × ${repRange(ex.repMin, ex.repMax)} · ${esc(Library.primaryLabel(info))}</span>
          </button>
          <button class="btn btn-small" data-action="move-exercise" data-id="${ex.id}" data-dir="-1"
            aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-small" data-action="move-exercise" data-id="${ex.id}" data-dir="1"
            aria-label="Move down" ${i === day.exercises.length - 1 ? 'disabled' : ''}>↓</button>
        </div>`;
    }).join('')
      : `<p class="empty">No exercises yet.</p>`;

    // The add/edit panel has three steps: pick from library → (or create custom) → sets & reps.
    let panel;
    if (picker.mode === 'custom') panel = this.customExerciseForm(picker);
    else if (picker.mode === 'details') panel = this.exerciseDetailsForm(picker, editing);
    else panel = this.exercisePicker(picker, editing);

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
        <div id="exercise-panel">${panel}</div>
      `,
    };
  },

  // Step 1: search the library and tap an exercise.
  exercisePicker(picker, editing) {
    return `
      <div class="card stack">
        <input type="search" id="lib-search" value="${esc(picker.query)}"
          placeholder="Search name, muscle or equipment" autocomplete="off" aria-label="Search exercises">
        <button type="button" class="btn" data-action="new-custom">+ Create custom exercise</button>
        <div id="lib-results" class="lib-results">${this.libraryResults(picker.query)}</div>
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
        <button class="btn btn-primary">${editing ? 'Save changes' : 'Add to day'}</button>
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
        ${isEdit ? `<p class="muted note">Changes apply on every day that uses this exercise.
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
      const info = Library.forExercise(ex);
      const last = Store.lastResult(ex);
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
              <span class="ex-title">${esc(info.name)}</span>
              <span class="ex-sub">${lastSummary(last)}</span>
            </span>
            <span class="tag">${esc(Library.primaryLabel(info))}</span>
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

  // ---------- Profile: avatar + name. Settings open from the gear in the top bar. ----------
  profile() {
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
        <a class="btn" href="#/log">Log</a>
      `,
    };
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
    const maxSection = `
      <div class="card">
        <p class="log-label">Current estimated max</p>
        <p class="log-max ${latest ? '' : 'is-blank'}">${latest ? `${Units.showWeight(latest.best.max)} <span>${unit}</span>` : '—'}</p>
        <p class="log-sub">${latest ? `Best set on ${shortDate(latest.date)}: ${formatSet(latest.best.set)}` : '&nbsp;'}</p>
        ${maxChart(points, history.length ? 'No sets with weight yet' : 'No history yet')}
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
