# AstroSelf — Astronaut Health Monitor

> *"When Earth is minutes away, the crew needs answers now."*

**Live demo:** https://senadogann.github.io/astro-health/ (no login, works offline after the first visit)

NASA Space Apps Challenge 2026 · Bursa · Team **İstikbal Göklerdedir**
Challenge: [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)

> **Prototype — not a medical device.** Prototype values. Real medical thresholds are set by flight surgeons.
> The app gives no diagnosis and no medication doses.

![Dashboard during a simulated solar particle event](docs/screenshots/01-dashboard-solar-storm.jpg)

## The problem

In January 2026 a crew returned early from the ISS for a medical reason, because the equipment on board was not
enough for a full diagnosis. On the way to Mars there is no early return, and a message to Earth and back can take
up to 44 minutes. NASA's Exploration Medical Capability element lists Earth-independent medical decision support as
an open gap (ExMC Med07 / Med10).

## Our solution

AstroSelf is a visual self-assessment tool that an astronaut can use alone, without a connection to Earth.

- **Daily check-in** of heart rate, blood pressure, body temperature, blood glucose, sleep, mood (plus optional
  vision change and exercise), with a "How to measure?" help text for each one.
- **Assessment engine** with three layers: a *personal baseline* (mean and standard deviation of the first 7–14 days,
  z-score), *Earth reference* ranges, and *NASA-derived* limits. Every indicator and body system is green, yellow or red,
  and the app says why.
- **3D body** that can be rotated and zoomed. Six systems (heart, lungs, brain, bones and muscles, eyes, blood and
  immunity) change colour with their status and pulse when red.
- **Organ panel**: what the system does, how the five hazards of spaceflight affect it, current values with trend
  charts, what to do, **when to notify the flight surgeon**, and the communication delay.
- **Environment selector**: ISS, Orion, lunar base, Mars transit, Mars base. It changes the communication delay,
  the radiation dose rate and the advice.
- **Real NASA data**: Inspiration4 blood values for comparison, and live space weather that raises a shelter alert.
- **Emergency mode** on every screen: six offline checklists, an "Earth reply in X min" countdown and a report for
  the flight surgeon.
- **30-day risk outlook**: trends and cumulative loads mapped to NASA HRP risks as Low / Medium / High, with a
  "Today / +30 days" switch on the 3D body.
- Reminders, a check-in streak with badges, and a printable one-page report.
- English and Turkish. Installable (PWA) and fully usable with no internet.

| Organ panel | Emergency checklist | 30-day outlook |
|---|---|---|
| ![Organ panel](docs/screenshots/02-organ-panel.jpg) | ![Emergency checklist](docs/screenshots/03-emergency-checklist.jpg) | ![30-day risk outlook](docs/screenshots/04-risk-outlook.jpg) |

## How to use it

