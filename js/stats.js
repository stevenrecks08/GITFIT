// stats.js — per-muscle numbers for the muscle map and set summaries:
// growth comes from logged workouts, planned sets from your weekly plan.
// Every exercise trains its primary muscles fully (1) and secondary muscles half (0.5).

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
        secondary: info.secondary || [],
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
  // For each exercise: its first vs. latest best set in that time. A muscle's number is
  // the average over its exercises (secondary ones count half). Muscles without
  // enough data are left out.
  muscleGrowth(now = Date.now()) {
    const exercises = {};
    for (const entry of loggedSince(now - this.GROWTH_WEEKS * WEEK_MS)) {
      const best = Math.max(0, ...entry.sets.map(set => estimateMax(set) || 0));
      if (!best) continue; // bodyweight-only: no estimated max
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
      forEachMuscle(entry, (m, share) => {
        if (!sums[m]) sums[m] = { total: 0, weight: 0 };
        sums[m].total += change * share;
        sums[m].weight += share;
      });
    }

    const growth = {};
    for (const m in sums) growth[m] = sums[m].total / sums[m].weight;
    return growth;
  },

  // Planned sets from your week (not logged workouts), for a list of day exercises:
  //   muscles = { muscleId: sets }       each exercise's target sets × 1 (primary) or × 0.5 (secondary)
  //   groups  = { 'Chest': sets, … }    per muscle group; an exercise counts once per group,
  //                                      at its biggest share there (a row hitting lats and upper back
  //                                      as primary adds its sets to Back once, not twice)
  plannedSets(exercises) {
    const muscles = {};
    const groups = {};
    for (const ex of exercises) {
      const info = Library.forExercise(ex);
      const groupShare = {};
      forEachMuscle(info, (m, share) => {
        muscles[m] = (muscles[m] || 0) + ex.sets * share;
        const g = MUSCLE_GROUP_OF[m];
        groupShare[g] = Math.max(groupShare[g] || 0, share);
      });
      for (const g in groupShare) groups[g] = (groups[g] || 0) + ex.sets * groupShare[g];
    }
    return { muscles, groups };
  },

  // Planned sets for the whole week (rest days have no exercises).
  weekPlannedSets() {
    return this.plannedSets(Store.data.days.filter(d => !d.rest).flatMap(d => d.exercises));
  },
};
