// cardio.js — the rules and wording for cardio. Saving goes through Store (storage.js).
//
// Cardio is much less strict than lifting: nothing holds you to it, it only adds to your record.
// Nothing turns red and nothing says Missed. It never touches the weekly streak, the week's
// Done / Partial / Missed states, Catch up or planned sets, so none of those files read this data.

// The types. These ids are saved in your data: never rename or remove one without a migration.
//   label  = in the type picker
//   name   = what an item with no name of its own is called
//   fields = the numbers this type uses, in the order the form asks for them:
//            seconds (time), miles, feet (elevation), mph, incline (%), where (treadmill or outside)
const CARDIO_TYPES = {
  walk: { label: 'Incline walk / treadmill', name: 'Incline walk', fields: ['seconds', 'mph', 'incline'] },
  run: { label: 'Run', name: 'Run', fields: ['miles', 'seconds', 'where'] },
  bike: { label: 'Bike', name: 'Bike', fields: ['miles', 'seconds', 'feet'] },
  hike: { label: 'Hike / backpack', name: 'Hike', fields: ['miles', 'feet', 'seconds'] },
  other: { label: 'Other', name: 'Other', fields: ['seconds'] },
};

const CARDIO_NUMBERS = ['seconds', 'miles', 'feet', 'mph', 'incline', 'where'];

// 5 km in saved miles, for the run form's 5K button. A 5K is a round number in km but not in
// miles, so this lets it be logged exactly on Imperial too (shown as 3.11 mi).
const FIVE_K_MILES = 3.107;

const Cardio = {
  type(item) {
    return CARDIO_TYPES[item.type] || CARDIO_TYPES.other;
  },

  name(item) {
    return item.name || this.type(item).name;
  },

  // Just the type, name and the numbers its type uses (a number from another type is dropped).
  // This is what a plan copies into an entry.
  details(item) {
    const details = { type: item.type, name: item.name || '' };
    const { fields } = this.type(item);
    for (const key of CARDIO_NUMBERS) details[key] = fields.includes(key) ? item[key] ?? null : null;
    return details;
  },

  // Does it have what an entry must have? Minutes, or distance and time for a run.
  isComplete(item) {
    return item.seconds > 0 && (item.type !== 'run' || item.miles > 0);
  },

  // "20 min", or "25.5 min" if it isn't a whole number.
  minutesText(seconds) {
    return `${Number((seconds / 60).toFixed(1))} min`;
  },

  // A run's pace in the chosen unit: "8:13 /mi". Empty until it has both a distance and a time.
  paceText(miles, seconds) {
    if (!(miles > 0) || !(seconds > 0)) return '';
    const distance = Units.isMetric() ? miles * KM_PER_MILE : miles;
    return `${formatClock(seconds / distance * 1000)} /${Units.distanceUnit()}`;
  },

  // The numbers on one line: "20 min · 3 mph · 15% incline". Empty if there are none.
  summary(item) {
    const speed = item.mph != null ? `${Units.showSpeed(item.mph)} ${Units.speedUnit()}` : '';
    const distance = item.miles != null ? `${Units.showDistance(item.miles)} ${Units.distanceUnit()}` : '';
    const elevation = item.feet != null ? `${Units.showElevation(item.feet)} ${Units.elevationUnit()} up` : '';
    const incline = item.incline != null ? `${item.incline}% incline` : '';
    if (item.type === 'run') {
      const time = item.seconds ? formatClock(item.seconds * 1000) : '';
      const where = item.where === 'treadmill' ? 'Treadmill' : item.where === 'outside' ? 'Outside' : '';
      return [distance, time, this.paceText(item.miles, item.seconds), where].filter(Boolean).join(' · ');
    }
    const time = item.seconds ? this.minutesText(item.seconds) : '';
    return (item.type === 'walk' ? [time, speed, incline] : [distance, elevation, time]).filter(Boolean).join(' · ');
  },

  // Which days a plan is on: "Mon, Wed, Fri" or "Every lifting day".
  daysText(plan) {
    if (plan.everyLiftingDay) return 'Every lifting day';
    return [...plan.weekdays].sort((a, b) => a - b).map(day => WEEKDAYS[day].slice(0, 3)).join(', ');
  },

  // The app's day, which changes at 3 am like the streak's. It's what a new entry is dated.
  today(now = Date.now()) {
    const d = new Date(now);
    d.setHours(d.getHours() - WEEK_START_HOUR);
    return dayKey(d);
  },

  // The date of a weekday in this week, as 'YYYY-MM-DD'.
  dayOfWeek(weekday, now = Date.now()) {
    const start = weekStartOf(now);
    return dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + weekday));
  },

  // A planned item can be checked from its day on, not before: this is a record of what you did.
  canCheck(day, now = Date.now()) {
    return day <= dayKey(new Date(now));
  },

  // Plans on a weekday. "Every lifting day" goes by the workouts planned on it right now, so it
  // follows a workout that's moved. (A quick workout isn't planned, so it doesn't count.)
  plansOn(weekday) {
    return Store.data.cardioPlans.filter(plan => (plan.everyLiftingDay
      ? Store.workoutsOn(weekday).length > 0
      : plan.weekdays.includes(weekday)));
  },

  // A weekday's rows on the week: [{ day, plan (or null), entry (or null, so it's unchecked) }].
  // First the plans on that day, then anything else logged that day (a one-off, or an entry
  // whose plan was deleted or moved off this day), so a logged entry never disappears from it.
  rowsFor(weekday, now = Date.now()) {
    const day = this.dayOfWeek(weekday, now);
    const left = Store.data.cardioLog.filter(e => e.day === day);
    const rows = this.plansOn(weekday).map(plan => {
      const i = left.findIndex(e => e.planId === plan.id);
      return { day, plan, entry: i < 0 ? null : left.splice(i, 1)[0] };
    });
    return [...rows, ...left.map(entry => ({ day, plan: null, entry }))];
  },

  // This week's totals for the Profile card, Monday → Sunday.
  thisWeek(now = Date.now()) {
    const start = dayKey(weekStartOf(now));
    const end = addWeeks(start, 1);
    const entries = Store.data.cardioLog.filter(e => e.day >= start && e.day < end);
    const seconds = entries.reduce((sum, e) => sum + (e.seconds || 0), 0);
    return { sessions: entries.length, minutes: Math.round(seconds / 60) };
  },

  // Every entry, newest date first (the last one added first, within a day).
  newestFirst() {
    return [...Store.data.cardioLog].reverse().sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  },
};
