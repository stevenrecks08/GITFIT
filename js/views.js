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
// On a timed exercise (plank): "60 sec".
function formatSet(set, timed = false) {
  if (timed) return `${set.reps} sec`;
  const weight = set.weight == null ? 'BW' : Units.showWeight(set.weight);
  return `${weight}×${set.reps}`;
}

// Target reps as "8–12", or just "10" when min and max are the same.
function repRange(min, max) {
  return min === max ? String(min) : `${min}–${max}`;
}

// The target line: "3 × 8–12", or "3 × 30–60 sec" on a timed exercise.
function targetText(ex, timed) {
  return `${ex.sets} × ${repRange(ex.repMin, ex.repMax)}${timed ? ' sec' : ''}`;
}

// "Last: 20×10, 20×8, 20×7" or "No history yet"
function lastSummary(last, timed = false) {
  return last ? `Last: ${last.sets.map(set => formatSet(set, timed)).join(', ')}` : 'No history yet';
}

// Going heavier: the next weight up from `lbs`, as "140 lbs" (5 lbs more, or 2.5 kg).
function heavierText(lbs) {
  return `${Number(Units.showWeight(lbs)) + (Units.isMetric() ? 2.5 : 5)} ${Units.weightUnit()}`;
}

// "Try 140 lbs today", under an exercise that hit the top of its rep range on every set last time.
function nextWeightNote(ex) {
  const lbs = Store.readyLastTime(ex);
  return lbs ? `<span class="ex-sub next-weight">Try ${heavierText(lbs)} today</span>` : '';
}

// The column heading over the weight boxes. Dumbbell weights are per dumbbell, said quietly underneath.
function weightHead(info, unit) {
  return `<div class="col-head">Weight (${unit})${info.equipment === 'Dumbbell' ? '<span class="col-note">per dumbbell</span>' : ''}</div>`;
}

// The weight box on a timed exercise (plank): still there, but clearly not for typing in.
const LOCKED_WEIGHT = `<input type="text" class="is-locked" value="—" disabled aria-label="No weight for this exercise">`;

// One note per exercise, on the workout screens. A small line until it's opened.
function noteBox(refId) {
  const note = Store.exerciseNote(refId);
  return `
    <details class="ex-note">
      <summary><span class="note-text">${note ? `Note: ${esc(note)}` : '+ Add note'}</span></summary>
      <textarea data-note="${esc(refId)}" rows="2" placeholder="e.g. seat on 4" aria-label="Note for this exercise">${esc(note)}</textarea>
    </details>`;
}

// The small button that opens an exercise's log (Back returns to wherever it was tapped).
function logButton(refId) {
  return `<button type="button" class="btn btn-small" data-action="view-log" data-id="${esc(refId)}">Log</button>`;
}

// One exercise in a search list.
function libItem(e, action, meta) {
  return `
    <button type="button" class="lib-item" data-action="${action}" data-id="${esc(e.id)}">
      <span class="lib-name">${esc(e.name)} ${e.custom ? '<span class="tag">Custom</span>' : ''}</span>
      <span class="lib-meta">${esc(meta ?? `${e.equipment} · ${Library.primaryLabel(e)}`)}</span>
    </button>`;
}

function profileName() {
  return Store.data.settings.name.trim() || 'Your name';
}

// Placeholder avatar text: "Rex Stephenson" → "RS"
function initials(name) {
  return name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();
}

const BACKUP_REMINDER_DAYS = 30;

// What the "i" next to the muscle map's caption says.
const MAP_INFO = {
  growth: `
    <p>For each exercise, your best in its first 2 weeks is compared with your best in its last 2 weeks, within the last 6 weeks. So one bad workout won't pull it down.</p>
    <p>A muscle's percent is the average of the exercises with it as a primary muscle. An exercise counts once it's logged in 3 different weeks.</p>
    <p>Best means estimated max: weight × (1 + reps ÷ 30). Bodyweight exercises use max reps, and planks use the longest hold.</p>`,
  level: `
    <p>Each exercise's latest estimated max is compared with published standards for your body weight and sex.</p>
    <p>A muscle shows the best level among the exercises with it as a primary muscle.</p>`,
};

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

// Planned sets for the week or one day: a row with a bar for each muscle, under a small heading
// for its group. Tapping a muscle shows the exercises behind its number.
//   planned = Stats.weekPlannedSets() or dayPlannedSets()   open = Set of muscle ids that are expanded
//   hideEmpty = leave out muscles with no sets (a single day, which would be full of zeros)
//   changed = Set of muscle ids that just changed (shown in green)
// All the bars share one scale (the most-trained muscle fills its bar), so any two can be compared.
function plannedSetsTable(planned, open, { hideEmpty = false, changed = new Set() } = {}) {
  const { muscles, sources } = planned;
  const values = Object.values(muscles);
  if (!values.length) return '<p class="empty">No exercises planned yet.</p>';
  const scale = Math.max(...values);

  const blocks = MUSCLE_GROUPS.map(group => {
    const rows = Object.entries(group.muscles).filter(([id]) => !hideEmpty || muscles[id]).map(([id, name]) => {
      const sets = muscles[id] || 0;
      const isOpen = open.has(id);
      const list = sources[id] || [];
      const detail = list.length
        ? `<ul class="sets-sources">${list.map(s => `
            <li><span class="src-name">${esc(s.name)}</span>
              <span class="src-role is-${s.role}">${s.role}</span>
              <span class="src-num">${setsText(s.sets)}</span></li>`).join('')}</ul>`
        : '<p class="sets-none">No planned exercise trains this.</p>';
      return `
        <div class="sets-block ${isOpen ? 'is-open' : ''}" data-block="${id}">
          ${setsRow('toggle-muscle', id, isOpen, name, sets / scale, sets, `is-muscle ${changed.has(id) ? 'is-changed' : ''}`)}
          <div class="collapse"><div class="collapse-inner">${detail}</div></div>
        </div>`;
    }).join('');
    return rows ? `<p class="sets-heading">${group.name}</p>${rows}` : '';
  }).join('');
  return `<div class="card sets-table">${blocks}</div>`;
}

// The thin planned sets strip pinned to the bottom of a workout's screen. Closed: one line of
// numbers, the muscles that just changed first (in green), then the most-trained. Tapping it opens
// the full list, with a switch between the workout's day and the whole week.
//   strip = { open, mode: 'day' or 'week' }   openRows = Set of muscle ids expanded in its list
//   changed = Set of muscle ids changed by the last edit
function plannedStrip(workout, strip, openRows, changed) {
  const week = strip.mode === 'week';
  const planned = week ? Stats.weekPlannedSets() : Stats.dayPlannedSets(workout.weekday);
  const { muscles } = planned;
  const order = Object.keys(muscles).sort((a, b) => muscles[b] - muscles[a]).filter(id => !changed.has(id));
  const line = [...changed, ...order].map(id =>
    `<span class="${changed.has(id) ? 'is-changed' : ''}">${MUSCLES[id]} ${setsText(muscles[id] || 0)}</span>`).join(' · ');
  const dayName = WEEKDAYS[workout.weekday];
  const segment = (id, label) => `
    <button type="button" class="segment ${strip.mode === id ? 'is-active' : ''}" data-action="strip-mode" data-id="${id}"
      aria-pressed="${strip.mode === id}">${label}</button>`;
  return `
    <div class="sets-strip ${strip.open ? 'is-open' : ''}" id="sets-strip">
      <button type="button" class="strip-bar" data-action="strip-toggle" aria-expanded="${strip.open}">
        <strong>${week ? 'Week' : dayName.slice(0, 3)}</strong>
        <span class="strip-line">${line || 'No exercises planned yet'}</span>
        ${CHEVRON}
      </button>
      <div class="collapse"><div class="collapse-inner"><div class="strip-panel">
        <p class="strip-title">Planned sets</p>
        <div class="segmented">${segment('day', dayName)}${segment('week', 'This week')}</div>
        ${plannedSetsTable(planned, openRows, { hideEmpty: !week, changed })}
      </div></div></div>
    </div>`;
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
// label = what the line is, for the key under the graph. A point with a dayKey can be tapped to
// show that day's sets; selected = the dayKey shown now (its dot is bigger).
// tight = the scale hugs the numbers, so small changes show (body weight).
function maxChart(points, emptyNote, singles = [], label = 'Estimated max', selected = null, tight = false) {
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
  const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.15, tight ? 0 : Math.max(...values) * 0.05, 1);
  const lo = Math.max(0, Math.min(...values) - pad);
  const hi = Math.max(...values) + pad;

  const x = t => (t1 === t0 ? (L + W - R) / 2 : L + (t - t0) / (t1 - t0) * (W - L - R));
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);

  const grid = [lo, (lo + hi) / 2, hi].map(v => `
    <line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>
    <text class="chart-label" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map(p => `<circle class="chart-dot" cx="${x(p.time).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${p.dayKey && p.dayKey === selected ? 6 : 3.5}"/>`).join('');
  // A bigger invisible circle over each dot, so it's easy to tap.
  const hits = points.filter(p => p.dayKey).map(p => `<circle class="chart-hit" cx="${x(p.time).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="14" data-action="log-day" data-id="${p.dayKey}"/>`).join('');
  const singleLine = singles.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const singleDots = singles.map(p => `<circle class="chart-single-dot" cx="${x(p.time).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.5"/>`).join('');
  // The "Actual 1-rep" key only shows once a 1-rep set has been logged.
  const key = `
    <p class="chart-key">
      <span><i class="key-estimate"></i>${label}</span>
      ${singles.length ? '<span><i class="key-single"></i>Actual 1-rep</span>' : ''}
    </p>`;
  const xLabels = t1 === t0
    ? `<text class="chart-label" x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">Today</text>`
    : `<text class="chart-label" x="${L}" y="${H - 6}">${shortDate(t0)}</text>
       <text class="chart-label" x="${W - R}" y="${H - 6}" text-anchor="end">Today</text>`;

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label} over time">
      ${grid}
      ${singles.length ? `<path class="chart-single-line" d="${singleLine}"/>${singleDots}` : ''}
      <path class="chart-line" d="${line}"/>
      ${dots}
      ${xLabels}
      ${hits}
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

