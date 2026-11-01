// streak.js — the weekly streak.
//
// A week runs Monday 3 am → next Monday 3 am (phone time), so a late workout finished
// just after midnight Sunday still counts for that week. A workout counts for the week
// Finish was tapped in, whichever weekday it was planned for.
//
// A week is "hit" when every planned set of every planned workout that week is logged
// (a set is logged when it has reps). What's planned that week:
//   - a planned day with a finished workout this week → its plan as it was when it was
//     first logged this week (saved with the workout), so later plan edits don't change it
//   - a planned day not done yet this week → the current plan
// Each planned exercise counts at most its planned sets, so extra sets on one exercise
// don't make up for another. Sets of an exercise swapped for today count for the one it replaced.
//
// Each week's result is decided once and never changed:
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

// A day's current plan in the same form as the plan saved with a workout.
function currentPlan(day) {
  if (day.rest) return [];
  return day.exercises.map(e => ({ exerciseId: e.id, refId: e.refId, sets: e.sets }));
}

const Streak = {
  // Set when a week is hit, to the new streak number; app.js shows the celebration and clears it.
  celebrate: null,

  // Planned and logged sets for one week, counting finished workouts only.
  progress(key) {
    const sessions = Store.data.sessions.filter(s => weekKey(s.date) === key);
    let planned = 0;
    let logged = 0;
    for (const day of Store.week()) {
      const done = sessions.filter(s => s.dayId === day.id);
      // Workouts saved before streaks existed have no plan; they fall back to the current one.
      const plan = done.length && done[0].plan ? done[0].plan : currentPlan(day);
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
  update(now = Date.now()) {
    const streak = Store.data.streak;
    const thisWeek = weekKey(now);

    if (!streak.start) {
      const hasPlan = Store.week().some(d => !d.rest && d.exercises.length);
      if (!hasPlan) return false;
      streak.start = addWeeks(thisWeek, 1);
      Store.save();
      return true;
    }

    let changed = false;
    const last = streak.weeks[streak.weeks.length - 1];
    for (let key = last ? addWeeks(last.week, 1) : streak.start; key < thisWeek; key = addWeeks(key, 1)) {
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
      if (result === 'frozen') {
        const left = before.freezes - 1;
        streak.notices.push(`${done} A streak freeze was used, so your ${before.current}-week streak is safe. `
          + `${left} freeze${left === 1 ? '' : 's'} left.`);
      } else if (result === 'missed' && before.current > 0) {
        const why = logged / planned >= FREEZE_LINE ? ' You were over 90%, but had no freezes left.' : '';
        streak.notices.push(`${done}${why} Your ${before.current}-week streak ended — start a new one this week!`);
      }
      changed = true;
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
