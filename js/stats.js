// stats.js — per-muscle numbers for the muscle map and set summaries:
// growth comes from logged workouts, planned sets from your weekly plan.
// For planned sets, every exercise trains its primary muscles fully (1) and secondary muscles
// half (0.5). Growth and levels only look at primary muscles.

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

const Stats = {
  GROWTH_WEEKS: 6,
  MIN_WEEKS: 3, // an exercise needs this many different weeks logged to count for growth

  // { muscleId: % change in estimated max over the last 6 weeks }
  // A bodyweight exercise uses its max reps instead of an estimated max (8 → 10 reps = +25%),
  // and a timed one its longest hold (40 → 50 sec = +25%).
  // For each exercise: its first vs. latest best set in that time. A muscle's number is
  // the average over the exercises that train it as a primary muscle: getting stronger at a
  // bench press doesn't prove the triceps grew. Muscles without enough data are left out.
  muscleGrowth(now = Date.now()) {
    const exercises = {};
    for (const entry of loggedSince(now - this.GROWTH_WEEKS * WEEK_MS)) {
      // A plank's seconds are saved as its reps, so this covers both.
      const noEstimate = Library.isRepsOnly(entry.refId) || Library.isTimed(entry.refId);
      const best = Math.max(0, ...entry.sets.map(set => (noEstimate ? set.reps : estimateMax(set)) || 0));
      if (!best) continue; // no reps, or no weight to estimate a max from
      if (!exercises[entry.refId]) exercises[entry.refId] = { entry, points: [] };
      exercises[entry.refId].points.push({ time: entry.time, best });
    }

    const sums = {};
    for (const { entry, points } of Object.values(exercises)) {
      const weeks = new Set(points.map(p => Math.floor((now - p.time) / WEEK_MS)));
      if (weeks.size < this.MIN_WEEKS) continue;
      points.sort((a, b) => a.time - b.time);
      const first = points[0].best;
      const change = (points[points.length - 1].best - first) / first * 100;
      for (const m of entry.primary) {
        if (!sums[m]) sums[m] = { total: 0, count: 0 };
        sums[m].total += change;
        sums[m].count += 1;
      }
    }

    const growth = {};
    for (const m in sums) growth[m] = sums[m].total / sums[m].count;
    return growth;
  },

  // { muscleId: { level: 0–4, exercise: 'Incline Barbell Bench Press' } }
  // Each exercise with published standards (standards.js) is placed into a level from its
  // latest estimated max, your body weight and sex. A muscle takes the best level among the
  // exercises that train it as a primary muscle. Empty without a logged body weight.
  muscleLevels() {
    const { sex, bodyWeightLbs } = Store.data.settings;
    const levels = {};
    if (!bodyWeightLbs) return levels;
    for (const refId in STANDARDS) {
      const weighted = Store.exerciseHistory(refId).filter(h => h.best);
      if (!weighted.length) continue;
      const max = weighted[weighted.length - 1].best.max;
      const level = Standards.levelOf(max, Standards.thresholds(refId, sex, bodyWeightLbs));
      const info = Library.get(refId);
      for (const m of info.primary) {
        if (!levels[m] || level > levels[m].level) levels[m] = { level, exercise: info.name };
      }
    }
    return levels;
  },

  // Whether any exercise with published standards trains this muscle as a primary muscle.
  hasStandards(muscleId) {
    return Object.keys(STANDARDS).some(refId => Library.get(refId).primary.includes(muscleId));
  },

  // Planned sets from your week (not logged workouts), for a list of day exercises:
  //   muscles = { muscleId: sets }       each exercise's target sets × 1 (primary) or × 0.5 (secondary)
  //   groups  = { 'Chest': sets, … }    per muscle group; an exercise counts once per group,
  //                                      at its biggest share there (a row hitting lats and upper back
  //                                      as primary adds its sets to Back once, not twice)
  //   sources = { muscleId: [ { name, sets, role: 'primary' | 'secondary' } ] }
  //                                      the exercises behind each muscle's number, most sets first
  //                                      (an exercise on several days is listed once, with its sets added up)
  plannedSets(exercises) {
    const muscles = {};
    const groups = {};
    const sources = {};
    for (const ex of exercises) {
      const info = Library.forExercise(ex);
      const groupShare = {};
      forEachMuscle(info, (m, share) => {
        muscles[m] = (muscles[m] || 0) + ex.sets * share;
        const g = MUSCLE_GROUP_OF[m];
        groupShare[g] = Math.max(groupShare[g] || 0, share);

        const list = sources[m] || (sources[m] = []);
        const same = list.find(s => s.refId === ex.refId);
        if (same) same.sets += ex.sets * share;
        else list.push({ refId: ex.refId, name: info.name, sets: ex.sets * share, role: share === 1 ? 'primary' : 'secondary' });
      });
      for (const g in groupShare) groups[g] = (groups[g] || 0) + ex.sets * groupShare[g];
    }
    for (const m in sources) sources[m].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
    return { muscles, groups, sources };
  },

  // Planned sets for the whole week (workouts on rest days don't count).
  weekPlannedSets() {
    return this.plannedSets(Store.plannedWorkouts().flatMap(w => w.exercises));
  },
};
