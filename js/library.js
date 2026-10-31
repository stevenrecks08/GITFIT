// library.js — the built-in exercise library, plus your custom exercises.
//
// Every exercise lists the muscles it works:
//   primary   → counts as 1 set for that muscle per set done
//   secondary → counts as 0.5 sets
// Days in your week point at an exercise here by its id (refId).

// Muscle regions. The id is what's saved; the label is what's shown.
const MUSCLES = {
  upperChest: 'Upper chest',
  midChest: 'Mid chest',
  lowerChest: 'Lower chest',
  frontDelts: 'Front delts',
  sideDelts: 'Side delts',
  rearDelts: 'Rear delts',
  lats: 'Lats',
  upperBack: 'Upper back / traps',
  lowerBack: 'Lower back',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
};

const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Smith machine', 'Bodyweight', 'Other'];

// Shorthand so the list below stays readable: ex(id, name, equipment, primary, secondary, aliases)
// aliases are other names people use; they help search and matching old exercises.
function ex(id, name, equipment, primary, secondary = [], aliases = []) {
  return { id, name, equipment, primary, secondary, aliases };
}

const LIBRARY = [
  // ----- Chest -----
  ex('barbell-bench-press', 'Barbell Bench Press', 'Barbell', ['midChest'], ['frontDelts', 'triceps'], ['bench press', 'bench', 'flat bench press']),
  ex('incline-barbell-bench-press', 'Incline Barbell Bench Press', 'Barbell', ['upperChest'], ['frontDelts', 'triceps'], ['incline bench press', 'incline bench']),
  ex('decline-barbell-bench-press', 'Decline Barbell Bench Press', 'Barbell', ['lowerChest'], ['frontDelts', 'triceps'], ['decline bench press', 'decline bench']),
  ex('dumbbell-bench-press', 'Dumbbell Bench Press', 'Dumbbell', ['midChest'], ['frontDelts', 'triceps'], ['db bench press', 'db bench']),
  ex('incline-dumbbell-press', 'Incline Dumbbell Press', 'Dumbbell', ['upperChest'], ['frontDelts', 'triceps'], ['incline db press', 'incline dumbbell bench press']),
  ex('machine-chest-press', 'Machine Chest Press', 'Machine', ['midChest'], ['frontDelts', 'triceps'], ['chest press']),
  ex('incline-machine-chest-press', 'Incline Machine Chest Press', 'Machine', ['upperChest'], ['frontDelts', 'triceps'], ['incline chest press']),
  ex('smith-incline-press', 'Smith Machine Incline Press', 'Smith machine', ['upperChest'], ['frontDelts', 'triceps'], ['smith incline']),
  ex('smith-bench-press', 'Smith Machine Bench Press', 'Smith machine', ['midChest'], ['frontDelts', 'triceps'], ['smith bench']),
  ex('pec-deck-fly', 'Pec Deck Fly', 'Machine', ['midChest'], ['frontDelts'], ['pec deck', 'machine fly', 'chest fly machine']),
  ex('cable-fly', 'Cable Fly', 'Cable', ['midChest'], ['frontDelts'], ['cable crossover', 'cable chest fly']),
  ex('low-to-high-cable-fly', 'Low-to-High Cable Fly', 'Cable', ['upperChest'], ['frontDelts'], ['incline cable fly']),
  ex('high-to-low-cable-fly', 'High-to-Low Cable Fly', 'Cable', ['lowerChest'], ['frontDelts'], ['decline cable fly']),
  ex('dumbbell-fly', 'Dumbbell Fly', 'Dumbbell', ['midChest'], ['frontDelts'], ['db fly']),
  ex('chest-dip', 'Chest Dip', 'Bodyweight', ['lowerChest'], ['triceps', 'frontDelts'], ['dips', 'dip']),
  ex('push-up', 'Push-Up', 'Bodyweight', ['midChest'], ['frontDelts', 'triceps'], ['pushup', 'push ups']),

  // ----- Back -----
  ex('pull-up', 'Pull-Up', 'Bodyweight', ['lats'], ['biceps', 'upperBack'], ['pullup', 'pull ups']),
  ex('chin-up', 'Chin-Up', 'Bodyweight', ['lats'], ['biceps', 'upperBack'], ['chinup', 'chin ups']),
  ex('assisted-pull-up', 'Assisted Pull-Up Machine', 'Machine', ['lats'], ['biceps', 'upperBack'], ['assisted pull up', 'assisted chin up']),
  ex('lat-pulldown', 'Lat Pulldown', 'Cable', ['lats'], ['biceps', 'upperBack'], ['pulldown', 'wide grip pulldown']),
  ex('close-grip-lat-pulldown', 'Close-Grip Lat Pulldown', 'Cable', ['lats'], ['biceps', 'upperBack'], ['close grip pulldown', 'v bar pulldown']),
  ex('machine-lat-pulldown', 'Machine Lat Pulldown', 'Machine', ['lats'], ['biceps', 'upperBack'], ['plate loaded pulldown']),
  ex('straight-arm-pulldown', 'Straight-Arm Pulldown', 'Cable', ['lats'], [], ['cable pullover', 'straight arm pushdown']),
  ex('barbell-row', 'Barbell Row', 'Barbell', ['upperBack', 'lats'], ['biceps', 'rearDelts', 'lowerBack'], ['bent over row', 'bent over barbell row']),
  ex('one-arm-dumbbell-row', 'One-Arm Dumbbell Row', 'Dumbbell', ['lats', 'upperBack'], ['biceps', 'rearDelts'], ['dumbbell row', 'db row', 'single arm row']),
  ex('seated-cable-row', 'Seated Cable Row', 'Cable', ['upperBack', 'lats'], ['biceps', 'rearDelts'], ['cable row', 'low row']),
  ex('chest-supported-machine-row', 'Chest-Supported Machine Row', 'Machine', ['upperBack'], ['lats', 'rearDelts', 'biceps'], ['machine row', 'seated machine row']),
  ex('t-bar-row', 'T-Bar Row', 'Barbell', ['upperBack', 'lats'], ['biceps', 'rearDelts', 'lowerBack'], ['tbar row']),
  ex('dumbbell-shrug', 'Dumbbell Shrug', 'Dumbbell', ['upperBack'], ['forearms'], ['shrug', 'shrugs']),
  ex('deadlift', 'Deadlift', 'Barbell', ['glutes', 'hamstrings', 'lowerBack'], ['upperBack', 'quads', 'forearms'], ['conventional deadlift']),
  ex('back-extension', 'Back Extension', 'Bodyweight', ['lowerBack'], ['glutes', 'hamstrings'], ['hyperextension', '45 degree back extension']),
  ex('face-pull', 'Face Pull', 'Cable', ['rearDelts'], ['upperBack'], ['face pulls']),

  // ----- Shoulders -----
  ex('overhead-press', 'Overhead Press', 'Barbell', ['frontDelts'], ['sideDelts', 'triceps'], ['ohp', 'military press', 'barbell overhead press']),
  ex('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'Dumbbell', ['frontDelts'], ['sideDelts', 'triceps'], ['db shoulder press', 'seated dumbbell press']),
  ex('machine-shoulder-press', 'Machine Shoulder Press', 'Machine', ['frontDelts'], ['sideDelts', 'triceps'], ['shoulder press']),
  ex('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'Dumbbell', ['sideDelts'], [], ['lateral raise', 'side raise', 'lateral raises']),
  ex('cable-lateral-raise', 'Cable Lateral Raise', 'Cable', ['sideDelts'], [], ['cable side raise']),
  ex('machine-lateral-raise', 'Machine Lateral Raise', 'Machine', ['sideDelts'], [], ['lateral raise machine']),
  ex('cable-upright-row', 'Cable Upright Row', 'Cable', ['sideDelts'], ['upperBack'], ['upright row']),
  ex('dumbbell-front-raise', 'Dumbbell Front Raise', 'Dumbbell', ['frontDelts'], [], ['front raise']),
  ex('reverse-pec-deck', 'Reverse Pec Deck', 'Machine', ['rearDelts'], ['upperBack'], ['rear delt machine', 'reverse fly machine']),
  ex('dumbbell-rear-delt-fly', 'Dumbbell Rear Delt Fly', 'Dumbbell', ['rearDelts'], ['upperBack'], ['rear delt fly', 'bent over reverse fly']),
  ex('cable-rear-delt-fly', 'Cable Rear Delt Fly', 'Cable', ['rearDelts'], ['upperBack'], ['cable reverse fly']),

  // ----- Arms -----
  ex('barbell-curl', 'Barbell Curl', 'Barbell', ['biceps'], ['forearms'], ['ez bar curl']),
  ex('dumbbell-curl', 'Dumbbell Curl', 'Dumbbell', ['biceps'], ['forearms'], ['curl', 'bicep curl', 'biceps curl', 'db curl']),
  ex('hammer-curl', 'Hammer Curl', 'Dumbbell', ['biceps'], ['forearms'], ['hammer curls']),
  ex('incline-dumbbell-curl', 'Incline Dumbbell Curl', 'Dumbbell', ['biceps'], [], ['incline curl']),
  ex('cable-curl', 'Cable Curl', 'Cable', ['biceps'], ['forearms'], ['cable bicep curl']),
  ex('machine-preacher-curl', 'Machine Preacher Curl', 'Machine', ['biceps'], [], ['preacher curl', 'machine curl']),
  ex('triceps-pushdown', 'Triceps Pushdown', 'Cable', ['triceps'], [], ['tricep pushdown', 'rope pushdown', 'pushdown', 'cable pushdown']),
  ex('overhead-cable-triceps-extension', 'Overhead Cable Triceps Extension', 'Cable', ['triceps'], [], ['overhead triceps extension', 'overhead extension']),
  ex('skull-crusher', 'Skull Crusher', 'Barbell', ['triceps'], [], ['lying triceps extension', 'skullcrusher']),
  ex('close-grip-bench-press', 'Close-Grip Bench Press', 'Barbell', ['triceps'], ['midChest', 'frontDelts'], ['cgbp', 'close grip bench']),
  ex('machine-triceps-dip', 'Machine Triceps Dip', 'Machine', ['triceps'], ['lowerChest', 'frontDelts'], ['seated dip machine', 'tricep dip machine']),
  ex('dumbbell-wrist-curl', 'Dumbbell Wrist Curl', 'Dumbbell', ['forearms'], [], ['wrist curl']),

  // ----- Legs -----
  ex('barbell-back-squat', 'Barbell Back Squat', 'Barbell', ['quads', 'glutes'], ['lowerBack'], ['squat', 'back squat', 'squats']),
  ex('hack-squat', 'Hack Squat', 'Machine', ['quads'], ['glutes'], ['machine hack squat']),
  ex('leg-press', 'Leg Press', 'Machine', ['quads'], ['glutes'], ['45 degree leg press']),
  ex('smith-machine-squat', 'Smith Machine Squat', 'Smith machine', ['quads'], ['glutes'], ['smith squat']),
  ex('bulgarian-split-squat', 'Bulgarian Split Squat', 'Dumbbell', ['quads', 'glutes'], ['hamstrings'], ['split squat', 'bss']),
  ex('walking-lunge', 'Walking Lunge', 'Dumbbell', ['quads', 'glutes'], ['hamstrings'], ['lunge', 'lunges']),
  ex('leg-extension', 'Leg Extension', 'Machine', ['quads'], [], ['leg extensions', 'quad extension']),
  ex('romanian-deadlift', 'Romanian Deadlift', 'Barbell', ['hamstrings', 'glutes'], ['lowerBack'], ['rdl', 'stiff leg deadlift']),
  ex('lying-leg-curl', 'Lying Leg Curl', 'Machine', ['hamstrings'], [], ['leg curl', 'hamstring curl']),
  ex('seated-leg-curl', 'Seated Leg Curl', 'Machine', ['hamstrings'], [], ['seated hamstring curl']),
  ex('barbell-hip-thrust', 'Barbell Hip Thrust', 'Barbell', ['glutes'], ['hamstrings'], ['hip thrust', 'hip thrusts']),
  ex('hip-abduction-machine', 'Hip Abduction Machine', 'Machine', ['glutes'], [], ['hip abduction', 'abductor']),
  ex('cable-glute-kickback', 'Cable Glute Kickback', 'Cable', ['glutes'], ['hamstrings'], ['glute kickback', 'kickback']),
  ex('standing-calf-raise', 'Standing Calf Raise', 'Machine', ['calves'], [], ['calf raise', 'calf raises']),
  ex('seated-calf-raise', 'Seated Calf Raise', 'Machine', ['calves'], [], ['seated calf']),

  // ----- Core -----
  ex('cable-crunch', 'Cable Crunch', 'Cable', ['abs'], [], ['kneeling cable crunch']),
  ex('machine-crunch', 'Machine Crunch', 'Machine', ['abs'], [], ['ab machine', 'ab crunch machine']),
  ex('hanging-leg-raise', 'Hanging Leg Raise', 'Bodyweight', ['abs'], ['obliques'], ['leg raise', 'hanging knee raise']),
  ex('plank', 'Plank', 'Bodyweight', ['abs'], ['obliques'], ['planks']),
  ex('cable-woodchopper', 'Cable Woodchopper', 'Cable', ['obliques'], ['abs'], ['woodchop', 'wood chopper']),
];

// Lowercase, letters and numbers only: "Push-Ups!" → "pushups"
function simplify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// "Upper chest, Front delts"
function muscleNames(ids) {
  return ids.map(id => MUSCLES[id] || id).join(', ');
}

const Library = {
  // Built-in exercises followed by your custom ones.
  all() {
    return [...LIBRARY, ...Store.data.customExercises];
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

  // Matches on name, other names, equipment and muscles ("chest", "cable", "rdl").
  // Every word must appear somewhere; results containing the whole phrase come first,
  // so "upper chest" lists upper-chest exercises before e.g. a chest-supported row.
  search(query) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean).map(simplify);
    const phrase = simplify(query);
    const searchText = e => simplify([e.name, e.equipment, ...(e.aliases || []),
      ...e.primary.map(id => MUSCLES[id])].join(' '));
    const ranked = this.all()
      .map(e => ({ e, text: searchText(e) }))
      .filter(({ text }) => words.every(w => text.includes(w)))
      .map(({ e, text }) => ({ e, rank: text.includes(phrase) ? 0 : 1 }));
    ranked.sort((a, b) => a.rank - b.rank || a.e.name.localeCompare(b.e.name));
    return ranked.map(r => r.e);
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
    const names = exercise.primary.map(id => MUSCLES[id]);
    if (!names.length) return 'No muscles set';
    return names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`;
  },
};
