// storage.js — everything that reads or writes saved data lives here.
// Data is kept in the browser's localStorage, so it stays on this device only.
//
// All weights are saved in lbs and heights in inches, whatever the Units
// setting says. units.js converts them for display.
//
// Shape of the saved data:
// {
//   version: 3,
//   settings: { name, units: 'imperial' | 'metric', heightIn, bodyWeightLbs },
//   days: [                // always one per weekday, Monday first
//     { id, weekday (0 = Monday … 6 = Sunday), name (type of day, e.g. "Legs"), rest,
//       exercises: [ { id, name, muscle, sets, repMin, repMax } ] }
//   ],
//   sessions: [            // one per finished workout, oldest first
//     { id, dayId, dayName, date (ISO string),
//       exercises: [ { exerciseId, name, muscle, targetSets, targetRepMin, targetRepMax,
//                      sets: [ { weight, reps } ] } ] }
//   ],
//   draft: null or { dayId, startedAt, entries: { [exerciseId]: [ { weight, reps } ] } }
// }
// (Sessions saved before version 2 have targetReps instead of targetRepMin/Max.)

const STORAGE_KEY = 'gitfit-data';
const DATA_VERSION = 3;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// "Monday – Legs", "Wednesday – Rest", or just "Thursday" if not set up yet.
function dayLabel(day) {
  const weekday = WEEKDAYS[day.weekday] || 'Extra day';
  if (day.rest) return `${weekday} – Rest`;
  return day.name ? `${weekday} – ${day.name}` : weekday;
}

// Today's weekday with Monday = 0 (JavaScript's getDay() starts at Sunday = 0).
function todayWeekday() {
  return (new Date().getDay() + 6) % 7;
}

// To add a setting: give it a default here, a field in Views.profile(),
// and a line in saveSettingsForm() in app.js.
const DEFAULT_SETTINGS = {
  name: 'Rex Stephenson',
  units: 'imperial',
  heightIn: null,
  bodyWeightLbs: null,
};

const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Full body', 'Other',
];

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emptyData() {
  return normalize({});
}

// Before version 3, days were a free list with names like "Mon Upper".
// Finds the weekday at the start of such a name: "Mon Upper" → { weekday: 0, rest: "Upper" }.
function splitWeekdayName(name) {
  const match = /^(mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?)\b[\s.:\-–]*/i.exec(name);
  if (!match) return null;
  const weekday = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(match[1].slice(0, 3).toLowerCase());
  return { weekday, rest: name.slice(match[0].length) };
}

// Makes sure there's exactly one day per weekday, in order Monday → Sunday.
function buildWeek(days) {
  const week = new Array(7).fill(null);
  const unplaced = [];

  for (const day of days) {
    if (day.weekday == null) {
      const split = splitWeekdayName(day.name || '');
      if (split && !week[split.weekday]) {
        day.weekday = split.weekday;
        day.name = split.rest;
      }
    }
    if (day.weekday != null && !week[day.weekday]) week[day.weekday] = day;
    else unplaced.push(day);
  }

  // Old days without a weekday in their name fill the free weekdays in order.
  for (let i = 0; i < 7; i++) {
    if (!week[i]) {
      const day = unplaced.shift() || { id: newId(), name: '', exercises: [] };
      day.weekday = i;
      week[i] = day;
    }
  }
  for (const day of week) day.rest = Boolean(day.rest);

  // More than 7 old days can't fit in a week. They're kept (so backups have them)
  // but not shown, with weekday null.
  for (const day of unplaced) day.weekday = null;
  return [...week, ...unplaced];
}

// Fills in anything missing and upgrades older data so it still works.
function normalize(data) {
  const days = buildWeek(Array.isArray(data.days) ? data.days : []);

  // Version 1 had a single target "reps" number; now it's a range.
  for (const day of days) {
    for (const ex of day.exercises) {
      if (ex.repMin == null) {
        ex.repMin = ex.reps ?? 10;
        ex.repMax = ex.reps ?? 10;
        delete ex.reps;
      }
    }
  }

  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    days,
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    draft: data.draft || null,
  };
}

