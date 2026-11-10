// library.js — the built-in exercise library, the muscle catalog, and search.
//
// Every exercise lists the muscles it works:
//   primary   → counts as 1 set for that muscle per set done
//   secondary → counts as 0.5 sets
// Days in your week point at an exercise here by its id (refId).

// The muscle catalog, grouped. The id (left) is what's saved; the label is what's shown.
const MUSCLE_GROUPS = [
  { name: 'Chest', muscles: { upperChest: 'Upper chest', midChest: 'Mid chest', lowerChest: 'Lower chest' } },
  { name: 'Shoulders', muscles: { frontDelts: 'Front delts', sideDelts: 'Side delts', rearDelts: 'Rear delts' } },
  { name: 'Back', muscles: { lats: 'Lats', upperBack: 'Upper back', traps: 'Traps', lowerBack: 'Lower back' } },
  { name: 'Arms', muscles: { biceps: 'Biceps', brachialis: 'Brachialis', triceps: 'Triceps' } },
  { name: 'Forearms', muscles: { brachioradialis: 'Brachioradialis', forearmFlexors: 'Forearm flexors', forearmExtensors: 'Forearm extensors' } },
  { name: 'Core', muscles: { abs: 'Abs', obliques: 'Obliques' } },
  { name: 'Legs', muscles: { quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', adductors: 'Adductors', calves: 'Calves' } },
];

// Every muscle in one list: { upperChest: 'Upper chest', … }
const MUSCLES = Object.assign({}, ...MUSCLE_GROUPS.map(g => g.muscles));

// Which group each muscle is in: { upperChest: 'Chest', … }
const MUSCLE_GROUP_OF = {};
for (const group of MUSCLE_GROUPS) for (const id in group.muscles) MUSCLE_GROUP_OF[id] = group.name;

const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Smith machine', 'Bodyweight', 'Other'];

// Shorthand so the list below stays readable: ex(id, name, equipment, primary, secondary, aliases)
// aliases are other names people use; they help search and matching old exercises.
function ex(id, name, equipment, primary, secondary = [], aliases = []) {
  return { id, name, equipment, primary, secondary, aliases };
}

const LIBRARY = [
  // ----- Chest -----
  ex('barbell-bench-press', 'Barbell Bench Press', 'Barbell', ['midChest'], ['upperChest', 'lowerChest', 'frontDelts', 'triceps'], ['bench press', 'bench', 'flat bench press']),
  ex('incline-barbell-bench-press', 'Incline Barbell Bench Press', 'Barbell', ['upperChest'], ['midChest', 'frontDelts', 'triceps'], ['incline bench press', 'incline bench']),
  ex('decline-barbell-bench-press', 'Decline Barbell Bench Press', 'Barbell', ['lowerChest'], ['midChest', 'frontDelts', 'triceps'], ['decline bench press', 'decline bench']),
  ex('dumbbell-bench-press', 'Dumbbell Bench Press', 'Dumbbell', ['midChest'], ['upperChest', 'lowerChest', 'frontDelts', 'triceps'], ['db bench press', 'db bench']),
  ex('incline-dumbbell-press', 'Incline Dumbbell Press', 'Dumbbell', ['upperChest'], ['midChest', 'frontDelts', 'triceps'], ['incline db press', 'incline dumbbell bench press']),
  ex('machine-chest-press', 'Machine Chest Press', 'Machine', ['midChest'], ['upperChest', 'lowerChest', 'frontDelts', 'triceps'], ['chest press']),
  ex('incline-machine-chest-press', 'Incline Machine Chest Press', 'Machine', ['upperChest'], ['midChest', 'frontDelts', 'triceps'], ['incline chest press']),
  ex('smith-incline-press', 'Smith Machine Incline Bench Press', 'Smith machine', ['upperChest'], ['midChest', 'frontDelts', 'triceps'], ['smith incline', 'smith machine incline press']),
  ex('smith-bench-press', 'Smith Machine Bench Press', 'Smith machine', ['midChest'], ['upperChest', 'lowerChest', 'frontDelts', 'triceps'], ['smith bench']),
  ex('smith-decline-bench-press', 'Smith Machine Decline Bench Press', 'Smith machine', ['lowerChest'], ['midChest', 'frontDelts', 'triceps'], ['smith decline']),
  ex('pec-deck-fly', 'Pec Deck Fly', 'Machine', ['midChest'], ['lowerChest', 'frontDelts'], ['pec deck', 'machine fly', 'chest fly machine']),
  ex('cable-fly', 'Cable Fly', 'Cable', ['midChest'], ['lowerChest', 'frontDelts'], ['cable crossover', 'cable chest fly']),
  ex('low-to-high-cable-fly', 'Low-to-High Cable Fly', 'Cable', ['upperChest'], ['midChest', 'frontDelts'], ['incline cable fly']),
  ex('high-to-low-cable-fly', 'High-to-Low Cable Fly', 'Cable', ['lowerChest'], ['midChest', 'frontDelts'], ['decline cable fly']),
  ex('dumbbell-fly', 'Dumbbell Fly', 'Dumbbell', ['midChest'], ['lowerChest', 'frontDelts'], ['db fly']),
  ex('chest-dip', 'Chest Dip', 'Bodyweight', ['lowerChest'], ['midChest', 'triceps', 'frontDelts'], ['dips', 'dip']),
  ex('push-up', 'Push-Up', 'Bodyweight', ['midChest'], ['upperChest', 'lowerChest', 'frontDelts', 'triceps'], ['pushup', 'push ups']),

  // ----- Back -----
  ex('pull-up', 'Pull-Up', 'Bodyweight', ['lats'], ['biceps', 'brachialis', 'upperBack'], ['pullup', 'pull ups']),
  ex('chin-up', 'Chin-Up', 'Bodyweight', ['lats'], ['biceps', 'brachialis', 'upperBack'], ['chinup', 'chin ups']),
  ex('assisted-pull-up', 'Assisted Pull-Up Machine', 'Machine', ['lats'], ['biceps', 'brachialis', 'upperBack'], ['assisted pull up', 'assisted chin up']),
  ex('lat-pulldown', 'Lat Pulldown', 'Cable', ['lats'], ['biceps', 'brachialis', 'upperBack'], ['pulldown', 'wide grip pulldown']),
  ex('close-grip-lat-pulldown', 'Close-Grip Lat Pulldown', 'Cable', ['lats'], ['biceps', 'brachialis', 'upperBack'], ['close grip pulldown', 'v bar pulldown']),
  ex('machine-lat-pulldown', 'Machine Lat Pulldown', 'Machine', ['lats'], ['biceps', 'brachialis', 'upperBack'], ['plate loaded pulldown']),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'Cable', ['lats'], ['triceps'], ['cable pullover', 'straight arm pushdown']),
  ex('barbell-row', 'Barbell Row', 'Barbell', ['upperBack', 'lats'], ['biceps', 'brachialis', 'rearDelts', 'lowerBack'], ['bent over row', 'bent over barbell row']),
  ex('one-arm-dumbbell-row', 'One-Arm Dumbbell Row', 'Dumbbell', ['lats', 'upperBack'], ['biceps', 'brachialis', 'rearDelts'], ['dumbbell row', 'db row', 'single arm row']),
  ex('seated-cable-row', 'Seated Cable Row', 'Cable', ['upperBack', 'lats'], ['biceps', 'brachialis', 'rearDelts'], ['cable row', 'low row']),
  ex('chest-supported-machine-row', 'Chest-Supported Machine Row', 'Machine', ['upperBack'], ['lats', 'rearDelts', 'biceps', 'brachialis'], ['machine row', 'seated machine row']),
  ex('t-bar-row', 'T-Bar Row', 'Barbell', ['upperBack', 'lats'], ['biceps', 'brachialis', 'rearDelts', 'lowerBack'], ['tbar row']),
  ex('smith-bent-over-row', 'Smith Machine Bent-Over Row', 'Smith machine', ['upperBack', 'lats'], ['biceps', 'brachialis', 'rearDelts', 'lowerBack'], ['smith row', 'smith machine row']),
  ex('dumbbell-shrug', 'Dumbbell Shrug', 'Dumbbell', ['traps'], [], ['shrug', 'shrugs']),
  ex('smith-shrug', 'Smith Machine Shrug', 'Smith machine', ['traps'], [], ['smith shrugs']),
  ex('deadlift', 'Deadlift', 'Barbell', ['glutes', 'hamstrings', 'lowerBack'], ['upperBack', 'traps', 'quads', 'adductors'], ['conventional deadlift']),
  ex('back-extension', 'Back Extension', 'Bodyweight', ['lowerBack'], ['glutes', 'hamstrings'], ['hyperextension', '45 degree back extension']),
  ex('face-pull', 'Face Pull', 'Cable', ['rearDelts'], ['upperBack', 'traps'], ['face pulls']),

  // ----- Shoulders -----
  ex('overhead-press', 'Overhead Press', 'Barbell', ['frontDelts'], ['sideDelts', 'triceps', 'traps'], ['ohp', 'military press', 'barbell overhead press']),
  ex('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'Dumbbell', ['frontDelts'], ['sideDelts', 'triceps', 'traps'], ['db shoulder press', 'seated dumbbell press']),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'Machine', ['frontDelts'], ['sideDelts', 'triceps', 'traps'], ['shoulder press']),
  ex('smith-overhead-press', 'Smith Machine Overhead Press', 'Smith machine', ['frontDelts'], ['sideDelts', 'triceps', 'traps'], ['smith shoulder press', 'smith ohp', 'smith military press']),
  ex('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'Dumbbell', ['sideDelts'], ['traps'], ['lateral raise', 'side raise', 'lateral raises']),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'Cable', ['sideDelts'], ['traps'], ['cable side raise']),
  ex('machine-lateral-raise', 'Machine Lateral Raise', 'Machine', ['sideDelts'], ['traps'], ['lateral raise machine']),
  ex('cable-upright-row', 'Cable Upright Row', 'Cable', ['sideDelts'], ['traps'], ['upright row']),
  ex('smith-upright-row', 'Smith Machine Upright Row', 'Smith machine', ['sideDelts'], ['traps'], ['smith upright']),
  ex('dumbbell-front-raise', 'Dumbbell Front Raise', 'Dumbbell', ['frontDelts'], ['traps'], ['front raise']),
  ex('reverse-pec-deck', 'Reverse Pec Deck', 'Machine', ['rearDelts'], ['upperBack', 'traps'], ['rear delt machine', 'reverse fly machine']),
  ex('dumbbell-rear-delt-fly', 'Dumbbell Rear Delt Fly', 'Dumbbell', ['rearDelts'], ['upperBack', 'traps'], ['rear delt fly', 'bent over reverse fly']),
  ex('cable-rear-delt-fly', 'Cable Rear Delt Fly', 'Cable', ['rearDelts'], ['upperBack', 'traps'], ['cable reverse fly']),

  // ----- Arms -----
  ex('barbell-curl', 'Barbell Curl', 'Barbell', ['biceps'], ['brachialis', 'brachioradialis'], ['ez bar curl']),
  ex('dumbbell-curl', 'Dumbbell Curl', 'Dumbbell', ['biceps'], ['brachialis', 'brachioradialis'], ['curl', 'bicep curl', 'biceps curl', 'db curl']),
  ex('hammer-curl', 'Hammer Curl', 'Dumbbell', ['brachialis', 'brachioradialis'], ['biceps'], ['hammer curls']),
  ex('incline-dumbbell-curl', 'Incline Dumbbell Curl', 'Dumbbell', ['biceps'], ['brachialis', 'brachioradialis'], ['incline curl']),
  ex('cable-curl', 'Cable Curl', 'Cable', ['biceps'], ['brachialis', 'brachioradialis'], ['cable bicep curl']),
  ex('machine-preacher-curl', 'Machine Preacher Curl', 'Machine', ['biceps'], ['brachialis', 'brachioradialis'], ['preacher curl', 'machine curl']),
  ex('reverse-curl', 'EZ-Bar Reverse Curl', 'Barbell', ['brachioradialis'], ['biceps', 'brachialis', 'forearmExtensors'], ['reverse curl', 'reverse grip curl']),
  ex('triceps-pushdown', 'Triceps Pushdown', 'Cable', ['triceps'], [], ['tricep pushdown', 'rope pushdown', 'pushdown', 'cable pushdown']),
  ex('overhead-cable-triceps-extension', 'Overhead Cable Triceps Extension', 'Cable', ['triceps'], [], ['overhead triceps extension', 'overhead extension']),
  ex('skull-crusher', 'Skull Crusher', 'Barbell', ['triceps'], [], ['lying triceps extension', 'skullcrusher']),
  ex('close-grip-bench-press', 'Close-Grip Bench Press', 'Barbell', ['triceps'], ['midChest', 'frontDelts'], ['cgbp', 'close grip bench']),
  ex('smith-close-grip-bench-press', 'Smith Machine Close-Grip Bench Press', 'Smith machine', ['triceps'], ['midChest', 'frontDelts'], ['smith close grip', 'smith cgbp']),
  ex('machine-triceps-dip', 'Machine Triceps Dip', 'Machine', ['triceps'], ['lowerChest', 'frontDelts'], ['seated dip machine', 'tricep dip machine']),
  ex('dumbbell-wrist-curl', 'Dumbbell Wrist Curl', 'Dumbbell', ['forearmFlexors'], [], ['wrist curl']),
  ex('reverse-wrist-curl', 'Dumbbell Reverse Wrist Curl', 'Dumbbell', ['forearmExtensors'], [], ['reverse wrist curl', 'wrist extension']),

  // ----- Legs -----
  ex('barbell-back-squat', 'Barbell Back Squat', 'Barbell', ['quads', 'glutes'], ['adductors', 'lowerBack'], ['squat', 'back squat', 'squats']),
  ex('hack-squat', 'Hack Squat', 'Machine', ['quads'], ['glutes', 'adductors'], ['machine hack squat']),
  ex('leg-press', 'Leg Press', 'Machine', ['quads'], ['glutes', 'adductors'], ['45 degree leg press']),
  ex('smith-machine-squat', 'Smith Machine Squat', 'Smith machine', ['quads'], ['glutes', 'adductors'], ['smith squat']),
  ex('smith-front-squat', 'Smith Machine Front Squat', 'Smith machine', ['quads'], ['glutes', 'adductors'], ['smith front']),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'Dumbbell', ['quads', 'glutes'], ['adductors'], ['split squat', 'bss']),
  ex('smith-split-squat', 'Smith Machine Split Squat', 'Smith machine', ['quads', 'glutes'], ['adductors'], ['smith bulgarian', 'smith bss']),
  ex('walking-lunge', 'Walking Lunge', 'Dumbbell', ['quads', 'glutes'], ['adductors'], ['lunge', 'lunges']),
  ex('smith-reverse-lunge', 'Smith Machine Reverse Lunge', 'Smith machine', ['quads', 'glutes'], ['adductors'], ['smith lunge', 'smith lunges']),
  ex('leg-extension', 'Leg Extension', 'Machine', ['quads'], [], ['leg extensions', 'quad extension']),
  ex('romanian-deadlift', 'Romanian Deadlift', 'Barbell', ['hamstrings', 'glutes'], ['lowerBack'], ['rdl', 'stiff leg deadlift']),
  ex('smith-romanian-deadlift', 'Smith Machine Romanian Deadlift', 'Smith machine', ['hamstrings', 'glutes'], ['lowerBack'], ['smith rdl', 'smith stiff leg deadlift']),
  ex('lying-leg-curl', 'Lying Leg Curl', 'Machine', ['hamstrings'], ['calves'], ['leg curl', 'hamstring curl']),
  ex('seated-leg-curl', 'Seated Leg Curl', 'Machine', ['hamstrings'], ['calves'], ['seated hamstring curl']),
  ex('barbell-hip-thrust', 'Barbell Hip Thrust', 'Barbell', ['glutes'], ['hamstrings'], ['hip thrust', 'hip thrusts']),
  ex('smith-hip-thrust', 'Smith Machine Hip Thrust', 'Smith machine', ['glutes'], ['hamstrings'], ['smith thrust']),
  ex('hip-abduction-machine', 'Hip Abduction Machine', 'Machine', ['glutes'], [], ['hip abduction', 'abductor']),
  ex('hip-adduction-machine', 'Hip Adduction Machine', 'Machine', ['adductors'], [], ['hip adduction', 'adductor', 'inner thigh']),
  ex('cable-glute-kickback', 'Cable Glute Kickback', 'Cable', ['glutes'], ['hamstrings'], ['glute kickback', 'kickback']),
  ex('standing-calf-raise', 'Standing Calf Raise', 'Machine', ['calves'], [], ['calf raise', 'calf raises']),
  ex('seated-calf-raise', 'Seated Calf Raise', 'Machine', ['calves'], [], ['seated calf']),
  ex('smith-calf-raise', 'Smith Machine Calf Raise', 'Smith machine', ['calves'], [], ['smith calf', 'smith calf raises']),

  // ----- Core -----
  ex('cable-crunch', 'Cable Crunch', 'Cable', ['abs'], ['obliques'], ['kneeling cable crunch']),
  ex('machine-crunch', 'Machine Crunch', 'Machine', ['abs'], ['obliques'], ['ab machine', 'ab crunch machine']),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'Bodyweight', ['abs'], ['obliques'], ['leg raise', 'hanging knee raise']),
  ex('plank', 'Plank', 'Bodyweight', ['abs'], ['obliques'], ['planks']),
  ex('cable-woodchopper', 'Cable Woodchopper', 'Cable', ['obliques'], ['abs'], ['woodchop', 'wood chopper']),
];

// How many exercise matches to show at once. Fewer, better matches beat a long list.
const MAX_RESULTS = 8;

// Every word used in muscle names and groups ("upper", "chest", "back", "delts", …).
const MUSCLE_WORDS = [...new Set(MUSCLE_GROUPS.flatMap(g =>
  [g.name, ...Object.values(g.muscles)]).flatMap(text => text.toLowerCase().split(/[^a-z0-9]+/)))];

// Lowercase, letters and numbers only: "Push-Ups!" → "pushups"
function simplify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Splits text into simplified words: "Low-to-High Cable Fly" → ['low', 'to', 'high', 'cable', 'fly']
function words(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// "Upper chest, Front delts"
function muscleNames(ids) {
  return ids.map(id => MUSCLES[id] || id).join(', ');
}

// Scores how well typed words match a set of word lists, best first.
// Each typed word must be the start of some word in one of the lists, or nothing matches (0).
// lists: [ [words, points], … ] — earlier, more important lists give more points.
function matchScore(typed, lists) {
  let score = 0;
  for (const t of typed) {
    let best = 0;
    for (const [list, points] of lists) {
      if (list.some(w => w.startsWith(t))) best = Math.max(best, points);
    }
    if (!best) return 0;
    score += best;
  }
  return score;
}

// Exercises logged in seconds instead of reps, with no weight. The seconds are saved as the set's reps.
const TIMED_EXERCISES = ['plank'];

const Library = {
  // Built-in exercises followed by your custom ones.
  all() {
    return [...LIBRARY, ...Store.data.customExercises];
  },

  // The same, without deleted custom exercises: what you can pick from.
  active() {
    return this.all().filter(e => !e.deleted);
  },

  isTimed(refId) {
    return TIMED_EXERCISES.includes(refId);
  },

  // Bodyweight exercises (built-in or custom) are tracked by max reps, not an estimated max.
  // A plank is bodyweight too, but it's timed, so it isn't one of these.
  isRepsOnly(refId) {
    return this.get(refId)?.equipment === 'Bodyweight' && !this.isTimed(refId);
  },

  // Every exercise in a muscle group (see groupOf), by name.
  inGroup(group) {
    return this.active().filter(e => this.groupOf(e) === group).sort((a, b) => a.name.localeCompare(b.name));
  },

  // Exercises that train the same muscles as this one, closest first: the more primary muscles
  // they share the better, then the more secondary muscles (so a Dumbbell Bench Press comes before
  // a Cable Fly for a Barbell Bench Press), then by name. For Swap for today.
  similarTo(refId, limit = 8) {
    const mine = this.get(refId);
    if (!mine) return [];
    const shared = (a, b) => (a || []).filter(id => (b || []).includes(id)).length;
    const score = e => 10 * shared(e.primary, mine.primary) + shared(e.secondary, mine.secondary);
    return this.active()
      .filter(e => e.id !== refId && shared(e.primary, mine.primary) > 0)
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
      .slice(0, limit);
  },

  get(refId) {
    return this.all().find(e => e.id === refId);
  },

  // The library exercise a day's exercise points at. Never undefined,
  // so screens don't break if a reference is somehow missing.
  forExercise(dayExercise) {
    return this.get(dayExercise.refId)
      || { id: dayExercise.refId, name: 'Unknown exercise', equipment: 'Other', primary: [], secondary: [] };
  },

  // Finds the exercises you're most likely typing, best first.
  // Words can be the start of a word ("inc ben" → Incline Bench Press) and can match
  // the name, other names, the primary muscles or the equipment — name matches rank highest.
  // Returns { results, total } where total counts every match, not just the ones shown.
  search(query) {
    const typed = words(query);
    if (!typed.length) return { results: [], total: 0 };
    const phrase = simplify(query);

    const scored = [];
    for (const e of this.active()) {
      const nameWords = words(e.name);
      const aliasWords = (e.aliases || []).flatMap(words);
      const muscleWords = e.primary.flatMap(id => [...words(MUSCLES[id]), ...words(MUSCLE_GROUP_OF[id])]);
      const equipmentWords = words(e.equipment);

      // Each typed word must match something. Points add up when it matches in
      // several places, so "chest" scores higher on Machine Chest Press (name + muscle)
      // than on Barbell Bench Press (muscle only).
      let score = 0;
      for (const t of typed) {
        const inName = nameWords.some(w => w.startsWith(t));
        const inAlias = aliasWords.some(w => w.startsWith(t));
        const inMuscles = muscleWords.some(w => w.startsWith(t));
        const inEquipment = equipmentWords.some(w => w.startsWith(t));
        if (!inName && !inAlias && !inMuscles && !inEquipment) { score = 0; break; }
        // A muscle word ("chest", "back") in the name of an exercise that doesn't
        // train that muscle (Chest-Supported Row, Back Squat) counts for little.
        const nameCounts = !MUSCLE_WORDS.some(w => w.startsWith(t)) || inMuscles;
        score += (inName ? (nameCounts ? 3 : 0.5) : 0) + (inAlias ? (nameCounts ? 2 : 0.5) : 0)
          + (inMuscles ? 2 : 0) + (inEquipment ? 1 : 0);
      }
      if (!score) continue;
      if (simplify(e.name).startsWith(phrase)) score += 3;   // typing the start of the name
      if ((e.aliases || []).some(a => simplify(a) === phrase)) score += 3; // exact nickname, e.g. "rdl"
      scored.push({ e, score });
    }

    scored.sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));
    return { results: scored.slice(0, MAX_RESULTS).map(s => s.e), total: scored.length };
  },

  // Muscles you're likely typing: matches the muscle's name or its group
  // ("chest" → upper/mid/lower chest, "fore" → the three forearm muscles).
  // Leaves out ids in `exclude` (already picked). Returns muscle ids in catalog order.
  searchMuscles(query, exclude = []) {
    const typed = words(query);
    if (!typed.length) return [];
    return Object.keys(MUSCLES).filter(id => !exclude.includes(id) &&
      matchScore(typed, [[words(MUSCLES[id]), 2], [words(MUSCLE_GROUP_OF[id]), 1]]) > 0);
  },

  // Exact name or alias match, ignoring case, punctuation and a plural "s"
  // ("Lateral Raises" = "Lateral Raise"). Used to link old exercises.
  findByName(name, list = LIBRARY) {
    const key = text => simplify(text).replace(/s$/, '');
    const target = key(name);
    if (!target) return null;
    return list.find(e => key(e.name) === target || (e.aliases || []).some(a => key(a) === target)) || null;
  },

  // Short primary-muscle label for tags: "Upper chest", "Quads, Glutes", "Glutes +2"
  primaryLabel(exercise) {
    const names = exercise.primary.map(id => MUSCLES[id] || id);
    if (!names.length) return 'No muscles set';
    return names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`;
  },

  // The muscle group (Chest, Shoulders, Back, Arms, Forearms, Core or Legs) an exercise
  // belongs to, for the muscle group chips in search: the group most of its primary
  // muscles are in. On a tie, the first primary muscle listed decides
  // (Deadlift: glutes + hamstrings + lower back → Legs; Hammer Curl: brachialis + brachioradialis → Arms).
  // null if it has no primary muscles.
  groupOf(exercise) {
    const counts = {};
    let best = null;
    for (const id of exercise.primary || []) {
      const group = MUSCLE_GROUP_OF[id];
      if (!group) continue;
      counts[group] = (counts[group] || 0) + 1;
      if (!best || counts[group] > counts[best]) best = group;
    }
    return best;
  },
};