1. Open the [live demo](https://senadogann.github.io/astro-health/). It starts in **demo mode** with 30 days of
   simulated data for a fictional astronaut.
2. Press a **scenario** button (Solar particle event, Sleep loss, Dehydration / fluid shift) and watch the cards,
   the 3D body and the alerts change.
3. Tap an organ on the 3D body to open its panel.
4. Change the **environment** (top right) to see how the delay and the radiation dose change.
5. Press **EMERGENCY** for the checklists. Press **30-day outlook** for the risk forecast.
6. Open **Daily check-in** to enter your own values. The app then switches to "My data" and starts building your
   personal baseline (7 days).

Data stays on the device (localStorage). There is no backend, no login and no tracking.

## NASA data and sources: real vs simulated

Every card in the app carries a label: *Real NASA data*, *NASA-derived*, *Simulated*, *Self-entered* or *Illustrative*.

| Data | Type | Source |
|---|---|---|
| Inspiration4 blood values (glucose, electrolytes, kidney, blood count) | **Real NASA data**, embedded in `data/i4_blood.json` | NASA OSDR [OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) / [OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) (Inspiration4) |
| ≥10 MeV proton flux; radiation storm alert at 10 pfu (NOAA S1) | **Real, live**; falls back to the last saved data, then to `data/swpc_snapshot.json` | [NOAA SWPC GOES proton flux](https://www.swpc.noaa.gov/products/goes-proton-flux) |
| Solar energetic particle events and flares | **Real, live** | [NASA DONKI (CCMC)](https://ccmc.gsfc.nasa.gov/tools/DONKI/) |
| Demo astronaut "Cmdr. A. Yıldız" and the three scenarios | **Simulated** | `js/demo.js` |
| Mission radiation dose | Model: mission days × environment dose rate | `js/rules.js` |
| Bone loss | Model: NASA rate of 1–1.5% per month | `js/rules.js`, `js/outlook.js` |

Inspiration4 notes: 4 civilian astronauts, 3-day mission, samples only before and after flight. The low glucose at
R+45 is probably a sample-handling artefact and is not interpreted as a spaceflight effect. The embedded file can be
rebuilt directly from NASA OSDR with `python tools/build_i4.py --fetch data/i4_blood.json`. The two-CSV command remains available for offline rebuilds.

### Reference values (`data/references.json`)

| Parameter | Value | Source |
|---|---|---|
| Career radiation limit | < 600 mSv effective dose | [NASA-STD-3001 Vol.1 Rev C](https://www.nasa.gov/reference/nasa-std-3001/) [V1 4030] |
| Solar particle event design limit | < 250 mSv | NASA-STD-3001 [V1 4031] |
| ISS dose rate | ~0.5 mSv/day (order of magnitude) | NASA LSAH Newsletter 2023 |
| Orion / Artemis I dose rate | 0.96–1.24 mSv/day | Nature 2024; [NTRS 20230010550](https://ntrs.nasa.gov/citations/20230010550) |
| Lunar surface dose rate | ~1.37 mSv/day | [Zhang et al., Science Advances 2020](https://doi.org/10.1126/sciadv.aaz1334) (Chang'E-4) |
| Mars transit / surface dose rate | 1.84 ± 0.33 / 0.64 ± 0.12 mSv/day | [Hassler et al., Science 2014](https://doi.org/10.1126/science.1244797) (Curiosity RAD) |
| Cabin CO₂ | 1-hour average ≤ 3 mmHg | [NASA-STD-3001 Vol.2](https://www.nasa.gov/ochmo/health-operations-and-oversight/hsa-standards/) [V2 6004]; OCHMO-TB-004 |
| Bone loss | 1–1.5% per month (hip/spine) | [HRP Evidence Reports](https://humanresearchroadmap.nasa.gov/evidence/): Bone Fracture, 2024 |
| Sleep on the ISS | 6.09 h on average (8.5 h scheduled) | [Barger et al., Lancet Neurology 2014](https://doi.org/10.1016/S1474-4422(14)70122-X) |
| SANS | ~70% of long-duration crew show at least one finding | HRP Evidence Report: SANS, 2022 |
| Aerobic exercise | ≥ 70% of peak heart rate, ≥ 3 sessions/week, ≥ 20 min | [NASA OCHMO technical briefs](https://www.nasa.gov/ochmo/hsa-standards/ochmo-technical-briefs/) |
| Vital signs measured | heart rate, blood pressure, temperature, respiration, height, weight | [NLSP](https://nlsp.nasa.gov/explore) LSAH protocol MR089S |

Also used: [NASA HRP 5 Hazards](https://www.nasa.gov/hrp/hazards/), [HRP Risks](https://www.nasa.gov/hrp/risks/),
[HRP Ongoing Research](https://www.nasa.gov/hrp/ongoing-hrp-research/),
[CSA: Monitoring radiation and astronaut health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp),
[CSA: Why do we conduct science experiments in space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp),
[NASA OSDR RadLab](https://visualization.osdr.nasa.gov/radlab/gui/overview/).

### Illustrative values

These cut-offs were chosen by the team for the prototype and are marked `illustrative` in `data/references.json`:
Earth reference ranges (simplified general adult ranges), the z-score levels (2 SD = "Watch", 3 SD = "Caution"; a baseline change alone never turns red, red also needs the reference range to agree), daily dose
alert levels (5 / 25 mSv), the simulated solar particle event dose (45 mSv), the "elevated" proton flux level (1 pfu),
sleep debt levels (10 / 20 h) and the outlook window (14 days).

## Technology

Plain HTML, CSS and JavaScript (ES modules). No build step, no backend.

- [Three.js](https://threejs.org/) r160 (MIT) for the 3D body, [Chart.js](https://www.chartjs.org/) 4.4.1 (MIT) for charts;
  both are stored in `vendor/` so the app works offline.
- `sw.js` caches the whole app (network first, cache fallback). `manifest.webmanifest` makes it installable.
- All interface text is in `data/i18n.json`; organ and emergency content in `data/content.json` and `data/emergency.json`.

### 3D model licence

The 3D figure is a stylised low-poly astronaut generated in code from Three.js primitives (`js/body.js`).
No external model file is used, so there is no third-party model licence. `js/body.js` is a replaceable module.

### Run locally

```bash
python -m http.server 8765
```

Then open http://localhost:8765. Static checks for translations and the offline file list: `python tools/check.py`.

## SI Use

- Most of the code was written with **Claude (Anthropic)** using **Claude Code**.
- The in-app texts (organ descriptions, self-care steps, emergency checklists) and the Turkish/English translations
  were drafted with Claude and reviewed by the team.
- The idea, the scope decisions, the choice of content and data sources, testing and the presentation are the team's.
- The app icon was drawn in code. **No NASA logo was generated with SI and no NASA logo is used.**
- The app itself contains no SI chat assistant: all assessments come from fixed rules in `js/rules.js` and `js/outlook.js`.

## Team

**İstikbal Göklerdedir** — Management Information Systems students, Bursa Uludağ University.

The team name is a quote from Mustafa Kemal Atatürk: *"İstikbal göklerdedir"* — *"The future is in the skies."*

Submission documents: [project page text](docs/project-page.md) · [video script](docs/video-script.md) · [slide outline](docs/slides.md)
