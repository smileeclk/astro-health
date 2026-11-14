// Live space weather -> radiation alert.
//   NOAA SWPC: GOES integral proton flux (no API key). >=10 MeV flux of 10 pfu or more = NOAA S1 storm.
//   NASA DONKI (CCMC): recent solar energetic particle (SEP) events and flares.
// Order of fallbacks: live fetch -> last data saved on this device -> snapshot stored in the repository.
import { t, fmt, esc, getLang } from './i18n.js';
import { trendChart } from './charts.js';

const SWPC_URL = 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-6-hour.json';
const DONKI_URL = 'https://ccmc.gsfc.nasa.gov/DONKI-API/get/';
const KEY = 'astroself.sw.v1';
const S_SCALE = [10, 100, 1e3, 1e4, 1e5]; // NOAA S1..S5 thresholds in pfu
const WATCH_PFU = 1;                      // "elevated" level (illustrative)

let chart = null;

async function getJSON(url, ms = 10000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

// Flare classes sort as A < B < C < M < X, then by number (X2.1 > X1.0 > M9.9).
function flareRank(cls) {
  const m = /^([ABCMX])([\d.]+)/.exec(cls || '');
  return m ? 'ABCMX'.indexOf(m[1]) * 100 + Number(m[2]) : -1;
}

async function fetchDonki() {
  const [sep, flr] = await Promise.all([
    getJSON(`${DONKI_URL}SEP?startDate=${day(30)}&endDate=${day(0)}`),
    getJSON(`${DONKI_URL}FLR?startDate=${day(7)}&endDate=${day(0)}`),
  ]);
  const flares = Array.isArray(flr) ? flr : [];
  const strongest = flares.reduce((a, b) => (flareRank(b.classType) > flareRank(a) ? b.classType : a), '');
  return {
    sepEvents: (Array.isArray(sep) ? sep : []).map((e) => ({ time: e.eventTime, link: e.link })),
    flares: { count: flares.length, strongest },
  };
}

function summarize(data, mode) {
  const series = data.series || [];
  const last = series[series.length - 1];
  const flux = last ? last.flux : null;
  const peak = series.reduce((m, p) => Math.max(m, p.flux), 0);
  const level = flux == null ? 0 : S_SCALE.filter((x) => flux >= x).length;
  const status = flux == null ? null : flux >= S_SCALE[0] ? 'red' : flux >= WATCH_PFU ? 'yellow' : 'green';
  return { ...data, mode, flux, peak, level, status, time: last ? last.t : null };
}

export async function loadSpaceWeather() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignore */ }

  try {
    const raw = await getJSON(SWPC_URL);
    const all = raw.filter((r) => r.energy === '>=10 MeV').map((r) => ({ t: r.time_tag, flux: r.flux }));
    if (!all.length) throw new Error('no data');
    // Keep every 3rd point plus the newest one: enough for a small chart, small enough to store.
    const series = all.filter((_, i) => i % 3 === 0 || i === all.length - 1);
    const data = { fetchedAt: new Date().toISOString(), satellite: raw[raw.length - 1].satellite, series, donki: cached ? cached.donki : null };
    try { data.donki = await fetchDonki(); } catch (e) { /* DONKI is optional: keep the last known events */ }
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    return summarize(data, 'live');
  } catch (e) {
    if (cached && cached.series) return summarize(cached, 'cached');
    try {
      const snap = await (await fetch('data/swpc_snapshot.json')).json();
      return summarize(snap, 'snapshot');
    } catch (e2) {
      return null;
    }
  }
}

const when = (iso) => (iso ? new Date(iso).toLocaleString(getLang() === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

export function renderSpaceWeather(el, sw) {
  if (chart) { chart.destroy(); chart = null; }
  if (!sw) {
    el.innerHTML = `<div class="card swcard"><div class="chead"><h3>${t('sw.title')}</h3></div><p class="why">${t('sw.loading')}</p></div>`;
    return;
  }
  const d = sw.donki;
  const donki = d ? `
    <p>${t('sw.sep', { n: d.sepEvents.length })}${d.sepEvents.length ? ` (${esc(when(d.sepEvents[d.sepEvents.length - 1].time))})` : ''}
      ${d.flares ? ' · ' + t('sw.flares', { n: d.flares.count, c: esc(d.flares.strongest || '–') }) : ''}</p>` : '';
  el.innerHTML = `
    <div class="card swcard ${sw.status || ''}">
      <div class="chead">
        <h3>${t('sw.title')}</h3>
        <span class="badge ${sw.mode === 'live' ? 'real' : 'ill'}">${t('sw.mode.' + sw.mode)}</span>
      </div>
      <div class="swgrid">
        <div>
          <div class="lbl">${t('sw.flux')}</div>
          <div class="big"><span class="dot ${sw.status}"></span> ${fmt(sw.flux, 2)} <small>pfu</small></div>
          <div class="why">${t('sw.scale', { s: sw.level })} · ${t(sw.status === 'red' ? 'sw.state.red' : sw.status === 'yellow' ? 'sw.state.yellow' : 'sw.state.green')}</div>
        </div>
        <div class="chartbox"><canvas></canvas></div>
      </div>
      ${donki}
      <p class="fine">${t('sw.meta', { sat: sw.satellite || '–', time: esc(when(sw.time)) })}
        · <a href="https://www.swpc.noaa.gov/products/goes-proton-flux" target="_blank" rel="noopener">NOAA SWPC ↗</a>
        · <a href="https://ccmc.gsfc.nasa.gov/tools/DONKI/" target="_blank" rel="noopener">NASA DONKI ↗</a></p>
    </div>`;
  chart = trendChart(el.querySelector('canvas'), {
    labels: sw.series.map((p) => p.t.slice(11, 16)),
    series: [{ label: t('sw.flux'), data: sw.series.map((p) => p.flux), status: sw.status }],
    baseline: null,
  }, { track: false });
}
