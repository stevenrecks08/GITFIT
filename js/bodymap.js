// bodymap.js — the 2D muscle map on Profile: a front and a back view.
//
// Each figure is drawn on a 200 × 380 grid with the middle of the body at x = 100.
// Only the right half is written out below; the left half is the same shapes mirrored.
// Front and back share one outline (BODY_HALF), so the two views line up.
// Muscle ids match MUSCLE_GROUPS in library.js.

const MAP_H = 380;

// The body outline and parts that aren't muscles (plain fill, drawn underneath the muscles).
const BODY_CENTER = `
  <ellipse cx="100" cy="24" rx="14" ry="17"/>
  <rect x="89" y="34" width="22" height="20" rx="6"/>`;
const BODY_HALF = `
  <path d="M100,36 L111,36 L111,46 Q122,52 136,56 Q158,54 166,72 Q172,90 168,108 Q173,126 169,144
    Q177,160 173,180 Q169,196 164,206 L152,206 Q144,186 145,160 Q140,148 141,128 L141,108
    Q140,140 128,168 Q129,180 131,190 Q147,220 143,262 Q139,286 132,294 L134,306 Q145,330 135,356
    L129,362 L111,362 Q106,330 110,308 L111,296 Q105,288 105,272 Q101,240 101,208 L100,208 Z"/>
  <ellipse cx="158" cy="215" rx="7" ry="10"/>
  <path d="M111,362 L130,362 Q141,370 137,377 L109,377 Z"/>`;

// Right-half muscle shapes for each view: [muscleId, path]
const DELTS_INNER = 'M124,62 Q130,55 142,55 Q150,60 151,74 Q150,88 146,98 Q136,88 130,78 Q126,70 124,62 Z';
const DELTS_OUTER = 'M142,55 Q160,54 166,72 Q170,88 162,100 Q154,104 146,98 Q150,88 151,74 Q150,60 142,55 Z';
const CALVES = 'M111,308 Q122,300 135,308 Q145,330 134,354 L120,356 Q107,332 111,308 Z';

const FRONT_MUSCLES = [
  ['traps', 'M111,46 Q122,52 136,56 Q128,62 120,62 Q112,58 111,46 Z'],
  ['upperChest', 'M100,59 L120,61 Q131,67 139,80 L100,82 Z'],
  ['midChest', 'M100,82 L139,80 Q143,90 141,100 L100,100 Z'],
  ['lowerChest', 'M100,100 L141,100 Q137,112 121,115 Q107,115 100,113 Z'],
  ['frontDelts', DELTS_INNER],
  ['sideDelts', DELTS_OUTER],
  ['biceps', 'M142,101 Q148,96 155,101 Q166,112 164,130 Q160,146 150,150 L145,150 Q140,128 142,101 Z'],
  ['brachialis', 'M164,114 Q171,124 169,144 L161,150 L150,150 Q160,146 164,130 Z'],
  ['brachioradialis', 'M152,152 L166,150 Q175,160 173,176 L164,187 Q160,166 152,152 Z'],
  ['forearmFlexors', 'M146,154 L152,152 Q160,166 164,187 L173,176 Q170,194 164,205 L153,205 Q144,182 146,154 Z'],
  ['abs', 'M100,117 L113,116 L115,170 Q108,176 100,178 Z'],
  ['obliques', 'M113,116 Q128,115 139,106 Q137,140 128,168 L115,170 Z'],
  ['quads', 'M106,208 L131,192 Q147,220 143,260 Q139,284 128,292 Q114,292 110,280 Q104,244 106,208 Z'],
  ['adductors', 'M101,210 L106,208 Q104,244 110,276 Q102,252 101,210 Z'],
  ['calves', CALVES],
];

