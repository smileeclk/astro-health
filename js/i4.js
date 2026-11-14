// Real NASA data: Inspiration4 blood values (NASA OSDR OSD-575 / OSD-569), embedded in data/i4_blood.json.
// Shown in the blood panel so the astronaut can compare an own value with a real crew.
import { t, fmt, esc } from './i18n.js';
import { trendChart } from './charts.js';

const TABLE = ['sodium', 'potassium', 'calcium', 'creatinine', 'hemoglobin', 'hematocrit', 'wbc', 'platelets'];

export function i4Html(i4, glucose) {
  if (!i4) return '';
  const g = i4.analytes.glucose;
  const box = (label, value, sub) => `<div class="cmpbox"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(sub || '')}</small></div>`;
  const rows = TABLE.map((key) => {
    const a = i4.analytes[key];
    return `<tr><td>${t('i4.a.' + key)} <small>${esc(a.unit)}</small></td>
      <td>${fmt(a.preflightMean, a.digits)}</td><td>${fmt(a.byTimepoint['R+1'].mean, a.digits)}</td>
      <td>${fmt(a.rangeMin, a.digits)}–${fmt(a.rangeMax, a.digits)}</td></tr>`;
  }).join('');
  return `
    <h3>${t('i4.title')} <span class="badge real">${t('badge.real')}</span></h3>
    <p class="why">${t('i4.intro')}</p>
    <div class="cmp">
      ${glucose != null ? box(t('i4.you'), `${fmt(glucose, 0)} mg/dL`, '') : ''}
      ${box(t('i4.pre'), `${fmt(g.preflightMean, 0)} mg/dL`, `${fmt(g.preflightMin, 0)}–${fmt(g.preflightMax, 0)} · n=${g.preflightN}`)}
      ${box(t('i4.lab'), `${fmt(g.rangeMin, 0)}–${fmt(g.rangeMax, 0)} mg/dL`, '')}
    </div>
    <div class="chartbox"><canvas data-i4></canvas></div>
    <p class="why">⚠ ${t('i4.note')}</p>
    <table class="i4table">
      <thead><tr><th>${t('i4.col.analyte')}</th><th>${t('i4.col.pre')}</th><th>${t('i4.col.r1')}</th><th>${t('i4.col.range')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="fine">${t('i4.source')}: <a href="${esc(i4.urls[0])}" target="_blank" rel="noopener">NASA OSDR OSD-575</a> /
      <a href="${esc(i4.urls[1])}" target="_blank" rel="noopener">OSD-569</a> (Inspiration4)</p>`;
}

export function i4Chart(el, i4, glucose) {
  const canvas = el.querySelector('canvas[data-i4]');
  if (!canvas || !i4) return;
  const g = i4.analytes.glucose;
  trendChart(canvas, {
    labels: i4.timepoints,
    series: [{ label: t('i4.chart.mean'), data: i4.timepoints.map((tp) => g.byTimepoint[tp].mean) }],
    baseline: glucose != null ? { label: t('i4.you'), value: glucose } : null,
  });
}
