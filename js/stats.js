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

// Suggested planned sets per week: [low, high]. 10–20 is a common guideline for building muscle.
// Chest is split into three parts, so each part gets the smaller range, as do the other smaller
// muscles. Muscles left out here have no target: they usually get enough from other exercises.
const BIG_TARGET = [10, 20];
const SMALL_TARGET = [6, 12];
const MUSCLE_TARGETS = {
  quads: BIG_TARGET, hamstrings: BIG_TARGET, glutes: BIG_TARGET, lats: BIG_TARGET,
  upperBack: BIG_TARGET, sideDelts: BIG_TARGET, biceps: BIG_TARGET, triceps: BIG_TARGET,
  upperChest: SMALL_TARGET, midChest: SMALL_TARGET, lowerChest: SMALL_TARGET, frontDelts: SMALL_TARGET,
  rearDelts: SMALL_TARGET, calves: SMALL_TARGET, abs: SMALL_TARGET,
};
const NO_TARGET_SCALE = 20; // the bar of a muscle with no target fills at this many sets

const Stats = {
  GROWTH_WEEKS: 6,
  MIN_WEEKS: 3, // an exercise needs this many different weeks logged to count for growth
  ENDS_WEEKS: 2, // growth compares the best of an exercise's first and last this-many weeks

  // Every exercise logged in the last 6 weeks and how it's going:
  //   [{ refId, name, primary, weeks (different weeks logged), counts (enough weeks to count),
  //      early, recent (its best in its first and last 2 weeks), change (% from early to recent) }]
  // Comparing bests means one bad workout, or even one bad week, doesn't look like getting weaker.
  // A bodyweight exercise uses its max reps instead of an estimated max (8 → 10 reps = +25%),
  // and a timed one its longest hold (40 → 50 sec = +25%).
  exerciseGrowth(now = Date.now()) {
    const exercises = {};
    for (const entry of loggedSince(now - this.GROWTH_WEEKS * WEEK_MS)) {
      // A plank's seconds are saved as its reps, so this covers both.
      const noEstimate = Library.isRepsOnly(entry.refId) || Library.isTimed(entry.refId);
      const best = Math.max(0, ...entry.sets.map(set => (noEstimate ? set.reps : estimateMax(set)) || 0));
      if (!best) continue; // no reps, or no weight to estimate a max from
      if (!exercises[entry.refId]) exercises[entry.refId] = { entry, points: [] };
      exercises[entry.refId].points.push({ time: entry.time, best });
    }

    return Object.values(exercises).map(({ entry, points }) => {
      const times = points.map(p => p.time);
      const ends = this.ENDS_WEEKS * WEEK_MS;
      const bestWhere = test => Math.max(...points.filter(p => test(p.time)).map(p => p.best));
      const early = bestWhere(t => t < Math.min(...times) + ends);
      const recent = bestWhere(t => t > Math.max(...times) - ends);
      const weeks = new Set(times.map(t => Math.floor((now - t) / WEEK_MS))).size;
      return { refId: entry.refId, name: entry.name, primary: entry.primary, weeks, counts: weeks >= this.MIN_WEEKS,
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

  // Planned sets from your week (not logged workouts), for a list of day exercises:
  //   muscles = { muscleId: sets }       each exercise's target sets × 1 (primary) or × 0.5 (secondary)
  //   sources = { muscleId: [ { name, sets, role: 'primary' | 'secondary', workoutId, where: 'Mon · Upper A' } ] }
  //                                      the exercises behind each muscle's number, most sets first
  //                                      (one row per workout an exercise is in)
  // workouts = the workouts to count.
  plannedSets(workouts) {
    const muscles = {};
    const sources = {};
    for (const workout of workouts) {
      const where = `${WEEKDAYS[workout.weekday].slice(0, 3)} · ${workout.name}`;
      for (const ex of workout.exercises) {
        const info = Library.forExercise(ex);
        forEachMuscle(info, (m, share) => {
          muscles[m] = (muscles[m] || 0) + ex.sets * share;

          const list = sources[m] || (sources[m] = []);
          const same = list.find(s => s.refId === ex.refId && s.workoutId === workout.id);
          if (same) same.sets += ex.sets * share;
          else list.push({ refId: ex.refId, name: info.name, sets: ex.sets * share, role: share === 1 ? 'primary' : 'secondary', workoutId: workout.id, where });
        });
      }
    }
    for (const m in sources) sources[m].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
    return { muscles, sources };
  },

  // How a muscle's planned sets for the week compare with its suggested range:
  //   { state: 'low' | 'good' | 'high' | 'none' (no target), fraction (how full its bar is, 0–1) }
  // The bar is full at the top of the range.
  targetState(muscleId, sets) {
    const target = MUSCLE_TARGETS[muscleId];
    if (!target) return { state: 'none', fraction: Math.min(1, sets / NO_TARGET_SCALE) };
    const [low, high] = target;
    return { state: sets < low ? 'low' : sets > high ? 'high' : 'good', fraction: Math.min(1, sets / high) };
  },

  // Planned sets for the whole week (workouts on rest days don't count).
  weekPlannedSets() {
    return this.plannedSets(Store.plannedWorkouts());
  },

  // Planned sets for one day: every workout on that weekday.
  dayPlannedSets(weekday) {
    return this.plannedSets(Store.workoutsOn(weekday));
  },
};
