// cardio.js — the rules and wording for cardio. Saving goes through Store (storage.js).
//
// Cardio is much less strict than lifting: nothing holds you to it, it only adds to your record.
// Nothing turns red and nothing says Missed. It never touches the weekly streak, the cycle or
// planned sets, so none of those files read this data.
// A plan shows as a checkbox either on its weekdays (on the Workouts tab, that day) or, with
// afterLift, at the end of every workout (above Finish), whichever day that is.

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

// The tappable distances on the run form, in saved miles. Race distances are round numbers in km
// but not in miles, so these log them exactly on Imperial too (a 5K shows as 3.11 mi).
// name = what a run with no name of its own is called once one is tapped.
const RUN_DISTANCES = [
  { label: '1 mile', miles: 1, name: '1 mile run' },
  { label: '5K', miles: 3.107, name: '5K run' },
  { label: '10K', miles: 6.214, name: '10K run' },
  { label: 'Half', miles: 13.109, name: 'Half marathon' },
  { label: 'Marathon', miles: 26.219, name: 'Marathon' },
];

// The distances with a graph of times on the Cardio tab. Add a label here to graph another one.
const RUN_GRAPHS = RUN_DISTANCES.filter(d => ['1 mile', '5K'].includes(d.label));

// How close a run must be to count as that distance: a typed 3.1 mi is a 5K, 3.5 mi isn't.
const RUN_GRAPH_MARGIN = 0.02;

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

  // What the short pop-up asks for when a planned item is checked off: its time and distance, if
  // its type has them and they weren't planned. In the order the type's form asks for them.
  missingFields(item) {
    return this.type(item).fields.filter(key => ['miles', 'seconds'].includes(key) && !(item[key] > 0));
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

  // Which days a plan is on: "Mon, Wed, Fri" or "After every lift".
  daysText(plan) {
    if (plan.afterLift) return 'After every lift';
    return [...plan.weekdays].sort((a, b) => a - b).map(day => WEEKDAYS[day].slice(0, 3)).join(', ');
  },

  // The app's day, which changes at 3 am like the streak's. It's what a new entry is dated.
  today(now = Date.now()) {
    return appDay(now);
  },

  // Weekday plans on a day ('YYYY-MM-DD'). "After every lift" plans aren't on a weekday.
  plansOn(day) {
    const [y, m, d] = day.split('-').map(Number);
    const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
    return Store.data.cardioPlans.filter(plan => !plan.afterLift && plan.weekdays.includes(weekday));
  },

  // A day's rows on the Workouts tab: [{ day, plan (or null), entry (or null, so it's unchecked) }].
  // First the weekday plans on that day, then anything else logged that day (a one-off, an
  // "after every lift" one, or an entry whose plan was deleted or changed), so a logged entry
  // never disappears from it.
  rowsFor(day = this.today()) {
    const left = Store.data.cardioLog.filter(e => e.day === day);
    const rows = this.plansOn(day).map(plan => {
      const i = left.findIndex(e => e.planId === plan.id);
      return { day, plan, entry: i < 0 ? null : left.splice(i, 1)[0] };
    });
    return [...rows, ...left.map(entry => ({ day, plan: null, entry }))];
  },

  // The "after every lift" rows at the end of a workout, in the same form: checked once it's been
  // logged today.
  afterLiftRows(day = this.today()) {
    return Store.data.cardioPlans.filter(plan => plan.afterLift).map(plan => ({
      day, plan, entry: Store.data.cardioLog.find(e => e.day === day && e.planId === plan.id) || null,
    }));
  },

  // This week's totals for the Profile card, Monday → Sunday.
  thisWeek(now = Date.now()) {
    const start = dayKey(weekStartOf(now));
    const end = addWeeks(start, 1);
    const entries = Store.data.cardioLog.filter(e => e.day >= start && e.day < end);
    const seconds = entries.reduce((sum, e) => sum + (e.seconds || 0), 0);
    return { sessions: entries.length, minutes: Math.round(seconds / 60) };
  },

  // Runs of about this distance with a time, oldest first, for its graph.
  // Treadmill and outside runs count alike.
  runsOf(miles) {
    return this.newestFirst().reverse().filter(e => e.type === 'run' && e.seconds > 0
      && Math.abs(e.miles - miles) <= miles * RUN_GRAPH_MARGIN);
  },

  // Every entry, newest date first (the last one added first, within a day).
  newestFirst() {
    return [...Store.data.cardioLog].reverse().sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  },
};
