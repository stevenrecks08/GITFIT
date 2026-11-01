// streak.js — the weekly streak.
//
// A week runs Monday 3 am → next Monday 3 am (phone time), so a late workout finished
// just after midnight Sunday still counts for that week. A workout counts for the week
// Finish was tapped in, whichever weekday it was planned for.
//
// A week is "hit" when every planned set of every planned workout that week is logged
// (a set is logged when it has reps). What's planned that week:
//   - each workout on a day that isn't a rest day (each workout counts once)
//   - a workout already finished this week → its plan as it was when it was first logged
//     this week (saved with the workout), so later plan edits don't change it
//   - a day that has passed (at 3 am the next morning) is locked as it was then (streak.locks):
//     its workouts and their plans still count even if they're edited, deleted, moved away or
//     the day is made a rest day; and if it was a rest day then, making it a training day later
//     doesn't add it. A workout moved or added onto a day that has already passed still counts.
//   - otherwise (today and later days) → the current plan
// Each planned exercise counts at most its planned sets, so extra sets on one exercise
// don't make up for another. Sets of an exercise swapped for today count for the one it replaced.
//
// Each week's result is decided once and only changes if a workout is changed later
// (editing or deleting a past workout re-judges its week and every week after: rejudge(),
// and Undo right after finishing takes back a hit that workout made: undoHit()):
//   hit    → streak +1. Decided the moment it happens. Every WEEKS_PER_FREEZE (4) weeks in a row
//            (streak 4, 8, 12 …) earns a freeze, up to MAX_FREEZES held.
//   frozen → the week ended with at least FREEZE_LINE (90%) of planned sets, a freeze was held
//            and the streak was above 0: the freeze is used and the streak stays where it is
//   missed → anything else when the week ends: streak back to 0
//   empty  → nothing was planned: no change
// Tracking starts the first full week after a plan with at least one exercise exists.
//
// Every number (current, best, freezes) is worked out from the list of results, so they can't drift.

const WEEK_START_HOUR = 3;
const FREEZE_LINE = 0.9;
const MAX_FREEZES = 2;
const WEEKS_PER_FREEZE = 4; // a freeze is earned at streak 4, 8, 12 …
const MILESTONE_WEEKS = 4;  // a bigger celebration every 4 weeks
const RECENT_WEEKS = 8;    // past weeks shown in the strip on Profile (plus this week)
const LOCK_WEEKS = 12;     // day locks kept this many weeks back (re-judging older weeks uses the current plan)

// Monday 3 am of the week a time falls in.
function weekStartOf(time) {
  const d = new Date(time);
  d.setHours(d.getHours() - WEEK_START_HOUR); // 0:00–2:59 belongs to the day before
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7, WEEK_START_HOUR);
}

// A week as 'YYYY-MM-DD' of its Monday. These sort in date order as text.
function weekKey(time) {
  return dayKey(weekStartOf(time));
}

// The week n weeks after (or before, if negative) a week key.
function addWeeks(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + 7 * n));
}

// How many days of this week have passed (Monday = 0 … 6). A day passes at 3 am the next morning.
function daysPassed(now = Date.now()) {
  const d = new Date(now);
  d.setHours(d.getHours() - WEEK_START_HOUR);
  return (d.getDay() + 6) % 7;
}

// A workout's current plan in the same form as the plan saved with a finished workout.
function currentPlan(workout) {
  return workout.exercises.map(e => ({ exerciseId: e.id, refId: e.refId, sets: e.sets }));
}

// A weekday as it is right now, in the form kept in streak.locks.
function dayLock(weekday) {
  return {
    rest: Store.isRestDay(weekday),
    workouts: Store.workoutsOn(weekday).map(w => ({ workoutId: w.id, plan: currentPlan(w) })),
  };
}

