// 30-Day Risk Outlook. Trend-based early warning, not a diagnosis.
//
// 1. Indicators: a robust straight line is fitted to the last 14 days and extended 30 days.
//    A change smaller than normal day-to-day noise counts as "flat".
// 2. Cumulative loads: radiation dose, sleep debt, exercise deficit, bone loss (NASA rate 1–1.5 %/month).
// 3. Prototype indicators use Low / Medium / High levels.
import { t, L, fmt, esc } from './i18n.js';
import { evalMetric, computeBaseline, worst, missionDay } from './rules.js';

const TREND_KEYS = ['hr', 'sys', 'dia', 'temp', 'glucose', 'sleepH', 'sleepQ', 'mood'];

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Robust straight-line fit (Theil–Sen): the median of the slopes between all pairs of days.
// One unusual day (for example a single stressful event) does not create a 30-day trend.
function linreg(ys) {
  const slopes = [];
  for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) slopes.push((ys[j] - ys[i]) / (j - i));
  const slope = slopes.length ? median(slopes) : 0;
  return { slope, intercept: median(ys.map((y, x) => y - slope * x)) };
}

const byLimits = (v, yellow, red) => (v >= red ? 'red' : v >= yellow ? 'yellow' : 'green');

export function computeOutlook(entries, envKey, refs, res) {
  const O = refs.outlook;
  if (!O) return { ready: false, n: entries.length, need: 5 }; // old cached references file
  if (entries.length < O.minDays) return { ready: false, n: entries.length, need: O.minDays };

  const H = O.horizonDays;
  const env = refs.environments[envKey];
  const recent = entries.slice(-O.windowDays);
  const baseline = computeBaseline(entries, refs);

  /* ----- 1. indicator trends ----- */
  const metrics = {};
  for (const key of TREND_KEYS) {
    const ys = recent.map((e) => e[key]).filter(Number.isFinite);
    if (ys.length < O.minDays) continue;
    const m = refs.metrics[key];
    const fit = linreg(ys);
    const flat = Math.abs(fit.slope * (ys.length - 1)) < m.sdFloor;
    const slope = flat ? 0 : fit.slope;
    // Current level: the fitted line today, or the mean of the last 3 days when there is no trend.
    const last3 = ys.slice(-3);
    const level = flat ? last3.reduce((s, v) => s + v, 0) / last3.length : fit.intercept + fit.slope * (ys.length - 1);
    // A trend is assumed to continue for at most as long as it has been observed, then to hold.
    const reach = ys.length - 1;
    const at = (d) => Math.min(m.max, Math.max(m.min, level + slope * Math.min(d, reach)));
    const statusAt = (d) => evalMetric(key, at(d), refs, baseline).status;
    let toYellow = null, toRed = null;
    for (let d = 0; d <= H; d++) {
      const s = statusAt(d);
      if (toYellow == null && s !== 'green') toYellow = d;
      if (toRed == null && s === 'red') { toRed = d; break; }
    }
    // A straight line cannot be trusted far past the point where it turns red, so the projection stops there.
    const projDay = toRed != null ? toRed : H;
    metrics[key] = { key, slope, flat, now: at(0), proj: at(projDay), projDay, statusNow: statusAt(0), status: statusAt(H), toYellow, toRed };
  }
  const ms = (...keys) => keys.map((k) => metrics[k]).filter(Boolean);
  const worstOf = (list) => list.reduce((s, x) => worst(s, x.status), 'green');

  /* ----- 2. cumulative loads ----- */
  const rad = res.metrics.radiation;
  const radProj = rad.cumulative + H * env.doseRate;
  const radiation = {
    now: rad.cumulative, proj: radProj,
    status: rad.status,
  };

  const deficits = recent.map((e) => e.sleepH).filter(Number.isFinite).map((h) => Math.max(0, O.sleepNeedH - h));
  const debtNow = deficits.reduce((s, v) => s + v, 0);
  const last7 = deficits.slice(-7);
  const debtProj = debtNow + H * (last7.reduce((s, v) => s + v, 0) / Math.max(1, last7.length));
  const sleepDebt = {
    now: debtNow, proj: debtProj,
    status: worst(byLimits(debtNow, O.sleepDebtYellowH, O.sleepDebtRedH), byLimits(debtProj, O.sleepDebtYellowH * 2, O.sleepDebtRedH * 2)),
  };

  const exDays = entries.slice(-7).map((e) => e.exercise).filter(Number.isFinite);
  const sessions = exDays.filter((min) => min >= O.exerciseSessionMin).length;
  const exercise = {
    hasData: exDays.length > 0, sessions, need: O.exerciseSessionsPerWeek,
    status: !exDays.length ? 'green' : sessions >= O.exerciseSessionsPerWeek ? 'green' : sessions > 0 ? 'yellow' : 'red',
  };

  const B = refs.bone;
  const day = missionDay(entries) + H;
  const boneLo = (day / 30) * B.lossPctPerMonthLow, boneHi = (day / 30) * B.lossPctPerMonthHigh;
  const bone = {
    now: res.metrics.bone.value, lo: boneLo, hi: boneHi,
    // Skipped exercise is the main thing a crew member can change, so it raises the bone risk.
    status: worst(byLimits((boneLo + boneHi) / 2, B.yellowPct, B.redPct), exercise.status),
  };

  const visionReports = recent.filter((e) => e.vision > 0).length;
  const marked = recent.some((e) => e.vision >= 2);
  const sans = { reports: visionReports, status: marked || visionReports >= O.visionRedReports ? 'red' : visionReports > 0 ? 'yellow' : 'green' };

  /* ----- 3. Prototype indicators ----- */
  const risks = [
    { id: 'cardio', system: 'cardio', status: worstOf(ms('hr', 'sys', 'dia')), metrics: ms('hr', 'sys', 'dia') },
    { id: 'sleep', system: 'brain', status: worst(worstOf(ms('sleepH', 'sleepQ')), sleepDebt.status), metrics: ms('sleepH', 'sleepQ'), loads: ['sleepDebt'] },
    { id: 'behavior', system: 'brain', status: worstOf(ms('mood')), metrics: ms('mood') },
    { id: 'bone', system: 'bones', status: bone.status, metrics: [], loads: ['bone', 'exercise'] },
    { id: 'sans', system: 'eyes', status: sans.status, metrics: [], loads: ['sans'] },
    { id: 'radiation', system: 'blood', status: radiation.status, metrics: [], loads: ['radiation'] },
    { id: 'immune', system: 'blood', status: worstOf(ms('temp', 'glucose')), metrics: ms('temp', 'glucose') },
  ];

  // Projected colour of each body system (for the "+30 days" view of the 3D figure).
  const systems = { cardio: 'green', lungs: worstOf(ms('temp')), brain: 'green', bones: 'green', eyes: 'green', blood: 'green' };
  for (const r of risks) systems[r.system] = worst(systems[r.system], r.status);

  return { ready: true, horizon: H, metrics, loads: { radiation, sleepDebt, exercise, bone, sans }, risks, systems };
}

