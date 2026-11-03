// streak.js — the weekly streak.
//
// A week runs Monday 3 am → next Monday 3 am (phone time), so a late workout finished
// just after midnight Sunday still counts for that week. A workout counts for the week
// Finish was tapped in, whichever weekday it was planned for.
//
// THE STREAK
// A week is "hit" when the number of different days with a logged workout reaches the weekly goal
// (settings.weeklyGoal, 1 to 7). Any finished workout counts: planned, quick or on a rest day.
// Several workouts on one day count as one day. A workout counts on the day Finish was tapped,
// and a day runs 3 am → 3 am (daysIn()).
//
// The goal can change any time; a week is judged against the goal when it ends, and that goal is
// saved with its result. So during the week it stays live: this week shows as hit (and celebrates)
// the moment it reaches the goal, and goes back if the goal is raised past it or a workout is undone.
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
// against the goal saved with it. Weeks judged before version 11 used the old set-counting rules:
// they have no saved goal, and they stay exactly as they were, never re-judged.
//
// Every number (current, best, freezes) is worked out from the list of results, so they can't drift.
//
// THE WEEK VIEW (not the streak)
// The Workouts tab still shows each workout on a passed day as done, partial, missed or
// "caught up <day>" (dayStates()), which goes by sets. What's planned that week:
//   - every workout on the week (each counts once; a day with no workouts is a rest day and plans nothing)
//   - a workout already finished this week → its plan as it was when it was first logged
//     this week (saved with the workout), so later plan edits don't change it
//   - a day that has passed (at 3 am the next morning) is locked as it was then (streak.locks).
//     A workout moved or added onto a day that has already passed still counts.
//   - otherwise (today and later days) → the current plan
// Each planned exercise counts at most its planned sets, so extra sets on one exercise
// don't make up for another. Sets of an exercise swapped for today count for the one it replaced
// only if both are in the same muscle group (Library.groupOf: Chest, Shoulders, Back, Arms,
// Forearms, Core or Legs).
//
// Quick workouts (one-offs, not in the plan) can make up missed sets there:
//   - planned sets still missing (after every planned workout's sets are counted) on a day that
//     had already passed (3 am the next morning) when the quick workout was finished,
//   - made up by quick workout sets of an exercise in the same muscle group,
//   - each missed exercise up to its missing sets. Quick workouts fill in oldest first.
//     An exercise added for a particular missed one (Catch up / Missed this week, entry.makeupFor)
//     makes that one up first, then any other missed sets in its group, oldest first.
// Because planned sets are counted first, doing the planned workout late as well never counts
// the same sets twice.

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

// The muscle group of a logged exercise: from the exercise's current muscles,
// falling back to the ones saved with the workout (as stats.js does).
function entryGroup(entry) {
  return Library.groupOf(Library.get(entry.refId) || entry);
}

// Counts up to `sets` more sets toward a planned exercise (never past its planned sets),
// remembering when, and which quick workout it was if it's made up by one (by). Returns how many were used.
function credit(item, date, sets, by = null) {
  const used = Math.min(sets, item.short);
  if (used) {
    item.short -= used;
    item.credits.push({ time: new Date(date).getTime(), sets: used, by });
  }
  return used;
}

