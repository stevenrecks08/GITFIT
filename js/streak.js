// streak.js — the weekly streak.
//
// A week runs Monday 3 am → next Monday 3 am (phone time), so a late workout finished
// just after midnight Sunday still counts for that week. A workout counts for the week
// Finish was tapped in.
//
// THE STREAK
// A week is "hit" when the number of finished workouts reaches the weekly goal (settings.weeklyGoal,
// 1 to 7 workouts a week). Every finished workout from your cycle counts, done in any order, however
// many of its sets were logged; two in one day count as two. Quick workouts don't count.
//
// A change to the goal counts from next week: each week is judged against the goal it started with.
// That's kept for this week as streak.thisWeekGoal, noted the first time the app runs in a week
// (before anything can be changed in it). A week the app never ran in started with the goal as it is
// now, since the goal can only be changed while the app is open. Before the first workout is logged
// (nothing is tracked yet), a new goal counts straight away.
//
// This week stays live: it shows as hit (and celebrates) the moment it reaches its goal, and goes
// back if a workout is undone or deleted.
//
// Results:
//   hit    → streak +1. Every WEEKS_PER_FREEZE (4) weeks in a row (streak 4, 8, 12 …) earns a freeze,
//            up to MAX_FREEZES held. Hitting the very first tracked week earns one too, so someone
//            new who goes away early doesn't lose their first streak. (Weeks from before version 11
//            have no saved goal, so someone who started back then doesn't get it.)
//   frozen → the week ended short, a freeze was held and the streak was above 0: the freeze is used
//            and the streak stays where it is (a freeze isn't wasted on a streak of 0)
//   missed → the week ended short with no freeze to use: streak back to 0
//   empty  → only on weeks from before version 11, when nothing was planned: no change
// Tracking starts the week the first workout is logged, so that week counts right away.
//
// Editing or deleting a past workout re-judges its week and every week after (rejudge()), each
// against the goal saved with it. Weeks judged under older rules stay exactly as they were, never
// re-judged: before version 14 the streak counted different days with a workout (those weeks have
// days instead of workouts), and before version 11 it counted sets (those have no goal at all).

const WEEK_START_HOUR = 3;
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

// The app's day a time falls on, as 'YYYY-MM-DD': it changes at 3 am, like the week, so a workout
// finished at 1 am belongs to the day before. (The week strip and Past workouts' calendar use this.)
function appDay(time) {
  const d = new Date(time);
  d.setHours(d.getHours() - WEEK_START_HOUR);
  return dayKey(d);
}

// Was this week judged by the current rules (finished workouts)? Older weeks are never re-judged.
function judgedByWorkouts(week) {
  return week.workouts != null;
}