/* ---------- text ---------- */

function forecast(m) {
  if (m.statusNow === 'red') return t('fc.nowRed');
  if (m.toRed != null) return t('fc.red', { d: m.toRed });
  if (m.statusNow === 'yellow') return t('fc.nowYellow');
  if (m.toYellow != null) return t('fc.yellow', { d: m.toYellow });
  return t('fc.stay');
}

function loadText(key, out) {
  const l = out.loads[key];
  if (key === 'radiation') return t('cum.radiation.v', { now: fmt(l.now, 1), proj: fmt(l.proj, 1) });
  if (key === 'sleepDebt') return t('cum.sleep.v', { now: fmt(l.now, 1), proj: fmt(l.proj, 1) });
  if (key === 'exercise') return l.hasData ? t('cum.exercise.v', { n: l.sessions, need: l.need }) : t('cum.exercise.none');
  if (key === 'bone') return t('cum.bone.v', { now: fmt(l.now, 1), lo: fmt(l.lo, 1), hi: fmt(l.hi, 1) });
  return t('cum.sans.v', { n: l.reports });
}

// Short explanation of a risk level, used in the outlook view and in the organ panel.
export function riskDrivers(risk, out, content, refs) {
  const lines = [];
  for (const m of risk.metrics) {
    if (m.status === 'green' && m.flat) continue;
    const d = refs.metrics[m.key];
    const change = m.projDay > 0 && !m.flat ? `${fmt(m.now, d.digits)} → ${fmt(m.proj, d.digits)}` : fmt(m.now, d.digits);
    lines.push(`${L(content.metrics[m.key].name)}: ${change} ${d.unit} · ${forecast(m)}`);
  }
  for (const key of risk.loads || []) lines.push(loadText(key, out));
  return lines.length ? lines : [t('outlook.stable')];
}

