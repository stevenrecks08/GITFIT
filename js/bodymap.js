// bodymap.js — the 2D muscle map on Profile: a front and a back view.
//
// Each figure is drawn on a 200 × 432 grid with the middle of the body at x = 100.
// Only the right half is written out below; the left half is the same shapes mirrored.
// Muscle ids match MUSCLE_GROUPS in library.js.

// Body parts that aren't muscles (drawn in a plain fill).
const BODY_CENTER = `
  <ellipse cx="100" cy="28" rx="16" ry="20"/>
  <rect x="92" y="44" width="16" height="16" rx="4"/>`;
const BODY_HALF = `
  <ellipse cx="157" cy="244" rx="7" ry="11"/>
  <path d="M100,206 L119,202 L131,204 L134,228 L108,236 L100,238 Z"/>
  <ellipse cx="123" cy="343" rx="11" ry="9"/>
  <path d="M116,414 L130,414 Q140,424 134,430 L112,430 Z"/>`;

// Right-half muscle shapes for each view: [muscleId, path]
const FRONT_MUSCLES = [
  ['traps', 'M108,54 L128,68 L106,66 Z'],
  ['upperChest', 'M100,70 L126,68 L128,84 L100,86 Z'],
  ['midChest', 'M100,86 L128,84 Q132,94 132,104 L100,106 Z'],
  ['lowerChest', 'M100,106 L132,104 Q128,118 114,122 L100,121 Z'],
  ['frontDelts', 'M126,68 Q140,66 147,76 L145,104 Q134,96 128,84 Z'],
  ['sideDelts', 'M147,76 Q157,82 157,98 L152,110 L145,104 Z'],
  ['biceps', 'M137,106 L145,104 L152,110 Q156,134 151,158 L141,160 Q134,134 137,106 Z'],
  ['brachialis', 'M152,110 Q160,124 159,150 L151,158 Q156,134 152,110 Z'],
  ['brachioradialis', 'M151,160 L159,151 Q166,172 164,194 L156,200 Q156,178 151,160 Z'],
  ['forearmFlexors', 'M141,162 L151,160 Q156,178 156,200 L164,194 Q164,216 160,232 L150,232 Q138,200 141,162 Z'],
  ['abs', 'M100,124 L116,123 L119,200 L100,205 Z'],
  ['obliques', 'M116,123 L131,107 Q137,150 131,201 L119,200 Z'],
  ['quads', 'M108,237 L134,229 Q142,270 136,328 Q126,338 114,332 Q106,290 108,237 Z'],
  ['adductors', 'M100,239 L108,237 Q106,290 112,318 Q101,296 100,239 Z'],
  ['calves', 'M112,356 Q122,350 133,356 Q136,388 127,412 L117,412 Q108,388 112,356 Z'],
];

const BACK_MUSCLES = [
  ['traps', 'M100,48 L108,54 L128,68 L118,78 L106,90 L100,112 Z'],
  ['upperBack', 'M100,112 L106,90 L118,78 L128,68 L128,84 Q132,94 134,106 L116,122 L100,128 Z'],
  ['rearDelts', 'M126,68 Q140,66 147,76 L145,104 Q134,96 128,84 Z'],
  ['sideDelts', 'M147,76 Q157,82 157,98 L152,110 L145,104 Z'],
  ['lats', 'M100,128 L116,122 L134,106 Q140,140 131,178 L113,186 Q104,162 100,152 Z'],
  ['lowerBack', 'M100,152 Q104,162 113,186 L131,178 L131,204 L100,208 Z'],
  ['triceps', 'M136,106 L145,104 L152,110 Q160,124 159,150 L151,160 L141,160 Q134,134 136,106 Z'],
  ['forearmExtensors', 'M141,162 L151,160 L159,151 Q166,172 164,194 Q164,216 160,232 L150,232 Q138,200 141,162 Z'],
  ['glutes', 'M100,208 L131,204 Q141,222 135,248 Q120,260 100,254 Z'],
  ['hamstrings', 'M107,256 Q122,260 135,250 Q140,290 133,332 L114,332 Q106,296 107,256 Z'],
  ['adductors', 'M100,256 L107,256 Q106,296 112,320 Q101,296 100,256 Z'],
  ['calves', 'M110,354 Q123,346 135,354 Q140,384 128,412 L116,412 Q106,384 110,354 Z'],
];

// Thin lines drawn on top for a bit of detail (ab rows, spine). Not tappable.
const FRONT_LINES = 'M100,145 L117,144 M100,168 L118,167';
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

const MapColors = {
  // Red (declining) → yellow (flat) → green (strong growth). Gray = not enough data.
  growth(pct) {
    if (pct == null) return MAP_EMPTY;
    const t = Math.max(-1, Math.min(1, pct / GROWTH_SCALE));
    return t < 0 ? mixColor('#facc15', '#f87171', -t) : mixColor('#facc15', '#4ade80', t);
  },
  // Gray (none) → dark green (a little) → bright green (a lot).
  sets(perWeek) {
    if (!perWeek) return MAP_EMPTY;
    return mixColor('#1f5c38', '#4ade80', Math.min(1, perWeek / SETS_SCALE));
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
      <svg viewBox="0 0 200 432" role="img" aria-label="${label} view muscle map">
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
