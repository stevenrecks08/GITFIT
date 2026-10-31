// units.js — converting between how numbers are SAVED and how they're SHOWN.
//
// Saved data always uses one unit, no matter what the Units setting is:
//   weights → lbs        heights → inches
// Only what's shown on screen (and read from input boxes) gets converted.
// That way switching units converts old lifts instead of just relabeling them.

const LBS_PER_KG = 2.20462262;
const CM_PER_INCH = 2.54;

// Accepts "62.5" or "62,5" (some iPhone keyboards type a comma).
function parseNumber(text) {
  const n = parseFloat(String(text ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

const Units = {
  current() {
    return Store.data.settings.units; // 'imperial' or 'metric'
  },

  isMetric(system = this.current()) {
    return system === 'metric';
  },

  weightUnit(system = this.current()) {
    return this.isMetric(system) ? 'kg' : 'lbs';
  },

  // Saved lbs → text to show, rounded to 0.1 ("100", "62.5"). Empty if no weight.
  showWeight(lbs, system = this.current()) {
    if (lbs === null || lbs === undefined || lbs === '') return '';
    const value = this.isMetric(system) ? Number(lbs) / LBS_PER_KG : Number(lbs);
    return String(Number(value.toFixed(1)));
  },

  // Text typed in the shown unit → lbs to save. null if it isn't a number.
  readWeight(text, system = this.current()) {
    const n = parseNumber(text);
    if (n === null) return null;
    const lbs = this.isMetric(system) ? n * LBS_PER_KG : n;
    return Number(lbs.toFixed(3));
  },

  // Saved inches → { ft, in } for imperial or { cm } for metric (as text).
  showHeight(inches, system = this.current()) {
    if (inches === null || inches === undefined) return { ft: '', in: '', cm: '' };
    if (this.isMetric(system)) return { cm: String(Math.round(inches * CM_PER_INCH)) };
    const total = Math.round(inches);
    return { ft: String(Math.floor(total / 12)), in: String(total % 12) };
  },

  // { ft, in } or { cm } typed in the shown unit → inches to save, or null.
  readHeight(parts, system = this.current()) {
    if (this.isMetric(system)) {
      const cm = parseNumber(parts.cm);
      return cm === null ? null : Number((cm / CM_PER_INCH).toFixed(2));
    }
    const ft = parseNumber(parts.ft);
    const inch = parseNumber(parts.in);
    if (ft === null && inch === null) return null;
    return (ft || 0) * 12 + (inch || 0);
  },
};
