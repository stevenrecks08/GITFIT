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
// On a bodyweight exercise (bw), the weight is added weight: "BW×10", or "BW+25×8".
function formatSet(set, timed = false, bw = false) {
  if (timed) return `${set.reps} sec`;
  if (bw && set.weight) return `BW+${Units.showWeight(set.weight)}×${set.reps}`;
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
function lastSummary(last, timed = false, bw = false) {
  return last ? `Last: ${last.sets.map(set => formatSet(set, timed, bw)).join(', ')}` : 'No history yet';
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
  const label = Library.isRepsOnly(info.id) ? 'Added weight' : 'Weight';
  return `<div class="col-head">${label} (${unit})${info.equipment === 'Dumbbell' ? '<span class="col-note">per dumbbell</span>' : ''}</div>`;
}

// A bodyweight exercise's weight box has "BW +" in front of it, since it's only added weight.
function bwBox(bw, box) {
  return bw ? `<div class="bw-box"><span>BW +</span>${box}</div>` : box;
}

// A set's number in the workout's set grid, or a green ✓ once its reps are typed (done).
// data-set-num lets app.js switch it as you type, without redrawing the screen.
function setNumber(exerciseId, index, done) {
  return `<div class="set-num ${done ? 'is-done' : ''}" data-set-num="${esc(exerciseId)}|${index}"
    aria-label="Set ${index + 1}${done ? ', logged' : ''}">${done ? '✓' : index + 1}</div>`;
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

// One exercise in a search list. isAdded = it's already in the workout being added to.
function libItem(e, action, meta, isAdded = false) {
  return `
    <button type="button" class="lib-item" data-action="${action}" data-id="${esc(e.id)}">
      <span class="lib-name">${esc(e.name)} ${e.custom ? '<span class="tag">Custom</span>' : ''}${isAdded ? '<span class="tag tag-added">✓ Added</span>' : ''}</span>
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
    <p>Best means estimated max: weight × (1 + reps ÷ 30). Bodyweight exercises use max reps, and planks use the longest hold. A bodyweight exercise with added weight counts separately, using its estimated max.</p>`,
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

// Sets per muscle (planned for the cycle or a workout, or logged in the last 7 days): a row with a
// bar for each muscle, under a small heading for its group. Tapping a muscle shows the exercises
// behind its number, each opening its workout (planned) or its log (logged).
// All the bars share one scale (the most-trained muscle fills its bar), so any two can be compared.
//   sets = Stats.cyclePlannedSets(), plannedSets([workout]) or actualSets()
//   open = Set of muscle ids that are expanded
//   hideEmpty = leave out muscles with no sets (a single workout, which would be full of zeros)
//   changed = Set of muscle ids that just changed (shown in green)
//   table = which list this is (data-table), so app.js remembers its open rows separately
//   empty = what it says when there's nothing at all
function plannedSetsTable(sets, open, { hideEmpty = false, changed = new Set(), table = 'planned', empty = 'No exercises planned yet.' } = {}) {
  const { muscles, sources } = sets;
  const values = Object.values(muscles);
  if (!values.length) return `<p class="empty">${empty}</p>`;
  const scale = Math.max(...values);

  const blocks = MUSCLE_GROUPS.map(group => {
    const rows = Object.entries(group.muscles).filter(([id]) => !hideEmpty || muscles[id]).map(([id, name]) => {
      const count = muscles[id] || 0;
      const isOpen = open.has(id);
      const list = sources[id] || [];
      const detail = list.length
        ? `<ul class="sets-sources">${list.map(s => `
            <li><button type="button" class="src-row" data-action="${s.action}" data-id="${esc(s.id)}">
              <span class="src-name">${esc(s.name)}<span class="src-where">${esc(s.where)}</span></span>
              <span class="src-role is-${s.role}">${s.role}</span>
              <span class="src-num">${setsText(s.sets)}</span>
            </button></li>`).join('')}</ul>`
        : `<p class="sets-none">${table === 'actual' ? 'Nothing logged trained this.' : 'No planned exercise trains this.'}</p>`;
      return `
        <div class="sets-block ${isOpen ? 'is-open' : ''}" data-block="${id}">
          ${setsRow('toggle-muscle', id, isOpen, name, count / scale, count,
            `is-muscle ${changed.has(id) ? 'is-changed' : ''}`)}
          <div class="collapse"><div class="collapse-inner">${detail}</div></div>
        </div>`;
    }).join('');
    return rows ? `<p class="sets-heading">${group.name}</p>${rows}` : '';
  }).join('');
  return `<div class="card sets-table" data-table="${table}">${blocks}</div>`;
}

// The "i" by planned sets, and what it opens.
function setsInfoButton(open) {
  return `<button type="button" class="info-btn" data-action="sets-info" aria-label="How planned sets work" aria-expanded="${open}"><span>i</span></button>`;
}
function setsInfoBox(open) {
  return `
    <div class="map-info" id="sets-info" ${open ? '' : 'hidden'}>
      <p>Each set counts as 1 set for an exercise's primary muscles, and ½ set for its secondary muscles.</p>
      <p>The cycle is one time through it: a workout that's in it twice counts twice.</p>
    </div>`;
}

// The thin planned sets strip pinned to the bottom of a workout's screen. Closed: one line of
// numbers, the muscles that just changed first (in green), then the most-trained. Tapping it opens
// the full list, with a switch between this workout and the whole cycle.
//   strip = { open, mode: 'workout' or 'cycle', infoOpen }   openRows = Set of muscle ids expanded in its list
//   changed = Set of muscle ids changed by the last edit
function plannedStrip(workout, strip, openRows, changed) {
  const cycle = strip.mode === 'cycle';
  const planned = cycle ? Stats.cyclePlannedSets() : Stats.plannedSets([workout]);
  const { muscles } = planned;
  const order = Object.keys(muscles).sort((a, b) => muscles[b] - muscles[a]).filter(id => !changed.has(id));
  const line = [...changed, ...order].map(id =>
    `<span class="${changed.has(id) ? 'is-changed' : ''}">${MUSCLES[id]} ${setsText(muscles[id] || 0)}</span>`).join(' · ');
  const segment = (id, label) => `
    <button type="button" class="segment ${strip.mode === id ? 'is-active' : ''}" data-action="strip-mode" data-id="${id}"
      aria-pressed="${strip.mode === id}">${label}</button>`;
  return `
    <div class="sets-strip ${strip.open ? 'is-open' : ''}" id="sets-strip">
      <button type="button" class="strip-bar" data-action="strip-toggle" aria-expanded="${strip.open}">
        <strong>${cycle ? 'Cycle' : 'Workout'}</strong>
        <span class="strip-line">${line || 'No exercises planned yet'}</span>
        ${CHEVRON}
      </button>
      <div class="collapse"><div class="collapse-inner"><div class="strip-panel">
        <p class="strip-title">Planned sets ${setsInfoButton(strip.infoOpen)}</p>
        ${setsInfoBox(strip.infoOpen)}
        <div class="segmented">${segment('workout', 'This workout')}${segment('cycle', 'Whole cycle')}</div>
        ${plannedSetsTable(planned, openRows, { hideEmpty: !cycle, changed, table: 'strip' })}
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
// format = how a number on the side is written (run times are minutes and seconds).
// dayAction = what tapping a dot runs (with its dayKey).
// better = which way is a new best: 'higher' (lifts), 'lower' (run times) or null (body weight, no
// bests). A dot that beat every dot before it is green (the theme's "done" color); the rest are white.
function maxChart(points, emptyNote, singles = [], label = 'Estimated max', selected = null, tight = false, format = Math.round, dayAction = 'log-day', better = 'higher') {
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
    <text class="chart-label" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`).join('');
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  // New bests: each point better than all before it (the first point has nothing to beat).
  const isBest = points.map((p, i) => better != null && i > 0 && points.slice(0, i).every(q =>
    (better === 'lower' ? p.value < q.value : p.value > q.value)));
  // Sizes (radius): 3 for a point (6px across), 4 for a new best (8px, plus a white ring from CSS),
  // 5 for the tapped day's point.
  const radius = (p, i) => (p.dayKey && p.dayKey === selected ? 5 : isBest[i] ? 4 : 3);
  const dots = points.map((p, i) => `<circle class="chart-dot ${isBest[i] ? 'is-pr' : ''}" cx="${x(p.time).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${radius(p, i)}"/>`).join('');
  // A bigger invisible circle over each dot, so it's easy to tap.
  const hits = points.filter(p => p.dayKey).map(p => `<circle class="chart-hit" cx="${x(p.time).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="14" data-action="${dayAction}" data-id="${p.dayKey}"/>`).join('');
  const singleLine = singles.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const singleDots = singles.map(p => `<circle class="chart-single-dot" cx="${x(p.time).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.5"/>`).join('');
  // The "Actual 1-rep" key only shows once a 1-rep set has been logged.
  const key = `
    <p class="chart-key">
      <span><i class="key-estimate"></i>${label}</span>
      ${singles.length ? '<span><i class="key-single"></i>Actual 1-rep</span>' : ''}
      ${isBest.some(Boolean) ? '<span><i class="key-pr"></i>New best</span>' : ''}
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
// prefix = the start of the action names its taps run: "log-day" and "log-month" for an exercise's log.
function logCalendar(month, logged, selected, minMonth, maxMonth, emptyNote, prefix = 'log') {
  const first = fromDayKey(`${month}-01`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const blanks = (first.getDay() + 6) % 7; // weeks start on Monday
  const today = dayKey(new Date());

  let cells = '<span></span>'.repeat(blanks);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    const classes = ['cal-day', key === today ? 'is-today' : '', key === selected ? 'is-selected' : ''].join(' ');
    cells += logged.has(key)
      ? `<button type="button" class="${classes} is-logged" data-action="${prefix}-day" data-id="${key}">${d}</button>`
      : `<span class="${classes}">${d}</span>`;
  }

  return `
    <div class="card calendar" data-month="${month}">
      <div class="cal-head">
        <button type="button" class="btn btn-small" data-action="${prefix}-month" data-id="-1"
          ${month <= minMonth ? 'disabled' : ''} aria-label="Previous month">‹</button>
        <strong>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" class="btn btn-small" data-action="${prefix}-month" data-id="1"
          ${month >= maxMonth ? 'disabled' : ''} aria-label="Next month">›</button>
      </div>
      <div class="cal-grid ${emptyNote ? 'is-empty' : ''}">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="cal-weekday">${d}</span>`).join('')}
        ${cells}
        ${emptyNote ? `<p class="empty-note"><span>${emptyNote}</span></p>` : ''}
      </div>
    </div>`;
}

// How an exercise has changed over the points on its graph: "+12% since Aug 3". Like the muscle map,
// it compares the best of the first and last 2 weeks (or less, on a short graph), so one bad
// workout doesn't decide it. points = oldest first, with at least 2 days needed.
function progressLine(points) {
  if (points.length < 2) return '';
  const t0 = points[0].time, t1 = points[points.length - 1].time;
  const ends = Math.min(14 * DAY_MS, (t1 - t0) / 2);
  const early = Math.max(...points.filter(p => p.time <= t0 + ends).map(p => p.value));
  const recent = Math.max(...points.filter(p => p.time >= t1 - ends).map(p => p.value));
  if (!early || dayKey(new Date(t0)) === dayKey(new Date(t1))) return '';
  const pct = Math.round((recent - early) / early * 100);
  const since = `since ${shortDate(t0)}`;
  return `<p class="log-change ${pct > 0 ? 'is-up' : ''}">${pct ? `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% ${since}` : `No change ${since}`}</p>`;
}

// Each time an exercise was done, newest first, each opening that workout.
// With a lot of them, only the newest show until Show all is tapped.
const LOG_LIST_SIZE = 10;
function logList(history, timed, showAll, bw) {
  const newest = [...history].reverse();
  const rows = (showAll ? newest : newest.slice(0, LOG_LIST_SIZE)).map(h => `
    <button type="button" class="muscle-row" data-action="open-session" data-id="${esc(h.sessionId)}">
      <span class="muscle-row-main">
        <strong>${shortDate(h.date)}</strong>
        <span>${h.sets.map(set => formatSet(set, timed, bw)).join(', ')}</span>
      </span>
      ${CHEVRON}
    </button>`).join('');
  const more = newest.length - LOG_LIST_SIZE;
  return `
    <div class="card log-list">
      ${rows}
      ${!showAll && more > 0 ? `<button type="button" class="text-btn" data-action="log-show-all">Show all ${newest.length}</button>` : ''}
    </div>`;
}

// A list of sets: Set, Weight, Reps. A timed exercise (plank) has Set and Seconds, with no weight.
// On a bodyweight exercise (bw), a set's weight shows as "BW" or "BW+25 lbs".
function setsList(sets, timed, bw = false) {
  const unit = Units.weightUnit();
  const rows = sets.map((set, i) => `
    <span>${i + 1}</span>
    <span>${timed ? '—' : set.weight == null ? 'BW' : `${bw ? 'BW+' : ''}${Units.showWeight(set.weight)} ${unit}`}</span>
    <span>${set.reps}</span>`).join('');
  return `
    <div class="log-sets">
      <span class="log-sets-head">Set</span><span class="log-sets-head">Weight</span><span class="log-sets-head">${timed ? 'Seconds' : 'Reps'}</span>
      ${rows}
    </div>`;
}

// The sets done on one day (all workouts that day), that day's estimated max (or longest hold,
// or max reps on a bodyweight exercise, plus an estimated max if it had added weight),
// and a way into each workout it was part of.
function logDayCard(entries, key, timed, bw) {
  const sets = entries.flatMap(h => h.sets);
  const maxes = entries.filter(h => h.best).map(h => h.best.max);
  const unit = Units.weightUnit();
  const topReps = Math.max(0, ...entries.map(h => h.topReps || 0));
  const summary = timed ? `Longest hold: <strong>${Math.max(...entries.map(h => h.hold))} sec</strong>`
    : [topReps ? `Max reps: <strong>${topReps}</strong>` : '',
      maxes.length ? `Estimated max: <strong>${Units.showWeight(Math.max(...maxes))} ${unit}</strong>` : ''].filter(Boolean).join(' · ');

  return `
    <div class="card log-day">
      <p class="log-day-date">${fromDayKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
      ${setsList(sets, timed, bw)}
      ${summary ? `<p class="log-day-max">${summary}</p>` : ''}
      <div class="stack log-day-links">
        ${entries.map(h => `<button type="button" class="btn btn-small" data-action="open-session" data-id="${esc(h.sessionId)}">See full workout: ${esc(h.workoutName || 'Workout')}</button>`).join('')}
      </div>
    </div>`;
}

// Cardio checkbox rows (today's on the Workouts tab, or "after every lift" at the end of a workout).
// rows = Cardio.rowsFor() or afterLiftRows(). Tapping an unchecked one logs it; a checked one opens
// to change it or uncheck it.
function cardioRows(rows) {
  const html = rows.map(({ day, plan, entry }) => {
    const item = entry || plan;
    const action = entry ? 'cardio-entry' : 'cardio-check';
    const id = entry ? entry.id : `${plan.id}|${day}`;
    return `
      <button type="button" class="cardio-row ${entry ? 'is-checked' : ''}" data-action="${action}" data-id="${esc(id)}"
        role="checkbox" aria-checked="${Boolean(entry)}">
        <span class="cardio-box" aria-hidden="true">${entry ? '✓' : ''}</span>
        <span class="cardio-row-text">
          <span class="cardio-row-name">${esc(Cardio.name(item))}</span>
          ${Cardio.summary(item) ? `<span class="cardio-row-meta">${esc(Cardio.summary(item))}</span>` : ''}
        </span>
      </button>`;
  }).join('');
  return html ? `<div class="cardio-rows">${html}</div>` : '';
}

// The weekly goal: chips 1 to 7, in the same style as the day chips.
function goalPicker(name, selected) {
  return `
    <div class="weekday-pick" role="radiogroup" aria-label="Workouts a week">
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

// A week's dates, Monday → Sunday: "Nov 2 – 8", or "Oct 26 – Nov 1" across two months.
// (The week starts at 3 am Monday, the same as the streak.)
function weekDates(now = Date.now()) {
  const start = weekStartOf(now);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const month = date => date.toLocaleDateString(undefined, { month: 'short' });
  return start.getMonth() === end.getMonth()
    ? `${month(start)} ${start.getDate()} – ${end.getDate()}`
    : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`;
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

// Short labels for the week strip, from each workout's name: its first letter, or more letters if
// a workout earlier in the cycle already has those (Push → P, Pull → Pu, Legs → L).
// Each split's workouts are labeled on their own, so a week with workouts from two splits (the
// week you switched) still shows each one's usual label.
// Returns { [workoutId]: label }.
function workoutLabels() {
  const labels = {};
  for (const split of Store.data.cycles) {
    const used = new Set();
    for (const w of new Set(Store.cycleWorkouts(split))) {
      const name = w.name.trim() || 'W';
      let n = 1;
      while (n < name.length && used.has(name.slice(0, n).toLowerCase())) n++;
      let label = name.slice(0, n);
      for (let k = 2; used.has(label.toLowerCase()); k++) label = name.slice(0, n) + k; // (the same name twice)
      used.add(label.toLowerCase());
      labels[w.id] = label;
    }
  }
  return labels;
}

// A finished workout's label: its workout's, or (a workout that's been deleted) its first letter.
function sessionLabel(session, labels) {
  return labels[session.workoutId] || (session.workoutName || 'W').trim().slice(0, 1);
}

// "last done today", "last done yesterday", "last done 3 days ago" or "never done", by the app's
// day (which changes at 3 am).
function lastDoneText(workoutId) {
  const last = Store.lastSessionFor(workoutId);
  if (!last) return 'never done';
  const days = Math.round((fromDayKey(appDay(Date.now())) - fromDayKey(appDay(last.date))) / DAY_MS);
  return days <= 0 ? 'last done today' : days === 1 ? 'last done yesterday' : `last done ${days} days ago`;
}

// "5 exercises · last done 3 days ago"
function workoutMeta(w) {
  const count = w.exercises.length;
  return `${count} exercise${count === 1 ? '' : 's'} · ${lastDoneText(w.id)}`;
}

const Views = {

  // ---------- Home: this week, Next Up, the rest of the cycle and today's cardio ----------
  // Next Up is the workout after the one you did last (Store.nextUp()), on a big card with Start.
  // Under it, "Then" lists the rest of the cycle in the order it's coming, each with its number in
  // the cycle (so it's clear where the cycle starts) and when it was last done; tapping one opens
  // its screen. A workout in progress takes Next Up's place, with Resume. Changing the cycle and
  // its planned sets are on the Edit cycle screen (cycleEdit()).
  home() {
    const draftWorkout = Store.draftWorkout();
    const cycle = Store.cycleItems(); // (of the split you're on)
    // A place's number in the cycle, the same as on Edit cycle (rest days count as places).
    const cycleNum = item => `<span class="cycle-num" aria-label="Number ${cycle.indexOf(item) + 1} in your cycle">${cycle.indexOf(item) + 1}</span>`;

    // This week: the streak, workouts so far against this week's goal, and Mon → Sun with a short
    // label on each day a workout was finished (two in a day: "P/L"). Today is outlined and days to
    // come are dimmed. A day with a workout opens Past workouts on that day.
    // The flame is green while the streak is alive (even before this week is hit, so mid-week
    // doesn't look like a lost streak), gray only at 0. Once this week is hit, "Week done ✓"
    // takes the place of "2/4 workouts".
    const { started, totals, week } = Streak.summary();
    const streak = started ? totals.current : 0;
    const labels = workoutLabels();
    const cells = Streak.weekDays().map(d => {
      const label = d.sessions.map(s => sessionLabel(s, labels)).join('/');
      const classes = ['wd-box', label ? 'has-workout' : '', d.today ? 'is-today' : '', d.future ? 'is-future' : ''].join(' ');
      const dayName = d.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
      const box = label
        ? `<button type="button" class="${classes}" data-action="week-day" data-id="${d.day}"
            aria-label="${esc(dayName)}: ${esc(d.sessions.map(s => s.workoutName).join(', '))}">${esc(label)}</button>`
        : `<span class="${classes}" aria-label="${esc(dayName)}">${d.date.getDate()}</span>`;
      return `
        <div class="wd">
          <span class="wd-name" aria-hidden="true">${d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
          ${box}
        </div>`;
    }).join('');
    const weekCard = `
      <div class="card week-card">
        <div class="week-card-top">
          <span class="streak-flame ${streak > 0 ? 'is-lit' : ''}">${FLAME_SVG}</span>
          <span class="week-card-streak"><strong>${streak}</strong> week streak</span>
          ${week.hit ? '<span class="week-card-done">Week done ✓</span>'
            : `<span class="week-card-count"><strong>${week.workouts}/${week.goal}</strong> workouts</span>`}
        </div>
        <div class="week-days">${cells}</div>
      </div>`;

    // The big card: the workout in progress (with its timer, sets so far and Resume), or else Next
    // Up (with Start). One card, so a workout in progress isn't shown twice.
    const next = Store.nextUp();
    // The place in the cycle the workout in progress counts as (none for a quick workout, or for
    // one started in another split before switching: the list below then starts with Next Up).
    const draftItem = draftWorkout && !draftWorkout.quick ? Store.getCycleItem(Store.data.draft.cycleItemId) : null;
    let hero;
    if (draftWorkout) {
      const totals = Store.draftTotals();
      const resume = `data-action="${draftWorkout.quick ? 'resume-quick' : 'open-workout'}" data-id="${esc(draftWorkout.id)}"`;
      hero = `
        <h2>In progress</h2>
        <div class="card next-up">
          <button class="workout-open" ${resume}>
            ${draftItem ? cycleNum(draftItem) : ''}
            <span class="next-up-main">
              <span class="workout-name">${esc(draftWorkout.name || 'Quick workout')}</span>
              <span class="day-meta"><span data-timer>${formatClock(Store.draftElapsed())}</span><span data-timer-paused ${Store.isDraftPaused() ? '' : 'hidden'}> · Paused</span> · ${totals.filled} / ${totals.total} sets</span>
            </span>
          </button>
          <button type="button" class="btn btn-primary" ${resume}>Resume</button>
        </div>`;
    } else if (next) {
      hero = `
        <h2>Next up</h2>
        <div class="card next-up">
          <button class="workout-open" data-action="open-slot" data-id="${esc(next.item.id)}">
            ${cycleNum(next.item)}
            <span class="next-up-main">
              <span class="workout-name">${esc(next.workout.name)}</span>
              <span class="day-meta">${workoutMeta(next.workout)}</span>
              ${next.restBefore ? '<span class="next-rest">Rest day planned before this one</span>' : ''}
            </span>
          </button>
          <button type="button" class="btn btn-primary" data-action="start-workout"
            data-id="${esc(next.workout.id)}" data-slot="${esc(next.item.id)}" ${next.workout.exercises.length ? '' : 'disabled'}>Start workout</button>
        </div>`;
    }
    // No workouts yet: the way to make the first one (under a quick workout in progress, if any).
    // (With no workouts there's no "Then" heading to hold the Edit cycle link. An empty split still
    // needs the link while there are other splits: Edit cycle is where you switch back to one.)
    if (!next) {
      hero = `${hero || ''}
        ${Store.data.cycles.length > 1
          ? '<div class="section-head"><h2>Next up</h2><a class="text-btn" href="#/cycle">Edit cycle</a></div>'
          : '<h2>Next up</h2>'}
        <div class="card next-up is-empty">
          <p class="week-hint">Your workouts make a cycle you go through in order, as many days a week as you like.</p>
          <button type="button" class="btn btn-primary" data-action="new-workout">Create your first workout</button>
        </div>`;
    }

    // "Then": the rest of the cycle, in the order it's coming. It starts after the workout on the
    // big card. (A quick workout in progress isn't in the cycle, so then the list starts with Next
    // Up itself, marked "Next".) Tapping a workout opens its screen, where Start workout is.
    let then = '';
    if (next) {
      const anchor = draftWorkout ? draftItem : next.item;
      const start = cycle.indexOf(anchor || next.item);
      const places = cycle.map((_, i) => cycle[(start + i) % cycle.length]).filter(item => item !== anchor);
      const rows = places.map(item => {
        if (item.kind === 'rest') {
          return `<div class="cycle-row is-rest">${cycleNum(item)}<span class="rest-word">Rest day</span></div>`;
        }
        const w = Store.getWorkout(item.workoutId);
        return `
          <button type="button" class="cycle-row" data-action="open-slot" data-id="${esc(item.id)}">
            ${cycleNum(item)}
            <span class="cycle-row-main">
              <span class="workout-title-line">
                <span class="workout-name">${esc(w.name)}</span>
                ${!anchor && item === next.item ? '<span class="tag tag-today">Next</span>' : ''}
              </span>
              <span class="day-meta">${workoutMeta(w)}</span>
            </span>
            ${CHEVRON}
          </button>`;
      });
      // With only one workout so far, the way to make the next one is right here.
      if (new Set(Store.cycleWorkouts()).size === 1) {
        rows.push('<button type="button" class="cycle-row is-add" data-action="new-workout">+ Add your next workout</button>');
      }
      then = `
        <div class="section-head">
          <h2>Then</h2>
          <a class="text-btn" href="#/cycle">Edit cycle</a>
        </div>
        ${rows.length ? `<div class="card cycle-rows">${rows.join('')}</div>` : ''}`;
    }

    // Today's cardio: planned on today's weekday, and anything logged today.
    const cardio = cardioRows(Cardio.rowsFor());

    return {
      title: 'GitFit',
      back: null,
      history: true,
      html: `
        ${weekCard}
        ${hero}
        ${then}
        ${cardio ? `<h2>Today's cardio</h2>${cardio}` : ''}

        <!-- (New workouts are made on Edit cycle, with + New workout.) -->
        <div class="fab-menu" id="fab-menu" aria-hidden="true">
          <button type="button" class="fab-option is-quick" data-action="quick-start">
            <strong>Quick workout</strong><span>A one-off, logged but not added to your cycle</span>
          </button>
          <button type="button" class="fab-option" data-action="add-cardio">
            <strong>Log cardio</strong><span>A walk, run, ride or hike, on any past date</span>
          </button>
        </div>
        <button type="button" class="fab" data-action="fab-menu" aria-label="Quick workout or log cardio" aria-expanded="false">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.6"
            stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      `,
    };
  },

  // ---------- Edit cycle: the cycle in order, and its planned sets ----------
  // Tap a workout to open its screen (to change its exercises); hold and drag a place to change the
  // order (see the drag code in app.js); ✕ takes a place out. The next one is marked; rest days are
  // small reminders. At the top: the name of the split you're on, and Switch cycle (a pop-up to
  // change to another split or make one, cycleSwitcher()).
  //   openSets = which planned-sets rows are expanded (a Set of muscle ids); setsInfoOpen = its "i" is open
  cycleEdit(openSets, setsInfoOpen) {
    const next = Store.nextUp();
    const hasWorkouts = Store.cycleWorkouts().length > 0;
    const remove = item => `
      <button type="button" class="icon-btn cycle-remove" data-action="cycle-remove" data-id="${esc(item.id)}"
        aria-label="Remove from cycle">✕</button>`;
    const items = Store.cycleItems().map((item, i) => {
      if (item.kind === 'rest') {
        return `
          <div class="cycle-item cycle-rest" data-cycle-item="${esc(item.id)}">
            <span class="cycle-num">${i + 1}</span>
            <span class="rest-word">Rest day</span>
            ${remove(item)}
          </div>`;
      }
      const w = Store.getWorkout(item.workoutId);
      const isNext = next && next.item === item;
      return `
        <div class="card workout-card cycle-item ${isNext ? 'is-next' : ''}" data-cycle-item="${esc(item.id)}">
          <span class="cycle-num">${i + 1}</span>
          <div class="workout-body">
            <button class="workout-open" data-action="open-slot" data-id="${esc(item.id)}">
              <span class="workout-title-line">
                <span class="workout-name">${esc(w.name)}</span>
                ${isNext ? '<span class="tag tag-today">Next</span>' : ''}
              </span>
              <span class="day-meta">${workoutMeta(w)}</span>
            </button>
          </div>
          ${remove(item)}
        </div>`;
    }).join('');
    return {
      title: 'Edit cycle',
      back: '#/',
      html: `
        <div class="section-head cycle-head">
          <h2>${esc(Store.activeCycle().name)}</h2>
          <button type="button" class="text-btn" data-action="switch-cycle">Switch cycle</button>
        </div>
        ${items ? `
          <div id="cycle-list">${items}</div>
          <p class="muted cycle-tip">Tap a workout to change its exercises. Hold and drag to change the order.</p>`
          : '<p class="empty">Your cycle is empty. Add a workout to start one.</p>'}
        <!-- A new workout is what's wanted most, so it has the wide button. Putting a workout
             in the cycle a second time and rest days are the smaller ones under it. -->
        <div class="cycle-add stack">
          <button type="button" class="btn" data-action="new-workout">+ New workout</button>
          <div class="row">
            ${hasWorkouts ? '<button type="button" class="btn" data-action="cycle-add-open">+ Repeat a workout</button>' : ''}
            <button type="button" class="btn" data-action="cycle-add-rest">+ Add rest day</button>
          </div>
        </div>
        ${hasWorkouts ? `
          <h2>Planned sets per cycle ${setsInfoButton(setsInfoOpen)}</h2>
          ${setsInfoBox(setsInfoOpen)}
          ${plannedSetsTable(Stats.cyclePlannedSets(), openSets)}` : ''}
      `,
    };
  },

  // ---------- New workout, or a copy of one: a pop-up that only asks for the title ----------
  // (It used to be a page of its own; a pop-up is one screen less on the way to adding exercises.)
  // source = the workout being copied, or null for a new one. Either way it goes at the end of
  // the cycle. It's a form so the keyboard's Go button creates it too (see the overlay's 'submit'
  // in app.js).
  newWorkoutDialog(source = null) {
    const count = source ? source.exercises.length : 0;
    return `
      <form id="new-workout-form" class="card notice stack" role="dialog" aria-label="${source ? 'Copy workout' : 'New workout'}"
        data-copy="${esc(source ? source.id : '')}" autocomplete="off">
        <div>
          <label for="new-workout-name">${source ? 'Title of the copy' : 'New workout title'}</label>
          <input id="new-workout-name" name="name" value="${esc(source ? source.name : '')}" placeholder="e.g. Push, Legs, Upper (arm focus)" required>
        </div>
        <p class="muted">${source ? `Copies all ${count} exercise${count === 1 ? '' : 's'} from ${esc(source.name)}. The copy is its own workout: changing one won't change the other. ` : ''}It goes at the end of your cycle.</p>
        <button type="submit" class="btn btn-primary">${source ? 'Create copy' : 'Create workout'}</button>
        <button type="button" class="btn" data-action="dialog-cancel">Cancel</button>
      </form>`;
  },

  // The add/edit exercise panel, in a card on a workout's screen or at the end of its list.
  // It has three steps: pick from library → (or create custom) → sets & reps.
  // picker = what it shows (see app.js); canClose = the search has a way to close it;
  // added = the exercises already in this workout (a Set of their ids), marked in the search
  exercisePanel(picker, editing, canClose, added) {
    if (picker.mode === 'custom') return this.customExerciseForm(picker);
    if (picker.mode === 'details') return this.exerciseDetailsForm(picker, editing);
    if (picker.mode === 'move') return this.moveExercisePicker(editing);
    return this.exercisePicker(picker, editing, canClose, added);
  },

  // Move an exercise to another workout: its other workouts, in cycle order.
  moveExercisePicker(exercise) {
    const others = [...new Set(Store.cycleWorkouts())].filter(w => !w.exercises.includes(exercise));
    return `
      <div class="card stack">
        <p class="muted move-title">Move to:</p>
        <div class="lib-results">
          ${others.map(w => `
            <button type="button" class="lib-item" data-action="move-confirm" data-id="${esc(w.id)}">
              <span class="lib-name">${esc(w.name)}</span>
              <span class="lib-meta">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'}</span>
            </button>`).join('')}
        </div>
        <button type="button" class="btn" data-action="move-cancel">Cancel</button>
      </div>`;
  },

  // "+ Repeat a workout" on Edit cycle: puts one of your workouts in the cycle another time
  // (Push, Pull, Legs, Push). New workouts have their own button there.
  cycleAddPicker() {
    const room = Store.cycleHasRoom();
    const workouts = [...new Set(Store.cycleWorkouts())];
    return `
      <div class="card notice stack" role="dialog" aria-label="Repeat a workout in the cycle">
        <h2>Repeat a workout</h2>
        ${room ? `
          <p class="muted move-title">It goes in your cycle another time, at the end. It's the same workout, not a copy.</p>
          <div class="lib-results">
            ${workouts.map(w => `
              <button type="button" class="lib-item" data-action="cycle-add-workout" data-id="${esc(w.id)}">
                <span class="lib-name">${esc(w.name)}</span>
                <span class="lib-meta">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'}</span>
              </button>`).join('')}
          </div>`
          : `<p class="muted">Your cycle has ${MAX_CYCLE_WORKOUTS} workouts, the most it can hold. Remove one to add another.</p>`}
        <button type="button" class="btn" data-action="dialog-cancel">Cancel</button>
      </div>`;
  },

  // ---------- Switch cycle: a pop-up on Edit cycle ----------
  // Your splits, one row each: tap one to switch to it (the one you're on says "Selected"), or its
  // pencil to rename or delete it. Under them, + Create split and Done. It stays open while you
  // switch, so the split behind it can be seen changing; Done closes it.
  cycleSwitcher() {
    const active = Store.activeCycle();
    const rows = Store.data.cycles.map(split => {
      const names = Store.cycleWorkouts(split).map(w => w.name);
      const on = split === active;
      return `
        <div class="split-row">
          <button type="button" class="workout-open" data-action="split-pick" data-id="${esc(split.id)}" aria-pressed="${on}">
            <span class="workout-title-line">
              <span class="workout-name">${esc(split.name)}</span>
              ${on ? '<span class="tag tag-today">Selected</span>' : ''}
            </span>
            <span class="day-meta">${names.length ? esc(names.join(' · ')) : 'No workouts yet'}</span>
          </button>
          <button type="button" class="icon-btn" data-action="split-edit" data-id="${esc(split.id)}"
            aria-label="Rename or delete ${esc(split.name)}">${PENCIL_SVG}</button>
        </div>`;
    }).join('');
    return `
      <div class="card notice stack" role="dialog" aria-label="Switch cycle">
        <h2>Your splits</h2>
        <div class="split-list">${rows}</div>
        <button type="button" class="btn" data-action="split-new">+ Create split</button>
        <button type="button" class="btn btn-primary" data-action="dialog-cancel">Done</button>
      </div>`;
  },

  // + Create split: asks for its name, then how it starts: empty, or with a copy of the workouts
  // of the split you're on (the user's choice; only offered when that split has workouts).
  // It's a form, so the keyboard's Go button makes an empty one (see the overlay's 'submit' in
  // app.js). Cancel goes back to the list of splits.
  newCycleDialog() {
    const active = Store.activeCycle();
    const canCopy = Store.cycleWorkouts().length > 0;
    return `
      <form id="new-cycle-form" class="card notice stack" role="dialog" aria-label="Create split" autocomplete="off">
        <div>
          <label for="new-cycle-name">New split name</label>
          <input id="new-cycle-name" name="name" maxlength="40" placeholder="e.g. Push Pull Legs, Upper Lower" required>
        </div>
        ${canCopy ? `<p class="muted">Start it empty, or with a copy of every workout in ${esc(active.name)}. The copies are their own workouts: changing one split won't change the other.</p>` : ''}
        <button type="submit" class="btn btn-primary">${canCopy ? 'Start empty' : 'Create split'}</button>
        ${canCopy ? `<button type="button" class="btn" data-action="split-create-copy">Copy ${esc(active.name)}</button>` : ''}
        <button type="button" class="btn" data-action="switch-cycle">Cancel</button>
      </form>`;
  },

  // A split's pencil in the Switch cycle pop-up: its name, and Delete split (the only split left
  // can't be deleted, so there's always a cycle). Done saves the name and goes back to the list.
  cycleDetails(split) {
    return `
      <form id="cycle-details-form" class="card notice stack" role="dialog" aria-label="Edit ${esc(split.name)}"
        data-id="${esc(split.id)}" autocomplete="off">
        <div>
          <label for="cycle-name">Split name</label>
          <input id="cycle-name" name="name" maxlength="40" value="${esc(split.name)}" placeholder="e.g. Push Pull Legs, Upper Lower">
        </div>
        <button type="submit" class="btn btn-primary">Done</button>
        ${Store.data.cycles.length > 1
          ? `<button type="button" class="btn btn-danger" data-action="split-delete" data-id="${esc(split.id)}">Delete split</button>`
          : '<p class="muted split-only">This is your only split, so it can\'t be deleted.</p>'}
      </form>`;
  },

  // The title, Copy and Delete of a workout (the pencil at the top of its screen).
  // It's a pop-up, so what's typed is saved by Done (see 'details-done' in app.js).
  workoutDetails(workout) {
    return `
      <div class="card notice stack" role="dialog" aria-label="Edit ${esc(workout.name)}">
        <div>
          <label for="workout-name">Title</label>
          <input id="workout-name" value="${esc(workout.name)}" placeholder="e.g. Push, Legs, Upper (arm focus)" autocomplete="off">
        </div>
        <button type="button" class="btn btn-primary" data-action="details-done">Done</button>
        <button type="button" class="btn" data-action="copy-workout" data-id="${workout.id}">Copy workout</button>
        <button type="button" class="btn btn-danger" data-action="delete-workout" data-id="${workout.id}">Delete workout</button>
      </div>`;
  },

  // Step 1: search the library and tap an exercise.
  exercisePicker(picker, editing, canClose, added) {
    return `
      <div class="card stack">
        <input type="search" id="lib-search" value="${esc(picker.query)}"
          placeholder="Search exercises" autocomplete="off" aria-label="Search exercises by name, muscle or equipment">
        <div id="lib-results" class="lib-results">${this.libraryResults(picker.query, 'pick-exercise', picker.group, { added })}</div>
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
  // added = the exercises already in the workout being added to (a Set of ids): they get an
  //   "Added" tag, so the same one isn't put in twice by mistake (it still can be).
  // similarTo = for Swap for today, the planned exercise: before you type, the list starts with
  //   exercises for the same muscles, since a swap is nearly always one of those.
  // (app.js passes the same options when it redraws this list: libraryOptions().)
  libraryResults(query, action = 'pick-exercise', group = null, { added = new Set(), similarTo = null } = {}) {
    const item = e => libItem(e, action, undefined, added.has(e.id));
    if (!query.trim()) {
      const chips = `
        <div class="browse-chips">
          ${MUSCLE_GROUPS.map(g => `
            <button type="button" class="chip-btn ${g.name === group ? 'is-picked' : ''}" data-action="browse-group"
              data-id="${g.name}" data-target="${action}">${g.name}</button>`).join('')}
        </div>`;
      if (group) return chips + Library.inGroup(group).map(item).join('');
      if (action === 'open-log') {
        const logged = Store.loggedExercises();
        return chips + (logged.length
          ? `<p class="lib-head">Your exercises</p>${logged.map(l => libItem({ id: l.refId, name: l.name }, action,
              `Last ${shortDate(l.date)} · ${l.count} workout${l.count === 1 ? '' : 's'}`)).join('')}`
          : '<p class="empty">Exercises you log will show here.</p>');
      }
      const similar = similarTo ? Library.similarTo(similarTo) : [];
      const recent = Store.loggedExercises().map(l => Library.get(l.refId))
        .filter(e => e && !e.deleted && e.id !== similarTo && !similar.includes(e)).slice(0, 6);
      return chips
        + (similar.length ? `<p class="lib-head">Similar exercises</p>${similar.map(item).join('')}` : '')
        + (recent.length ? `<p class="lib-head">Recent</p>${recent.map(item).join('')}` : '');
    }
    const { results, total } = Library.search(query);
    if (!results.length) {
      const canCreate = ['pick-exercise', 'swap-pick', 'quick-pick'].includes(action);
      return `<p class="empty">No matches.${canCreate ? ' Create it as a custom exercise.' : ''}</p>`;
    }
    const more = total > results.length
      ? `<p class="lib-more">Showing the best ${results.length} of ${total} — keep typing to narrow it down.</p>` : '';
    return results.map(item).join('') + more;
  },

  // Step 2: sets and reps for the picked exercise.
  exerciseDetailsForm(picker, editing) {
    const info = Library.forExercise({ refId: picker.refId });
    const timed = Library.isTimed(picker.refId);
    // A new one starts with what you last used for it, if anything.
    const form = editing || Store.lastTargets(picker.refId) || (timed ? { sets: 3, repMin: 30, repMax: 60 } : { sets: 3, repMin: 8, repMax: 12 });
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
        ${editing && new Set(Store.cycleWorkouts()).size > 1 ? '<button type="button" class="text-btn" data-action="move-open">Move to another workout</button>' : ''}
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

  // ---------- A planned workout before it's started: look at it and change it, on one screen ----------
  // Each exercise is one short row (its target, and last time's sets on one line), so the whole
  // workout fits on a screen. Tapping a row opens it up, with a down arrow to show that it does:
  // last time's sets in full, its note, and Edit (its sets & reps, inside its card) and Log.
  // Hold and drag a row to change the order (app.js). The pencil at the top has the title, copy
  // and delete. Start workout is what starts it (and its timer).
  //   ui = { picker (the add/edit panel, see app.js), strip and stripRows (the planned sets strip),
  //          changed (muscles changed by the last edit), open (a Set: the exercises opened up) }
  workoutPreview(workout, ui) {
    const { picker } = ui;
    const hasExercises = workout.exercises.length > 0;
    const editing = workout.exercises.find(e => e.id === picker.exerciseId);
    // A workout with nothing in it opens ready to add to.
    const adding = !editing && (picker.adding || !hasExercises);
    // The exercises already here, so the search can mark them.
    const added = new Set(workout.exercises.map(e => e.refId));

    const cards = workout.exercises.map((ex, i) => {
      const info = Library.forExercise(ex);
      const timed = Library.isTimed(ex.refId);
      const bw = Library.isRepsOnly(ex.refId);
      const last = Store.lastResult(ex);
      const title = `
        <span class="ex-num">${i + 1}</span>
        <span class="ex-toggle-main">
          <span class="ex-title">${esc(info.name)}</span>
          <span class="ex-sub">Target ${targetText(ex, timed)}</span>`;

      // Being edited: its sets & reps take the place of the rest of the card.
      if (ex === editing) {
        return `
          <div class="card preview-ex is-editing" data-plan-ex="${ex.id}">
            <div class="preview-head">${title}</span></div>
            <div id="exercise-panel">${this.exercisePanel(picker, editing, false, added)}</div>
          </div>`;
      }

      const isOpen = ui.open.has(ex.id);
      return `
        <div class="card preview-ex ${isOpen ? 'is-open' : ''}" data-plan-ex="${ex.id}">
          <button type="button" class="preview-head preview-toggle" data-action="toggle-plan-ex" data-id="${ex.id}" aria-expanded="${isOpen}">
            ${title}
              ${last ? `<span class="ex-sub preview-line">${lastSummary(last, timed, bw)}</span>` : ''}
              ${nextWeightNote(ex)}
            </span>
            ${CHEVRON}
          </button>
          <div class="collapse"><div class="collapse-inner"><div class="preview-more">
            ${last
              ? `<p class="preview-last">Last time · ${formatDate(last.date)}</p>${setsList(last.sets, timed, bw)}`
              : '<p class="preview-last">No history yet</p>'}
            ${noteBox(ex.refId)}
            <div class="row preview-actions">
              <button type="button" class="btn btn-small" data-action="edit-exercise" data-id="${ex.id}">${PENCIL_SVG} Edit</button>
              ${logButton(ex.refId)}
            </div>
          </div></div></div>
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
          ${adding ? `<h2>Add exercise</h2><div id="exercise-panel">${this.exercisePanel(picker, null, hasExercises, added)}</div>`
            : '<button type="button" class="btn btn-add-ex" data-action="add-exercise">+ Add exercise</button>'}
          ${hasExercises ? `<p class="muted preview-tip">Tap an exercise to see last time, add a note or edit it. Hold and drag to change the order.</p>
            <p class="muted preview-tip">Only log your working sets, not your warm-ups.</p>` : ''}
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
      const bw = Library.isRepsOnly(refId);
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
          // The set's number becomes a green ✓ once its reps are typed (app.js updates it as you type).
          return `
            ${setNumber(ex.id, i, set.reps !== '' && set.reps != null)}
            ${timed ? LOCKED_WEIGHT : bwBox(bw, `<input type="text" inputmode="decimal" value="${Units.showWeight(set.weight)}" placeholder="${bw ? '' : unit}"
              data-ex="${ex.id}" data-set="${i}" data-field="weight" aria-label="Set ${i + 1} ${bw ? 'added ' : ''}weight in ${unit}">`)}
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
            <div id="swap-results" class="lib-results">${this.libraryResults(swap.query, 'swap-pick', null, { similarTo: ex.refId })}</div>
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
      return `
        <div class="card workout-ex ${isOpen ? 'is-open' : ''}" id="ex-${ex.id}" ${ex.today ? '' : `data-plan-ex="${ex.id}"`}>
          <button class="ex-toggle" data-action="toggle-exercise" data-id="${ex.id}" aria-expanded="${isOpen}">
            <span class="ex-num">${i + 1}</span>
            <span class="ex-toggle-main">
              <span class="ex-title">${esc(info.name)}</span>
              ${swapped ? `<span class="ex-sub swap-note">Swapped for today · planned: ${esc(plannedName)}</span>` : ''}
              ${ex.today ? '<span class="ex-sub swap-note">Added for today only</span>' : ''}
              <span class="ex-sub">${lastSummary(last, timed, bw)}</span>
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
      ${workout.exercises.length ? '' : '<p class="muted quick-hint">Add the exercises you do as you go. This workout won\'t be added to your cycle or count toward your streak.</p>'}` : '';
    const quickBottom = quickAdd.creating ? this.customExerciseForm(picker, 'Save and add') : quickAdd.open ? `
      <div class="card stack" id="quick-add-panel">
        ${quick ? '' : '<p class="muted add-today-note">Just for today: your plan stays the same.</p>'}
        <input type="search" id="quick-search" value="${esc(quickAdd.query)}"
          placeholder="Search exercises" autocomplete="off" aria-label="Search exercises to add, by name, muscle or equipment">
        <div id="quick-results" class="lib-results">${this.libraryResults(quickAdd.query, 'quick-pick')}</div>
        <button type="button" class="btn" data-action="quick-new-custom">+ Create custom exercise</button>
        <button type="button" class="btn" data-action="quick-add-cancel">Cancel</button>
      </div>` : `
      <button type="button" class="btn btn-add-ex" data-action="quick-add-open">+ Add exercise${quick ? '' : ' for today'}</button>`;

    // "After every lift" cardio, to check off at the end (planned on the Cardio tab).
    const afterLift = cardioRows(Cardio.afterLiftRows());

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
        ${afterLift ? `<div class="after-lift"><h2>Cardio after your lift</h2>${afterLift}</div>` : ''}
        <div class="finish-bar stack">
          <button class="btn btn-primary" data-action="finish">Finish workout</button>
          <button class="btn btn-danger" data-action="discard">Discard workout</button>
        </div>
      `,
    };
  },

  // ---------- Profile: avatar + name. Settings open from the gear in the top bar. ----------
  // map = the muscle map: { mode ('growth' or 'level'), muscle (the tapped muscle or null), infoOpen }
  // openActual = which rows of "Actual sets, last 7 days" are expanded (a Set of muscle ids)
  profile(map, openActual) {
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
        <h2>Actual sets, last 7 days</h2>
        ${plannedSetsTable(Stats.actualSets(), openActual, { table: 'actual', empty: 'Sets you log will show here, counted over the last 7 days.' })}
      `,
    };
  },

  // A small reminder once there's something to lose and no backup in the last 30 days.
  backupReminder() {
    const { lastBackupAt } = Store.data.settings;
    if (!Store.data.sessions.length && !Store.data.cardioLog.length) return '';
    const days = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / (24 * 60 * 60 * 1000)) : null;
    if (days != null && days < BACKUP_REMINDER_DAYS) return '';
    return `
      <div class="card backup-note">
        <span>${days == null ? 'You haven\'t backed up yet.' : `Last backup: ${days} days ago.`} Your data only lives on this device.</span>
        <button type="button" class="btn btn-small" data-action="export">Back up</button>
      </div>`;
  },

  // ---------- Cardio ----------

  // The Cardio tab: this week (no goal and nothing negative), planned cardio, a calendar and every
  // entry, newest first. Planned items go above the calendar since the entry list keeps growing.
  // state = { month ('YYYY-MM', null = this month), day (the day tapped, or null) }
  cardio(state) {
    const { sessions, minutes } = Cardio.thisWeek();
    const plans = Store.data.cardioPlans;
    const planRow = plan => `
      <div class="custom-row">
        <span class="custom-info">
          <strong>${esc(Cardio.name(plan))}</strong>
          <span>${esc(Cardio.daysText(plan))}</span>
          ${Cardio.summary(plan) ? `<span>${esc(Cardio.summary(plan))}</span>` : ''}
        </span>
        <button type="button" class="btn btn-small" data-action="cardio-plan-edit" data-id="${esc(plan.id)}">Edit</button>
        <button type="button" class="btn btn-small btn-danger" data-action="cardio-plan-delete" data-id="${esc(plan.id)}">Delete</button>
      </div>`;
    const log = Cardio.newestFirst();
    const logged = new Set(log.map(e => e.day));
    const thisMonth = dayKey(new Date()).slice(0, 7);
    const firstMonth = log.length ? log[log.length - 1].day.slice(0, 7) : thisMonth;
    const day = logged.has(state.day) ? state.day : null;
    const row = e => `
      <div class="custom-row">
        <span class="custom-info">
          <strong>${esc(Cardio.name(e))}</strong>
          <span>${fromDayKey(e.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span>${esc(Cardio.summary(e))}</span>
        </span>
        <button type="button" class="btn btn-small" data-action="cardio-log-edit" data-id="${esc(e.id)}">Edit</button>
        <button type="button" class="btn btn-small btn-danger" data-action="cardio-log-delete" data-id="${esc(e.id)}">Delete</button>
      </div>`;
    const dayCard = day ? `
      <div class="card log-day">
        <p class="log-day-date">${fromDayKey(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        ${log.filter(e => e.day === day).map(e => `
          <p class="cardio-day-entry"><strong>${esc(Cardio.name(e))}</strong><span>${esc(Cardio.summary(e))}</span></p>`).join('')}
      </div>` : '';
    return {
      title: 'Cardio',
      back: null,
      html: `
        <div class="card cardio-week">This week: ${sessions} session${sessions === 1 ? '' : 's'} · ${minutes} min</div>
        <button type="button" class="btn btn-primary" data-action="add-cardio">+ Add cardio</button>

        <h2>Planned cardio</h2>
        ${plans.length
          ? `<div class="card custom-list cardio-plan-list">${plans.map(planRow).join('')}</div>`
          : '<p class="muted cardio-plan-note">Planned cardio shows as a checkbox: on the Workouts tab on its days, or at the end of every workout if you pick After every lift.</p>'}
        <button type="button" class="btn" data-action="cardio-plan-new">+ New planned cardio</button>

        ${this.cardioGraph(state)}

        <h2>Log</h2>
        ${logCalendar(state.month || thisMonth, logged, day, firstMonth, thisMonth, log.length ? '' : 'Cardio you log will show here', 'cardio')}
        ${dayCard}
        ${log.length ? `<h2>Every entry</h2><div class="card custom-list">${log.map(row).join('')}</div>` : ''}`,
    };
  },

  // A graph of times for one race distance, with a switch between the distances.
  // It opens on the distance run most recently. state.graph = the label picked, if any.
  cardioGraph(state) {
    const latestOf = d => Cardio.runsOf(d.miles).at(-1)?.day || '';
    const recent = [...RUN_GRAPHS].sort((a, b) => (latestOf(a) < latestOf(b) ? 1 : -1))[0];
    const picked = RUN_GRAPHS.find(d => d.label === state.graph)
      || (latestOf(recent) ? recent : RUN_GRAPHS.find(d => d.label === '5K'));
    const runs = Cardio.runsOf(picked.miles);
    const clock = seconds => formatClock(seconds * 1000);
    const latest = runs[runs.length - 1];
    const best = runs.reduce((top, run) => (!top || run.seconds < top.seconds ? run : top), null);
    // Like the exercise log, the best only gets a line when the latest isn't it.
    const sub = !latest ? '&nbsp;'
      : best.seconds < latest.seconds ? `Best ${clock(best.seconds)} on ${shortDate(fromDayKey(best.day))}`
      : `Logged ${shortDate(fromDayKey(latest.day))}`;
    // Tapping a dot opens its day on the calendar below (see 'cardio-dot' in app.js).
    const points = runs.map(run => ({ time: fromDayKey(run.day).getTime(), value: run.seconds, dayKey: run.day }));
    return `
      <h2>Run times</h2>
      <div class="card">
        <div class="segmented log-switch">
          ${RUN_GRAPHS.map(d => `
            <button type="button" class="segment ${d === picked ? 'is-active' : ''}" data-action="cardio-graph" data-id="${d.label}" aria-pressed="${d === picked}">${d.label}</button>`).join('')}
        </div>
        <p class="log-max ${latest ? '' : 'is-blank'}">${latest ? clock(latest.seconds) : '—'}</p>
        <p class="log-sub">${sub}</p>
        ${maxChart(points, `Log a ${picked.label === '5K' ? '5K' : '1 mile run'} to start the graph`, [], 'Time (lower is faster)', state.day, true, clock, 'cardio-dot', 'lower')}
      </div>`;
  },

  // The pop-up for one cardio entry or planned item.
  // form = cardioForm in app.js: { kind: 'entry' | 'plan', id (null = new), from: 'week' | 'log' | null, … }
  cardioForm(form) {
    const isPlan = form.kind === 'plan';
    const type = CARDIO_TYPES[form.type];
    const box = (id, label, value, placeholder = '0', keyboard = 'decimal') => `
      <div>
        <label for="cardio-${id}">${label}</label>
        <input id="cardio-${id}" type="text" inputmode="${keyboard}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
      </div>`;
    // A run's time has seconds too, since they change the pace.
    const time = () => (form.type === 'run' ? `
      <div>
        <label for="cardio-minutes">Time</label>
        <div class="row range-row">
          <input id="cardio-minutes" type="text" inputmode="numeric" value="${form.seconds ? Math.floor(form.seconds / 60) : ''}" placeholder="0" aria-label="Minutes">
          <span class="range-sep">min</span>
          <input id="cardio-secs" type="text" inputmode="numeric" value="${form.seconds ? Math.round(form.seconds % 60) : ''}" placeholder="0" aria-label="Seconds">
          <span class="range-sep">sec</span>
        </div>
        <p class="cardio-pace" id="cardio-pace">${Cardio.paceText(form.miles, form.seconds) ? `Pace: ${Cardio.paceText(form.miles, form.seconds)}` : ''}</p>
      </div>` : box('minutes', 'Minutes', form.seconds ? String(Number((form.seconds / 60).toFixed(1))) : ''));
    const where = () => `
      <div class="segmented">
        ${[['outside', 'Outside'], ['treadmill', 'Treadmill']].map(([id, label]) => `
          <button type="button" class="segment ${(form.where || 'outside') === id ? 'is-active' : ''}" data-action="cardio-where" data-id="${id}">${label}</button>`).join('')}
      </div>`;
    const fieldHtml = {
      seconds: time,
      miles: () => `
        ${box('miles', `Distance (${Units.distanceUnit()})`, Units.showDistance(form.miles))}
        ${form.type === 'run' ? `
          <div class="cardio-distances">
            ${RUN_DISTANCES.map(d => `
              <button type="button" class="cardio-distance ${d.miles === form.miles ? 'is-active' : ''}" data-action="cardio-distance" data-id="${d.miles}">${d.label}</button>`).join('')}
          </div>` : ''}`,
      feet: () => box('feet', `Elevation (${Units.elevationUnit()})`, Units.showElevation(form.feet)),
      mph: () => box('mph', `Speed (${Units.speedUnit()})`, Units.showSpeed(form.mph)),
      incline: () => box('incline', 'Incline (%)', form.incline ?? ''),
      where,
    };
    // Checking off a planned item: just the numbers it's missing. The name, date and everything
    // else planned are already known, and show on the line under its name.
    if (form.quick) {
      return `
        <div class="card notice cardio-form stack" role="dialog" aria-label="Log ${esc(Cardio.name(form))}">
          <div>
            <h2>${esc(Cardio.name(form))}</h2>
            <p class="cardio-quick-note">${esc(form.quickNote)}</p>
          </div>
          ${form.quick.map(field => fieldHtml[field]()).join('')}
          ${form.error ? `<p class="cardio-error" role="alert">${esc(form.error)}</p>` : ''}
          <button type="button" class="btn btn-primary" data-action="cardio-save">Save</button>
          <button type="button" class="btn" data-action="cardio-cancel">Cancel</button>
        </div>`;
    }
    const days = () => `
      <div>
        <label>Days</label>
        <label class="weekday-chip cardio-lifting-chip">
          <input type="checkbox" id="cardio-lifting" ${form.afterLift ? 'checked' : ''}>
          <span>After every lift</span>
        </label>
        <div class="weekday-pick">
          ${WEEKDAYS.map((day, i) => `
            <label class="weekday-chip">
              <input type="checkbox" name="cardio-weekday" value="${i}" ${form.weekdays.includes(i) ? 'checked' : ''}>
              <span>${day.slice(0, 3)}</span>
            </label>`).join('')}
        </div>
      </div>`;
    const date = () => `
      <div>
        <label for="cardio-date">Date</label>
        <input id="cardio-date" type="date" value="${form.day}" max="${dayKey(new Date())}">
      </div>`;
    // Unchecking a planned item leaves its row to check again, so it needs no question.
    // A one-off has no row to come back to, so Delete asks first.
    let remove = '';
    if (form.kind === 'entry' && form.id && form.from === 'week') {
      remove = form.planId && Store.getCardioPlan(form.planId)
        ? '<button type="button" class="btn" data-action="cardio-uncheck">Uncheck</button>'
        : '<button type="button" class="btn btn-danger" data-action="cardio-entry-delete">Delete</button>';
    }
    const title = isPlan ? (form.id ? 'Edit planned cardio' : 'New planned cardio') : (form.id ? 'Edit cardio' : 'Add cardio');
    return `
      <div class="card notice cardio-form stack" role="dialog" aria-label="${title}">
        <h2>${title}</h2>
        <div>
          <label for="cardio-type">Type</label>
          <select id="cardio-type">
            ${Object.entries(CARDIO_TYPES).map(([id, t]) => `<option value="${id}" ${id === form.type ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select>
        </div>
        ${box('name', 'Name', form.name, type.name, 'text')}
        ${isPlan ? days() : date()}
        ${type.fields.map(field => fieldHtml[field]()).join('')}
        ${form.error ? `<p class="cardio-error" role="alert">${esc(form.error)}</p>` : ''}
        <button type="button" class="btn btn-primary" data-action="cardio-save">Save</button>
        ${remove}
        <button type="button" class="btn" data-action="cardio-cancel">Cancel</button>
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
        ${maxChart(points, 'Log your weight to start the graph', [], 'Body weight', null, true, Math.round, 'log-day', null)}
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
          <div class="week-sets"><span>Workouts this week</span><strong>${week.workouts} / ${week.goal}</strong></div>
          <div class="week-bar ${week.hit ? 'is-full' : ''}"><i style="width:${Math.min(100, week.workouts / week.goal * 100)}%"></i></div>
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

  // ---------- Weekly streak (on Profile) ----------
  // The flame is green while the streak is alive (above 0), like the This week card on the
  // Workouts tab, and gray only at 0.
  streakCard() {
    const { started, start, totals, week, recent } = Streak.summary();
    const fill = Math.min(100, week.workouts / week.goal * 100);
    const startLabel = start
      ? fromDayKey(start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    const headline = started ? `${totals.current}-week streak`
      : start ? `Streak starts ${startLabel}` : 'Log a workout to start a streak';
    const left = week.goal - week.workouts;
    const plural = n => `workout${n === 1 ? '' : 's'}`;
    const sub = started
      ? (week.hit ? 'This week is done 🔥' : `Do ${left} more ${plural(left)} to hit this week`)
      : start ? 'This week is practice' : `Your goal is ${week.goal} ${plural(week.goal)} a week`;

    // How to earn the next freeze (one every WEEKS_PER_FREEZE weeks in a row).
    const toNext = WEEKS_PER_FREEZE - totals.current % WEEKS_PER_FREEZE;
    const earnNote = !Store.data.streak.weeks.length ? 'Hit your goal your first week to earn a freeze.'
      : !started ? `Hit ${WEEKS_PER_FREEZE} weeks in a row to earn a freeze.`
      : totals.freezes >= MAX_FREEZES ? `Freezes full. You earn one every ${WEEKS_PER_FREEZE} weeks in a row.`
      : `${toNext} more week${toNext === 1 ? '' : 's'} in a row to earn a freeze.`;

    const icons = { hit: '✓', frozen: '❄︎', missed: '✕', empty: '–', current: '', untracked: '' };
    const names = { hit: 'hit', frozen: 'saved by a freeze', missed: 'missed', empty: 'nothing planned',
      current: 'in progress', untracked: 'not tracked' };
    const strip = recent.map(w => `
      <div class="wk is-${w.status} ${w.isThisWeek ? 'is-this-week' : ''}"
        aria-label="Week of ${shortDate(fromDayKey(w.key))}: ${names[w.status]}">
        <span class="wk-box" aria-hidden="true">${icons[w.status]}</span>
        <span class="wk-date" aria-hidden="true">${w.isThisWeek ? 'Now' : fromDayKey(w.key).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span>
      </div>`).join('');

    return `
      <div class="card streak-card">
        <div class="streak-top">
          <span class="streak-flame ${started && totals.current > 0 ? 'is-lit' : ''}">${FLAME_SVG}</span>
          <span class="streak-words">
            <strong>${headline}</strong>
            <span class="muted">${sub}</span>
          </span>
        </div>

        <div class="week-sets">
          <span>Workouts this week</span>
          <strong>${week.workouts} / ${week.goal}</strong>
        </div>
        <div class="week-bar ${week.hit ? 'is-full' : ''}" role="img"
          aria-label="${week.workouts} of ${week.goal} workouts this week">
          <i style="width:${fill}%"></i>
        </div>
        ${week.nextGoal ? `<p class="earn-note">Your new goal of ${week.nextGoal} ${plural(week.nextGoal)} a week starts next week.</p>` : ''}

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
          ${sparks}
          <span class="celebrate-flame">${FLAME_SVG}</span>
        </div>
        <p class="celebrate-num">${streak}</p>
        <p class="celebrate-label">week streak</p>
        ${milestone ? '<p class="celebrate-badge">Milestone</p>' : ''}
        <p class="celebrate-msg">${message}</p>
        ${earned ? '<p class="celebrate-freeze">❄&#xFE0E; +1 streak freeze earned</p>' : ''}
        ${earned && streak === 1 ? `<p class="celebrate-msg">It saves your streak if you miss a week. Stay consistent for ${WEEKS_PER_FREEZE - 1} more weeks to earn another.</p>` : ''}
        <p class="celebrate-hint">Tap to continue</p>
      </div>`;
  },

  // What happened to the streak while the app was closed (freeze used / streak ended).
  // ---------- Past workouts: a calendar of the days you worked out, then every finished workout ----------
  // The calendar is history only: nothing is planned on it. Tapping a day lists that day's workouts.
  // state = { month ('YYYY-MM', null = this month), day (the day tapped, or null) }
  history(state) {
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

    // The calendar: each day with a finished workout can be tapped. Days change at 3 am (appDay()),
    // like the week strip on the Workouts tab, so a 1 am workout is on the day before.
    const sessions = Store.data.sessions;
    const logged = new Set(sessions.map(s => appDay(s.date)));
    const thisMonth = dayKey(new Date()).slice(0, 7);
    const firstMonth = sessions.length ? appDay(sessions[0].date).slice(0, 7) : thisMonth;
    const day = logged.has(state.day) ? state.day : null;
    const dayCard = day ? `
      <div class="card log-day">
        <p class="log-day-date">${fromDayKey(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <div class="stack log-day-links">
          ${sessions.filter(s => appDay(s.date) === day).map(s => `
            <button type="button" class="btn btn-small" data-action="open-session" data-id="${esc(s.id)}">${esc(s.workoutName || 'Workout')}${s.quick ? ' · Quick' : ''} · ${plural(setCount(s), 'set')}</button>`).join('')}
        </div>
      </div>` : '';

    return {
      title: 'Past workouts',
      back: '#/',
      html: `
        ${logCalendar(state.month || thisMonth, logged, day, firstMonth, thisMonth, sessions.length ? '' : 'Days you work out will show here', 'history')}
        ${dayCard}
        ${html || '<p class="empty">No finished workouts yet.</p>'}`,
    };
  },

  // ---------- One past workout: looks like the workout start page, with a pencil on each exercise ----------
  // The pencil opens that exercise's boxes, to fix its weights and reps or fill in a forgotten set.
  // edit = the changes being made (see pastEdit in app.js): { exercises: [{ entry, rows }], editing (index or null) }
  pastWorkout(session, edit) {
    const unit = Units.weightUnit();
    const cards = edit.exercises.map((e, x) => {
      const timed = Library.isTimed(e.entry.refId);
      const bw = Library.isRepsOnly(e.entry.refId);
      const info = Library.get(e.entry.refId) || Library.forExercise(e.entry);
      const isEditing = edit.editing === x;
      const logged = e.rows.filter(set => set.reps !== '');
      const rows = e.rows.map((set, i) => `
        <div class="set-num">${i + 1}</div>
        ${timed ? LOCKED_WEIGHT : bwBox(bw, `<input type="text" inputmode="decimal" value="${Units.showWeight(set.weight)}" placeholder="${bw ? '' : unit}"
          data-past="${x}" data-set="${i}" data-field="weight" aria-label="Set ${i + 1} ${bw ? 'added ' : ''}weight in ${unit}">`)}
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
            : logged.length ? setsList(logged, timed, bw).replace('class="log-sets"', 'class="log-sets past-sets"')
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
          `<span><i style="background:var(--map-level-${i})"></i>${label}</span>`).join('')}</div>
        <p class="legend-empty"><i></i>No logged exercise with a standard</p>`;
    } else {
      caption = `Change in estimated max, last ${Stats.GROWTH_WEEKS} weeks`;
      legend = `
        <div class="legend-bar" style="background: linear-gradient(90deg, ${MapColors.growth(-GROWTH_SCALE)}, ${MapColors.growth(0)}, ${MapColors.growth(GROWTH_SCALE)})"></div>
        <div class="legend-labels"><span>−${GROWTH_SCALE}%</span><span>Flat</span><span>+${GROWTH_SCALE}%</span></div>
        <p class="legend-empty"><i></i>Not enough data yet (needs ${Stats.MIN_WEEKS} weeks of a primary exercise)</p>`;
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
    const fromTo = e => e.kind === 'hold' ? `${e.early} → ${e.recent} sec`
      : e.kind === 'reps' ? `${e.early} → ${e.recent} reps`
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
    const planned = Stats.cyclePlannedSets().sources[id] || [];
    const secondary = planned.filter(s => s.role === 'secondary').map(s => s.name);
    const primary = planned.filter(s => s.role === 'primary').map(s => s.name);
    const named = names => esc(new Set(names).size > 1 ? `${names[0]} and others` : names[0]);
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
            placeholder="Search exercises" autocomplete="off" aria-label="Search exercises by name, muscle or equipment">
          <div id="log-results" class="lib-results">${this.libraryResults(query, 'open-log')}</div>
        </div>
      `,
    };
  },

  // ---------- One exercise's log: estimated max graph, calendar, a day's sets ----------
  // state = { month: 'YYYY-MM' shown in the calendar (null = latest), day: 'YYYY-MM-DD' tapped (or null),
  //           range: how much of the graph shows: '3m', '1y' or 'all',
  //           weighted: on a bodyweight exercise, which side of its switch shows (null = whichever
  //           the latest workout was) }
  // A timed exercise (plank) shows its longest hold instead of an estimated max. A bodyweight
  // exercise has a switch: its max reps with no added weight, or "Weighted", which is like any
  // other exercise. The switch only changes the top card; the calendar and list show every set.
  exerciseLog(refId, state) {
    const history = Store.exerciseHistory(refId);
    const info = Library.get(refId);
    const name = info ? info.name : Store.loggedExercises().find(l => l.refId === refId)?.name || 'Unknown exercise';
    const timed = Library.isTimed(refId);
    const bw = Library.isRepsOnly(refId);
    const showWeighted = bw && (state.weighted ?? Boolean(history[history.length - 1]?.sets.some(set => set.weight)));
    // Timed exercises and a bodyweight exercise's reps share one card: a top number and its graph, with no estimate.
    const scored = timed || (bw && !showWeighted);
    const scoreOf = h => (timed ? h.hold : h.topReps);
    const scoredHistory = history.filter(h => scoreOf(h) > 0);
    const logTab = (id, label, on) => `
      <button type="button" class="segment ${on ? 'is-active' : ''}" data-action="log-tab" data-id="${id}" aria-pressed="${on}">${label}</button>`;
    const bwSwitch = bw ? `
      <div class="segmented log-switch">${logTab('reps', esc(info?.name || 'Bodyweight'), !showWeighted)}${logTab('weighted', 'Weighted', showWeighted)}</div>` : '';
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
      ? scoredHistory.map(h => ({ time: new Date(h.date).getTime(), value: scoreOf(h), dayKey: h.dayKey }))
      : weighted.map(h => ({ time: new Date(h.date).getTime(), value: Number(Units.showWeight(h.best.max)), dayKey: h.dayKey })))
      .filter(p => inRange(p.time));
    // Actual max: the heaviest weight ever logged for a single rep (the first day it was lifted).
    // singlePoints = the heaviest single of each workout that had one, for the graph's white line.
    // Best ever: only worth a line once the latest isn't the best.
    const bestEver = weighted.reduce((a, h) => (!a || h.best.max > a.best.max ? h : a), null);
    let single = null;
    const singlePoints = [];
    for (const h of scored ? [] : history) {
      const heaviest = Math.max(0, ...h.sets.filter(set => set.reps === 1 && set.weight).map(set => set.weight));
      if (!heaviest) continue;
      if (inRange(new Date(h.date).getTime())) singlePoints.push({ time: new Date(h.date).getTime(), value: Number(Units.showWeight(heaviest)) });
      if (!single || heaviest > single.weight) single = { weight: heaviest, date: h.date };
    }
    const emptyNote = !history.length ? 'No history yet'
      : scored && !scoredHistory.length ? 'No sets without added weight yet'
      : !weighted.length && !scored ? `No sets with ${bw ? 'added ' : ''}weight yet` : 'Nothing in this time';
    const ranges = { '3m': '3 months', '1y': '1 year', all: 'All time' };
    const rangePicker = `
      <div class="segmented log-range">
        ${Object.entries(ranges).map(([id, label]) => `
          <button type="button" class="segment ${id === (state.range || 'all') ? 'is-active' : ''}" data-action="log-range" data-id="${id}"
            aria-pressed="${id === (state.range || 'all')}">${label}</button>`).join('')}
      </div>`;
    const top = scored && scoredHistory.length ? scoredHistory.reduce((a, b) => (scoreOf(b) > scoreOf(a) ? b : a)) : null;
    const maxSection = scored ? `
      <div class="card">
        ${bwSwitch}
        <p class="log-label">${scoreLabel}</p>
        <p class="log-max ${top ? '' : 'is-blank'}">${top ? `${scoreOf(top)} <span>${scoreUnit(scoreOf(top))}</span>` : '—'}</p>
        ${progressLine(points)}
        <p class="log-sub">${top ? `On ${shortDate(top.date)}` : '&nbsp;'}</p>
        ${rangePicker}
        ${maxChart(points, emptyNote, [], scoreLabel, state.day)}
      </div>` : `
      <div class="card">
        ${bwSwitch}
        <p class="log-label">Current estimated max</p>
        <p class="log-max ${latest ? '' : 'is-blank'}">${latest ? `${Units.showWeight(latest.best.max)} <span>${unit}</span>` : '—'}</p>
        ${progressLine(points)}
        <p class="log-sub">${latest ? `Best set on ${shortDate(latest.date)}: ${formatSet(latest.best.set, false, bw)}` : '&nbsp;'}</p>
        <!-- Best ever and actual 1-rep max: one small line each, only when there's something to
             say, so most exercises just show the big number (the user didn't want it cluttered). -->
        ${bestEver && bestEver.best.max > latest.best.max ? `
          <p class="log-actual">
            <span class="log-actual-label">Best ever</span>
            <span class="log-actual-value">${Units.showWeight(bestEver.best.max)} ${unit}</span><span class="log-actual-date">· ${shortDate(bestEver.date)}</span>
          </p>` : ''}
        ${single ? `
          <p class="log-actual">
            <span class="log-actual-label">Actual 1-rep max</span>
            <span class="log-actual-value">${Units.showWeight(single.weight)} ${unit}</span><span class="log-actual-date">· ${shortDate(single.date)}</span>
          </p>` : ''}
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
        ${state.day ? logDayCard(history.filter(h => h.dayKey === state.day), state.day, timed, bw)
          : history.length ? '<p class="muted log-hint">Tap a highlighted day to see its sets.</p>' : ''}
        ${history.length ? logList(history, timed, state.showAll, bw) : ''}
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
        <p class="muted settings-note">Changes save automatically and are included in backups.</p>

        <h2>Custom exercises</h2>
        ${customs.length ? `<div class="card custom-list">${customs.map(e => `
          <div class="custom-row">
            <span class="custom-info"><strong>${esc(e.name)}</strong><span>${esc(e.equipment)} · ${esc(Library.primaryLabel(e))}</span></span>
            <button type="button" class="btn btn-small btn-danger" data-action="delete-custom" data-id="${esc(e.id)}">Delete</button>
          </div>`).join('')}</div>`
          : '<p class="muted settings-note">Exercises you create are saved here and can be added to any workout.</p>'}

        <h2>Backup</h2>
        <div class="row">
          <button class="btn" data-action="export">Export</button>
          <button class="btn" data-action="import">Import</button>
        </div>
        <p class="muted settings-note">
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
        ${unitOption('imperial', 'Imperial', 'lbs, ft/in, miles')}
        ${unitOption('metric', 'Metric', 'kg, cm, km')}
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

      <h2>Workouts per week</h2>
      <div class="card stack">
        <div>
          <label>How many workouts a week are you aiming for?</label>
          ${goalPicker('weeklyGoal', s.weeklyGoal)}
          <p class="muted goal-note">Hit it to keep your streak going. Quick workouts don't count.${Store.data.streak.start ? ' A change starts next week.' : ''}</p>
        </div>
      </div>`;
  },
};
