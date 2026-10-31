// storage.js — everything that reads or writes saved data lives here.
// Data is kept in the browser's localStorage, so it stays on this device only.
//
// All weights are saved in lbs and heights in inches, whatever the Units
// setting says. units.js converts them for display.
//
// Shape of the saved data:
// {
//   version: 4,
//   settings: { name, units: 'imperial' | 'metric', heightIn, bodyWeightLbs, sex: 'male' | 'female' },
//   customExercises: [     // your own exercises, used alongside LIBRARY in library.js
//     { id: 'custom-…', name, equipment, primary: [muscle ids], secondary: [muscle ids], custom: true }
//   ],
//   days: [                // always one per weekday, Monday first
//     { id, weekday (0 = Monday … 6 = Sunday), name (type of day, e.g. "Legs"), rest,
//       exercises: [ { id, refId (library or custom exercise id), sets, repMin, repMax } ] }
//   ],
//   sessions: [            // one per finished workout, oldest first
//     { id, dayId, dayName, date (ISO string),
//       exercises: [ { exerciseId, refId, name, primary, secondary,
//                      targetSets, targetRepMin, targetRepMax,
//                      sets: [ { weight, reps } ] } ] }
//   ],
//   draft: null or { dayId, startedAt, entries: { [exerciseId]: [ { weight, reps } ] } }
// }
// Older sessions may be missing primary/secondary (they have a single "muscle" text
// instead), and ones saved before version 2 have targetReps instead of targetRepMin/Max.

const STORAGE_KEY = 'gitfit-data';
const DATA_VERSION = 5;

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

// To add a setting: give it a default here, a field in Views.settings(),
// and a line in saveSettingsForm() in app.js.
const DEFAULT_SETTINGS = {
  name: 'Rex Stephenson',
  units: 'imperial',
  heightIn: null,
  bodyWeightLbs: null,
  sex: 'male', // for strength standards: 'male' | 'female'
};

// Before version 4, exercises had one muscle group picked from a short list.
// When an old exercise isn't in the library, it becomes a custom exercise
// with these muscles as its primary muscles.
const OLD_MUSCLE_GROUPS = {
  Chest: ['midChest'],
  Back: ['lats', 'upperBack'],
  Shoulders: ['frontDelts'],
  Biceps: ['biceps'],
  Triceps: ['triceps'],
  Forearms: ['forearmFlexors'],
  Quads: ['quads'],
  Hamstrings: ['hamstrings'],
  Glutes: ['glutes'],
  Calves: ['calves'],
  Core: ['abs'],
};

// Muscle ids that were renamed or split in version 5 → their replacement.
// ("Upper back / traps" became separate Upper back and Traps; upperBack keeps its id.)
const RENAMED_MUSCLES = {
  forearms: 'forearmFlexors',
};