const pill = (status) => `<span class="pill ${status}"><span class="dot ${status}"></span>${t('level.' + status)}</span>`;

export function renderOutlook(el, out, { refs, content, sources }) {
  if (!out.ready) {
    el.innerHTML = `<div class="card empty"><h2>${t('outlook.title')}</h2><p>${t('outlook.need', { n: out.n, need: out.need })}</p></div>`;
    return;
  }
  const risks = out.risks.map((r) => `
    <div class="card riskcard ${r.status}">
      <div class="chead"><h3>${t('risk.' + r.id)}</h3>${pill(r.status)}</div>
      <ul>${riskDrivers(r, out, content, refs).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>`).join('');

  const rows = Object.values(out.metrics).map((m) => {
    const d = refs.metrics[m.key];
    const perWeek = m.slope * 7;
    const arrow = m.flat ? '→' : perWeek > 0 ? '↗' : '↘';
    return `<tr>
      <td><span class="dot ${m.status}" style="display:inline-block"></span> ${esc(L(content.metrics[m.key].name))}</td>
      <td>${arrow} ${m.flat ? t('fc.flat') : `${perWeek > 0 ? '+' : ''}${fmt(perWeek, 1)} ${esc(d.unit)}`}</td>
      <td>${fmt(m.now, d.digits)}</td>
      <td>${m.projDay === out.horizon ? fmt(m.proj, d.digits) : '–'}</td>
      <td>${forecast(m)}</td></tr>`;
  }).join('');

  const load = (key, title) => {
    const l = out.loads[key];
    return `<div class="card riskcard ${l.status}"><div class="chead"><h3>${title}</h3>${pill(l.status)}</div><p>${esc(loadText(key, out))}</p></div>`;
  };
  const sourceLinks = [sources.hrp_hazards, sources.hrp_risks, sources.hrp_research]
    .map((source) => `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.title)} ↗</a>`)
    .join(' · ');

  el.innerHTML = `
    <div class="outlook">
      <h2>${t('outlook.title')}</h2>
      <p class="notebox">⚠ ${t('outlook.note')}</p>
      <p class="why">${t('outlook.method')}</p>

      <h3 class="sect">${t('outlook.risks')}</h3>
      <div class="riskgrid">${risks}</div>

      <h3 class="sect">${t('outlook.cum')}</h3>
      <div class="riskgrid">
        ${load('radiation', t('cum.radiation'))}${load('sleepDebt', t('cum.sleep'))}${load('exercise', t('cum.exercise'))}${load('bone', t('cum.bone'))}
      </div>

      <h3 class="sect">${t('outlook.trends')}</h3>
      <div class="card" style="overflow-x:auto">
        <table class="i4table">
          <thead><tr><th>${t('outlook.col.ind')}</th><th>${t('outlook.col.trend')}</th><th>${t('outlook.col.now')}</th><th>${t('outlook.col.proj')}</th><th>${t('outlook.col.fc')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="why">${t('outlook.research')}</p>
      <p class="fine">${sourceLinks}</p>
    </div>`;
}
