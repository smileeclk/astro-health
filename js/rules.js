// Assessment engine. Pure functions: entries + environment + references -> green / yellow / red.
//
// Three layers, in order of importance:
//   1. Personal baseline: mean and SD of the first 7–14 days -> z-score (the main alert).
//   2. Earth reference:   general clinical ranges, labelled as such.
//   3. NASA-derived:      radiation dose against NASA limits, bone loss at the NASA rate.
//
// Prototype values. Real medical thresholds are set by flight surgeons.

const RANK = { green: 0, yellow: 1, red: 2 };
const TIER = { green: 0, watch: 1, caution: 2, red: 3 };
const tierOf = (x) => x.tier || (x.status === 'yellow' ? 'watch' : x.status);
export const worst = (a, b) => (RANK[b] > RANK[a] ? b : a);

// Which indicators feed which body system.
export const SYSTEMS = {
  cardio: ['hr', 'sys', 'dia'],
  lungs: ['temp'],
  brain: ['sleepH', 'sleepQ', 'mood'],
  bones: ['bone'],
  eyes: ['vision'],
  blood: ['glucose', 'temp', 'radiation'],
};
export const SYSTEM_ORDER = ['cardio', 'lungs', 'brain', 'bones', 'eyes', 'blood'];
export const CHECKIN_KEYS = ['hr', 'sys', 'dia', 'temp', 'glucose', 'sleepH', 'sleepQ', 'mood', 'vision'];

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
function sampleSd(a) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}
const inRange = (v, [lo, hi]) => (lo == null || v >= lo) && (hi == null || v <= hi);

export function rangeStatus(v, m) {
  if (inRange(v, m.green)) return 'green';
  if (inRange(v, m.yellow)) return 'yellow';
  return 'red';
}

// Personal baseline from the first 7–14 days of data.
export function computeBaseline(entries, refs) {
  const z = refs.zscore;
  const out = { ready: entries.length >= z.minDays, n: entries.length, need: z.minDays, days: 0, stats: {} };
  if (!out.ready) return out;
  const first = entries.slice(0, z.maxDays);
  out.days = first.length;
  for (const key of CHECKIN_KEYS) {
    const m = refs.metrics[key];
    if (!m.sdFloor) continue;
    const vals = first.map((e) => e[key]).filter(Number.isFinite);
    if (vals.length < z.minDays) continue;
    // The SD floor stops a very steady baseline from turning tiny changes into alerts.
    out.stats[key] = { mean: mean(vals), sd: Math.max(sampleSd(vals), m.sdFloor) };
  }
  return out;
}

export function evalMetric(key, value, refs, baseline) {
  const m = refs.metrics[key];
  const earth = rangeStatus(value, m);
  const st = baseline && baseline.stats[key];
  const Z = refs.zscore;
  let z = null;
  let dev = 0; // distance from the personal baseline in the direction that matters, in SD
  if (st) {
    z = (value - st.mean) / st.sd;
    dev = m.dir === 'low' ? -z : m.dir === 'high' ? z : Math.abs(z);
  }
  const zStatus = dev >= Z.red ? 'red' : dev >= Z.yellow ? 'yellow' : 'green';

  // A change from the personal baseline alone raises an indicator to yellow at most.
  // Red ("notify doctor") needs the clinical reference range to agree.
  let status = earth;
  if (dev >= Z.yellow) status = worst(status, 'yellow');
  if (dev >= Z.red && earth !== 'green') status = 'red';

  // Yellow has two steps: "watch" and the stronger "caution".
  let tier = status;
  if (status === 'yellow') tier = dev >= Z.red || (earth === 'yellow' && dev >= Z.yellow) ? 'caution' : 'watch';

  let driver = null; // what caused a non-green status
  if (status !== 'green') driver = dev >= Z.yellow ? 'baseline' : m.label;
  return { key, value, status, tier, earth, z, zStatus, driver, baseline: st || null, label: m.label };
}

