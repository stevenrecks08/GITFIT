// demo-data.js — TEMPORARY sample history so the Log screen has something to show.
// Adds 13 Monday workouts of Dumbbell Curl (Aug 3 – Oct 26, 2026), marked demo: true.
// Your own workouts are not changed.
//
// To remove later: delete this file and its <script> line in index.html,
// and drop saved sessions with demo: true (see normalize() in storage.js).

const DEMO_CURLS = [
  // [month (1–12), day, weight in lbs, reps per set]
  [8, 3, 15, [12, 11, 11]],
  [8, 10, 15, [12, 12, 11]],
  [8, 17, 15, [13, 12, 12]],
  [8, 24, 17.5, [10, 9, 9]],    // first time going up
  [8, 31, 17.5, [11, 10, 10]],
  [9, 7, 17.5, [9, 8, 8]],      // bad day
  [9, 14, 17.5, [12, 11, 10]],
  [9, 21, 20, [10, 9, 8]],
  [9, 28, 20, [11, 10, 9]],
  [10, 5, 20, [12, 11, 10]],    // good day
  [10, 12, 20, [10, 9, 9]],     // a bit off
  [10, 19, 22.5, [10, 9, 8]],
  [10, 26, 22.5, [11, 10, 9]],
];

(function addDemoData() {
  if (Store.data.sessions.some(s => s.demo)) return; // already added

  const monday = Store.data.days.find(d => d.weekday === 0);
  const info = Library.get('dumbbell-curl');
  for (const [month, day, weight, reps] of DEMO_CURLS) {
    Store.data.sessions.push({
      id: `demo-${month}-${day}`,
      demo: true,
      dayId: monday.id,
      dayName: dayLabel(monday),
      date: new Date(2026, month - 1, day, 18, 0).toISOString(),
      exercises: [{
        exerciseId: 'demo-dumbbell-curl',
        refId: info.id,
        name: info.name,
        primary: info.primary,
        secondary: info.secondary,
        targetSets: 3,
        targetRepMin: 8,
        targetRepMax: 12,
        sets: reps.map(r => ({ weight, reps: r })),
      }],
    });
  }
  // Keep workouts oldest first, like the rest of the app expects.
  Store.data.sessions.sort((a, b) => new Date(a.date) - new Date(b.date));
  Store.save();
  render();
})();