// When a fully done planned exercise got its last needed set (ms).
function doneAt(item) {
  let total = 0;
  for (const c of [...item.credits].sort((a, b) => a.time - b.time)) {
    total += c.sets;
    if (total >= item.sets) return c.time;
  }
  return 0;
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

  // How many different days of a week have a logged workout. The streak goes by this number.
  // (daysPassed gives a time's day of its week, with the day changing at 3 am.)
  daysIn(key) {
    const days = new Set();
    for (const s of Store.data.sessions) {
      const time = new Date(s.date).getTime();
      if (weekKey(time) === key && s.exercises.some(e => e.sets.length)) days.add(daysPassed(time));
    }
    return days.size;
  },

  // Planned and logged sets for one week, counting finished workouts only. For the week view
  // (dayStates()); the streak doesn't use it.
  progress(key, now = Date.now()) {
    const sessions = Store.data.sessions.filter(s => weekKey(s.date) === key);
    const locks = Store.data.streak.locks[key] || {};

    // The week's planned workouts: [{ workoutId, weekday, plan }], each workout once.
    const plannedWorkouts = [];
    const seen = new Set();
    const add = (workoutId, weekday, plan) => {
      if (seen.has(workoutId)) return;
      seen.add(workoutId);
      plannedWorkouts.push({ workoutId, weekday, plan });
    };
    for (let weekday = 0; weekday < 7; weekday++) {
      const lock = locks[weekday];
      if (lock) {
        // A passed day: as it was then, plus any workout put on it since.
        if (!lock.rest) lock.workouts.forEach(w => add(w.workoutId, weekday, w.plan));
        const locked = new Set(lock.workouts.map(w => w.workoutId));
        Store.workoutsOn(weekday).filter(w => !locked.has(w.id)).forEach(w => add(w.id, weekday, currentPlan(w)));
      } else if (!Store.isRestDay(weekday)) {
        Store.workoutsOn(weekday).forEach(w => add(w.id, weekday, currentPlan(w)));
      }
    }

    // Every planned exercise of the week, with when its sets were counted:
    //   { workoutId, weekday, exerciseId, refId, group, sets (planned), short (still missing),
    //     credits: [{ time, sets }] }
    const items = [];

    // 1. Planned workouts' own sets (in whichever session of that workout, any day this week).
    for (const { workoutId, weekday, plan: dayPlan } of plannedWorkouts) {
      const done = sessions.filter(s => s.workoutId === workoutId)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      // Workouts saved before streaks existed have no plan; they fall back to the day's.
      const plan = done.length && done[0].plan ? done[0].plan : dayPlan;
      for (const p of plan) {
        const item = { workoutId, weekday, exerciseId: p.exerciseId, refId: p.refId,
          group: Library.groupOf(Library.forExercise(p)), sets: p.sets, short: p.sets, credits: [] };
        items.push(item);
        for (const s of done) {
          // A swapped-in exercise only counts if it's in the same group as the planned one.
          const sets = s.exercises.filter(e => e.exerciseId === p.exerciseId
            && (!e.swappedFrom || entryGroup(e) === item.group))
            .reduce((n, e) => n + e.sets.length, 0);
          credit(item, s.date, sets);
        }
      }
    }

    // 2. Quick workouts make up missed sets in the same group, only for days that had already
    //    passed when the quick workout was finished. An exercise added for a particular missed
    //    exercise (Catch up or the Missed this week list: entry.makeupFor) makes that one up first;
    //    any other sets go to the oldest missed sets in its group.
    const quick = sessions.filter(s => s.quick).sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const session of quick) {
      const passed = daysPassed(new Date(session.date).getTime());
      for (const entry of session.exercises) {
        const group = entryGroup(entry);
        let left = entry.sets.length;
        const target = entry.makeupFor && items.find(i =>
          i.workoutId === entry.makeupFor.workoutId && i.exerciseId === entry.makeupFor.exerciseId);
        const order = target ? [target, ...items.filter(i => i !== target)] : items;
        for (const item of order) {
          if (!left) break;
          if (item.weekday >= passed || !item.short) continue;
          if (item !== target && item.group !== group) continue;
          left -= credit(item, session.date, left, session.workoutName);
        }
      }
    }

    // How many days have passed (a whole ended week has passed).
    const passedNow = key < weekKey(now) ? 7 : key === weekKey(now) ? daysPassed(now) : 0;
    return { items, passedNow };
  },

  // How each planned workout on a day that has passed this week went, for the week screen
  // and the Missed this week list. Today and later days are never missed.
  //   { [workoutId]: { weekday, planned, done, state: 'done' | 'partial' | 'missed',
  //                    caughtUp (weekday name it was completed on, if after its own day, else null),
  //                    missing: [{ exerciseId, refId, sets (still missing) }],
  //                    madeUp: { [quick workout's name]: sets it made up } } }
  dayStates(now = Date.now()) {
    const { items, passedNow } = this.progress(weekKey(now), now);
    const states = {};
    for (const item of items) {
      if (item.weekday >= passedNow) continue;
      const s = states[item.workoutId] || (states[item.workoutId] =
        { weekday: item.weekday, planned: 0, done: 0, finishedAt: 0, missing: [], madeUp: {} });
      for (const c of item.credits) if (c.by) s.madeUp[c.by] = (s.madeUp[c.by] || 0) + c.sets;
      s.planned += item.sets;
      s.done += item.sets - item.short;
      if (item.short) s.missing.push({ exerciseId: item.exerciseId, refId: item.refId, sets: item.short });
      else s.finishedAt = Math.max(s.finishedAt, doneAt(item));
    }
    for (const s of Object.values(states)) {
      s.state = s.done >= s.planned ? 'done' : s.done ? 'partial' : 'missed';
      const day = s.state === 'done' ? daysPassed(s.finishedAt) : -1;
      s.caughtUp = day > s.weekday ? WEEKDAYS[day].slice(0, 3) : null;
      delete s.finishedAt;
    }
    return states;
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
  // hit in step with its days and the goal. Waits until there's a goal (data from before
  // version 11 is asked once, before anything else).
  // goals = { [week]: goal } when re-judging: the goal each ended week was judged against.
  // Safe to call any time; returns true if anything changed.
  update(now = Date.now(), { quiet = false, goals = {} } = {}) {
    const streak = Store.data.streak;
    const thisWeek = weekKey(now);
    const goal = Store.data.settings.weeklyGoal;
    if (goal == null) return false;

    // Only this week's locks are ever used (the week view), so older ones are dropped.
    let changed = this.lockDays(thisWeek, daysPassed(now));
    for (const key in streak.locks) {
      if (key < thisWeek) {
        delete streak.locks[key];
        changed = true;
      }
    }

    if (!streak.start) {
      if (!this.daysIn(thisWeek)) {
        if (changed) Store.save();
        return changed;
      }
      streak.start = thisWeek;
      changed = true;
    }

    const last = streak.weeks[streak.weeks.length - 1];
    for (let key = last ? addWeeks(last.week, 1) : streak.start; key < thisWeek; key = addWeeks(key, 1)) {
      const days = this.daysIn(key);
      const weekGoal = goals[key] ?? goal;
      const before = this.totals();
      let result;
      if (days >= weekGoal) result = 'hit';
      // (A freeze isn't wasted on a streak of 0.)
      else if (before.freezes > 0 && before.current > 0) result = 'frozen';
      else result = 'missed';
      streak.weeks.push({ week: key, result, days, goal: weekGoal });

      const done = `${weekRange(key)}: you worked out on ${days} of ${weekGoal} day${weekGoal === 1 ? '' : 's'}.`;
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

    if (thisWeek >= streak.start) {
      const days = this.daysIn(thisWeek);
      const record = streak.weeks.find(w => w.week === thisWeek);
      if (!record && days >= goal) {
        streak.weeks.push({ week: thisWeek, result: 'hit', days, goal });
        this.celebrate = this.totals().current;
        changed = true;
      } else if (record && record.goal != null) { // (a hit from before version 11 stays as it is)
        if (days < goal) {
          // The goal went up past it, or a workout was undone or deleted: not hit after all.
          streak.weeks = streak.weeks.filter(w => w !== record);
          changed = true;
        } else if (record.days !== days || record.goal !== goal) {
          record.days = days;
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
  // match them. Weeks from before version 11 (no saved goal) stay as they were.
  // Re-judged weeks don't show notices. This week only celebrates if it wasn't already hit.
  rejudge(sessionDate, now = Date.now()) {
    const streak = Store.data.streak;
    const from = weekKey(new Date(sessionDate).getTime());
    const thisWeek = weekKey(now);
    const wasHit = streak.weeks.some(w => w.week === thisWeek && w.result === 'hit');
    const goals = {};
    for (const w of streak.weeks) if (w.goal != null) goals[w.week] = w.goal;
    streak.weeks = streak.weeks.filter(w => w.week < from || w.goal == null);
    this.update(now, { quiet: true, goals });
    if (wasHit) this.celebrate = null;
    Store.save();
  },

  // Everything the Profile shows:
  //   started (false until the first tracked week), start (its key), totals,
  //   week = this week's { days, goal, hit },
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
      week: { days: this.daysIn(thisWeek), goal: Store.data.settings.weeklyGoal, hit: record(thisWeek)?.result === 'hit' },
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