// How many days in a row (ending with the last entry) a value has been at or below `at`.
export function lowStreak(entries, key, at) {
  let n = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (!(entries[i][key] <= at)) break;
    if (n > 0 && Math.round((new Date(entries[i + 1].date) - new Date(entries[i].date)) / 86400000) !== 1) break;
    n++;
  }
  return n;
}

// Some indicators (mood) only become serious when they stay low. One low day is "watch" at most;
// red needs the configured number of low days in a row. `prior` = low days before this value.
export function applyPersistence(r, prior, refs) {
  const rule = refs.metrics[r.key].persist;
  if (!rule) return r;
  r.lowDays = r.value <= rule.at ? prior + 1 : 0;
  if (r.lowDays >= rule.days) {
    r.status = 'red'; r.tier = 'red'; r.driver = r.driver || refs.metrics[r.key].label;
  } else if (r.status !== 'green') {
    r.status = 'yellow'; r.tier = 'watch';
  }
  return r;
}

export function missionDay(entries) {
  if (!entries.length) return 0;
  const a = new Date(entries[0].date + 'T00:00:00');
  const b = new Date(entries[entries.length - 1].date + 'T00:00:00');
  return Math.round((b - a) / 86400000) + 1;
}

export function evaluate(entries, envKey, refs) {
  if (!entries.length) return { empty: true };
  const env = refs.environments[envKey];
  const latest = entries[entries.length - 1];
  const baseline = computeBaseline(entries, refs);
  const day = missionDay(entries);
  const metrics = {};

  for (const key of CHECKIN_KEYS) {
    if (!Number.isFinite(latest[key])) continue;
    const rule = refs.metrics[key].persist;
    const prior = rule ? lowStreak(entries.slice(0, -1), key, rule.at) : 0;
    metrics[key] = applyPersistence(evalMetric(key, latest[key], refs, baseline), prior, refs);
  }

  // Radiation (NASA-derived): daily scenario thresholds and estimated mission total.
  const R = refs.radiation;
  const doses = entries.map((e) => (Number.isFinite(e.dose) ? e.dose : env.doseRate));
  const cumulative = doses.reduce((s, v) => s + v, 0);
  const today = doses[doses.length - 1];
  let rStatus = 'green';
  if (today >= R.dailyRed_mSv) rStatus = 'red';
  else if (today >= R.dailyYellow_mSv) rStatus = 'yellow';
  metrics.radiation = {
    key: 'radiation', value: today, status: rStatus, driver: rStatus === 'green' ? null : 'nasa', label: 'nasa',
    cumulative, rate: env.doseRate, event: today >= R.dailyRed_mSv,
  };

  // Bone loss (NASA-derived model): 1–1.5% per month of weightlessness, from mission day.
  const B = refs.bone;
  const lo = (day / 30) * B.lossPctPerMonthLow;
  const hi = (day / 30) * B.lossPctPerMonthHigh;
  const loss = (lo + hi) / 2;
  const bStatus = loss >= B.redPct ? 'red' : loss >= B.yellowPct ? 'yellow' : 'green';
  metrics.bone = { key: 'bone', value: loss, lo, hi, status: bStatus, driver: bStatus === 'green' ? null : 'nasa', label: 'nasa' };

  const systems = {};
  let overall = 'green';
  for (const id of SYSTEM_ORDER) {
    const list = SYSTEMS[id].map((k) => metrics[k]).filter(Boolean);
    const status = list.reduce((s, m) => worst(s, m.status), 'green');
    const tier = list.reduce((a, m) => (TIER[tierOf(m)] > TIER[a] ? tierOf(m) : a), 'green');
    systems[id] = { id, status, tier, metrics: list };
    overall = worst(overall, status);
  }

  return { empty: false, day, latest, baseline, metrics, systems, overall, shelter: metrics.radiation.event };
}