const Streak = {
  // Set when a week is hit, to the new streak number; app.js shows the celebration and clears it.
  celebrate: null,

  // Planned and logged sets for one week, counting finished workouts only.
  progress(key) {
    const sessions = Store.data.sessions.filter(s => weekKey(s.date) === key);
    const locks = Store.data.streak.locks[key] || {};

    // The week's planned workouts: [{ workoutId, plan }], each workout once.
    const plannedWorkouts = [];
    const seen = new Set();
    const add = (workoutId, plan) => {
      if (seen.has(workoutId)) return;
      seen.add(workoutId);
      plannedWorkouts.push({ workoutId, plan });
    };
    for (let weekday = 0; weekday < 7; weekday++) {
      const lock = locks[weekday];
      if (lock) {
        // A passed day: as it was then, plus any workout put on it since.
        if (!lock.rest) lock.workouts.forEach(w => add(w.workoutId, w.plan));
        const locked = new Set(lock.workouts.map(w => w.workoutId));
        Store.workoutsOn(weekday).filter(w => !locked.has(w.id)).forEach(w => add(w.id, currentPlan(w)));
      } else if (!Store.isRestDay(weekday)) {
        Store.workoutsOn(weekday).forEach(w => add(w.id, currentPlan(w)));
      }
    }

    let planned = 0;
    let logged = 0;
    for (const { workoutId, plan: dayPlan } of plannedWorkouts) {
      const done = sessions.filter(s => s.workoutId === workoutId);
      // Workouts saved before streaks existed have no plan; they fall back to the day's.
      const plan = done.length && done[0].plan ? done[0].plan : dayPlan;
      const entries = done.flatMap(s => s.exercises);
      for (const item of plan) {
        const sets = entries.filter(e => e.exerciseId === item.exerciseId)
          .reduce((n, e) => n + e.sets.length, 0);
        planned += item.sets;
        logged += Math.min(item.sets, sets);
      }
    }
    return { planned, logged };
  },

  // Locks each day of a week that has passed (up to `upTo` days), as it is now.
  // Called before anything can be changed, so "now" is how the day was when it passed.
  lockDays(key, upTo) {
    const locks = Store.data.streak.locks;
    const week = locks[key] || (locks[key] = {});
    let changed = false;
    for (let weekday = 0; weekday < upTo; weekday++) {
      if (week[weekday]) continue;
      week[weekday] = dayLock(weekday);
      changed = true;
    }
    return changed;
  },

  // A workout on a day that has passed this week, not done yet this week, that still counts
  // as it was (so editing or deleting it won't change this week). Returns that day's name, or null.
  lockedDay(workoutId, now = Date.now()) {
    const key = weekKey(now);
    const locks = Store.data.streak.locks[key] || {};
    if (Store.data.sessions.some(s => s.workoutId === workoutId && weekKey(s.date) === key)) return null;
    for (const weekday in locks) {
      const lock = locks[weekday];
      if (!lock.rest && lock.workouts.some(w => w.workoutId === workoutId)) return WEEKDAYS[weekday];
    }
    return null;
  },

  // Whether a weekday has already passed in a tracked week (so it's locked for this week).
  hasPassed(weekday, now = Date.now()) {
    const start = Store.data.streak.start;
    return Boolean(start) && weekKey(now) >= start && weekday < daysPassed(now);
  },

  // Current streak, best streak and freezes held, from the week results so far.
  totals(weeks = Store.data.streak.weeks) {
    let current = 0, best = 0, freezes = 0;
    for (const w of weeks) {
      if (w.result === 'hit') {
        current++;
        best = Math.max(best, current);
        if (current % WEEKS_PER_FREEZE === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
      } else if (w.result === 'frozen') {
        freezes--;
      } else if (w.result === 'missed') {
        current = 0;
      }
    }
    return { current, best, freezes };
  },

  // Brings the streak up to date: starts tracking once there's a plan, decides every
  // week that has ended, and locks this week as hit as soon as it is.
  // Safe to call any time; returns true if anything changed.
  update(now = Date.now(), { quiet = false } = {}) {
    const streak = Store.data.streak;
    const thisWeek = weekKey(now);

    if (!streak.start) {
      const hasPlan = Store.plannedWorkouts().some(w => w.exercises.length);
      if (!hasPlan) return false;
      streak.start = addWeeks(thisWeek, 1);
      Store.save();
      return true;
    }

    let changed = false;
    const last = streak.weeks[streak.weeks.length - 1];
    for (let key = last ? addWeeks(last.week, 1) : streak.start; key < thisWeek; key = addWeeks(key, 1)) {
      // Days of an ended week not locked yet (the app was closed) are as they are now.
      // (When re-judging, older weeks keep whatever locks they have.)
      if (!quiet && this.lockDays(key, 7)) changed = true;
      const { planned, logged } = this.progress(key);
      const before = this.totals();
      let result;
      if (!planned) result = 'empty';
      else if (logged >= planned) result = 'hit';
      // (A freeze isn't wasted on a streak of 0.)
      else if (logged / planned >= FREEZE_LINE && before.freezes > 0 && before.current > 0) result = 'frozen';
      else result = 'missed';
      streak.weeks.push({ week: key, result, logged, planned });

      const done = `${weekRange(key)}: you logged ${logged} of ${planned} sets (${percent(logged, planned)}%).`;
      if (quiet) {
        // Re-judged after a past workout was edited: no notice.
      } else if (result === 'frozen') {
        const left = before.freezes - 1;
        streak.notices.push(`${done} A streak freeze was used, so your ${before.current}-week streak is safe. `
          + `${left} freeze${left === 1 ? '' : 's'} left.`);
      } else if (result === 'missed' && before.current > 0) {
        const why = logged / planned >= FREEZE_LINE ? ' You were over 90%, but had no freezes left.' : '';
        streak.notices.push(`${done}${why} Your ${before.current}-week streak ended — start a new one this week!`);
      }
      changed = true;
    }

    if (thisWeek >= streak.start) {
      if (this.lockDays(thisWeek, daysPassed(now))) changed = true;
      const oldest = addWeeks(thisWeek, -LOCK_WEEKS);
      for (const key in streak.locks) if (key < oldest) delete streak.locks[key];
    }

    if (thisWeek >= streak.start && !streak.weeks.some(w => w.week === thisWeek)) {
      const { planned, logged } = this.progress(thisWeek);
      if (planned && logged >= planned) {
        streak.weeks.push({ week: thisWeek, result: 'hit', logged, planned });
        this.celebrate = this.totals().current;
        changed = true;
      }
    }

    if (changed) Store.save();
    return changed;
  },

  // Undo of a finished workout that hit this week: takes the hit back off,
  // so it can be hit again once the workout is finished for real.
  // A past workout was edited or deleted: that week and every week after it are judged
  // again from the workouts as they are now, so the streak and freezes match them.
  // Re-judged weeks don't show notices. This week only celebrates if it wasn't already hit.
  rejudge(sessionDate, now = Date.now()) {
    const streak = Store.data.streak;
    const from = weekKey(new Date(sessionDate).getTime());
    const thisWeek = weekKey(now);
    const wasHit = streak.weeks.some(w => w.week === thisWeek && w.result === 'hit');
    streak.weeks = streak.weeks.filter(w => w.week < from);
    this.update(now, { quiet: true });
    if (wasHit) this.celebrate = null;
    Store.save();
  },

  undoHit(now = Date.now()) {
    const streak = Store.data.streak;
    streak.weeks = streak.weeks.filter(w => !(w.week === weekKey(now) && w.result === 'hit'));
    this.celebrate = null;
    Store.save();
  },

  // Everything the Profile shows:
  //   started (false until the first tracked week), start (its key), totals,
  //   week = this week's { planned, logged, hit },
  //   recent = the last RECENT_WEEKS weeks + this one, oldest first: [{ key, status }]
  //     status: 'hit' | 'frozen' | 'missed' | 'empty' | 'current' (this week, not hit yet) | 'untracked'
  summary(now = Date.now()) {
    const streak = Store.data.streak;
    const thisWeek = weekKey(now);
    const record = key => streak.weeks.find(w => w.week === key);
    const recent = [];
    for (let i = RECENT_WEEKS; i >= 0; i--) {
      const key = addWeeks(thisWeek, -i);
      const status = record(key)?.result
        || (!streak.start || key < streak.start ? 'untracked' : 'current');
      recent.push({ key, status, isThisWeek: i === 0 });
    }
    return {
      started: Boolean(streak.start) && thisWeek >= streak.start,
      start: streak.start,
      totals: this.totals(),
      week: { ...this.progress(thisWeek), hit: record(thisWeek)?.result === 'hit' },
      recent,
    };
  },
};

// Whole percent, rounded down so 89.9% never shows as 90%.
function percent(part, whole) {
  return Math.floor(part / whole * 100);
}

// "Oct 26 – Nov 1" for a week key.
function weekRange(key) {
  const [y, m, d] = key.split('-').map(Number);
  const fmt = date => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(new Date(y, m - 1, d))} – ${fmt(new Date(y, m - 1, d + 6))}`;
}
