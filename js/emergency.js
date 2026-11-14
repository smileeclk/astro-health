// Emergency Mode: offline step-by-step checklists, an "Earth reply" countdown and a report for the flight surgeon.
// No diagnosis and no medication doses.
import { t, L, esc, fmt, getLang } from './i18n.js';
import { delayText, valueText, statusText } from './ui.js';

const KEY = 'astroself.em.v1';

let root = null;
let getCtx = null;   // () => { res, refs, content, envKey, who, simulated, spaceWx }
let data = null;     // data/emergency.json
let ticker = null;
let st = { open: false, id: null, checked: {}, startedAt: null, sentAt: null, notes: '', report: false };

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
}

const clock = (iso) => new Date(iso).toLocaleTimeString(getLang() === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const protocol = () => data && data.protocols.find((p) => p.id === st.id);

export async function initEmergency(el, ctxFn) {
  root = el;
  getCtx = ctxFn;
  try { data = await (await fetch('data/emergency.json')).json(); } catch (e) { data = null; }
  // An unfinished checklist survives a reload: in an emergency nobody should lose their place.
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* ignore */ }
  st.report = false;

  root.addEventListener('click', onClick);
  root.addEventListener('change', (e) => {
    const box = e.target.closest('input[data-step]');
    if (!box) return;
    if (box.checked) st.checked[box.dataset.step] = new Date().toISOString();
    else delete st.checked[box.dataset.step];
    persist();
    render();
  });
  root.addEventListener('input', (e) => {
    if (e.target.id === 'emNotes') { st.notes = e.target.value; persist(); }
  });
  if (st.open) render();
}

export function openEmergency(id) {
  st.open = true;
  if (id) choose(id);
  persist();
  render();
}

// Re-render after a language or data change, unless the user is typing notes.
export function renderEmergency() {
  if (st.open && !(document.activeElement && document.activeElement.id === 'emNotes')) render();
}

function choose(id) {
  if (st.id !== id) Object.assign(st, { id, checked: {}, startedAt: new Date().toISOString(), sentAt: null, notes: '' });
  st.report = false;
}

