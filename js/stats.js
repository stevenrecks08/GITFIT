// stats.js — per-muscle numbers for the muscle map and set summaries:
// growth comes from logged workouts, planned sets from your cycle, actual sets from the last 7 days.
// For planned and actual sets, every exercise trains its primary muscles fully (1) and secondary
// muscles half (0.5). Growth and levels only look at primary muscles.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// Each exercise logged since `since` (ms), with when it was done and the muscles it trains.
function loggedSince(since) {
  const list = [];
  for (const session of Store.data.sessions) {
    const time = new Date(session.date).getTime();
    if (time < since) continue;
    for (const entry of session.exercises) {
      // Use the exercise's current muscles; fall back to the ones saved with the workout.
      const info = Library.get(entry.refId) || entry;
      list.push({
        time,
        refId: entry.refId || entry.exerciseId,
        name: info.name || entry.name,
        sets: entry.sets,
        primary: info.primary || [],
      });
    }
  }
  return list;
}

// Calls add(muscleId, share) for every muscle an exercise trains.
function forEachMuscle(entry, add) {
  for (const m of entry.primary) add(m, 1);
  for (const m of entry.secondary) add(m, 0.5);
}

// Adds an exercise's sets to the muscles it trains, and to the list of exercises behind each
// muscle's number (one row per `key`, so the same exercise in two workouts gets two rows).
//   row = what the row shows: { key, name, where, action, id } (action/id = what tapping it opens)
function addSets(muscles, sources, info, sets, row) {
  forEachMuscle(info, (m, share) => {
    muscles[m] = (muscles[m] || 0) + sets * share;
    const list = sources[m] || (sources[m] = []);
    const same = list.find(s => s.key === row.key);
    if (same) same.sets += sets * share;
    else list.push({ ...row, sets: sets * share, role: share === 1 ? 'primary' : 'secondary' });
  });
}

// Most sets first, then by name.
function sortSources(sources) {
  for (const m in sources) sources[m].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
}