const Store = {
  data: emptyData(),

  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) this.data = normalize(JSON.parse(raw));
  },

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
  },

  // ---------- Days ----------

  getDay(dayId) {
    return this.data.days.find(d => d.id === dayId);
  },

  // The seven days, Monday first.
  week() {
    return this.data.days.filter(d => d.weekday != null);
  },

  // name is the type of day, e.g. "Legs". Can be empty.
  renameDay(dayId, name) {
    this.getDay(dayId).name = name;
    this.save();
  },

  // Exercises are kept when a day becomes a rest day, so switching back restores them.
  setRestDay(dayId, rest) {
    this.getDay(dayId).rest = rest;
    if (rest && this.data.draft && this.data.draft.dayId === dayId) this.data.draft = null;
    this.save();
  },

  // ---------- Exercises ----------

  addExercise(dayId, fields) {
    const exercise = { id: newId(), ...fields };
    this.getDay(dayId).exercises.push(exercise);
    this.save();
    return exercise;
  },

  updateExercise(dayId, exerciseId, fields) {
    const exercise = this.getDay(dayId).exercises.find(e => e.id === exerciseId);
    Object.assign(exercise, fields);
    this.save();
  },

  deleteExercise(dayId, exerciseId) {
    const day = this.getDay(dayId);
    day.exercises = day.exercises.filter(e => e.id !== exerciseId);
    this.save();
  },

  // direction: -1 moves up, +1 moves down
  moveExercise(dayId, exerciseId, direction) {
    const list = this.getDay(dayId).exercises;
    const from = list.findIndex(e => e.id === exerciseId);
    const to = from + direction;
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    this.save();
  },

  // ---------- Sessions (finished workouts) ----------

  // Most recent logged sets for an exercise, or null if never done.
  // Returns { date, sets: [ { weight, reps } ] }
  lastResult(exerciseId) {
    for (let i = this.data.sessions.length - 1; i >= 0; i--) {
      const session = this.data.sessions[i];
      const entry = session.exercises.find(e => e.exerciseId === exerciseId);
      if (entry && entry.sets.length) return { date: session.date, sets: entry.sets };
    }
    return null;
  },

  lastSessionForDay(dayId) {
    for (let i = this.data.sessions.length - 1; i >= 0; i--) {
      if (this.data.sessions[i].dayId === dayId) return this.data.sessions[i];
    }
    return null;
  },

  // ---------- Draft (the workout in progress) ----------
  // Saved on every keystroke so nothing is lost if the phone locks
  // or the app gets closed mid-workout.

  // Makes sure there's a draft for this day with exactly one row per target set.
  // Each set's weight (lbs, or null) starts as last time's weight; reps start empty.
  ensureDraft(day) {
    let draft = this.data.draft;
    if (!draft || draft.dayId !== day.id) {
      draft = { dayId: day.id, startedAt: new Date().toISOString(), entries: {} };
      this.data.draft = draft;
    }
    for (const ex of day.exercises) {
      const lastSets = this.lastResult(ex.id)?.sets || [];
      const rows = draft.entries[ex.id] || [];
      // Keeps rows already typed in; adds or trims if the set count was edited.
      draft.entries[ex.id] = Array.from({ length: ex.sets }, (_, i) =>
        rows[i] || { weight: lastSets[i]?.weight ?? null, reps: '' });
    }
    this.save();
    return draft;
  },

  // field is 'weight' (lbs number or null) or 'reps' (text as typed)
  updateDraftSet(exerciseId, setIndex, field, value) {
    this.data.draft.entries[exerciseId][setIndex][field] = value;
    this.save();
  },

  // True once any set of this exercise has reps typed in.
  draftHasReps(exerciseId) {
    const rows = this.data.draft?.entries[exerciseId] || [];
    return rows.some(s => s.reps !== '');
  },

  discardDraft() {
    this.data.draft = null;
    this.save();
  },

  // Turns the draft into a saved session. Only sets with reps entered are saved
  // (weights are prefilled, so a weight alone doesn't mean the set was done).
  // Returns the session, or null if nothing was filled in.
  finishDraft() {
    const draft = this.data.draft;
    const day = this.getDay(draft.dayId);
    const toNumber = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

    const exercises = [];
    for (const ex of day.exercises) {
      const sets = (draft.entries[ex.id] || [])
        .map(s => ({ weight: toNumber(s.weight), reps: toNumber(s.reps) }))
        .filter(s => s.reps !== null);
      if (sets.length) {
        exercises.push({
          exerciseId: ex.id,
          name: ex.name,
          muscle: ex.muscle,
          targetSets: ex.sets,
          targetRepMin: ex.repMin,
          targetRepMax: ex.repMax,
          sets,
        });
      }
    }
    if (!exercises.length) return null;

    const session = {
      id: newId(),
      dayId: day.id,
      dayName: dayLabel(day),
      date: new Date().toISOString(),
      exercises,
    };
    this.data.sessions.push(session);
    this.data.draft = null;
    this.save();
    return session;
  },

  // ---------- Settings ----------

  updateSettings(fields) {
    Object.assign(this.data.settings, fields);
    this.save();
  },

  // ---------- Backup ----------

  exportBackup() {
    const json = JSON.stringify(this.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gitfit-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // Replaces all data with the contents of a backup file. Throws if the file is invalid.
  importBackup(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.days) || !Array.isArray(parsed.sessions)) {
      throw new Error('This file is not a GitFit backup.');
    }
    this.data = normalize(parsed);
    this.save();
  },
};