function onClick(e) {
  const btn = e.target.closest('[data-em]');
  if (!btn) return;
  const act = btn.dataset.em;
  if (act === 'close') st.open = false;
  if (act === 'list') { st.id = null; st.report = false; }
  if (act === 'choose') choose(btn.dataset.id);
  if (act === 'sent') st.sentAt = new Date().toISOString();
  if (act === 'reset') Object.assign(st, { checked: {}, startedAt: new Date().toISOString(), sentAt: null, notes: '', report: false });
  if (act === 'report') st.report = true;
  if (act === 'steps') st.report = false;
  if (act === 'copy') {
    const text = root.querySelector('#emReport').value;
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => {
      root.querySelector('#emReport').select();
      document.execCommand('copy');
    });
    btn.textContent = t('em.copied');
    return;
  }
  if (act === 'download') {
    const blob = new Blob([root.querySelector('#emReport').value], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flight-surgeon-report-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  persist();
  render();
}

/* ---------- report ---------- */

function buildReport() {
  const ctx = getCtx();
  const p = protocol();
  const env = ctx.refs.environments[ctx.envKey];
  const steps = L(p.steps);
  const lines = [
    `=== ${t('rep.header')} ===`,
    `${t('rep.generated')}: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
    `${t('rep.crew')}: ${ctx.who}${ctx.simulated ? ` (${t('badge.sim')})` : ''}`,
    `${t('rep.env')}: ${t('env.' + ctx.envKey)} · ${t('env.delay')}: ${delayText(env)}`,
    `${t('rep.event')}: ${L(p.title)} · ${t('rep.started')} ${clock(st.startedAt)}`,
    '',
    `${t('rep.steps')}:`,
    ...steps.map((s, i) => (st.checked[i] ? `[x] ${clock(st.checked[i])}  ${s}` : `[ ]        ${s}`)),
  ];
  const res = ctx.res;
  if (res && !res.empty) {
    const m = res.metrics;
    const name = (k) => L(ctx.content.metrics[k].name);
    const val = (k) => (m[k] ? `${name(k)}: ${valueText(m[k], ctx.refs)}` : null);
    lines.push('', `${t('rep.vitals', { date: res.latest.date })}:`);
    lines.push(...['hr', 'sys', 'dia', 'temp', 'glucose', 'sleepH', 'sleepQ', 'mood', 'vision'].map(val).filter(Boolean).map((x) => '  ' + x));
    const flags = Object.values(m).filter((x) => x.status !== 'green').map((x) => `${name(x.key)} (${statusText(x)})`);
    lines.push(`${t('rep.flags')}: ${flags.length ? flags.join(', ') : t('rep.none')}`);
    lines.push(`${t('dose.title')}: ${fmt(m.radiation.cumulative, 1)} mSv`);
  }
  if (ctx.spaceWx && ctx.spaceWx.flux != null) {
    lines.push(`${t('sw.flux')}: ${fmt(ctx.spaceWx.flux, 2)} pfu · ${t('sw.scale', { s: ctx.spaceWx.level })} · ${t('sw.mode.' + ctx.spaceWx.mode)}`);
  }
  lines.push('', `${t('rep.notes')}: ${st.notes || '-'}`, '', t('rep.footer'));
  return lines.join('\n');
}

/* ---------- rendering ---------- */

function timerHtml(env, envKey) {
  if (env.delayMaxSec < 1) return `<div class="emtimer"><b>${t('em.timer.realtime')}</b></div>`;
  return `
    <div class="emtimer">
      <div><b id="emTimer"></b><div class="why">${t('em.timer.hint', { env: t('env.' + envKey), delay: delayText(env) })}</div></div>
      ${st.sentAt ? '' : `<button type="button" class="btn" data-em="sent">${t('em.timer.start')}</button>`}
    </div>`;
}

function tick() {
  const el = root.querySelector('#emTimer');
  if (!el) return;
  const env = getCtx().refs.environments[getCtx().envKey];
  if (!st.sentAt) { el.textContent = t('em.timer.title'); return; }
  const left = env.delayMaxSec - (Date.now() - new Date(st.sentAt).getTime()) / 1000;
  el.textContent = left > 0 ? t('em.timer.running', { t: mmss(left) }) : t('em.timer.done');
}

function render() {
  clearInterval(ticker);
  root.hidden = !st.open;
  document.body.style.overflow = st.open ? 'hidden' : '';
  if (!st.open) { root.innerHTML = ''; return; }

  const head = (title, back) => `
    <div class="emhead">
      ${back ? `<button type="button" class="btn" data-em="${back}">←</button>` : ''}
      <h2>${title}</h2>
      <button type="button" class="btn" data-em="close">✕ ${t('em.close')}</button>
    </div>`;

  if (!data) {
    root.innerHTML = `<div class="embox">${head(t('em.title'))}<p>${t('em.unavailable')}</p></div>`;
    return;
  }

  const p = protocol();
  if (!p) {
    root.innerHTML = `
      <div class="embox">
        ${head('🚨 ' + t('em.title'))}
        <p class="emsub">${t('em.choose')}</p>
        <div class="emgrid">
          ${data.protocols.map((x) => `
            <button type="button" class="emtile" data-em="choose" data-id="${x.id}">
              <span class="ico">${x.icon}</span><span>${esc(L(x.title))}</span>
            </button>`).join('')}
        </div>
        <p class="fine">${t('em.disclaimer')}</p>
      </div>`;
    return;
  }

  const ctx = getCtx();
  const env = ctx.refs.environments[ctx.envKey];
  const steps = L(p.steps);
  const done = steps.filter((_, i) => st.checked[i]).length;

  if (st.report) {
    root.innerHTML = `
      <div class="embox">
        ${head(t('em.report.title'), 'steps')}
        <textarea id="emReport" class="emreport" readonly>${esc(buildReport())}</textarea>
        <div class="emactions">
          <button type="button" class="btn primary" data-em="copy">${t('em.copy')}</button>
          <button type="button" class="btn" data-em="download">${t('em.download')}</button>
        </div>
        <p class="fine">${t('em.disclaimer')}</p>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="embox">
      ${head(`${p.icon} ${esc(L(p.title))}`, 'list')}
      ${timerHtml(env, ctx.envKey)}
      <p class="emsub">${t('em.progress', { a: done, b: steps.length })}</p>
      <ol class="emsteps">
        ${steps.map((s, i) => `
          <li class="${st.checked[i] ? 'done' : ''}">
            <label><input type="checkbox" data-step="${i}"${st.checked[i] ? ' checked' : ''}>
              <span><b>${i + 1}.</b> ${esc(s)}${st.checked[i] ? ` <small>✓ ${clock(st.checked[i])}</small>` : ''}</span></label>
          </li>`).join('')}
      </ol>
      <label class="emnotes">${t('em.notes')}
        <textarea id="emNotes" rows="3">${esc(st.notes)}</textarea>
      </label>
      <div class="emactions">
        <button type="button" class="btn primary" data-em="report">${t('em.report')}</button>
        <button type="button" class="btn" data-em="reset">${t('em.reset')}</button>
      </div>
      <p class="fine">${t('em.disclaimer')}</p>
    </div>`;
  tick();
  ticker = setInterval(tick, 1000);
}
