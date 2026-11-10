// storage.js — everything that reads or writes saved data lives here.
// Data is kept in the browser's localStorage, so it stays on this device only.
//
// All weights are saved in lbs and heights in inches, whatever the Units
// setting says. Cardio distances are saved in miles, speeds in mph and
// elevation in feet the same way. units.js converts them for display.
//
// Shape of the saved data:
// {
//   version: 15,
//   settings: { name, units: 'imperial' | 'metric', heightIn, bodyWeightLbs, sex: 'male' | 'female' | null,
//               weeklyGoal (workouts a week you're aiming for, 1 to 7; a change counts from next week),
//               setupDone (the first-time setup was finished or skipped),
//               lastBackupAt (ISO, when Export was last used, or null) },
//   bodyWeightLog: [ { day: 'YYYY-MM-DD', lbs } ],  // oldest first; one per day, for the Profile graph
//   exerciseNotes: { [refId]: text },               // one note per exercise, kept until you change it
//   customExercises: [     // your own exercises, used alongside LIBRARY in library.js
//     { id: 'custom-…', name, equipment, primary: [muscle ids], secondary: [muscle ids], custom: true,
//       deleted (true once deleted: gone from search and workouts, kept so its past logs still have a name) }
//   ],
//   workouts: [            // your workouts, of every split (each belongs to one split: the one
//                          // whose cycle it's in, at least once)
//     { id, name (e.g. "Push"),
//       exercises: [ { id, refId (library or custom exercise id), sets, repMin, repMax } ] }
//   ],
//   cycles: [              // your splits. Each is a cycle of its own workouts; there's always at least one
//     { id, name (e.g. "Push Pull Legs"),
//       items: [             // the order you do its workouts in, repeating (Push > Pull > Legs > Push …)
//         { id, kind: 'workout', workoutId }   // a workout can be in it more than once (up to MAX_CYCLE_WORKOUTS)
//         or { id, kind: 'rest' }              // a rest day reminder: Next Up skips it, it only shows in the list
//       ] }
//   ],
//   activeCycleId,         // the split you're on: "the cycle" everywhere in the app means this one's items
//   sessions: [            // one per finished workout, oldest first
//     { id, workoutId, workoutName, cycleItemId (the place in the cycle it was done as, or null),
//       cycleId (the split it was done in, so each split's Next Up goes by its own workouts; null on a quick workout),
//       date (ISO string, when Finish was tapped, or the last set's time
//                                         if "Use last set time" was picked for a workout left running),
//       durationMs (how long it took, not counting pauses; missing on workouts saved before version 9),
//       quick (true on a quick workout: a one-off, not in the cycle; workoutId is null and plan is []),
//       plan: [ { exerciseId, refId, sets } ],  // the workout's plan when it was logged
//       exercises: [ { exerciseId (the planned workout exercise it covers), refId, name, primary, secondary,
//                      swappedFrom (the planned refId; only on exercises swapped for today),
//                      targetSets, targetRepMin, targetRepMax,   // (not on quick workouts)
//                      makeupFor: { workoutId, exerciseId }      // (only on quick workouts from before
//                                 // version 14: the missed exercise it made up; no longer used)
//                      today (true on an exercise added for today only: not in the plan, no targets),
//                      sets: [ { weight, reps } ] } ] }   // on a timed exercise (plank), reps = seconds, weight null
//   ],
//   draft: null or { workoutId, cycleItemId (its place in the cycle, or null), startedAt,
//                    entries: { [exerciseId]: [ { weight, reps, loggedAt?, extra? } ] },
//                    swaps: { [exerciseId]: refId },  // exercises swapped for today only
//                    added: [ { id, refId } ],        // exercises added for today only
//                    pausedAt (ISO while the timer is paused, else null), pausedMs (earlier pauses) },
//                    // loggedAt = when that set's reps were typed
//          or, for a quick workout: { quick: true, workoutId: null, name, startedAt,
//                    exercises: [ { id, refId } ] (in the order added),
//                    entries, swaps: {} }
//   streak: {              // the weekly streak; see streak.js
//     start: 'YYYY-MM-DD' (Monday of the first tracked week) or null until a workout is logged,
//     weeks: [ { week: 'YYYY-MM-DD' (its Monday), result: 'hit' | 'frozen' | 'missed',
//                workouts (finished workouts that week), goal (the weekly goal it was judged against) } ],
//                // oldest first; changes only when a past workout is changed.
//                // Weeks from before version 14 have days (different days with a workout) instead of
//                // workouts, and ones from before version 11 have logged and planned (sets) and no goal,
//                // may be 'empty'. Both are kept as they were, never judged again.
//     thisWeekGoal: { week, goal } or null,  // the goal this week started with (a change counts from next week)
//     notices: [ text ]    // shown once, next time the app opens (freeze used / streak ended)
//   },
//   // Cardio only adds to your record: it never touches the streak, the cycle or planned sets.
//   // Which numbers each type uses is in CARDIO_TYPES in cardio.js. Any number can be null on a plan.
//   cardioPlans: [         // planned cardio, shown as checkboxes
//     { id, type: 'walk' | 'run' | 'bike' | 'hike' | 'other', name (may be empty: shows the type's name),
//       seconds, miles, feet (elevation), mph, incline (%), where ('outside' | 'treadmill', runs only),
//       weekdays: [0 = Monday … 6 = Sunday] (shown on the Workouts tab on those days),
//       afterLift (true = shown at the end of every workout instead of on weekdays) }
//   ],
//   cardioLog: [           // every cardio entry, in the order added (Cardio.newestFirst() sorts by date)
//     { id, day: 'YYYY-MM-DD', planId (the plan it was checked from, or null for a one-off),
//       type, name, seconds, miles, feet, mph, incline, where }  // its own copy, so changing a plan leaves it alone
//   ]
// }
// Older sessions may be missing primary/secondary (they have a single "muscle" text
// instead), ones saved before version 2 have targetReps instead of targetRepMin/Max,
// and ones saved before version 6 have no plan.
// Before version 7 each weekday held its own exercises ("days" with a name and exercises);
// each became a workout on that weekday, keeping its id, and sessions had dayId/dayName.
// Version 8 added quick workouts (quick sessions and quick drafts); older data has none.
// Version 9 added the workout timer: draft.pausedAt / pausedMs, sets' loggedAt in the draft,
// and session.durationMs (older sessions have no duration).
// Version 10 added bodyWeightLog (started from the saved body weight), exerciseNotes, draft.added,
// settings.setupDone (true for anyone who already had saved data) and settings.lastBackupAt.
// Version 11 made the streak go by days a week: settings.weeklyGoal (older data starts with null,
// so the app asks once) and days/goal on each new streak week. Old weeks keep their result.
// Version 12: a set's weight on a bodyweight exercise is now only the added weight (null = none).
// Older sets held the body weight there, and none had added weight, so those weights are cleared.
// Version 13 added cardio: cardioPlans and cardioLog. Older data starts with both empty.
// Version 14 made workouts a repeating cycle instead of weekdays: each workout's weekday became its
// place in the cycle (Monday first), and the unused days list and the week view's day locks went.
// The streak now counts finished workouts (weeks judged before keep their days), the weekly goal
// is workouts a week, and a cardio plan's everyLiftingDay became afterLift.
// Version 15 added splits: several cycles to switch between, each with its own workouts. The one
// cycle there was (the "cycle" list) became the first split's items, named DEFAULT_CYCLE_NAME, and
// every planned workout finished before then got that split's id as its cycleId.