function renameMuscles(ids) {
  return [...new Set((ids || []).map(id => RENAMED_MUSCLES[id] || id))];
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Estimated 1-rep max in lbs (Epley formula: weight × (1 + reps ÷ 30)).
// null for bodyweight sets or sets without reps.
function estimateMax(set) {
  if (!set.weight || !set.reps) return null;
  return set.weight * (1 + set.reps / 30);
}

// A date as 'YYYY-MM-DD' in the phone's own time zone (saved dates are UTC).
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

// Before version 4, day exercises had their own name and muscle. Now they point
// at a library exercise (refId). Old ones are linked by name, or turned into
// custom exercises if the library doesn't have them.
function linkToLibrary(days, customExercises) {
  for (const day of days) {
    for (const ex of day.exercises) {
      if (ex.refId) continue;
      const match = Library.findByName(ex.name) || Library.findByName(ex.name, customExercises);
      if (match) {
        ex.refId = match.id;
      } else {
        const custom = {
          id: 'custom-' + newId(),
          name: ex.name || 'Unnamed exercise',
          equipment: 'Other',
          primary: OLD_MUSCLE_GROUPS[ex.muscle] || [],
          secondary: [],
          custom: true,
        };
        customExercises.push(custom);
        ex.refId = custom.id;
      }
      delete ex.name;
      delete ex.muscle;
    }
  }
}

// Fills in anything missing and upgrades older data so it still works.
function normalize(data) {
  const days = buildWeek(Array.isArray(data.days) ? data.days : []);
  const customExercises = Array.isArray(data.customExercises) ? data.customExercises : [];
  // Sample workouts (demo: true) came from a temporary demo file; they're dropped.
  const sessions = (Array.isArray(data.sessions) ? data.sessions : []).filter(s => !s.demo);

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

  linkToLibrary(days, customExercises);

  // Give old logged exercises the refId of the day exercise they came from,
  // so future history/volume features can tell which exercise they were.
  const refIds = {};
  for (const day of days) for (const ex of day.exercises) refIds[ex.id] = ex.refId;
  for (const session of sessions) {
    for (const entry of session.exercises) {
      if (!entry.refId && refIds[entry.exerciseId]) entry.refId = refIds[entry.exerciseId];
      if (entry.primary) entry.primary = renameMuscles(entry.primary);
      if (entry.secondary) entry.secondary = renameMuscles(entry.secondary);
    }
  }
  for (const custom of customExercises) {
    custom.primary = renameMuscles(custom.primary);
    custom.secondary = renameMuscles(custom.secondary).filter(id => !custom.primary.includes(id));
  }

  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    customExercises,
    days,
    sessions,
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

  // Saves a new custom exercise to reuse on any day. Returns it.
  addCustomExercise(fields) {
    const exercise = { id: 'custom-' + newId(), ...fields, custom: true };
    this.data.customExercises.push(exercise);
    this.save();
    return exercise;
  },

  // Changes a custom exercise everywhere it's used. fields: { name, equipment, primary, secondary }
  updateCustomExercise(id, fields) {
    Object.assign(this.data.customExercises.find(e => e.id === id), fields);
    this.save();
  },

  // fields: { refId, sets, repMin, repMax }
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

  // Most recent logged sets for a day's exercise, or null if never done.
  // Matching the refId too means that if you switch the exercise to a different
  // one, you don't see the old exercise's numbers.
  // Returns { date, sets: [ { weight, reps } ] }
  lastResult(dayExercise) {
    for (let i = this.data.sessions.length - 1; i >= 0; i--) {
      const session = this.data.sessions[i];
      const entry = session.exercises.find(e =>
        e.exerciseId === dayExercise.id && (!e.refId || e.refId === dayExercise.refId));
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
      const lastSets = this.lastResult(ex)?.sets || [];
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
        // Name and muscles are copied in, so history stays right even if the
        // exercise is later changed or removed.
        const info = Library.forExercise(ex);
        exercises.push({
          exerciseId: ex.id,
          refId: ex.refId,
          name: info.name,
          primary: info.primary,
          secondary: info.secondary,
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

  // ---------- Exercise log ----------

  // Every finished workout that included this exercise, oldest first:
  //   [{ date (ISO), dayKey ('YYYY-MM-DD', local), sets: [{weight, reps}], best: {set, max} or null }]
  // best = the set with the highest estimated 1-rep max (null if no set had a weight).
  exerciseHistory(refId) {
    const history = [];
    for (const session of this.data.sessions) {
      const sets = session.exercises.filter(e => e.refId === refId).flatMap(e => e.sets);
      if (!sets.length) continue;
      let best = null;
      for (const set of sets) {
        const max = estimateMax(set);
        if (max != null && (!best || max > best.max)) best = { set, max };
      }
      history.push({ date: session.date, dayKey: dayKey(session.date), sets, best });
    }
    return history.sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  // Wipes everything and starts over with an empty week and default settings.
  deleteAll() {
    this.data = emptyData();
    this.save();
  },
};
