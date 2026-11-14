// Shared text helpers: turn rule-engine results into plain-language strings.
import { t, fmt } from './i18n.js';

export const MOOD_FACES = ['😞', '🙁', '😐', '🙂', '😄'];

// Earth round-trip communication delay for an environment, as text.
export function delayText(env) {
  if (env.delayMaxSec < 1) return t('delay.realtime');
  if (env.delayMaxSec < 60) return t('delay.seconds', { s: fmt(env.delayMaxSec, 1) });
  const a = Math.round(env.delayMinSec / 60);
  const b = Math.round(env.delayMaxSec / 60);
  return a > 0 ? t('delay.range', { a, b }) : t('delay.upto', { b });
}

function rangeText(m) {
  const [lo, hi] = m.green;
  if (lo != null && hi != null) return `${fmt(lo, m.digits)}–${fmt(hi, m.digits)}`;
  return lo != null ? `≥ ${fmt(lo, m.digits)}` : `≤ ${fmt(hi, m.digits)}`;
}

export function valueText(r, refs) {
  if (r.key === 'vision') return t('vision.' + r.value);
  if (r.key === 'mood') return `${MOOD_FACES[r.value - 1] || ''} ${t('mood.' + r.value)}`;
  if (r.key === 'radiation') return `${fmt(r.value, 2)} mSv`;
  if (r.key === 'bone') return `≈ ${fmt(r.value, 1)} %`;
  const m = refs.metrics[r.key];
  return `${fmt(r.value, m.digits)} ${m.unit}`;
}

// Why does this indicator have this colour?
export function reasonText(r, refs) {
  if (r.key === 'radiation') {
    return r.event || r.value >= refs.radiation.dailyYellow_mSv
      ? t('reason.radiation.high', { rate: fmt(r.rate, 2) })
      : t('reason.radiation.ok', { cum: fmt(r.cumulative, 1) });
  }
  if (r.key === 'bone') return t('reason.bone', { lo: fmt(r.lo, 1), hi: fmt(r.hi, 1) });
  if (r.key === 'vision' && r.value > 0) return t('reason.vision.' + r.value);
  if (r.lowDays >= 2) return t('reason.lowDays', { n: r.lowDays }); // a trend says more than one value

  const m = refs.metrics[r.key];
  const isEarth = m.label === 'earth';
  if (r.status === 'green') {
    if (r.baseline) return t('reason.ok.baseline');
    return t(isEarth ? 'reason.ok.earth' : 'reason.ok.range');
  }
  if (r.driver === 'baseline') {
    // Plain words instead of statistics: "clearly higher than your normal (61 → 82 bpm)".
    const key = `reason.${r.z > 0 ? 'above' : 'below'}${Math.abs(r.z) >= refs.zscore.red ? '.strong' : ''}`;
    return t(key, { mean: fmt(r.baseline.mean, m.digits), value: fmt(r.value, m.digits), unit: m.unit });
  }
  return t(isEarth ? 'reason.earth' : 'reason.range', { range: rangeText(m), unit: m.unit });
}

// Which label explains the status: personal baseline, Earth reference or NASA-derived.
export function driverLabel(r) {
  if (r.driver === 'baseline' || (r.status === 'green' && r.baseline)) return t('label.baseline');
  if (r.label === 'nasa') return t('label.nasa');
  if (r.label === 'earth') return t('label.earth');
  return t('badge.ill');
}

// Status word for an indicator or body system: Nominal / Watch / Caution / Notify doctor.
export function statusText(x) {
  return t('status.' + (x.status === 'yellow' && x.tier === 'caution' ? 'caution' : x.status));
}

// The statistics behind a baseline alert, for readers who want them.
export function sigmaNote(r) {
  return r.z != null && r.driver === 'baseline' ? t('reason.sigma', { z: fmt(Math.abs(r.z), 1) }) : '';
}