const STORAGE_KEY = 'gitfit-data';
const DATA_VERSION = 15;

// The most workouts a cycle can hold (rest day reminders don't count).
const MAX_CYCLE_WORKOUTS = 7;

// What the first split is called until it's renamed (Switch cycle → its pencil).
const DEFAULT_CYCLE_NAME = 'My split';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// To add a setting: give it a default here, a field in Views.settings(),
// and a line in saveSettingsForm() in app.js.
const DEFAULT_SETTINGS = {
  name: '',
  units: 'imperial',
  heightIn: null,
  bodyWeightLbs: null,
  sex: null, // for strength standards: 'male' | 'female', or null until picked (no levels on the map)
  weeklyGoal: 4, // workouts a week, 1 to 7; picked in the first-time setup and changed in Settings
  setupDone: false,
  lastBackupAt: null,
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
// null for sets with no weight (a bodyweight set saved without one) or no reps.
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

// Version 7: each set-up weekday (one with a name or exercises) becomes a workout on that
// weekday, keeping the day's id so its sessions and draft still point at it.
// Days beyond 7 (very old data) were never shown and are left out.
function daysToWorkouts(oldDays) {
  return buildWeek(oldDays)
    .filter(day => day.weekday != null && (day.name || day.exercises.length))
    .map(day => ({ id: day.id, name: day.name || WEEKDAYS[day.weekday], weekday: day.weekday, exercises: day.exercises }));
}

// Fills in anything missing and upgrades older data so it still works.
function normalize(data) {
  const oldDays = Array.isArray(data.days) ? data.days : [];
  const isOld = !Array.isArray(data.workouts);
  let workouts = isOld ? daysToWorkouts(oldDays) : data.workouts;
  const customExercises = Array.isArray(data.customExercises) ? data.customExercises : [];
  // Sample workouts (demo: true) came from a temporary demo file; they're dropped.
  const sessions = (Array.isArray(data.sessions) ? data.sessions : []).filter(s => !s.demo);

  // Version 1 had a single target "reps" number; now it's a range.
  for (const workout of workouts) {
    for (const ex of workout.exercises) {
      if (ex.repMin == null) {
        ex.repMin = ex.reps ?? 10;
        ex.repMax = ex.reps ?? 10;
        delete ex.reps;
      }
    }
  }

  linkToLibrary(workouts, customExercises);

  // Version 7: sessions point at a workout (the old day's id) and keep just its name.
  // An old name like "Monday – Push" becomes "Push".
  for (const session of sessions) {
    if (session.workoutId) continue;
    session.workoutId = session.dayId;
    const split = splitWeekdayName(session.dayName || '');
    const rest = split ? split.rest.trim() : (session.dayName || '').trim();
    session.workoutName = rest && rest !== 'Rest' ? rest
      : workouts.find(w => w.id === session.dayId)?.name || 'Workout';
    delete session.dayId;
    delete session.dayName;
  }
  const draft = data.draft ? { swaps: {}, added: [], ...data.draft } : null;
  if (draft && draft.quick && !Array.isArray(draft.exercises)) draft.exercises = [];
  // Version 9: the timer's pause. (A draft from before has no pause; its startedAt already exists.)
  if (draft) {
    draft.pausedAt = draft.pausedAt || null;
    draft.pausedMs = draft.pausedMs || 0;
    draft.startedAt = draft.startedAt || new Date().toISOString();
  }
  if (draft && draft.dayId) {
    draft.workoutId = draft.dayId;
    delete draft.dayId;
  }

  // Give old logged exercises the refId of the workout exercise they came from,
  // so future history/volume features can tell which exercise they were.
  const refIds = {};
  for (const workout of workouts) for (const ex of workout.exercises) refIds[ex.id] = ex.refId;
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

  // Version 12: bodyweight exercises only keep added weight (see the top of this file).
  if ((data.version ?? 0) < 12) {
    const isBodyweight = refId => [...LIBRARY, ...customExercises].find(e => e.id === refId)?.equipment === 'Bodyweight';
    const clearWeights = sets => (sets || []).forEach(set => { set.weight = null; });
    for (const session of sessions) {
      for (const entry of session.exercises) if (isBodyweight(entry.refId)) clearWeights(entry.sets);
    }
    if (draft) {
      const listed = [...draft.added, ...(draft.exercises || [])];
      for (const id in draft.entries) {
        const refId = draft.swaps[id] || refIds[id] || listed.find(e => e.id === id)?.refId;
        if (isBodyweight(refId)) clearWeights(draft.entries[id]);
      }
    }
  }

  // Anyone with saved data from before version 10 has no need for the first-time setup.
  // Saved data from before sex could be left unpicked had 'male' as its default, so it keeps it.
  const settings = { ...DEFAULT_SETTINGS, ...(data.version != null ? { sex: 'male' } : {}), setupDone: data.version != null, ...data.settings };

  // The weekly goal is a whole number from 1 to 7. Anything else (data from before version 11 never
  // had one) starts at the default.
  if (![1, 2, 3, 4, 5, 6, 7].includes(settings.weeklyGoal)) settings.weeklyGoal = DEFAULT_SETTINGS.weeklyGoal;

  // Version 14: the cycle. Workouts were on weekdays; they go into the cycle in week order
  // (Monday first, and in their own order within a day), and their weekday is dropped.
  let cycle = Array.isArray(data.cycle) ? data.cycle : null;
  if (!cycle && !Array.isArray(data.cycles)) {
    workouts = workouts.map((w, i) => ({ w, i }))
      .sort((a, b) => (a.w.weekday ?? 7) - (b.w.weekday ?? 7) || a.i - b.i)
      .map(({ w }) => w);
    cycle = workouts.map(w => ({ id: newId(), kind: 'workout', workoutId: w.id }));
  }
  for (const w of workouts) delete w.weekday;

  // Version 15: splits. The one cycle there was becomes the first split, and every planned
  // workout finished so far was done in it.
  let cycles = Array.isArray(data.cycles) ? data.cycles.filter(c => c && c.id) : [];
  if (!cycles.length) {
    cycles = [{ id: newId(), name: DEFAULT_CYCLE_NAME, items: cycle || [] }];
    for (const session of sessions) {
      if (!session.quick && session.workoutId) session.cycleId = cycles[0].id;
    }
  }
  for (const c of cycles) {
    c.name = c.name || DEFAULT_CYCLE_NAME;
    // (A place in a cycle can't point at a workout that's gone.)
    c.items = (Array.isArray(c.items) ? c.items : [])
      .filter(item => item.kind === 'rest' || workouts.some(w => w.id === item.workoutId));
  }
  // The split you're on: the saved one if it's still there, otherwise the first.
  const activeCycleId = cycles.some(c => c.id === data.activeCycleId) ? data.activeCycleId : cycles[0].id;

  // Version 14: "every lifting day" cardio became "after every lift".
  const cardioPlans = Array.isArray(data.cardioPlans) ? data.cardioPlans : [];
  for (const plan of cardioPlans) {
    plan.afterLift = Boolean(plan.afterLift || plan.everyLiftingDay);
    delete plan.everyLiftingDay;
    if (!Array.isArray(plan.weekdays) || plan.afterLift) plan.weekdays = [];
  }

  // Version 14: the week view's day locks are gone.
  const streak = { start: null, weeks: [], notices: [], thisWeekGoal: null, ...data.streak };
  delete streak.locks;

  // Version 10: the body weight graph starts from the weight already saved.
  const bodyWeightLog = Array.isArray(data.bodyWeightLog) ? data.bodyWeightLog : [];
  if (!bodyWeightLog.length && settings.bodyWeightLbs != null) {
    bodyWeightLog.push({ day: dayKey(new Date()), lbs: settings.bodyWeightLbs });
  }

  return {
    version: DATA_VERSION,
    settings,
    bodyWeightLog,
    exerciseNotes: data.exerciseNotes || {},
    customExercises,
    workouts,
    cycles,
    activeCycleId,
    sessions,
    // Version 6 added swaps to the draft, and the streak.
    // Version 8 added quick workouts (draft.quick, session.quick).
    draft,
    streak,
    // Version 13: cardio. Only what's listed here is kept, on loading and on importing a backup.
    cardioPlans,
    cardioLog: Array.isArray(data.cardioLog) ? data.cardioLog : [],
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

  // ---------- Cardio (the rules and wording are in cardio.js) ----------

  getCardioPlan(id) {
    return this.data.cardioPlans.find(p => p.id === id) || null;
  },

  saveCardioPlan(id, fields) {
    const plan = this.getCardioPlan(id);
    if (plan) Object.assign(plan, fields);
    else this.data.cardioPlans.push({ id: newId(), ...fields });
    this.save();
  },

  // Entries already logged from it stay in the log.
  deleteCardioPlan(id) {
    this.data.cardioPlans = this.data.cardioPlans.filter(p => p.id !== id);
    this.save();
  },

  getCardioEntry(id) {
    return this.data.cardioLog.find(e => e.id === id) || null;
  },

  saveCardioEntry(id, fields) {
    const entry = this.getCardioEntry(id);
    if (entry) Object.assign(entry, fields);
    else this.data.cardioLog.push({ id: newId(), ...fields });
    this.save();
  },

  deleteCardioEntry(id) {
    this.data.cardioLog = this.data.cardioLog.filter(e => e.id !== id);
    this.save();
  },

  // ---------- Splits ----------
  // A split is a cycle of its own workouts, with a name. You're on one at a time (the active one),
  // and "the cycle" everywhere else in the app means its places. Switching is the Switch cycle
  // pop-up on Edit cycle. Workouts aren't shared between splits: a copy of a split gets copies.

  // The split you're on.
  activeCycle() {
    return this.data.cycles.find(c => c.id === this.data.activeCycleId) || this.data.cycles[0];
  },

  getCycle(id) {
    return this.data.cycles.find(c => c.id === id) || null;
  },

  // The places of the split you're on, in order.
  cycleItems() {
    return this.activeCycle().items;
  },

  // The split a workout belongs to, or null if there's no such workout.
  cycleOf(workoutId) {
    return this.data.cycles.find(c => c.items.some(item => item.workoutId === workoutId)) || null;
  },

  switchCycle(id) {
    if (!this.getCycle(id)) return;
    this.data.activeCycleId = id;
    this.save();
  },

  // A new split, which becomes the one you're on. With copyFrom (another split), it starts with a
  // copy of each of that split's workouts in the same order, rest days too. The copies are their
  // own workouts, so changing one split never changes the other.
  addCycle(name, copyFrom = null) {
    const cycle = { id: newId(), name, items: [] };
    const copies = {}; // a copied workout's id → its copy's id (a workout in the cycle twice is copied once)
    for (const item of copyFrom ? copyFrom.items : []) {
      if (item.kind === 'workout' && !copies[item.workoutId]) {
        const source = this.getWorkout(item.workoutId);
        const copy = { id: newId(), name: source.name, exercises: source.exercises.map(ex => ({ ...ex, id: newId() })) };
        this.data.workouts.push(copy);
        copies[item.workoutId] = copy.id;
      }
      cycle.items.push(item.kind === 'workout'
        ? { id: newId(), kind: 'workout', workoutId: copies[item.workoutId] }
        : { id: newId(), kind: 'rest' });
    }
    this.data.cycles.push(cycle);
    this.data.activeCycleId = cycle.id;
    this.save();
    return cycle;
  },

  renameCycle(id, name) {
    this.getCycle(id).name = name;
    this.save();
  },

  // Deletes a split and its workouts (a workout of it that's in progress is discarded). Workouts
  // already finished stay in history. The last split left can't be deleted. If it was the one
  // you're on, the first split left takes its place.
  deleteCycle(id) {
    const cycle = this.getCycle(id);
    if (!cycle || this.data.cycles.length < 2) return;
    const gone = new Set(cycle.items.filter(item => item.kind === 'workout').map(item => item.workoutId));
    this.data.workouts = this.data.workouts.filter(w => !gone.has(w.id));
    if (this.data.draft && gone.has(this.data.draft.workoutId)) this.data.draft = null;
    this.data.cycles = this.data.cycles.filter(c => c !== cycle);
    if (this.data.activeCycleId === id) this.data.activeCycleId = this.data.cycles[0].id;
    this.save();
  },

  // ---------- Workouts and the cycle (of the split you're on) ----------

  getWorkout(id) {
    return this.data.workouts.find(w => w.id === id) || null;
  },

  // A place in the cycle, by its id (null if it's not in the split you're on).
  getCycleItem(id) {
    return this.cycleItems().find(item => item.id === id) || null;
  },

  // The workouts in the cycle, in order, a workout as many times as it's in it (rest days left out).
  cycleWorkouts(cycle = this.activeCycle()) {
    return cycle.items.filter(item => item.kind === 'workout').map(item => this.getWorkout(item.workoutId));
  },

  // Is there room in the cycle for another workout? (The split you're on, unless another is given.)
  cycleHasRoom(cycle = this.activeCycle()) {
    return this.cycleWorkouts(cycle).length < MAX_CYCLE_WORKOUTS;
  },

  // A new workout, added to the end of the cycle. exercises (optional, for Copy workout) are copied
  // with new ids, so the copy can be changed without touching the original.
  // cycle = the split it goes in: the one you're on, unless the + menu's Planned workout picked
  // another (or a workout of another split is being copied).
  addWorkout(name, exercises = [], cycle = this.activeCycle()) {
    const workout = { id: newId(), name, exercises: exercises.map(ex => ({ ...ex, id: newId() })) };
    this.data.workouts.push(workout);
    cycle.items.push({ id: newId(), kind: 'workout', workoutId: workout.id });
    this.save();
    return workout;
  },

  // Adds a workout that's already in the cycle once more, or a rest day reminder (workoutId null),
  // at the end of the cycle.
  addToCycle(workoutId = null) {
    this.cycleItems().push(workoutId ? { id: newId(), kind: 'workout', workoutId } : { id: newId(), kind: 'rest' });
    this.save();
  },

  // Takes one place out of the cycle. A workout that isn't in the cycle anywhere else is deleted
  // with it (app.js asks first), since every workout lives in the cycle.
  removeFromCycle(itemId) {
    const cycle = this.activeCycle();
    const item = this.getCycleItem(itemId);
    cycle.items = cycle.items.filter(i => i !== item);
    if (item.kind === 'workout' && !cycle.items.some(i => i.workoutId === item.workoutId)) this.deleteWorkout(item.workoutId);
    this.save();
  },

  // Is this the only place in the cycle that has its workout?
  isOnlyPlaceFor(itemId) {
    const item = this.getCycleItem(itemId);
    return item.kind === 'workout' && this.cycleItems().filter(i => i.workoutId === item.workoutId).length === 1;
  },

  // Puts the cycle in this order (a list of its items' ids), after dragging one.
  setCycleOrder(itemIds) {
    this.cycleItems().sort((a, b) => itemIds.indexOf(a.id) - itemIds.indexOf(b.id));
    this.save();
  },

  renameWorkout(id, name) {
    this.getWorkout(id).name = name;
    this.save();
  },

  // Its finished sessions stay in history (they keep their own name and sets).
  // It comes out of every place in the cycle too.
  deleteWorkout(id) {
    this.data.workouts = this.data.workouts.filter(w => w.id !== id);
    for (const cycle of this.data.cycles) cycle.items = cycle.items.filter(item => item.workoutId !== id);
    if (this.data.draft && this.data.draft.workoutId === id) this.data.draft = null;
    this.save();
  },

  // Where in a split's cycle you last were (the split you're on, unless another is given): the
  // index of the place the most recently finished planned workout of that split was done as, or
  // -1 if there's none (nothing finished in it, or it's no longer in the cycle).
  // Always worked out from history, never saved, so it can't drift: undoing or deleting a workout
  // moves it back by itself, and switching back to a split carries on where it was left. Quick
  // workouts and other splits' workouts don't count.
  //   - its own place, if it's still in the cycle
  //   - otherwise (a workout from before version 14, or its place was removed) the first place
  //     with the same workout
  //   - otherwise -1, so Next Up starts the cycle over
  lastCycleIndex(cycle = this.activeCycle()) {
    const last = [...this.data.sessions].reverse().find(s => !s.quick && s.workoutId && s.cycleId === cycle.id);
    if (!last) return -1;
    const own = cycle.items.findIndex(item => item.id === last.cycleItemId);
    return own >= 0 ? own : cycle.items.findIndex(item => item.workoutId === last.workoutId);
  },

  // The workout to do next: the first workout after where you last were (going round to the start),
  // skipping rest day reminders.
  //   { item (its place in the cycle), workout, restBefore (a rest day reminder was skipped to get
  //     here, so the screen can say so) }, or null if the cycle has no workouts.
  nextUp(split = this.activeCycle()) {
    const cycle = split.items;
    const from = this.lastCycleIndex(split);
    let restBefore = false;
    for (let step = 1; step <= cycle.length; step++) {
      const item = cycle[(from + step + cycle.length) % cycle.length];
      if (item.kind === 'rest') {
        restBefore = true;
        continue;
      }
      return { item, workout: this.getWorkout(item.workoutId), restBefore: restBefore && from >= 0 };
    }
    return null;
  },

  // Which place in the cycle a workout being started counts as: the one it was opened from, if
  // that's this workout; otherwise the first place with this workout from Next Up on (so with a
  // workout in the cycle twice, the next one coming up). null if it isn't in the cycle.
  // (It goes by the workout's own split, which is nearly always the one you're on.)
  cyclePlaceFor(workoutId, itemId = null) {
    const split = this.cycleOf(workoutId);
    if (!split) return null;
    const cycle = split.items;
    if (cycle.find(item => item.id === itemId)?.workoutId === workoutId) return itemId;
    const start = Math.max(0, cycle.indexOf(this.nextUp(split)?.item));
    for (let step = 0; step < cycle.length; step++) {
      const item = cycle[(start + step) % cycle.length];
      if (item.workoutId === workoutId) return item.id;
    }
    return null;
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

  // Removes a custom exercise from search and from every workout. It's only marked as deleted,
  // so finished workouts and its log keep their name and muscles.
  deleteCustomExercise(id) {
    this.data.customExercises.find(e => e.id === id).deleted = true;
    for (const workout of this.data.workouts) {
      workout.exercises.filter(e => e.refId === id).forEach(e => this.keepLoggedSets(workout.id, e));
      workout.exercises = workout.exercises.filter(e => e.refId !== id);
    }
    this.save();
  },

  // The planned workouts that use an exercise.
  workoutsUsing(refId) {
    return this.data.workouts.filter(w => w.exercises.some(e => e.refId === refId));
  },

  exerciseNote(refId) {
    return this.data.exerciseNotes[refId] || '';
  },

  setExerciseNote(refId, text) {
    if (text.trim()) this.data.exerciseNotes[refId] = text;
    else delete this.data.exerciseNotes[refId];
    this.save();
  },

  // fields: { refId, sets, repMin, repMax }
  addExercise(workoutId, fields) {
    const exercise = { id: newId(), ...fields };
    this.getWorkout(workoutId).exercises.push(exercise);
    this.save();
    return exercise;
  },

  updateExercise(workoutId, exerciseId, fields) {
    const exercise = this.getWorkout(workoutId).exercises.find(e => e.id === exerciseId);
    // Changed to a different exercise: sets already logged today stay with the old one.
    if (fields.refId && fields.refId !== exercise.refId) this.keepLoggedSets(workoutId, exercise);
    Object.assign(exercise, fields);
    this.save();
  },

  deleteExercise(workoutId, exerciseId) {
    const workout = this.getWorkout(workoutId);
    const exercise = workout.exercises.find(e => e.id === exerciseId);
    if (exercise) this.keepLoggedSets(workoutId, exercise);
    workout.exercises = workout.exercises.filter(e => e.id !== exerciseId);
    this.save();
  },

  // An exercise is leaving the plan while its workout is in progress. Sets already logged today
  // shouldn't be lost, so they carry on as an exercise added for today only (draft.added), which
  // is saved with the workout as usual. Sets with no reps yet just go.
  keepLoggedSets(workoutId, exercise) {
    const draft = this.data.draft;
    if (!draft || draft.quick || draft.workoutId !== workoutId) return;
    const logged = (draft.entries[exercise.id] || []).filter(s => s.reps !== '');
    const refId = draft.swaps[exercise.id] || exercise.refId;
    delete draft.entries[exercise.id];
    delete draft.swaps[exercise.id];
    if (!logged.length) return;
    const id = newId();
    draft.added.push({ id, refId });
    draft.entries[id] = logged.map(({ extra, ...set }) => set);
  },

  // Moves an exercise to the end of another workout, keeping its sets, reps and id.
  moveExerciseToWorkout(fromWorkoutId, exerciseId, toWorkoutId) {
    const from = this.getWorkout(fromWorkoutId);
    const exercise = from.exercises.find(e => e.id === exerciseId);
    from.exercises = from.exercises.filter(e => e !== exercise);
    this.getWorkout(toWorkoutId).exercises.push(exercise);
    this.save();
  },

  // The sets and reps last used for an exercise, to start a new one with: from a workout it's
  // in, otherwise from the last time it was logged with targets. null if neither.
  lastTargets(refId) {
    for (const workout of this.data.workouts) {
      const ex = workout.exercises.find(e => e.refId === refId);
      if (ex) return { sets: ex.sets, repMin: ex.repMin, repMax: ex.repMax };
    }
    for (let i = this.data.sessions.length - 1; i >= 0; i--) {
      const entry = this.data.sessions[i].exercises.find(e => e.refId === refId && e.targetSets && e.targetRepMin);
      if (entry) return { sets: entry.targetSets, repMin: entry.targetRepMin, repMax: entry.targetRepMax };
    }
    return null;
  },

  // Puts a workout's exercises in this order (a list of their ids), after dragging one.
  setExerciseOrder(workoutId, exerciseIds) {
    const workout = this.getWorkout(workoutId);
    workout.exercises.sort((a, b) => exerciseIds.indexOf(a.id) - exerciseIds.indexOf(b.id));
    this.save();
  },

  // ---------- Sessions (finished workouts) ----------

  // Most recent logged sets for a workout's exercise, or null if never done.
  // Matching the refId too means that if you switch the exercise to a different
  // one, you don't see the old exercise's numbers. An exercise never logged in this
  // workout (e.g. in a new copy of a workout) falls back to the last time that exercise
  // was done in any workout.
  // Returns { date, sets: [ { weight, reps } ] }
  lastResult(workoutExercise) {
    for (let i = this.data.sessions.length - 1; i >= 0; i--) {
      const session = this.data.sessions[i];
      const entry = session.exercises.find(e =>
        e.exerciseId === workoutExercise.id && (!e.refId || e.refId === workoutExercise.refId));
      if (entry && entry.sets.length) return { date: session.date, sets: entry.sets };
    }
    const history = this.exerciseHistory(workoutExercise.refId);
    const last = history[history.length - 1];
    return last ? { date: last.date, sets: last.sets } : null;
  },

  lastSessionFor(workoutId) {
    for (let i = this.data.sessions.length - 1; i >= 0; i--) {
      if (this.data.sessions[i].workoutId === workoutId) return this.data.sessions[i];
    }
    return null;
  },

  // ---------- Draft (the workout in progress) ----------
  // Saved on every keystroke so nothing is lost if the phone locks
  // or the app gets closed mid-workout.

  // The workout the draft is for: the planned workout, or for a quick workout a stand-in
  // built from the draft ({ id: 'quick', quick: true, name, exercises: [{ id, refId, sets }] }),
  // so the workout screen and the checks below can treat both the same way. null if no draft.
  draftWorkout() {
    const draft = this.data.draft;
    if (!draft) return null;
    if (!draft.quick) {
      // A planned workout, plus anything added for today only (marked today: true).
      const workout = this.getWorkout(draft.workoutId);
      if (!workout || !draft.added.length) return workout;
      const added = draft.added.map(e => ({ ...e, today: true, sets: (draft.entries[e.id] || []).length }));
      return { ...workout, exercises: [...workout.exercises, ...added] };
    }
    return {
      id: 'quick',
      quick: true,
      name: draft.name,
      exercises: draft.exercises.map(e => ({ ...e, sets: (draft.entries[e.id] || []).length })),
    };
  },

  // ---------- Quick workout (a one-off, not added to the plan) ----------

  // Starts an empty quick workout (replacing any other workout in progress; app.js asks first).
  startQuick() {
    this.data.draft = { quick: true, workoutId: null, name: 'Quick workout', startedAt: new Date().toISOString(),
      pausedAt: null, pausedMs: 0,
      exercises: [], entries: {}, swaps: {} };
    this.save();
  },

  renameQuick(name) {
    this.data.draft.name = name;
    this.save();
  },

  // Puts a quick workout's exercises in this order (a list of their ids), after dragging one.
  // It's only for this workout: a quick workout isn't in the plan.
  setQuickOrder(exerciseIds) {
    const draft = this.data.draft;
    draft.exercises.sort((a, b) => exerciseIds.indexOf(a.id) - exerciseIds.indexOf(b.id));
    this.save();
  },

  // The weight a new set starts with (lbs or null): last time's weight (on a bodyweight exercise,
  // that's last time's added weight). A timed exercise (plank) never has a weight.
  startWeight(refId, lastWeight) {
    if (Library.isTimed(refId)) return null;
    return lastWeight ?? null;
  },

  // Your body weight on a date (lbs): the latest logged by then, or the first ever logged. 0 if none.
  bodyWeightOn(date) {
    const log = this.data.bodyWeightLog;
    const day = dayKey(new Date(date));
    return ([...log].reverse().find(e => e.day <= day) || log[0])?.lbs || 0;
  },

  // Adds an exercise with one set, its weight prefilled from the last time it was done. Returns its id.
  // On a planned workout it's added for today only (draft.added): the plan doesn't change.
  quickAddExercise(refId) {
    const draft = this.data.draft;
    const id = newId();
    (draft.quick ? draft.exercises : draft.added).push({ id, refId });
    const history = this.exerciseHistory(refId);
    const lastSets = history[history.length - 1]?.sets || [];
    draft.entries[id] = [{ weight: this.startWeight(refId, lastSets[0]?.weight), reps: '' }];
    this.save();
    return id;
  },

  // One more set row, with the weight of the set above. If that's empty, so is this one
  // (except a bodyweight exercise, which always starts with your body weight).
  // On a planned exercise it's marked extra: a bonus set for today, on top of the plan.
  addDraftSet(exerciseId) {
    const draft = this.data.draft;
    const workout = this.draftWorkout();
    const rows = draft.entries[exerciseId];
    const ex = workout.exercises.find(e => e.id === exerciseId);
    const refId = draft.swaps[exerciseId] || ex.refId;
    rows.push({ weight: rows[rows.length - 1]?.weight ?? this.startWeight(refId, null), reps: '', ...(workout.quick || ex.today ? {} : { extra: true }) });
    this.save();
  },

  // Can the last set of this exercise be taken off? On a quick workout or an exercise added for
  // today, if at least one would be left (Remove exercise is for the rest). On a planned exercise,
  // only a set added today: a planned set that's skipped is just left empty.
  canRemoveDraftSet(exerciseId) {
    const draft = this.data.draft;
    const rows = draft.entries[exerciseId];
    const loose = draft.quick || draft.added.some(e => e.id === exerciseId);
    return loose ? rows.length > 1 : Boolean(rows[rows.length - 1]?.extra);
  },

  removeDraftSet(exerciseId) {
    if (this.canRemoveDraftSet(exerciseId)) this.data.draft.entries[exerciseId].pop();
    this.save();
  },

  quickRemoveExercise(exerciseId) {
    const draft = this.data.draft;
    if (draft.quick) draft.exercises = draft.exercises.filter(e => e.id !== exerciseId);
    else draft.added = draft.added.filter(e => e.id !== exerciseId);
    delete draft.entries[exerciseId];
    this.save();
  },

  // Makes sure there's a draft for this workout with one row per target set, then any extra sets.
  // Each set's weight (lbs, or null) starts from startWeight(); reps start empty.
  // cycleItemId = the place in the cycle a new draft counts as (see cyclePlaceFor()).
  ensureDraft(workout, cycleItemId = null) {
    let draft = this.data.draft;
    if (!draft || draft.workoutId !== workout.id) {
      draft = { workoutId: workout.id, cycleItemId, startedAt: new Date().toISOString(), pausedAt: null, pausedMs: 0, entries: {}, swaps: {}, added: [] };
      this.data.draft = draft;
    }
    for (const ex of workout.exercises) {
      const lastSets = this.lastFor(ex)?.sets || [];
      const refId = this.swappedRef(ex.id) || ex.refId;
      const rows = draft.entries[ex.id] || [];
      const planned = rows.filter(r => !r.extra);
      // Keeps rows already typed in; adds or trims if the set count was edited (a set that's
      // already logged isn't trimmed: it stays as an extra set). Extra sets stay after them.
      draft.entries[ex.id] = [
        ...Array.from({ length: ex.sets }, (_, i) => planned[i] || { weight: this.startWeight(refId, lastSets[i]?.weight), reps: '' }),
        ...planned.slice(ex.sets).filter(r => r.reps !== '').map(r => ({ ...r, extra: true })),
        ...rows.filter(r => r.extra),
      ];
    }
    this.save();
    return draft;
  },

  // field is 'weight' (lbs number or null) or 'reps' (text as typed)
  // Typing reps also notes when (loggedAt), so a workout left running can end at its last set.
  updateDraftSet(exerciseId, setIndex, field, value) {
    const set = this.data.draft.entries[exerciseId][setIndex];
    set[field] = value;
    if (field === 'reps') {
      if (value !== '') set.loggedAt = new Date().toISOString();
      else delete set.loggedAt;
    }
    this.save();
  },

  // ---------- Workout timer ----------
  // Worked out from the saved start time, never counted up while the app runs, so it stays right
  // when the app is closed or the phone is locked. Paused time (pausedMs, plus the pause going on
  // now since pausedAt) doesn't count.

  // How long the workout in progress has run, in ms, at `now` (or at the pause, if paused then).
  draftElapsed(now = Date.now()) {
    const draft = this.data.draft;
    if (!draft) return 0;
    const pausedAt = draft.pausedAt ? new Date(draft.pausedAt).getTime() : Infinity;
    const end = Math.min(now, pausedAt);
    return Math.max(0, end - new Date(draft.startedAt).getTime() - (draft.pausedMs || 0));
  },

  isDraftPaused() {
    return Boolean(this.data.draft?.pausedAt);
  },

  pauseDraft() {
    this.data.draft.pausedAt = new Date().toISOString();
    this.save();
  },

  resumeDraft() {
    const draft = this.data.draft;
    draft.pausedMs = (draft.pausedMs || 0) + (Date.now() - new Date(draft.pausedAt).getTime());
    draft.pausedAt = null;
    this.save();
  },

  // When the last set of the workout in progress was logged (ms), or null if none has a time.
  lastSetTime() {
    let last = null;
    for (const rows of Object.values(this.data.draft?.entries || {})) {
      for (const set of rows) {
        if (set.loggedAt && set.reps !== '') last = Math.max(last ?? 0, new Date(set.loggedAt).getTime());
      }
    }
    return last;
  },

  // True once any set of this exercise has reps typed in.
  draftHasReps(exerciseId) {
    const rows = this.data.draft?.entries[exerciseId] || [];
    return rows.some(s => s.reps !== '');
  },

  // The exercise swapped in for today in place of a day exercise (its refId), or null.
  swappedRef(exerciseId) {
    return this.data.draft?.swaps[exerciseId] || null;
  },

  // Last time's sets for a day exercise in this workout: those of the swapped-in
  // exercise if it was swapped for today, otherwise lastResult().
  lastFor(dayExercise) {
    const swapped = this.swappedRef(dayExercise.id);
    if (!swapped) return this.lastResult(dayExercise);
    const history = this.exerciseHistory(swapped);
    const last = history[history.length - 1];
    return last ? { date: last.date, sets: last.sets } : null;
  },

  // Does a different exercise in place of a planned one, for this workout only
  // (the weekly plan doesn't change). Its sets start over, prefilled from its own last time.
  // Swapping back to the planned exercise undoes the swap.
  swapExercise(workout, exerciseId, refId) {
    const ex = workout.exercises.find(e => e.id === exerciseId);
    const swaps = this.data.draft.swaps;
    if (refId === ex.refId) delete swaps[exerciseId];
    else swaps[exerciseId] = refId;
    delete this.data.draft.entries[exerciseId];
    this.ensureDraft(workout);
  },

  discardDraft() {
    this.data.draft = null;
    this.save();
  },

  // Turns the draft into a saved session. Only sets with reps entered are saved
  // (weights are prefilled, so a weight alone doesn't mean the set was done).
  // Returns the session, or null if nothing was filled in.
  // endAt (ms, optional) = when it ended, for a workout left running ("Use last set time"):
  // it's saved as finished then, which also decides which day and week it counts for.
  finishDraft(endAt = null) {
    const draft = this.data.draft;
    const workout = this.draftWorkout();
    const end = endAt ?? Date.now();
    const date = new Date(end).toISOString();
    const durationMs = this.draftElapsed(end);
    const toNumber = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

    const exercises = [];
    for (const ex of workout.exercises) {
      const sets = (draft.entries[ex.id] || [])
        .map(s => ({ weight: toNumber(s.weight), reps: toNumber(s.reps) }))
        .filter(s => s.reps !== null);
      if (sets.length) {
        // Name and muscles are copied in, so history stays right even if the
        // exercise is later changed or removed. A swapped exercise is saved as itself,
        // under the planned exercise's id so it still counts for the planned sets.
        const swapped = draft.swaps[ex.id];
        const refId = swapped || ex.refId;
        const info = Library.forExercise({ refId });
        exercises.push({
          exerciseId: ex.id,
          refId,
          ...(swapped ? { swappedFrom: ex.refId } : {}),
          name: info.name,
          primary: info.primary,
          secondary: info.secondary,
          // A quick workout has no targets. Neither does one added for today, and it's left out of
          // the plan below.
          ...(ex.today ? { today: true }
            : !workout.quick ? { targetSets: ex.sets, targetRepMin: ex.repMin, targetRepMax: ex.repMax } : {}),
          sets,
        });
      }
    }
    if (!exercises.length) return null;

    // A quick workout isn't in the cycle: no workout id, no place in the cycle and no plan.
    // It doesn't count toward the streak (see streak.js).
    const session = workout.quick ? {
      id: newId(),
      quick: true,
      workoutId: null,
      cycleItemId: null,
      cycleId: null,
      workoutName: workout.name.trim() || 'Quick workout',
      date,
      durationMs,
      plan: [],
      exercises,
    } : {
      id: newId(),
      workoutId: workout.id,
      cycleItemId: draft.cycleItemId || null,
      cycleId: this.cycleOf(workout.id)?.id || null, // the split it was done in
      workoutName: workout.name,
      date,
      durationMs,
      plan: workout.exercises.filter(e => !e.today).map(e => ({ exerciseId: e.id, refId: e.refId, sets: e.sets })),
      exercises,
    };
    // Sessions stay oldest first (one ended at its last set can be older than the newest).
    const at = this.data.sessions.findIndex(s => new Date(s.date) > new Date(date));
    if (at === -1) this.data.sessions.push(session);
    else this.data.sessions.splice(at, 0, session);
    this.data.draft = null;
    this.save();
    return session;
  },

  // What's still empty in the workout in progress, shown before finishing:
  //   [{ name: 'Barbell Bench Press', problems: ['Set 3: no reps', 'Set 2: no weight'] }]
  // A set with no reps won't be saved. A missing weight is only flagged on
  // non-bodyweight exercises (a bodyweight set can have none, if no body weight is logged).
  draftGaps() {
    const draft = this.data.draft;
    const workout = this.draftWorkout();
    if (!workout) return [];
    const gaps = [];
    for (const ex of workout.exercises) {
      const info = Library.forExercise({ refId: draft.swaps[ex.id] || ex.refId });
      const problems = [];
      (draft.entries[ex.id] || []).forEach((set, i) => {
        if (set.reps === '' || set.reps == null) problems.push(`Set ${i + 1}: no ${Library.isTimed(info.id) ? 'time' : 'reps'}`);
        else if (set.weight == null && info.equipment !== 'Bodyweight') problems.push(`Set ${i + 1}: no weight`);
      });
      if (problems.length) gaps.push({ name: info.name, problems });
    }
    return gaps;
  },

  // How far along one exercise of the workout in progress is, for its row's badge:
  //   { filled: sets with reps, total: sets, complete: every set has reps (and a weight,
  //     unless it's a bodyweight exercise) }
  draftProgress(exerciseId) {
    const draft = this.data.draft;
    const rows = draft?.entries[exerciseId] || [];
    const ex = this.draftWorkout()?.exercises.find(e => e.id === exerciseId);
    const info = Library.forExercise({ refId: draft?.swaps[exerciseId] || ex?.refId });
    const hasReps = set => set.reps !== '' && set.reps != null;
    const filled = rows.filter(hasReps).length;
    const complete = rows.length > 0 && rows.every(set => hasReps(set) && (set.weight != null || info.equipment === 'Bodyweight'));
    return { filled, total: rows.length, complete };
  },

  // Sets logged so far in the whole workout in progress: { filled, total }.
  draftTotals() {
    const totals = { filled: 0, total: 0 };
    for (const ex of this.draftWorkout()?.exercises || []) {
      const progress = this.draftProgress(ex.id);
      totals.filled += progress.filled;
      totals.total += progress.total;
    }
    return totals;
  },

  // The first exercise that isn't filled in yet (its id), or null if they all are.
  firstUnfinished() {
    const first = (this.draftWorkout()?.exercises || []).find(ex => !this.draftProgress(ex.id).complete);
    return first ? first.id : null;
  },

  // Did every planned set of this exercise reach the top of its rep range, all at the same weight?
  // Then it's time to go heavier: returns that weight in lbs, otherwise null.
  // Exercises with no target or no real weight to raise (bodyweight, plank) never ask.
  readyForMoreWeight(exerciseId) {
    const draft = this.data.draft;
    const ex = this.draftWorkout()?.exercises.find(e => e.id === exerciseId);
    if (!ex?.repMax) return null;
    if (Library.forExercise({ refId: draft.swaps[exerciseId] || ex.refId }).equipment === 'Bodyweight') return null;
    const rows = (draft.entries[exerciseId] || []).filter(r => !r.extra);
    const weight = rows[0]?.weight;
    if (!weight || !rows.every(r => r.weight === weight && Number(r.reps) >= ex.repMax)) return null;
    return weight;
  },

  // The same question about the last time this exercise was done, for the "Try 140 lbs today"
  // reminder. It goes away by itself: once a heavier weight is logged, the reps fall below the top.
  // Also gone once a heavier weight is in today's boxes. Returns last time's weight in lbs, or null.
  readyLastTime(ex) {
    if (!ex.repMax) return null;
    if (Library.forExercise({ refId: this.swappedRef(ex.id) || ex.refId }).equipment === 'Bodyweight') return null;
    const rows = (this.lastFor(ex)?.sets || []).slice(0, ex.sets);
    const weight = rows[0]?.weight;
    if (!weight || rows.length < ex.sets || !rows.every(r => r.weight === weight && r.reps >= ex.repMax)) return null;
    if (this.data.draft?.entries[ex.id]?.[0]?.weight > weight) return null;
    return weight;
  },

  // Weights in the workout in progress that look like typos, to check at Finish: over half as
  // heavy again as this exercise's heaviest ever (and at least 25 lbs more, since small dumbbell
  // jumps are real), or over 1000 lbs the first time it's done. Only sets with reps count.
  //   [{ id, name, weight, heaviest (null the first time) }]
  draftWeightChecks() {
    const draft = this.data.draft;
    const checks = [];
    for (const ex of this.draftWorkout()?.exercises || []) {
      const refId = draft.swaps?.[ex.id] || ex.refId;
      const weight = Math.max(0, ...(draft.entries[ex.id] || []).filter(s => s.reps !== '').map(s => s.weight || 0));
      if (!weight) continue;
      const past = this.exerciseHistory(refId).flatMap(h => h.sets).map(s => s.weight || 0);
      const heaviest = past.length ? Math.max(...past) : 0;
      if (heaviest ? weight > heaviest * 1.5 && weight - heaviest >= 25 : weight > 1000) {
        checks.push({ id: ex.id, name: Library.forExercise({ refId }).name, weight, heaviest: heaviest || null });
      }
    }
    return checks;
  },

  // Undo for a workout just finished: removes its session and puts back the
  // workout in progress exactly as it was (draft = a copy saved before finishing).
  undoFinish(sessionId, draft) {
    this.data.sessions = this.data.sessions.filter(s => s.id !== sessionId);
    this.data.draft = draft;
    this.save();
  },

  // ---------- Past workouts ----------
  // Logs, the muscle map and "last time" are always worked out from sessions, so they
  // follow these changes by themselves. The streak is re-checked from the workout's week
  // by the caller (Streak.rejudge).

  getSession(id) {
    return this.data.sessions.find(s => s.id === id) || null;
  },

  // Replaces a past workout's exercises (each with its edited sets). Exercises left
  // with no sets are dropped. Its date, day and plan stay as they were.
  updateSession(id, exercises) {
    const session = this.getSession(id);
    session.exercises = exercises.filter(e => e.sets.length);
    this.save();
  },

  deleteSession(id) {
    this.data.sessions = this.data.sessions.filter(s => s.id !== id);
    this.save();
  },

  // ---------- Settings ----------

  updateSettings(fields) {
    Object.assign(this.data.settings, fields);
    this.save();
  },

  // Changes your body weight and logs it under today (a second change today replaces the first).
  setBodyWeight(lbs) {
    this.data.settings.bodyWeightLbs = lbs;
    const today = dayKey(new Date());
    const log = this.data.bodyWeightLog;
    if (log[log.length - 1]?.day === today) log[log.length - 1].lbs = lbs;
    else log.push({ day: today, lbs });
    this.save();
  },

  // Fixes the weight logged on one day.
  editBodyWeight(day, lbs) {
    const entry = this.data.bodyWeightLog.find(e => e.day === day);
    if (!entry) return;
    entry.lbs = lbs;
    this.syncBodyWeight();
    this.save();
  },

  // Removes the weight logged on one day.
  deleteBodyWeight(day) {
    this.data.bodyWeightLog = this.data.bodyWeightLog.filter(e => e.day !== day);
    this.syncBodyWeight();
    this.save();
  },

  // "Your body weight" (used for levels and bodyweight exercises) is always the newest entry
  // in the log, or none once the log is empty.
  syncBodyWeight() {
    const log = this.data.bodyWeightLog;
    this.data.settings.bodyWeightLbs = log.length ? log[log.length - 1].lbs : null;
  },

  // ---------- Backup ----------

  exportBackup() {
    this.data.settings.lastBackupAt = new Date().toISOString();
    this.save();
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
    // (Backups from before version 14 have days; newer ones have workouts instead.)
    if (!parsed || !(Array.isArray(parsed.days) || Array.isArray(parsed.workouts)) || !Array.isArray(parsed.sessions)) {
      throw new Error('This file is not a GitFit backup.');
    }
    this.data = normalize(parsed);
    this.save();
  },

  // ---------- Exercise log ----------

  // Every finished workout that included this exercise, oldest first:
  //   [{ sessionId, workoutName, date (ISO), dayKey ('YYYY-MM-DD', local), sets: [{weight, reps}],
  //      best: {set, max} or null, hold: longest seconds (timed exercises only),
  //      topReps: most reps in one set with no added weight (bodyweight exercises only; 0 if none) }]
  // best = the set with the highest estimated 1-rep max (null if no set had a weight, or it's timed).
  // On a bodyweight exercise, that's from the added weight: sets with and without it are tracked
  // separately, so 6 reps with 25 lbs added doesn't look like fewer reps than 10 with none.
  exerciseHistory(refId) {
    const timed = Library.isTimed(refId);
    const repsOnly = Library.isRepsOnly(refId);
    const history = [];
    for (const session of this.data.sessions) {
      const sets = session.exercises.filter(e => e.refId === refId).flatMap(e => e.sets);
      if (!sets.length) continue;
      let best = null;
      for (const set of sets) {
        const max = timed ? null : estimateMax(set);
        if (max != null && (!best || max > best.max)) best = { set, max };
      }
      history.push({ sessionId: session.id, workoutName: session.workoutName, date: session.date,
        dayKey: dayKey(session.date), sets, best,
        ...(timed ? { hold: Math.max(0, ...sets.map(s => s.reps || 0)) } : {}),
        ...(repsOnly ? { topReps: Math.max(0, ...sets.filter(s => !s.weight).map(s => s.reps || 0)) } : {}) });
    }
    return history.sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  // Exercises you've logged, most recent first: [{ refId, name, date (last done), count (workouts) }]
  loggedExercises() {
    const list = new Map();
    for (let i = this.data.sessions.length - 1; i >= 0; i--) {
      const session = this.data.sessions[i];
      for (const entry of session.exercises) {
        if (!entry.refId) continue;
        const item = list.get(entry.refId);
        if (item) item.count++;
        else list.set(entry.refId, { refId: entry.refId, name: Library.get(entry.refId)?.name || entry.name, date: session.date, count: 1 });
      }
    }
    return [...list.values()];
  },

  // What a just-finished workout is shown with on its summary:
  //   { sessionId, name, durationMs, sets, exercises, volume (lbs: weight × reps of every set),
  //     moreThanLast (% more weight than the last time of this workout, or null),
  //     bests: [{ refId, name, before, after, timed, repsOnly }] }
  // A best = beating every earlier workout of that exercise (estimated max, longest hold, or max reps).
  // The first time doing an exercise doesn't count, or every new exercise would be a best.
  sessionSummary(session) {
    // Dumbbell weights are per dumbbell, so they count twice here: you lifted both.
    const volumeOf = s => s.exercises.reduce((sum, e) => {
      const each = Library.get(e.refId)?.equipment === 'Dumbbell' ? 2 : 1;
      // A bodyweight exercise lifts your body weight as well as any added weight.
      const body = Library.isRepsOnly(e.refId) ? this.bodyWeightOn(s.date) : 0;
      return sum + each * e.sets.reduce((n, set) => n + (Library.isTimed(e.refId) ? 0 : ((set.weight || 0) + body) * (set.reps || 0)), 0);
    }, 0);
    const bests = [];
    for (const entry of session.exercises) {
      if (!entry.refId) continue;
      const timed = Library.isTimed(entry.refId);
      const earlier = this.exerciseHistory(entry.refId).filter(h => new Date(h.date) < new Date(session.date));
      // A bodyweight exercise has two separate bests: reps with no added weight, and with added weight.
      const reps = sets => Math.max(0, ...sets.filter(s => !s.weight).map(s => s.reps || 0));
      const estimate = sets => Math.max(0, ...sets.map(s => estimateMax(s) || 0));
      const tracks = timed ? [{ score: sets => Math.max(0, ...sets.map(s => s.reps || 0)), timed }]
        : Library.isRepsOnly(entry.refId) ? [{ score: reps, repsOnly: true }, { score: estimate, label: ' (weighted)' }]
        : [{ score: estimate }];
      for (const { score, label = '', ...kind } of tracks) {
        const after = score(entry.sets);
        const before = Math.max(0, ...earlier.map(h => score(h.sets)));
        if (before && after > before) bests.push({ refId: entry.refId, name: entry.name + label, before, after, ...kind });
      }
    }
    const previous = session.workoutId && [...this.data.sessions].reverse()
      .find(s => s.workoutId === session.workoutId && new Date(s.date) < new Date(session.date));
    const volume = volumeOf(session);
    const lastVolume = previous ? volumeOf(previous) : 0;
    return {
      sessionId: session.id,
      name: session.workoutName,
      durationMs: session.durationMs,
      sets: session.exercises.reduce((n, e) => n + e.sets.length, 0),
      exercises: session.exercises.length,
      volume,
      moreThanLast: lastVolume && volume > lastVolume ? Math.round((volume - lastVolume) / lastVolume * 100) : null,
      bests,
    };
  },

  // Wipes everything and starts over with one empty split and default settings.
  deleteAll() {
    this.data = emptyData();
    this.save();
  },
};