const BACK_MUSCLES = [
  ['traps', 'M100,36 L111,44 Q122,52 138,58 Q128,68 118,84 L100,118 Z'],
  ['upperBack', 'M100,118 L118,84 Q128,68 138,58 Q143,78 141,98 L121,112 L100,122 Z'],
  ['rearDelts', DELTS_INNER],
  ['sideDelts', DELTS_OUTER],
  ['lats', 'M100,122 L121,112 L141,98 Q144,124 134,148 Q126,160 116,166 Q106,150 100,140 Z'],
  ['lowerBack', 'M100,140 Q106,150 116,166 L128,164 Q128,176 130,186 L100,188 Z'],
  ['triceps', 'M142,101 Q148,96 155,101 Q163,101 168,108 Q173,126 169,144 L161,150 L145,150 Q140,128 142,101 Z'],
  ['forearmExtensors', 'M146,154 L166,150 Q175,160 173,176 Q170,194 164,205 L153,205 Q144,182 146,154 Z'],
  ['glutes', 'M100,188 L130,186 Q145,202 141,222 Q124,234 100,230 Z'],
  ['hamstrings', 'M106,232 Q124,234 141,224 Q145,256 137,286 L114,290 Q106,262 106,232 Z'],
  ['adductors', 'M100,232 L106,232 Q106,262 112,284 Q101,262 100,232 Z'],
  ['calves', CALVES],
];

// Thin lines drawn on top for a bit of detail (ab rows). Not tappable.
const FRONT_LINES = 'M100,131 L114,130 M100,145 L114,144 M100,159 L115,158';
const BACK_LINES = '';

const MAP_EMPTY = '#3a404d'; // muscles with no data

// Blends two '#rrggbb' colors: t = 0 gives a, t = 1 gives b.
function mixColor(a, b, t) {
  const channel = i => {
    const x = parseInt(a.slice(i, i + 2), 16);
    const y = parseInt(b.slice(i, i + 2), 16);
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

const GROWTH_SCALE = 10; // ±10% in 6 weeks is full red / full green
const SETS_SCALE = 16;   // 16+ sets a week is the brightest green

// One color per strength level, Beginner → Elite (LEVELS in standards.js).
const LEVEL_COLORS = ['#60a5fa', '#4ade80', '#facc15', '#fb923c', '#e879f9'];

const MapColors = {
  // A color per level. Gray = no logged exercise with a standard.
  level(value) {
    return value ? LEVEL_COLORS[value.level] : MAP_EMPTY;
  },
  // Red (declining) → yellow (flat) → green (strong growth). Gray = not enough data.
  growth(pct) {
    if (pct == null) return MAP_EMPTY;
    const t = Math.max(-1, Math.min(1, pct / GROWTH_SCALE));
    return t < 0 ? mixColor('#facc15', '#f87171', -t) : mixColor('#facc15', '#4ade80', t);
  },
  // Gray (none) → dark green (a little) → bright green (a lot).
  sets(perWeek) {
    if (!perWeek) return MAP_EMPTY;
    return mixColor('#173a27', '#4ade80', Math.min(1, perWeek / SETS_SCALE));
  },
};

// One figure. colors = { muscleId: color }, selected = the tapped muscle id (or null).
function bodyFigure(label, muscles, lines, colors, selected) {
  const half = muscles.map(([id, d]) => `
    <path class="muscle ${id === selected ? 'is-selected' : ''}" d="${d}" fill="${colors[id] || MAP_EMPTY}"
      data-action="muscle" data-id="${id}"><title>${MUSCLES[id]}</title></path>`).join('');
  const mirrored = content => `${content}<g transform="translate(200 0) scale(-1 1)">${content}</g>`;
  return `
    <figure class="body-figure">
      <svg viewBox="0 0 200 ${MAP_H}" role="img" aria-label="${label} view muscle map">
        <g class="body-part">${BODY_CENTER}${mirrored(BODY_HALF)}</g>
        ${mirrored(half)}
        ${lines ? `<path class="body-line" d="${lines}"/><path class="body-line" d="${lines}" transform="translate(200 0) scale(-1 1)"/>` : ''}
      </svg>
      <figcaption>${label}</figcaption>
    </figure>`;
}

function bodyMapSvg(colors, selected) {
  return bodyFigure('Front', FRONT_MUSCLES, FRONT_LINES, colors, selected)
    + bodyFigure('Back', BACK_MUSCLES, BACK_LINES, colors, selected);
}
