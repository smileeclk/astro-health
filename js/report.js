// One-page printable report for the flight surgeon (weekly private medical conference).
import { t, L, fmt, esc } from './i18n.js';
import { SYSTEM_ORDER } from './rules.js';
import { valueText, reasonText, delayText, statusText } from './ui.js';
import { riskDrivers } from './outlook.js';

const ROWS = ['hr', 'sys', 'dia', 'temp', 'glucose', 'sleepH', 'sleepQ', 'mood', 'vision', 'radiation', 'bone'];
const WEEK = ['hr', 'sys', 'dia', 'temp', 'glucose', 'sleepH', 'sleepQ', 'mood', 'exercise'];

export function renderReport(el, { res, out, entries, refs, content, envKey, who, simulated, spaceWx }) {
  if (!res || res.empty) {
    el.innerHTML = `<div class="card empty"><h2>${t('report.title')}</h2><p>${t('empty.body')}</p></div>`;
    return;
  }
  const env = refs.environments[envKey];
  const name = (k) => L(content.metrics[k].name);
  const st = (x) => `<span class="rs ${x.status}">${statusText(x)}</span>`;
  const lv = (s) => `<span class="rs ${s}">${t('level.' + s)}</span>`;
  const m = res.metrics;

  const indicators = ROWS.filter((k) => m[k]).map((k) => `
    <tr><td>${esc(name(k))}</td><td><b>${esc(valueText(m[k], refs))}</b></td><td>${st(m[k])}</td><td>${esc(reasonText(m[k], refs))}</td></tr>`).join('');

  const systems = SYSTEM_ORDER.map((id) => `<span class="rsys">${esc(L(content.systems[id].name))}: ${st(res.systems[id])}</span>`).join('');

  const risks = out && out.ready ? out.risks.map((r) => `
    <tr><td>${t('risk.' + r.id)}</td><td>${lv(r.status)}</td><td>${riskDrivers(r, out, content, refs).map(esc).join('; ')}</td></tr>`).join('') : '';

  const week = entries.slice(-7);
  const cell = (e, k) => (Number.isFinite(e[k]) ? fmt(e[k], refs.metrics[k].digits) : '–');
  const weekRows = WEEK.map((k) => `<tr><td>${esc(name(k))} <small>${esc(refs.metrics[k].unit)}</small></td>${week.map((e) => `<td>${cell(e, k)}</td>`).join('')}</tr>`).join('');

  const r = m.radiation;
  el.innerHTML = `
    <div class="reportbar">
      <button type="button" class="btn primary" data-act="print">🖨 ${t('report.print')}</button>
      <span class="why">${t('report.hint')}</span>
    </div>
    <article class="paper" id="paper">
      <header>
        <div>
          <h1>${t('report.title')}</h1>
          <p>${esc(who)}${simulated ? ` · <b>${t('report.simulated')}</b>` : ''} · ${t('mission.day', { n: res.day })}</p>
        </div>
        <div class="meta">
          <p>${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC</p>
          <p>${t('env.' + envKey)} · ${t('env.delay')}: ${esc(delayText(env))}</p>
        </div>
      </header>

      <h2>${t('report.overall')}: <span class="rs ${res.overall}">${t('overall.' + res.overall)}</span></h2>
      <p class="syslist">${systems}</p>

      <h2>${t('report.indicators', { date: res.latest.date })}</h2>
      <table><thead><tr><th>${t('outlook.col.ind')}</th><th>${t('report.col.value')}</th><th>${t('report.col.status')}</th><th>${t('report.col.why')}</th></tr></thead>
        <tbody>${indicators}</tbody></table>

      ${risks ? `<h2>${t('outlook.title')}</h2>
      <table><thead><tr><th>${t('report.col.risk')}</th><th>${t('report.col.level')}</th><th>${t('report.col.why')}</th></tr></thead><tbody>${risks}</tbody></table>` : ''}

      <h2>${t('report.week')}</h2>
      <table class="week"><thead><tr><th></th>${week.map((e) => `<th>${e.date.slice(5)}</th>`).join('')}</tr></thead><tbody>${weekRows}</tbody></table>

      <h2>${t('report.radiation')}</h2>
      <p>${t('dose.title')}: <b>${fmt(r.cumulative, 1)} mSv</b> · ${t('dose.rate', { env: t('env.' + envKey), rate: fmt(r.rate, 2) })}
        ${spaceWx && spaceWx.flux != null ? `<br>${t('sw.flux')}: <b>${fmt(spaceWx.flux, 2)} pfu</b> · ${t('sw.scale', { s: spaceWx.level })} · ${t('sw.mode.' + spaceWx.mode)}` : ''}</p>

      <h2>${t('report.notes')}</h2>
      <div class="lines"></div>

      <footer>${t('report.footer')}</footer>
    </article>`;
}