// A list of sets: Set, Weight, Reps. A timed exercise (plank) has Set and Seconds, with no weight.
function setsList(sets, timed) {
  const unit = Units.weightUnit();
  const rows = sets.map((set, i) => `
    <span>${i + 1}</span>
    <span>${timed ? '—' : set.weight == null ? 'BW' : `${Units.showWeight(set.weight)} ${unit}`}</span>
    <span>${set.reps}</span>`).join('');
  return `
    <div class="log-sets">
      <span class="log-sets-head">Set</span><span class="log-sets-head">Weight</span><span class="log-sets-head">${timed ? 'Seconds' : 'Reps'}</span>
      ${rows}
    </div>`;
}

// The sets done on one day (all workouts that day), that day's estimated max (or longest hold,
// or max reps on a bodyweight exercise), and a way into each workout it was part of.
function logDayCard(entries, key, timed) {
  const sets = entries.flatMap(h => h.sets);
  const maxes = entries.filter(h => h.best).map(h => h.best.max);
  const unit = Units.weightUnit();
  const summary = timed ? `Longest hold: <strong>${Math.max(...entries.map(h => h.hold))} sec</strong>`
    : entries[0].topReps != null ? `Max reps: <strong>${Math.max(...entries.map(h => h.topReps))}</strong>`
    : maxes.length ? `Estimated max: <strong>${Units.showWeight(Math.max(...maxes))} ${unit}</strong>` : '';

  return `
    <div class="card log-day">
      <p class="log-day-date">${fromDayKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      ${setsList(sets, timed)}
      ${summary ? `<p class="log-day-max">${summary}</p>` : ''}
      <div class="stack log-day-links">
        ${entries.map(h => `<button type="button" class="btn btn-small" data-action="open-session" data-id="${esc(h.sessionId)}">See full workout: ${esc(h.workoutName || 'Workout')}</button>`).join('')}
      </div>
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

// The weekly goal: chips 1 to 7, in the same style as the day chips.
function goalPicker(name, selected) {
  return `
    <div class="weekday-pick" role="radiogroup" aria-label="Days a week">
      ${[1, 2, 3, 4, 5, 6, 7].map(n => `
        <label class="weekday-chip">
          <input type="radio" name="${name}" value="${n}" ${n === selected ? 'checked' : ''}>
          <span>${n}</span>
        </label>`).join('')}
    </div>`;
}

// The small pencil on a workout's screen.
const PENCIL_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;

// This week's dates, Monday → Sunday: "Nov 2 – 8", or "Oct 26 – Nov 1" across two months.
// (The week starts at 3 am Monday, the same as the streak.)
function weekDates(now = Date.now()) {
  const start = weekStartOf(now);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const month = date => date.toLocaleDateString(undefined, { month: 'short' });
  return start.getMonth() === end.getMonth()
    ? `${month(start)} ${start.getDate()} – ${end.getDate()}`
    : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`;
}

// The date of a weekday in this week, for its heading: "Oct 26".
function dayDate(weekday, now = Date.now()) {
  const start = weekStartOf(now);
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + weekday);
  return `${date.toLocaleDateString(undefined, { month: 'short' })} ${date.getDate()}`;
}

// The workout timer: "12:34" under an hour, "1:02:34" from an hour.
function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// A finished workout's length in Past workouts: "52 min", "1 h 12 min".
function formatDuration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  return h ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