const Stats = {
  GROWTH_WEEKS: 6,
  MIN_WEEKS: 3, // an exercise needs this many different weeks logged to count for growth
  ENDS_WEEKS: 2, // growth compares the best of an exercise's first and last this-many weeks

  // Every exercise logged in the last 6 weeks and how it's going:
  //   [{ refId, name, primary, kind ('weight', 'reps' or 'hold'), weeks (different weeks logged),
  //      counts (enough weeks to count), early, recent (its best in its first and last 2 weeks),
  //      change (% from early to recent) }]
  // Comparing bests means one bad workout, or even one bad week, doesn't look like getting weaker.
  // A bodyweight exercise counts as two separate exercises: sets with no added weight use max reps
  // (8 → 10 reps = +25%), and sets with added weight an estimated max like any other exercise.
  // A timed one uses its longest hold (40 → 50 sec = +25%).
  exerciseGrowth(now = Date.now()) {
    const exercises = {};
    const add = (entry, kind, best, suffix = '') => {
      if (!best) return; // no reps, or no weight to estimate a max from
      const key = entry.refId + suffix;
      if (!exercises[key]) exercises[key] = { entry, kind, name: entry.name + suffix, points: [] };
      exercises[key].points.push({ time: entry.time, best });
    };
    for (const entry of loggedSince(now - this.GROWTH_WEEKS * WEEK_MS)) {
      const estimate = Math.max(0, ...entry.sets.map(set => estimateMax(set) || 0));
      // A plank's seconds are saved as its reps.
      if (Library.isTimed(entry.refId)) add(entry, 'hold', Math.max(0, ...entry.sets.map(set => set.reps || 0)));
      else if (Library.isRepsOnly(entry.refId)) {
        add(entry, 'reps', Math.max(0, ...entry.sets.filter(set => !set.weight).map(set => set.reps || 0)));
        add(entry, 'weight', estimate, ' (weighted)');
      } else add(entry, 'weight', estimate);
    }

    return Object.values(exercises).map(({ entry, kind, name, points }) => {
      const times = points.map(p => p.time);
      const ends = this.ENDS_WEEKS * WEEK_MS;
      const bestWhere = test => Math.max(...points.filter(p => test(p.time)).map(p => p.best));
      const early = bestWhere(t => t < Math.min(...times) + ends);
      const recent = bestWhere(t => t > Math.max(...times) - ends);
      const weeks = new Set(times.map(t => Math.floor((now - t) / WEEK_MS))).size;
      return { refId: entry.refId, name, kind, primary: entry.primary, weeks, counts: weeks >= this.MIN_WEEKS,
        early, recent, change: (recent - early) / early * 100 };
    });
  },

  // { muscleId: % change over the last 6 weeks }: the average over the exercises that train it as
  // a primary muscle (getting stronger at a bench press doesn't prove the triceps grew).
  // Muscles without enough data are left out.
  muscleGrowth(now = Date.now()) {
    const sums = {};
    for (const ex of this.exerciseGrowth(now).filter(e => e.counts)) {
      for (const m of ex.primary) {
        if (!sums[m]) sums[m] = { total: 0, count: 0 };
        sums[m].total += ex.change;
        sums[m].count += 1;
      }
    }

    const growth = {};
    for (const m in sums) growth[m] = sums[m].total / sums[m].count;
    return growth;
  },

  // Each logged exercise with published standards (standards.js), placed into a level from its
  // latest estimated max, your body weight and sex: [{ refId, name, primary, level: 0–4, max }]
  // Empty without a logged body weight and a sex.
  exerciseLevels() {
    const { sex, bodyWeightLbs } = Store.data.settings;
    if (!bodyWeightLbs || !sex) return [];
    const list = [];
    for (const refId in STANDARDS) {
      const weighted = Store.exerciseHistory(refId).filter(h => h.best);
      if (!weighted.length) continue;
      const max = weighted[weighted.length - 1].best.max;
      const { name, primary } = Library.get(refId);
      list.push({ refId, name, primary, max, level: Standards.levelOf(max, Standards.thresholds(refId, sex, bodyWeightLbs)) });
    }
    return list;
  },

  // { muscleId: { level: 0–4, exercise: 'Incline Barbell Bench Press' } }
  // A muscle takes the best level among the exercises that train it as a primary muscle.
  muscleLevels() {
    const levels = {};
    for (const ex of this.exerciseLevels()) {
      for (const m of ex.primary) {
        if (!levels[m] || ex.level > levels[m].level) levels[m] = { level: ex.level, exercise: ex.name };
      }
    }
    return levels;
  },

  // Whether any exercise with published standards trains this muscle as a primary muscle.
  hasStandards(muscleId) {
    return Object.keys(STANDARDS).some(refId => Library.get(refId).primary.includes(muscleId));
  },

  // Planned sets (not logged workouts) for a list of workouts:
  //   muscles = { muscleId: sets }       each exercise's target sets × 1 (primary) or × 0.5 (secondary)
  //   sources = { muscleId: [ { name, where (the workout's name), sets, role: 'primary' | 'secondary',
  //                             action: 'open-workout', id (the workout's id) } ] }
  //                                      the exercises behind each muscle's number, most sets first
  //                                      (one row per workout an exercise is in)
  // workouts = the workouts to count. A workout in the list twice counts twice.
  plannedSets(workouts) {
    const muscles = {};
    const sources = {};
    for (const workout of workouts) {
      for (const ex of workout.exercises) {
        const info = Library.forExercise(ex);
        addSets(muscles, sources, info, ex.sets,
          { key: `${ex.refId}|${workout.id}`, name: info.name, where: workout.name, action: 'open-workout', id: workout.id });
      }
    }
    sortSources(sources);
    return { muscles, sources };
  },

  // Planned sets for one time through the cycle (a workout in it twice counts twice).
  cyclePlannedSets() {
    return this.plannedSets(Store.cycleWorkouts());
  },

  // Sets actually logged in the last 7 days (now back to the same time a week ago), in the same
  // form as plannedSets(). Every finished workout counts, quick ones too. Each exercise has one row,
  // saying how many workouts it was in, and opens its log.
  actualSets(now = Date.now()) {
    const muscles = {};
    const sources = {};
    const times = {}; // how many workouts each exercise was in
    for (const session of Store.data.sessions) {
      const time = new Date(session.date).getTime();
      if (time < now - WEEK_MS || time > now) continue;
      for (const entry of session.exercises) {
        if (!entry.sets.length) continue;
        // Use the exercise's current muscles; fall back to the ones saved with the workout.
        const info = Library.get(entry.refId) || { name: entry.name, primary: entry.primary || [], secondary: entry.secondary || [] };
        times[entry.refId] = (times[entry.refId] || new Set()).add(session.id);
        addSets(muscles, sources, info, entry.sets.length,
          { key: entry.refId, name: info.name || entry.name, action: 'view-log', id: entry.refId });
      }
    }
    for (const m in sources) {
      for (const s of sources[m]) {
        const n = times[s.key].size;
        s.where = `${n} workout${n === 1 ? '' : 's'}`;
      }
    }
    sortSources(sources);
    return { muscles, sources };
  },
};