const Streak = {
  // Set when a week is hit, to the new streak number; app.js shows the celebration and clears it.
  celebrate: null,

  // How many workouts were finished in a week (quick workouts don't count). The streak goes by this.
  workoutsIn(key) {
    return Store.data.sessions.filter(s => !s.quick && weekKey(new Date(s.date).getTime()) === key
      && s.exercises.some(e => e.sets.length)).length;
  },

  // The goal a week is judged against: what it started with if that's known (this week), otherwise
  // the goal as it is now (see the top of this file).
  goalFor(key) {
    const kept = Store.data.streak.thisWeekGoal;
    return kept && kept.week === key ? kept.goal : Store.data.settings.weeklyGoal;
  },

  // Current streak, best streak and freezes held, from the week results so far.
  totals(weeks = Store.data.streak.weeks) {
    let current = 0, best = 0, freezes = 0;
    for (const w of weeks) {
      if (w.result === 'hit') {
        current++;
        best = Math.max(best, current);
        const firstWeek = w === weeks[0] && w.goal != null;
        if (firstWeek || current % WEEKS_PER_FREEZE === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
      } else if (w.result === 'frozen') {
        freezes--;
      } else if (w.result === 'missed') {
        current = 0;
      }
    }
    return { current, best, freezes };
  },

  // Brings the streak up to date: decides every week that has ended, and keeps this week's
  // hit in step with its workouts and its goal.
  // goals = { [week]: goal } when re-judging: the goal each ended week was judged against.
  // Safe to call any time; returns true if anything changed.
  update(now = Date.now(), { quiet = false, goals = {} } = {}) {
    const streak = Store.data.streak;
    const thisWeek = weekKey(now);
    let changed = false;

    if (!streak.start) {
      // Nothing tracked yet: the goal as it is now is this week's goal, so a change counts at once.
      const goal = Store.data.settings.weeklyGoal;
      if (streak.thisWeekGoal?.week !== thisWeek || streak.thisWeekGoal.goal !== goal) {
        streak.thisWeekGoal = { week: thisWeek, goal };
        changed = true;
      }
      if (!this.workoutsIn(thisWeek)) {
        if (changed) Store.save();
        return changed;
      }
      streak.start = thisWeek;
      changed = true;
    }

    const last = streak.weeks[streak.weeks.length - 1];
    for (let key = last ? addWeeks(last.week, 1) : streak.start; key < thisWeek; key = addWeeks(key, 1)) {
      const workouts = this.workoutsIn(key);
      const weekGoal = goals[key] ?? this.goalFor(key);
      const before = this.totals();
      let result;
      if (workouts >= weekGoal) result = 'hit';
      // (A freeze isn't wasted on a streak of 0.)
      else if (before.freezes > 0 && before.current > 0) result = 'frozen';
      else result = 'missed';
      streak.weeks.push({ week: key, result, workouts, goal: weekGoal });

      const done = `${weekRange(key)}: you did ${workouts} of ${weekGoal} workout${weekGoal === 1 ? '' : 's'}.`;
      if (quiet) {
        // Re-judged after a past workout was edited: no notice.
      } else if (result === 'frozen') {
        const left = before.freezes - 1;
        streak.notices.push(`${done} A streak freeze was used, so your ${before.current}-week streak is safe. `
          + `${left} freeze${left === 1 ? '' : 's'} left.`);
      } else if (result === 'missed' && before.current > 0) {
        streak.notices.push(`${done} Your ${before.current}-week streak ended — start a new one this week!`);
      }
      changed = true;
    }

    // This week's goal is the one it started with (noted the first time the app runs in it).
    if (streak.thisWeekGoal?.week !== thisWeek) {
      streak.thisWeekGoal = { week: thisWeek, goal: Store.data.settings.weeklyGoal };
      changed = true;
    }
    const goal = streak.thisWeekGoal.goal;

    if (thisWeek >= streak.start) {
      const workouts = this.workoutsIn(thisWeek);
      const record = streak.weeks.find(w => w.week === thisWeek);
      if (!record && workouts >= goal) {
        streak.weeks.push({ week: thisWeek, result: 'hit', workouts, goal });
        this.celebrate = this.totals().current;
        changed = true;
      } else if (record && judgedByWorkouts(record)) { // (a hit under older rules stays as it is)
        if (workouts < goal) {
          // A workout was undone or deleted: not hit after all.
          streak.weeks = streak.weeks.filter(w => w !== record);
          changed = true;
        } else if (record.workouts !== workouts || record.goal !== goal) {
          record.workouts = workouts;
          record.goal = goal;
          changed = true;
        }
      }
    }

    if (changed) Store.save();
    return changed;
  },

  // A past workout was edited or deleted: that week and every week after it are judged again
  // from the workouts as they are now, each against the goal it had, so the streak and freezes
  // match them. Weeks judged under older rules (see the top of this file) stay as they were.
  // Re-judged weeks don't show notices. This week only celebrates if it wasn't already hit.
  rejudge(sessionDate, now = Date.now()) {
    const streak = Store.data.streak;
    const from = weekKey(new Date(sessionDate).getTime());
    const thisWeek = weekKey(now);
    const wasHit = streak.weeks.some(w => w.week === thisWeek && w.result === 'hit');
    const goals = {};
    for (const w of streak.weeks) if (w.goal != null) goals[w.week] = w.goal;
    // Older weeks after `from` stay; the loop in update() only adds weeks after the last one kept,
    // so the new-rule weeks between them are dropped from the first new-rule week on.
    const firstDropped = streak.weeks.findIndex(w => w.week >= from && judgedByWorkouts(w));
    if (firstDropped >= 0) streak.weeks = streak.weeks.slice(0, firstDropped);
    this.update(now, { quiet: true, goals });
    if (wasHit) this.celebrate = null;
    Store.save();
  },

  // This week, Monday → Sunday, for the strip on the Workouts tab: the workouts that count toward
  // the streak, on the day they were finished (quick workouts don't count, so they aren't shown).
  //   [{ day: 'YYYY-MM-DD', date (Date), sessions: [finished workouts that day], today, future }]
  weekDays(now = Date.now()) {
    const start = weekStartOf(now);
    const today = appDay(now);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const day = dayKey(date);
      const sessions = Store.data.sessions.filter(s => !s.quick && appDay(s.date) === day
        && s.exercises.some(e => e.sets.length));
      return { day, date, sessions, today: day === today, future: day > today };
    });
  },

  // Everything the Profile shows:
  //   started (false until the first tracked week), start (its key), totals,
  //   week = this week's { workouts, goal (the one it started with), nextGoal (the goal from next
  //          week, if it was changed this week, else null), hit },
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
    const goal = this.goalFor(thisWeek);
    const setting = Store.data.settings.weeklyGoal;
    return {
      started: Boolean(streak.start) && thisWeek >= streak.start,
      start: streak.start,
      totals: this.totals(),
      week: { workouts: this.workoutsIn(thisWeek), goal, nextGoal: setting !== goal ? setting : null,
        hit: record(thisWeek)?.result === 'hit' },
      recent,
    };
  },
};

// "Oct 26 – Nov 1" for a week key.
function weekRange(key) {
  const [y, m, d] = key.split('-').map(Number);
  const fmt = date => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(new Date(y, m - 1, d))} – ${fmt(new Date(y, m - 1, d + 6))}`;
}