// Short form for the "ran too long" question: "4h 12m".
function formatHoursMinutes(ms) {
  const minutes = Math.floor(ms / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const Views = {

  // ---------- Home: the week, Monday to Sunday, with each day's workouts ----------
  // openSets = which planned-sets rows are expanded (a Set of muscle ids)
  // A day with no workouts is a rest day automatically; tap a workout to start it (any day);
  // hold a workout and drag it to move it to another day (see the drag code in app.js).
  home(openSets) {
    const draftWorkout = Store.draftWorkout();
    const today = todayWeekday();
    const thisWeek = weekKey(Date.now());

    const resume = draftWorkout ? `
      <div class="card banner stack">
        <div><strong>Workout in progress:</strong> ${esc(draftWorkout.name)}<span class="banner-timer"><span data-timer>${formatClock(Store.draftElapsed())}</span><span data-timer-paused ${Store.isDraftPaused() ? '' : 'hidden'}> · Paused</span></span></div>
        <button class="btn btn-primary" data-action="${draftWorkout.quick ? 'resume-quick' : 'open-workout'}" data-id="${draftWorkout.id}">Resume</button>
      </div>` : '';

    // Quick workouts finished this week, on the day they were finished (a workout just after
    // midnight belongs to the day before, like the streak's 3 am day change). Blue "✓ Done" cards;
    // tapping one opens it in Past workouts. They aren't in the plan, so next week they're gone.
    const quickOn = WEEKDAYS.map(() => []);
    for (const s of Store.data.sessions) {
      const time = new Date(s.date).getTime();
      if (s.quick && weekKey(time) === thisWeek) quickOn[daysPassed(time)].push(s);
    }
    const quickCard = s => `
      <div class="card workout-card is-quick">
        <button class="workout-open" data-action="open-session" data-id="${esc(s.id)}">
          <span class="workout-name">${esc(s.workoutName)}</span>
          <span class="day-meta">Quick · ${s.exercises.length} exercise${s.exercises.length === 1 ? '' : 's'} · <span class="done-mark">✓ Done</span></span>
        </button>
      </div>`;

    // Workouts on days that have passed this week: done, partial or missed (Streak.dayStates()).
    const states = Streak.dayStates();

    const days = WEEKDAYS.map((dayName, weekday) => {
      const rest = Store.isRestDay(weekday);
      const workouts = Store.workoutsOn(weekday);
      const cards = workouts.map(w => {
        const last = Store.lastSessionFor(w.id);
        const count = w.exercises.length;
        const state = states[w.id];
        // A passed day's workout: "✓ Done" (with "caught up Wed" if it was made up later),
        // amber "Partial · 12/15 sets" or red "Missed · 0/15 sets" (both with Catch up).
        // Otherwise: finished this week → "✓ Done", or when it was last done.
        const doneThisWeek = last && weekKey(new Date(last.date).getTime()) === thisWeek;
        let when;
        if (state && state.state !== 'done') {
          const label = state.state === 'partial' ? 'Partial' : 'Missed';
          when = ` · <span class="state-${state.state}">${label} · ${state.done}/${state.planned} sets</span>`;
        } else if (state || doneThisWeek) {
          when = ` · <span class="done-mark">✓ Done${state?.caughtUp ? ` · caught up ${state.caughtUp}` : ''}</span>`;
        } else {
          when = last ? ` · last ${formatDate(last.date)}` : '';
        }
        const catchUp = state && state.state !== 'done'
          ? `<button type="button" class="btn btn-small catch-up-btn" data-action="catch-up" data-id="${w.id}">Catch up</button>` : '';
        // The left strip follows the state: amber for Partial, red for Missed, otherwise green.
        const stripClass = state && state.state !== 'done' ? `is-${state.state}` : '';
        return `
          <div class="card workout-card ${stripClass}" data-workout="${w.id}">
            <div class="workout-body">
              <button class="workout-open" data-action="open-workout" data-id="${w.id}">
                <span class="workout-name">${esc(w.name)}</span>
                <span class="day-meta">${count} exercise${count === 1 ? '' : 's'}${when}</span>
              </button>
              ${catchUp}
            </div>
          </div>`;
      }).join('');
      // An empty day is a rest day: its label, and a small link to add a workout (making it a training day).
      const empty = `
        <button type="button" class="day-add" data-action="new-workout-on" data-id="${weekday}">+ Add a workout to train this day</button>`;
      return `
        <section class="day-block ${rest ? 'is-rest' : ''} ${weekday === today ? 'is-today' : ''}" data-weekday="${weekday}">
          <div class="day-head">
            <span class="day-head-name">${dayName}</span>
            <span class="day-head-date">${dayDate(weekday)}</span>
            ${weekday === today ? '<span class="tag tag-today">Today</span>' : ''}
            ${rest ? '<span class="rest-word">Rest day</span>' : ''}
          </div>
          ${cards}${quickOn[weekday].map(quickCard).join('')}
          ${cards ? '' : empty}
        </section>`;
    }).join('');

    return {
      title: 'GitFit',
      back: null,
      history: true,
      html: `
        ${resume}
        <div class="week-intro">
          <div class="week-title">
            <h2>This week</h2>
            <span class="week-range">${weekDates()}</span>
          </div>
          ${Store.data.workouts.length ? '' : '<p class="week-hint">Tap + to create your first workout.</p>'}
        </div>
        <div class="week">${days}</div>

        <h2>Planned sets per week</h2>
        ${plannedSetsTable(Stats.weekPlannedSets(), openSets)}

        <div class="fab-menu" id="fab-menu" aria-hidden="true">
          <button type="button" class="fab-option" data-action="new-workout">
            <strong>New workout</strong><span>Add a workout to your week</span>
          </button>
          <button type="button" class="fab-option is-quick" data-action="quick-start">
            <strong>Quick workout</strong><span>A one-off, logged but not added to your week</span>
          </button>
        </div>
        <button type="button" class="fab" data-action="fab-menu" aria-label="New workout or quick workout" aria-expanded="false">
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
      back: source ? `#/workout/${source.id}` : '#/',
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

  // The add/edit exercise panel, in a card on a workout's screen or at the end of its list.
  // It has three steps: pick from library → (or create custom) → sets & reps.
  // picker = what it shows (see app.js); canClose = the search has a way to close it
  exercisePanel(picker, editing, canClose) {
    if (picker.mode === 'custom') return this.customExerciseForm(picker);
    if (picker.mode === 'details') return this.exerciseDetailsForm(picker, editing);
    return this.exercisePicker(picker, editing, canClose);
  },

  // The title, day, Copy and Delete of a workout (the pencil at the top of its screen).
  // It's a pop-up, so what's typed is saved by Done (see 'details-done' in app.js).
  workoutDetails(workout) {
    return `
      <div class="card notice stack" role="dialog" aria-label="Edit ${esc(workout.name)}">
        <div>
          <label for="workout-name">Title</label>
          <input id="workout-name" value="${esc(workout.name)}" placeholder="e.g. Push, Legs, Upper (arm focus)" autocomplete="off">
        </div>
        <div>
          <label>Day</label>
          ${weekdayPicker('workout-day', workout.weekday)}
        </div>
        <button type="button" class="btn btn-primary" data-action="details-done">Done</button>
        <button type="button" class="btn" data-action="copy-workout" data-id="${workout.id}">Copy workout</button>
        <button type="button" class="btn btn-danger" data-action="delete-workout" data-id="${workout.id}">Delete workout</button>
      </div>`;
  },

  // Step 1: search the library and tap an exercise.
  exercisePicker(picker, editing, canClose) {
    return `
      <div class="card stack">
        <input type="search" id="lib-search" value="${esc(picker.query)}"
          placeholder="Search name, muscle or equipment" autocomplete="off" aria-label="Search exercises">
        <div id="lib-results" class="lib-results">${this.libraryResults(picker.query)}</div>
        <button type="button" class="btn" data-action="new-custom">+ Create custom exercise</button>
        ${editing ? '<button type="button" class="btn" data-action="cancel-edit">Cancel</button>'
          : canClose ? '<button type="button" class="btn" data-action="close-add">Done adding</button>' : ''}
      </div>`;
  },

  // The search results list. Redrawn on its own while you type, so the search box keeps focus.
  // Before you type: muscle group chips to browse, then your recent exercises (on the Log,
  // every exercise you've logged). Once you type: only the best few matches.
  // action = what tapping a result does (picking for a day, or opening its log).
  // group = the muscle group chip that's picked, if any.
  libraryResults(query, action = 'pick-exercise', group = null) {
    if (!query.trim()) {
      const chips = `
        <div class="browse-chips">
          ${MUSCLE_GROUPS.map(g => `
            <button type="button" class="chip-btn ${g.name === group ? 'is-picked' : ''}" data-action="browse-group"
              data-id="${g.name}" data-target="${action}">${g.name}</button>`).join('')}
        </div>`;
      if (group) return chips + Library.inGroup(group).map(e => libItem(e, action)).join('');
      if (action === 'open-log') {
        const logged = Store.loggedExercises();
        return chips + (logged.length
          ? `<p class="lib-head">Your exercises</p>${logged.map(l => libItem({ id: l.refId, name: l.name }, action,
              `Last ${shortDate(l.date)} · ${l.count} workout${l.count === 1 ? '' : 's'}`)).join('')}`
          : '<p class="empty">Exercises you log will show here.</p>');
      }
      const recent = Store.loggedExercises().map(l => Library.get(l.refId)).filter(e => e && !e.deleted).slice(0, 6);
      return chips + (recent.length ? `<p class="lib-head">Recent</p>${recent.map(e => libItem(e, action)).join('')}` : '');
    }
    const { results, total } = Library.search(query);
    if (!results.length) {
      const canCreate = ['pick-exercise', 'swap-pick', 'quick-pick'].includes(action);
      return `<p class="empty">No matches.${canCreate ? ' Create it as a custom exercise.' : ''}</p>`;
    }
    const more = total > results.length
      ? `<p class="lib-more">Showing the best ${results.length} of ${total} — keep typing to narrow it down.</p>` : '';
    return results.map(e => libItem(e, action)).join('') + more;
  },

  // Step 2: sets and reps for the picked exercise.
  exerciseDetailsForm(picker, editing) {
    const info = Library.forExercise({ refId: picker.refId });
    const timed = Library.isTimed(picker.refId);
    const form = editing || (timed ? { sets: 3, repMin: 30, repMax: 60 } : { sets: 3, repMin: 8, repMax: 12 });
    return `
      <form id="exercise-form" class="card stack">
        <div class="picked">
          <div class="picked-info">
            ${editing?.refId === picker.refId ? '' : `<strong>${esc(info.name)}</strong>`}
            <span class="muted">${esc(info.equipment)}</span>
            <span class="muscle-line"><b>Primary:</b> ${esc(muscleNames(info.primary) || '—')}</span>
            ${info.secondary.length ? `<span class="muscle-line"><b>Secondary:</b> ${esc(muscleNames(info.secondary))}</span>` : ''}
          </div>
        </div>
        <button type="button" class="btn" data-action="change-exercise">${editing ? 'Change exercise' : 'Pick a different exercise'}</button>
        ${info.custom ? `<button type="button" class="btn" data-action="edit-custom">Edit custom exercise</button>` : ''}
        <div>
          <label for="ex-sets">Sets</label>
          <div class="row range-row">
            <button type="button" class="btn sets-step" data-action="sets-step" data-id="-1" aria-label="One set less">−</button>
            <input id="ex-sets" name="sets" type="number" inputmode="numeric" min="1" max="20" value="${form.sets}" required>
            <button type="button" class="btn sets-step" data-action="sets-step" data-id="1" aria-label="One set more">+</button>
          </div>
        </div>
        <div>
          <label for="ex-rep-min">${timed ? 'Target seconds (e.g. 30 to 60)' : 'Target reps (e.g. 8 to 12)'}</label>
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
  // saveLabel = the save button's text, when saving does more than save (see Swap for today).
  customExerciseForm(picker, saveLabel) {
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
        <button class="btn btn-primary">${saveLabel || (isEdit ? 'Save changes' : 'Save exercise')}</button>
        <button type="button" class="btn" data-action="cancel-custom">${isEdit ? 'Cancel' : 'Back to library'}</button>
        ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete-custom" data-id="${esc(c.id)}">Delete custom exercise</button>` : ''}
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

  // "Missed this week" at the top of a quick workout's + Add exercise: planned exercises from
  // days that have passed that still have sets missing, under "Tue · Pull" headers.
  // Tapping one adds it with its missing sets and target reps. Nothing missed → nothing shown.
  missedPicker() {
    const missed = Store.missedThisWeek();
    if (!missed.length) return '';
    const groups = missed.map(w => `
      <div class="missed-day">${WEEKDAYS[w.weekday].slice(0, 3)} · ${esc(w.name)}</div>
      ${w.exercises.map(e => `
        <button type="button" class="lib-item missed-item" data-action="quick-missed"
          data-id="${esc(e.makeupFor.workoutId)}|${esc(e.makeupFor.exerciseId)}">
          <span class="lib-name">${esc(Library.forExercise(e).name)}</span>
          <span class="lib-meta missed-sets">${e.sets} set${e.sets === 1 ? '' : 's'} missed</span>
        </button>`).join('')}`).join('');
    return `
      <div class="missed-picker">
        <h3>Missed this week</h3>
        ${groups}
      </div>`;
  },

  // ---------- A planned workout before it's started: look at it and change it, on one screen ----------
  // Shows what you did last time, each exercise's note and log. Each exercise has a pencil that
  // opens its sets & reps inside its card; hold and drag a card to change the order (app.js).
  // The pencil at the top has the title, day, copy and delete. Start workout is what starts it
  // (and its timer). Dashed cards make it look different from the real thing.
  //   ui = { picker (the add/edit panel, see app.js), strip and stripRows (the planned sets strip),
  //          changed (muscles changed by the last edit) }
  workoutPreview(workout, ui) {
    const { picker } = ui;
    const hasExercises = workout.exercises.length > 0;
    const editing = workout.exercises.find(e => e.id === picker.exerciseId);
    // A workout with nothing in it opens ready to add to.
    const adding = !editing && (picker.adding || !hasExercises);

    const cards = workout.exercises.map((ex, i) => {
      const info = Library.forExercise(ex);
      const timed = Library.isTimed(ex.refId);
      const last = Store.lastResult(ex);
      const isEditing = ex === editing;
      return `
        <div class="card preview-ex ${isEditing ? 'is-editing' : ''}" data-plan-ex="${ex.id}">
          <div class="preview-head">
            <span class="ex-num">${i + 1}</span>
            <span class="ex-toggle-main">
              <span class="ex-title">${esc(info.name)}</span>
              <span class="ex-sub">Target ${targetText(ex, timed)}</span>
              ${nextWeightNote(ex)}
            </span>
            ${logButton(ex.refId)}
            <button type="button" class="icon-btn" data-action="edit-exercise" data-id="${ex.id}"
              aria-label="Edit ${esc(info.name)}" aria-pressed="${isEditing}">${PENCIL_SVG}</button>
          </div>
          ${isEditing ? `<div id="exercise-panel">${this.exercisePanel(picker, editing, false)}</div>` : `
            ${last
              ? `<p class="preview-last">Last time · ${formatDate(last.date)}</p>${setsList(last.sets, timed)}`
              : '<p class="preview-last">No history yet</p>'}
            ${noteBox(ex.refId)}`}
        </div>`;
    }).join('');

    return {
      title: workout.name,
      back: '#/',
      html: `
        <div class="start-row ${hasExercises ? '' : 'is-empty'}">
          ${hasExercises ? `<button type="button" class="btn btn-primary" data-action="start-workout" data-id="${workout.id}">Start workout</button>` : ''}
          <button type="button" class="icon-btn" data-action="workout-details" data-id="${workout.id}" aria-label="Edit ${esc(workout.name)}">${PENCIL_SVG}</button>
        </div>
        <div id="plan-list">${cards}</div>
        <div class="plan-end">
          ${adding ? `<h2>Add exercise</h2><div id="exercise-panel">${this.exercisePanel(picker, null, hasExercises)}</div>`
            : '<button type="button" class="btn btn-add-ex" data-action="add-exercise">+ Add exercise</button>'}
          ${hasExercises ? '<p class="muted preview-tip">Only log your working sets, not your warm-ups.</p>' : ''}
        </div>
        ${plannedStrip(workout, ui.strip, ui.stripRows, ui.changed)}
      `,
    };
  },

  // ---------- Workout: compact list, one exercise expanded at a time ----------
  // swap = the Swap for today search: { exerciseId (whose search is open, or null), query,
  //   creating (showing the custom exercise form instead of the search; its state is in picker) }
  // A quick workout (workout.quick, from Store.draftWorkout()) uses the same screen with an
  // editable title, no targets or swaps, "+ Add set" on each exercise, and "+ Add exercise"
  // (quickAdd = its search: { open, query, creating (showing the custom exercise form instead) }).
  // A planned workout has that "+ Add exercise" too, for today only (those exercises are ex.today
  // and work like a quick workout's).
  workout(workout, draft, openId, swap, quickAdd = { open: false, query: '' }, picker = null) {
    const quick = Boolean(workout.quick);
    const title = workout.name || 'Quick workout';

    const unit = Units.weightUnit();
    const cards = workout.exercises.map((ex, i) => {
      // A swapped exercise shows as itself, with its own history.
      const swapped = Store.swappedRef(ex.id);
      const refId = swapped || ex.refId;
      const info = Library.forExercise({ refId });
      const timed = Library.isTimed(refId);
      const last = Store.lastFor(ex);
      const nextEx = workout.exercises[i + 1];
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
            ${timed ? LOCKED_WEIGHT : `<input type="text" inputmode="decimal" value="${Units.showWeight(set.weight)}" placeholder="${unit}"
              data-ex="${ex.id}" data-set="${i}" data-field="weight" aria-label="Set ${i + 1} weight in ${unit}">`}
            <input type="text" inputmode="numeric" value="${esc(set.reps)}" placeholder="${lastReps ?? ''}"
              data-ex="${ex.id}" data-set="${i}" data-field="reps" aria-label="Set ${i + 1} ${timed ? 'seconds' : 'reps'}">`;
        }).join('');

        // Swap for today: a button, or the exercise search once it's tapped.
        // Once swapped, only Undo swap shows (undo, then swap again to pick a different one).
        // Every workout has "+ Add set" and "− Remove set" (when the last set can go: Store.canRemoveDraftSet()).
        // A quick workout (or an exercise added for today) has "Remove exercise" instead of the swap.
        const setButtons = `
            <button type="button" class="btn btn-small" data-action="add-set" data-id="${ex.id}">+ Add set</button>
            ${Store.canRemoveDraftSet(ex.id) ? `<button type="button" class="btn btn-small" data-action="remove-set" data-id="${ex.id}">− Remove set</button>` : ''}`;
        const swapPanel = quick || ex.today ? `
          <div class="row swap-row">
            ${setButtons}
            <button type="button" class="btn btn-small" data-action="quick-remove" data-id="${ex.id}">Remove exercise</button>
            ${logButton(refId)}
          </div>` : swap.exerciseId === ex.id && swap.creating ? `
          <div class="swap-panel stack">
            ${this.customExerciseForm(picker, 'Save and swap')}
          </div>` : swap.exerciseId === ex.id ? `
          <div class="swap-panel stack">
            <input type="search" id="swap-search" value="${esc(swap.query)}"
              placeholder="Swap for today: search exercises" autocomplete="off" aria-label="Search exercises to swap in">
            <div id="swap-results" class="lib-results">${this.libraryResults(swap.query, 'swap-pick')}</div>
            <button type="button" class="btn" data-action="swap-new-custom">+ Create custom exercise</button>
            <button type="button" class="btn" data-action="swap-cancel">Cancel</button>
          </div>` : `
          <div class="row swap-row">
            ${setButtons}
            ${swapped
              ? `<button type="button" class="btn btn-small" data-action="swap-undo" data-id="${ex.id}">Undo swap</button>`
              : `<button type="button" class="btn btn-small" data-action="swap-open" data-id="${ex.id}">Swap for today</button>`}
            ${logButton(refId)}
          </div>`;

        // Next shows once every set here is filled in (app.js shows it as you type). The last exercise gets Done.
        const nextButton = `
          <button type="button" class="btn btn-primary next-ex" data-action="next-exercise" data-id="${ex.id}"
            ${Store.draftProgress(ex.id).complete ? '' : 'hidden'}>${nextEx ? `Next: ${esc(Library.forExercise({ refId: Store.swappedRef(nextEx.id) || nextEx.refId }).name)}` : 'Done'}</button>`;

        body = `
          <div class="ex-body">
            ${ex.repMin ? `<div class="ex-sub">Target ${targetText(ex, timed)}${last ? ` · last done ${formatDate(last.date)}` : ''}</div>`
              : last ? `<div class="ex-sub">Last done ${formatDate(last.date)}</div>` : ''}
            <div class="set-grid">
              <div class="col-head">Set</div>
              ${weightHead(info, unit)}
              <div class="col-head">${timed ? 'Seconds' : 'Reps'}</div>
              ${setRows}
            </div>
            ${nextButton}
            ${swapPanel}
            ${noteBox(refId)}
          </div>`;
      }

      const plannedName = swapped ? Library.forExercise(ex).name : '';
      // A quick workout exercise added to make up a missed one: which day and workout.
      const makeupWorkout = ex.makeupFor && Store.getWorkout(ex.makeupFor.workoutId);
      const makeupNote = ex.makeupFor
        ? `<span class="ex-sub makeup-note">Catching up${makeupWorkout ? ` ${WEEKDAYS[Streak.dayStates()[makeupWorkout.id]?.weekday ?? makeupWorkout.weekday].slice(0, 3)} · ${esc(makeupWorkout.name)}` : ''}</span>` : '';
      return `
        <div class="card workout-ex ${isOpen ? 'is-open' : ''}" id="ex-${ex.id}" ${ex.today ? '' : `data-plan-ex="${ex.id}"`}>
          <button class="ex-toggle" data-action="toggle-exercise" data-id="${ex.id}" aria-expanded="${isOpen}">
            <span class="ex-num">${i + 1}</span>
            <span class="ex-toggle-main">
              <span class="ex-title">${esc(info.name)}</span>
              ${swapped ? `<span class="ex-sub swap-note">Swapped for today · planned: ${esc(plannedName)}</span>` : ''}
              ${ex.today ? '<span class="ex-sub swap-note">Added for today only</span>' : ''}
              ${makeupNote}
              <span class="ex-sub">${lastSummary(last, timed)}</span>
              ${nextWeightNote(ex)}
            </span>
            <span class="tag">${esc(Library.primaryLabel(info))}</span>
            ${badge}
          </button>
          ${body}
        </div>`;
    });
    // Hold and drag reorders the exercises in #exercise-list (see app.js). One added for today
    // only isn't in the plan, so it has no place to save: it stays below the list.
    const planCards = cards.filter((_, i) => !workout.exercises[i].today).join('');
    const todayCards = cards.filter((_, i) => workout.exercises[i].today).join('');

    // Quick workout: the title box at the top, and "+ Add exercise" (or its search) below the exercises.
    const quickTop = quick ? `
      <input id="quick-name" class="quick-name" value="${esc(workout.name)}" placeholder="Quick workout"
        autocomplete="off" aria-label="Workout title">
      ${workout.exercises.length ? '' : '<p class="muted quick-hint">Add the exercises you do as you go. This workout won\'t be added to your week.</p>'}` : '';
    const quickBottom = quickAdd.creating ? this.customExerciseForm(picker, 'Save and add') : quickAdd.open ? `
      <div class="card stack" id="quick-add-panel">
        ${quick ? this.missedPicker() : '<p class="muted add-today-note">Just for today: your plan stays the same.</p>'}
        <input type="search" id="quick-search" value="${esc(quickAdd.query)}"
          placeholder="Search name, muscle or equipment" autocomplete="off" aria-label="Search exercises to add">
        <div id="quick-results" class="lib-results">${this.libraryResults(quickAdd.query, 'quick-pick')}</div>
        <button type="button" class="btn" data-action="quick-new-custom">+ Create custom exercise</button>
        <button type="button" class="btn" data-action="quick-add-cancel">Cancel</button>
      </div>` : `
      <button type="button" class="btn btn-add-ex" data-action="quick-add-open">+ Add exercise${quick ? '' : ' for today'}</button>`;

    // The strip that says you're really in a workout, with the sets logged so far.
    const totals = Store.draftTotals();
    const status = `
      <div class="workout-status is-live">
        <strong>In progress</strong>
        <span data-sets-done>${totals.filled} / ${totals.total} sets</span>
        <span class="status-bar"><i data-sets-bar style="width:${totals.total ? totals.filled / totals.total * 100 : 0}%"></i></span>
      </div>`;

    return {
      title,
      back: '#/',
      timer: true, // the workout timer shows in the top bar
      html: `
        ${status}
        ${quickTop}
        <div id="exercise-list">${planCards}</div>
        ${todayCards}
        ${quickBottom}
        <div class="finish-bar stack">
          <button class="btn btn-primary" data-action="finish">Finish workout</button>
          <button class="btn btn-danger" data-action="discard">Discard workout</button>
        </div>
      `,
    };
  },

  // ---------- Profile: avatar + name. Settings open from the gear in the top bar. ----------
  // map = the muscle map: { mode ('growth' or 'level'), muscle (the tapped muscle or null), infoOpen }
  profile(map) {
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
        ${this.backupReminder()}
        ${this.streakCard()}
        <a class="btn" href="#/log">Log</a>
        ${this.bodyWeightCard()}
        ${this.muscleMap(map)}
      `,
    };
  },

  // A small reminder once there's something to lose and no backup in the last 30 days.
  backupReminder() {
    const { lastBackupAt } = Store.data.settings;
    if (!Store.data.sessions.length) return '';
    const days = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / (24 * 60 * 60 * 1000)) : null;
    if (days != null && days < BACKUP_REMINDER_DAYS) return '';
    return `
      <div class="card backup-note">
        <span>${days == null ? 'You haven\'t backed up yet.' : `Last backup: ${days} days ago.`} Your data only lives on this device.</span>
        <button type="button" class="btn btn-small" data-action="export">Back up</button>
      </div>`;
  },

  // ---------- Body weight (on Profile): log today's weight, see it over time ----------
  bodyWeightCard() {
    const log = Store.data.bodyWeightLog;
    const unit = Units.weightUnit();
    const latest = log[log.length - 1];
    const points = log.map(e => ({ time: fromDayKey(e.day).getTime(), value: Number(Units.showWeight(e.lbs)) }));
    const change = latest && log.length > 1 ? Number(Units.showWeight(latest.lbs)) - points[0].value : null;
    const changeText = change == null ? '' : change === 0 ? `No change since ${shortDate(fromDayKey(log[0].day))}`
      : `${change > 0 ? '+' : '−'}${Number(Math.abs(change).toFixed(1))} ${unit} since ${shortDate(fromDayKey(log[0].day))}`;
    return `
      <h2>Body weight</h2>
      <div class="card">
        <p class="log-max ${latest ? '' : 'is-blank'}">${latest ? `${Units.showWeight(latest.lbs)} <span>${unit}</span>` : '—'}</p>
        <p class="log-sub">${changeText || (latest ? `Logged ${shortDate(fromDayKey(latest.day))}` : '&nbsp;')}</p>
        ${maxChart(points, 'Log your weight to start the graph', [], 'Body weight', null, true)}
        <form id="bw-form" class="bw-form">
          <input name="weight" type="text" inputmode="decimal" placeholder="Today's weight (${unit})" autocomplete="off" aria-label="Today's body weight in ${unit}">
          <button class="btn btn-primary btn-small">Log</button>
        </form>
        <a class="btn bw-log-link" href="#/body-weight">Body weight log</a>
      </div>`;
  },

  // ---------- Body weight log: every weight entered, newest first, each can be edited or deleted ----------
  // editDay = the day whose weight is open for editing (null = none)
  bodyWeightLog(editDay) {
    const unit = Units.weightUnit();
    const row = entry => {
      const date = fromDayKey(entry.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      if (entry.day === editDay) {
        return `
          <div class="custom-row bw-editing">
            <span class="custom-info"><span>${date}</span></span>
            <form id="bw-edit-form" class="bw-form">
              <input id="bw-edit-weight" name="weight" type="text" inputmode="decimal" value="${Units.showWeight(entry.lbs)}" autocomplete="off" aria-label="Body weight in ${unit}">
              <button class="btn btn-primary btn-small">Save</button>
              <button type="button" class="btn btn-small" data-action="bw-edit-cancel">Cancel</button>
            </form>
          </div>`;
      }
      return `
        <div class="custom-row">
          <span class="custom-info"><strong>${Units.showWeight(entry.lbs)} ${unit}</strong><span>${date}</span></span>
          <button type="button" class="btn btn-small" data-action="bw-edit" data-id="${entry.day}">Edit</button>
          <button type="button" class="btn btn-small btn-danger" data-action="bw-delete" data-id="${entry.day}">Delete</button>
        </div>`;
    };
    const log = [...Store.data.bodyWeightLog].reverse();
    return {
      title: 'Body weight log',
      back: '#/profile',
      html: log.length
        ? `<div class="card custom-list">${log.map(row).join('')}</div>`
        : '<p class="empty">No weights logged yet. Log your weight on Profile to start.</p>',
    };
  },

  // ---------- After finishing a workout: stays up until closed (or the app is closed) ----------
  // s = Store.sessionSummary(). The new bests only show if there are any; each opens its log.
  summary(s) {
    const unit = Units.weightUnit();
    const { week } = Streak.summary();
    const best = b => b.timed ? `${b.before} → ${b.after} sec longest hold`
      : b.repsOnly ? `${b.before} → ${b.after} max reps`
      : `${Units.showWeight(b.before)} → ${Units.showWeight(b.after)} ${unit} estimated max`;
    const stats = [
      ['Time', s.durationMs ? formatDuration(s.durationMs) : '—'],
      ['Sets', s.sets],
      ['Exercises', s.exercises],
      ['Weight lifted', s.volume ? `${Math.round(Number(Units.showWeight(s.volume))).toLocaleString()} ${unit}` : '—'],
    ];
    return {
      title: 'Workout done',
      back: null,
      html: `
        <div class="summary-top">
          <span class="summary-check" aria-hidden="true">✓</span>
          <h1>${esc(s.name || 'Workout')}</h1>
          ${s.moreThanLast ? `<p class="summary-more">${s.moreThanLast}% more weight than last time</p>` : ''}
        </div>
        <div class="summary-stats">
          ${stats.map(([label, value]) => `<div class="card"><span>${label}</span><strong>${value}</strong></div>`).join('')}
        </div>
        ${s.bests.length ? `
          <div class="card summary-bests">
            <h2>You got ${s.bests.length} new best${s.bests.length === 1 ? '' : 's'} today!</h2>
            ${s.bests.map(b => `
              <button type="button" class="best-row" data-action="view-log" data-id="${esc(b.refId)}">
                <span class="best-main"><strong>${esc(b.name)}</strong><span>${best(b)}</span></span>
                <span class="best-link">Log ${CHEVRON}</span>
              </button>`).join('')}
          </div>` : ''}
        <div class="card summary-week">
          <div class="week-sets"><span>Days this week</span><strong>${week.days} / ${week.goal}</strong></div>
          <div class="week-bar ${week.hit ? 'is-full' : ''}"><i style="width:${Math.min(100, week.days / week.goal * 100)}%"></i></div>
        </div>
        <div class="finish-bar">
          <button type="button" class="btn btn-primary" data-action="close-summary">Close</button>
        </div>
      `,
    };
  },

  // ---------- First-time setup: the same fields as Settings, all optional ----------
  setup() {
    return {
      title: 'Welcome to GitFit',
      back: null,
      html: `
        <p class="setup-intro">A few quick details. You can change these any time.</p>
        <form id="settings-form">
          ${this.settingsFields(true)}
        </form>
        <p class="muted setup-tip">When you work out, only log your working sets, not your warm-ups.</p>
        <div class="finish-bar stack">
          <button type="button" class="btn btn-primary" data-action="setup-done">Get started</button>
        </div>
      `,
    };
  },

  // ---------- The one-time question for data from before the weekly goal existed ----------
  // Tapping a number saves it and carries on (see the change listener in app.js).
  goalPrompt() {
    return {
      title: 'Weekly goal',
      back: null,
      html: `
        <p class="setup-intro">Your streak now counts days instead of sets. A week counts when you work out on enough different days. Any workout counts, and two on the same day count as one.</p>
        <h2>How many days a week are you trying to go?</h2>
        <div class="card">${goalPicker('goal-prompt', null)}</div>
        <p class="muted setup-tip">You can change this any time in Settings.</p>
      `,
    };
  },

  // ---------- Weekly streak (on Profile) ----------
  // The flame is gray until this week is hit, then green.
  streakCard() {
    const { started, start, totals, week, recent } = Streak.summary();
    const fill = Math.min(100, week.days / week.goal * 100);
    const startLabel = start
      ? fromDayKey(start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const headline = started ? `${totals.current}-week streak`
      : start ? `Streak starts ${startLabel}` : 'Log a workout to start a streak';
    const left = week.goal - week.days;
    const sub = started
      ? (week.hit ? 'This week is done 🔥' : `Work out ${left} more day${left === 1 ? '' : 's'} to hit this week`)
      : start ? 'This week is practice' : `Your goal is ${week.goal} day${week.goal === 1 ? '' : 's'} a week`;

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
          <span>Days this week</span>
          <strong>${week.days} / ${week.goal}</strong>
        </div>
        <div class="week-bar ${week.hit ? 'is-full' : ''}" role="img"
          aria-label="${week.days} of ${week.goal} days this week">
          <i style="width:${fill}%"></i>
        </div>

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
    const messages = ['Weekly goal reached.', 'Another full week in the books.',
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
    const setCount = s => s.exercises.reduce((n, e) => n + e.sets.length, 0);
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // Newest first, grouped by week (Monday 3 am → Monday 3 am, the same weeks as the streak):
    // "This week", "Last week", then date ranges like "Oct 19 – 25", each with its totals.
    const thisWeek = weekKey(Date.now());
    const lastWeek = addWeeks(thisWeek, -1);
    const weeks = [];
    for (const s of [...Store.data.sessions].reverse()) {
      const key = weekKey(new Date(s.date).getTime());
      if (weeks[weeks.length - 1]?.key !== key) weeks.push({ key, sessions: [] });
      weeks[weeks.length - 1].sessions.push(s);
    }

    const html = weeks.map(({ key, sessions }) => {
      const label = key === thisWeek ? 'This week' : key === lastWeek ? 'Last week'
        : weekDates(new Date(sessions[0].date).getTime());
      const sets = sessions.reduce((n, s) => n + setCount(s), 0);
      const cards = sessions.map(s => `
        <button class="card past-card ${s.quick ? 'is-quick' : ''}" data-action="open-session" data-id="${esc(s.id)}">
          <span class="past-when">${when(s.date)}</span>
          <span class="day-name">${esc(s.workoutName || 'Workout')}${s.quick ? ' <span class="tag tag-quick">Quick</span>' : ''}</span>
          <span class="day-meta">${plural(s.exercises.length, 'exercise')} · ${plural(setCount(s), 'set')}${s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ''}</span>
        </button>`).join('');
      return `
        <div class="past-week">
          <div class="past-week-head">
            <h2>${label}</h2>
            <span class="past-week-total">${plural(sessions.length, 'workout')} · ${plural(sets, 'set')}</span>
          </div>
          ${cards}
        </div>`;
    }).join('');

    return {
      title: 'Past workouts',
      back: '#/',
      html: html || '<p class="empty">No finished workouts yet.</p>',
    };
  },

  // ---------- One past workout: looks like the workout start page, with a pencil on each exercise ----------
  // The pencil opens that exercise's boxes, to fix its weights and reps or fill in a forgotten set.
  // edit = the changes being made (see pastEdit in app.js): { exercises: [{ entry, rows }], editing (index or null) }
  pastWorkout(session, edit) {
    const unit = Units.weightUnit();
    const cards = edit.exercises.map((e, x) => {
      const timed = Library.isTimed(e.entry.refId);
      const info = Library.forExercise(e.entry);
      const isEditing = edit.editing === x;
      const logged = e.rows.filter(set => set.reps !== '');
      const rows = e.rows.map((set, i) => `
        <div class="set-num">${i + 1}</div>
        ${timed ? LOCKED_WEIGHT : `<input type="text" inputmode="decimal" value="${Units.showWeight(set.weight)}" placeholder="${unit}"
          data-past="${x}" data-set="${i}" data-field="weight" aria-label="Set ${i + 1} weight in ${unit}">`}
        <input type="text" inputmode="numeric" value="${esc(set.reps)}"
          data-past="${x}" data-set="${i}" data-field="reps" aria-label="Set ${i + 1} ${timed ? 'seconds' : 'reps'}">`).join('');
      const swappedFrom = e.entry.swappedFrom ? Library.forExercise({ refId: e.entry.swappedFrom }).name : '';
      return `
        <div class="card preview-ex ${isEditing ? 'is-editing' : ''}">
          <div class="preview-head">
            <span class="ex-num">${x + 1}</span>
            <span class="ex-toggle-main">
              <span class="ex-title">${esc(e.entry.name)}</span>
              ${swappedFrom ? `<span class="ex-sub swap-note">Swapped · planned: ${esc(swappedFrom)}</span>` : ''}
              ${e.entry.targetRepMin ? `<span class="ex-sub">Target ${targetText({ sets: e.entry.targetSets, repMin: e.entry.targetRepMin, repMax: e.entry.targetRepMax }, timed)}</span>` : ''}
            </span>
            ${e.entry.refId ? logButton(e.entry.refId) : ''}
            <button type="button" class="icon-btn" data-action="past-edit-exercise" data-id="${x}"
              aria-label="Edit ${esc(e.entry.name)}" aria-pressed="${isEditing}">${PENCIL_SVG}</button>
          </div>
          ${isEditing ? `
            <p class="muted past-hint">Sets with no ${timed ? 'time' : 'reps'} aren't saved.</p>
            <div class="set-grid">
              <div class="col-head">Set</div>
              ${weightHead(info, unit)}
              <div class="col-head">${timed ? 'Seconds' : 'Reps'}</div>
              ${rows}
            </div>`
            : logged.length ? setsList(logged, timed).replace('class="log-sets"', 'class="log-sets past-sets"')
            : '<p class="preview-last">No sets logged</p>'}
        </div>`;
    }).join('');

    // Save and Discard only show once there's something to save or discard.
    const editButtons = edit.editing != null || pastEditChanged() ? `
      <button class="btn btn-primary" data-action="past-save">Save changes</button>
      <button class="btn" data-action="past-discard">Discard changes</button>` : '';

    return {
      title: session.workoutName || 'Workout',
      back: '#/history',
      html: `
        ${session.quick ? '<p class="past-quick"><span class="tag tag-quick">Quick</span> Not in your week. It still counts as a day for your streak.</p>' : ''}
        <p class="past-date">${new Date(session.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        ${cards}
        <div class="finish-bar stack">
          ${editButtons}
          <button class="btn btn-danger" data-action="past-delete">Delete workout</button>
        </div>
      `,
    };
  },

  // A yes/no pop-up drawn into the overlay.
  // confirm/cancel = { label, action, id (optional, passed to the action) }; danger = the confirm button is red.
  // With no cancel, there's just the one button.
  confirmDialog({ title, lines, confirm, cancel, danger = false }) {
    return `
      <div class="card notice" role="dialog" aria-label="${esc(title)}">
        <h2>${esc(title)}</h2>
        ${lines.map(line => `<p>${esc(line)}</p>`).join('')}
        <div class="stack">
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="${confirm.action}" data-id="${esc(confirm.id ?? '')}">${esc(confirm.label)}</button>
          ${cancel ? `<button type="button" class="btn" data-action="${cancel.action}" data-id="${esc(cancel.id ?? '')}">${esc(cancel.label)}</button>` : ''}
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
  muscleMap({ mode, muscle, infoOpen }) {
    const values = mode === 'level' ? Stats.muscleLevels() : Stats.muscleGrowth();
    const colors = {};
    for (const id in MUSCLES) colors[id] = MapColors[mode](values[id]);

    const modes = { growth: 'Growth', level: 'Level' };
    const toggle = Object.entries(modes).map(([m, label]) => `
      <button type="button" class="segment ${m === mode ? 'is-active' : ''}" data-action="map-mode" data-id="${m}"
        aria-pressed="${m === mode}">${label}</button>`).join('');

    let legend, caption;
    if (mode === 'level') {
      const { bodyWeightLbs, sex } = Store.data.settings;
      caption = !bodyWeightLbs ? 'Log your body weight above to see levels'
        : !sex ? 'Pick your sex in Settings to see levels'
        : `Strength level vs. published standards (${STANDARDS_SOURCE})`;
      legend = `
        <div class="legend-levels">${LEVELS.map((label, i) =>
          `<span><i style="background:${LEVEL_COLORS[i]}"></i>${label}</span>`).join('')}</div>
        <p class="legend-empty"><i style="background:${MAP_EMPTY}"></i>No logged exercise with a standard</p>`;
    } else {
      caption = `Change in estimated max, last ${Stats.GROWTH_WEEKS} weeks`;
      legend = `
        <div class="legend-bar" style="background: linear-gradient(90deg, ${MapColors.growth(-GROWTH_SCALE)}, ${MapColors.growth(0)}, ${MapColors.growth(GROWTH_SCALE)})"></div>
        <div class="legend-labels"><span>−${GROWTH_SCALE}%</span><span>Flat</span><span>+${GROWTH_SCALE}%</span></div>
        <p class="legend-empty"><i style="background:${MAP_EMPTY}"></i>Not enough data yet (needs ${Stats.MIN_WEEKS} weeks of a primary exercise)</p>`;
    }

    return `
      <h2>Muscle map</h2>
      <div class="card">
        <div class="segmented">${toggle}</div>
        <p class="map-caption">${caption}
          <button type="button" class="info-btn" data-action="map-info" aria-label="How this is worked out" aria-expanded="${infoOpen}"><span>i</span></button>
        </p>
        <div class="map-info" id="map-info" ${infoOpen ? '' : 'hidden'}>${MAP_INFO[mode]}</div>
        <div class="body-map" id="body-map">
          ${bodyMapSvg(colors, muscle)}
        </div>
        ${muscle ? `<div class="muscle-card" id="muscle-card">${this.muscleCard(muscle, mode)}</div>` : ''}
        <div class="legend">${legend}</div>
      </div>`;
  },

  // The card under the map for a tapped muscle: its number and the exercises behind it,
  // best first, each opening its log. It also says why a muscle has no number.
  muscleCard(id, mode) {
    const head = result => `
      <div class="muscle-card-head">
        <strong>${MUSCLES[id]}</strong>
        <span>${result}</span>
        <button type="button" class="icon-btn" data-action="muscle-close" aria-label="Close">✕</button>
      </div>`;
    const row = (refId, name, detail, result = '') => `
      <button type="button" class="muscle-row" data-action="view-log" data-id="${esc(refId)}">
        <span class="muscle-row-main"><strong>${esc(name)}</strong><span>${detail}</span></span>
        <span class="muscle-row-result">${result}</span>
        ${CHEVRON}
      </button>`;
    const percent = pct => {
      const rounded = Math.round(pct);
      return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}%`;
    };
    const note = text => `<p class="muscle-note">${text}</p>`;

    if (mode === 'level') {
      const { bodyWeightLbs, sex } = Store.data.settings;
      if (!bodyWeightLbs) return head('—') + note('Log your body weight to see levels.');
      if (!sex) return head('—') + note('Pick your sex in Settings to see levels.');
      const list = Stats.exerciseLevels().filter(e => e.primary.includes(id)).sort((a, b) => b.level - a.level || b.max - a.max);
      if (!list.length) {
        return head('—') + note(Stats.hasStandards(id) ? 'No logged exercise with a standard trains this yet.'
          : 'No exercise with published standards trains this as a primary muscle.');
      }
      return head(LEVELS[list[0].level]) + list.map(e =>
        row(e.refId, e.name, `${Math.round(Number(Units.showWeight(e.max)))} ${Units.weightUnit()} estimated max`, LEVELS[e.level])).join('');
    }

    const all = Stats.exerciseGrowth().filter(e => e.primary.includes(id));
    const counted = all.filter(e => e.counts).sort((a, b) => b.change - a.change);
    const waiting = all.filter(e => !e.counts);
    const fromTo = e => Library.isTimed(e.refId) ? `${e.early} → ${e.recent} sec`
      : Library.isRepsOnly(e.refId) ? `${e.early} → ${e.recent} reps`
      : `${Math.round(Number(Units.showWeight(e.early)))} → ${Math.round(Number(Units.showWeight(e.recent)))} ${Units.weightUnit()}`;
    const countedRows = counted.map(e => row(e.refId, e.name, fromTo(e), percent(e.change))).join('');
    const waitingRows = waiting.length ? `
      <p class="muscle-sub">Not counted yet (needs ${Stats.MIN_WEEKS} weeks):</p>
      ${waiting.map(e => row(e.refId, e.name, `Logged ${e.weeks} week${e.weeks === 1 ? '' : 's'}`)).join('')}` : '';
    const average = counted.reduce((sum, e) => sum + e.change, 0) / counted.length;
    if (all.length) {
      return head(counted.length ? `${percent(average)} in ${Stats.GROWTH_WEEKS} weeks` : 'Not enough data') + countedRows + waitingRows;
    }
    // Nothing logged that trains it as a primary muscle: say so, and what's in the plan for it.
    const planned = Stats.weekPlannedSets().sources[id] || [];
    const secondary = planned.filter(s => s.role === 'secondary').map(s => s.name);
    const primary = planned.filter(s => s.role === 'primary').map(s => s.name);
    const named = names => esc(names.length > 1 ? `${names[0]} and others` : names[0]);
    return head('Not enough data')
      + note(`No exercise you've logged in the last ${Stats.GROWTH_WEEKS} weeks trains this as a primary muscle.`)
      + (primary.length ? note(`${named(primary)} in your plan will count once logged in ${Stats.MIN_WEEKS} different weeks.`) : '')
      + (secondary.length ? note(`It gets sets from ${named(secondary)}, but those only count toward its planned sets.`) : '');
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
  // state = { month: 'YYYY-MM' shown in the calendar (null = latest), day: 'YYYY-MM-DD' tapped (or null),
  //           range: how much of the graph shows: '3m', '1y' or 'all' }
  // A timed exercise (plank) shows its longest hold instead of an estimated max,
  // and a bodyweight exercise shows its max reps.
  exerciseLog(refId, state) {
    const history = Store.exerciseHistory(refId);
    const info = Library.get(refId);
    const name = info ? info.name : Store.loggedExercises().find(l => l.refId === refId)?.name || 'Unknown exercise';
    const timed = Library.isTimed(refId);
    // Timed and bodyweight exercises share one card: a top number and its graph, with no estimate.
    const repsOnly = Library.isRepsOnly(refId);
    const scored = timed || repsOnly;
    const scoreOf = h => (timed ? h.hold : h.topReps);
    const scoreLabel = timed ? 'Longest hold' : 'Max reps';
    const scoreUnit = value => (timed ? 'sec' : value === 1 ? 'rep' : 'reps');
    // With no history, the graph and calendar still show, empty, with a note over them.
    const first = history[0];
    const last = history[history.length - 1];
    const heading = `
      <h1 class="log-name">${esc(name)}</h1>
      <p class="log-first">${first ? `First logged ${fromDayKey(first.dayKey).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Not logged yet'}</p>`;

    const unit = Units.weightUnit();
    const weighted = history.filter(h => h.best);
    const latest = weighted[weighted.length - 1];
    // How far back the graph goes.
    const rangeDays = { '3m': 91, '1y': 365 }[state.range];
    const inRange = time => !rangeDays || time >= Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const points = (scored
      ? history.map(h => ({ time: new Date(h.date).getTime(), value: scoreOf(h), dayKey: h.dayKey }))
      : weighted.map(h => ({ time: new Date(h.date).getTime(), value: Number(Units.showWeight(h.best.max)), dayKey: h.dayKey })))
      .filter(p => inRange(p.time));
    // Actual max: the heaviest weight ever logged for a single rep (the first day it was lifted).
    // singlePoints = the heaviest single of each workout that had one, for the graph's white line.
    let single = null;
    const singlePoints = [];
    for (const h of scored ? [] : history) {
      const heaviest = Math.max(0, ...h.sets.filter(set => set.reps === 1 && set.weight).map(set => set.weight));
      if (!heaviest) continue;
      if (inRange(new Date(h.date).getTime())) singlePoints.push({ time: new Date(h.date).getTime(), value: Number(Units.showWeight(heaviest)) });
      if (!single || heaviest > single.weight) single = { weight: heaviest, date: h.date };
    }
    const emptyNote = !history.length ? 'No history yet' : !weighted.length && !scored ? 'No sets with weight yet' : 'Nothing in this time';
    const ranges = { '3m': '3 months', '1y': '1 year', all: 'All time' };
    const rangePicker = `
      <div class="segmented log-range">
        ${Object.entries(ranges).map(([id, label]) => `
          <button type="button" class="segment ${id === (state.range || 'all') ? 'is-active' : ''}" data-action="log-range" data-id="${id}"
            aria-pressed="${id === (state.range || 'all')}">${label}</button>`).join('')}
      </div>`;
    const top = scored && history.length ? history.reduce((a, b) => (scoreOf(b) > scoreOf(a) ? b : a)) : null;
    const maxSection = scored ? `
      <div class="card">
        <p class="log-label">${scoreLabel}</p>
        <p class="log-max ${top ? '' : 'is-blank'}">${top ? `${scoreOf(top)} <span>${scoreUnit(scoreOf(top))}</span>` : '—'}</p>
        <p class="log-sub">${top ? `On ${shortDate(top.date)}` : '&nbsp;'}</p>
        ${rangePicker}
        ${maxChart(points, emptyNote, [], scoreLabel, state.day)}
      </div>` : `
      <div class="card">
        <p class="log-label">Current estimated max</p>
        <p class="log-max ${latest ? '' : 'is-blank'}">${latest ? `${Units.showWeight(latest.best.max)} <span>${unit}</span>` : '—'}</p>
        <p class="log-sub">${latest ? `Best set on ${shortDate(latest.date)}: ${formatSet(latest.best.set)}` : '&nbsp;'}</p>
        <!-- Actual 1-rep max: one small line (many exercises are never done for 1 rep).
             With none logged it stays as a blank "—", so you can see it's tracked. -->
        <p class="log-actual">
          <span class="log-actual-label">Actual 1-rep max</span>
          ${single
            ? `<span class="log-actual-value">${Units.showWeight(single.weight)} ${unit}</span><span class="log-actual-date">· ${shortDate(single.date)}</span>`
            : '<span class="log-actual-value is-blank">—</span>'}
        </p>
        ${rangePicker}
        ${maxChart(points, emptyNote, singlePoints, 'Estimated max', state.day)}
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
        ${state.day ? logDayCard(history.filter(h => h.dayKey === state.day), state.day, timed)
          : history.length ? '<p class="muted log-hint">Tap a highlighted day to see its sets.</p>' : ''}
      `,
    };
  },

  // ---------- Settings (opened from the gear on Profile) ----------
  // Every setting lives in one form; app.js saves the whole form on any change.
  // To add a setting, add a field in settingsFields() (and see DEFAULT_SETTINGS in storage.js).
  settings() {
    const { lastBackupAt } = Store.data.settings;
    const customs = Store.data.customExercises.filter(e => !e.deleted);
    return {
      title: 'Settings',
      back: '#/profile',
      html: `
        <form id="settings-form">
          ${this.settingsFields()}
        </form>
        <p class="muted" style="font-size:14px">Changes save automatically and are included in backups.</p>

        <h2>Custom exercises</h2>
        ${customs.length ? `<div class="card custom-list">${customs.map(e => `
          <div class="custom-row">
            <span class="custom-info"><strong>${esc(e.name)}</strong><span>${esc(e.equipment)} · ${esc(Library.primaryLabel(e))}</span></span>
            <button type="button" class="btn btn-small btn-danger" data-action="delete-custom" data-id="${esc(e.id)}">Delete</button>
          </div>`).join('')}</div>`
          : '<p class="muted" style="font-size:14px">Exercises you create are saved here and can be added to any workout.</p>'}

        <h2>Backup</h2>
        <div class="row">
          <button class="btn" data-action="export">Export</button>
          <button class="btn" data-action="import">Import</button>
        </div>
        <p class="muted" style="font-size:14px">
          Your data lives only on this device. Export now and then to keep a copy safe.
          ${lastBackupAt ? `Last backup: ${shortDate(lastBackupAt)}.` : 'No backup yet.'}
        </p>
        <input type="file" id="import-file" accept=".json,application/json" hidden>

        <h2>Danger zone</h2>
        <button class="btn btn-danger" data-action="delete-all">Delete all data</button>
      `,
    };
  },

  // Units, About you and the weekly goal, in the form that Settings and the first-time setup share.
  // withBodyWeight = also ask for body weight (first-time setup only; after that it's on Profile).
  settingsFields(withBodyWeight = false) {
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

    return `
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
        ${withBodyWeight ? `
        <div>
          <label for="body-weight">Body weight</label>
          <div class="row range-row">
            <input id="body-weight" name="bodyWeight" type="text" inputmode="decimal"
              value="${Units.showWeight(s.bodyWeightLbs)}" placeholder="0">
            <span class="range-sep">${Units.weightUnit()}</span>
          </div>
        </div>` : ''}
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

      <h2>Weekly goal</h2>
      <div class="card stack">
        <div>
          <label>How many days a week are you trying to go?</label>
          ${goalPicker('weeklyGoal', s.weeklyGoal)}
        </div>
      </div>`;
  },
};
