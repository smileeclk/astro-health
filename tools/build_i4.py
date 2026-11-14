"""Convert the NASA OSDR Inspiration4 blood CSVs into data/i4_blood.json.

Source files (download first):
  OSD-575  LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv
  OSD-569  LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv
  https://osdr.nasa.gov/geode-py/ws/studies/OSD-{ID}/download?source=datamanager&file={FILE}

Usage:  python tools/build_i4.py <cmp.csv> <cbc.csv> data/i4_blood.json
"""
import csv
import json
import sys
from tempfile import TemporaryDirectory
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

OSDR_FILES = {
    575: 'LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv',
    569: 'LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv',
}


def refresh(out_path):
    with TemporaryDirectory() as directory:
        paths = []
        for study, filename in OSDR_FILES.items():
            query = urlencode({'source': 'datamanager', 'file': filename})
            url = f'https://osdr.nasa.gov/geode-py/ws/studies/OSD-{study}/download?{query}'
            path = Path(directory) / filename
            with urlopen(url, timeout=30) as response:
                path.write_bytes(response.read())
            paths.append(path)
        main(*paths, out_path)

TIMEPOINTS = ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194']

# key -> (file, value column, range-min column, range-max column, unit, digits)
ANALYTES = {
    'glucose':    ('cmp', 'glucose_value_milligram_per_deciliter', 'glucose_range_min_milligram_per_deciliter', 'glucose_range_max_milligram_per_deciliter', 'mg/dL', 0),
    'sodium':     ('cmp', 'sodium_value_millimol_per_liter', 'sodium_range_min_millimol_per_liter', 'sodium_range_max_millimol_per_liter', 'mmol/L', 0),
    'potassium':  ('cmp', 'potassium_value_millimol_per_liter', 'potassium_range_min_millimol_per_liter', 'potassium_range_max_millimol_per_liter', 'mmol/L', 1),
    'calcium':    ('cmp', 'calcium_value_milligram_per_deciliter', 'calcium_range_min_milligram_per_deciliter', 'calcium_range_max_milligram_per_deciliter', 'mg/dL', 1),
    'creatinine': ('cmp', 'creatinine_value_milligram_per_deciliter', 'creatinine_range_min_milligram_per_deciliter', 'creatinine_range_max_milligram_per_deciliter', 'mg/dL', 2),
    # The source column is named "hemoglobin_value_percent", but the values and ranges are in g/dL.
    'hemoglobin': ('cbc', 'hemoglobin_value_percent', 'hemoglobin_range_min_percent', 'hemoglobin_range_max_percent', 'g/dL', 1),
    'hematocrit': ('cbc', 'hematocrit_value_percent', 'hematocrit_range_min_percent', 'hematocrit_range_max_percent', '%', 1),
    'wbc':        ('cbc', 'white_blood_cell_count_value_thousand_per_microliter', 'white_blood_cell_count_range_min_thousand_per_microliter', 'white_blood_cell_count_range_max_thousand_per_microliter', '10³/µL', 1),
    'platelets':  ('cbc', 'platelet_count_value_thousand_per_microliter', 'platelet_count_range_min_thousand_per_microliter', 'platelet_count_range_max_thousand_per_microliter', '10³/µL', 0),
}


def num(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def load(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        parts = row['Sample Name'].split('_')  # e.g. C001_serum_L-3
        row['_crew'], row['_tp'] = parts[0], parts[2]
    return rows


def main(cmp_path, cbc_path, out_path):
    files = {'cmp': load(cmp_path), 'cbc': load(cbc_path)}
    out = {
        'source': 'NASA OSDR OSD-575 / OSD-569 (Inspiration4)',
        'urls': ['https://osdr.nasa.gov/bio/repo/data/studies/OSD-575', 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569'],
        'note': '4 civilian astronauts, 3-day mission, samples only before (L-) and after (R+) flight. '
                'Low glucose at R+45 is probably a sample-handling artefact, not a spaceflight effect.',
        'crew': 4,
        'timepoints': TIMEPOINTS,
        'analytes': {},
    }
    for key, (fname, vcol, lo_col, hi_col, unit, digits) in ANALYTES.items():
        rows = files[fname]
        by_tp = {}
        for tp in TIMEPOINTS:
            vals = [num(r[vcol]) for r in rows if r['_tp'] == tp]
            vals = [v for v in vals if v is not None]
            by_tp[tp] = {'mean': round(sum(vals) / len(vals), 2), 'min': min(vals), 'max': max(vals), 'n': len(vals)}
        pre = [num(r[vcol]) for r in rows if r['_tp'].startswith('L-')]
        pre = [v for v in pre if v is not None]
        los = [v for v in (num(r[lo_col]) for r in rows) if v is not None]
        his = [v for v in (num(r[hi_col]) for r in rows) if v is not None]
        out['analytes'][key] = {
            'unit': unit, 'digits': digits,
            # Lab reference range as reported with the samples (widest range where it differs by person).
            'rangeMin': min(los), 'rangeMax': max(his),
            'preflightMean': round(sum(pre) / len(pre), 2), 'preflightMin': min(pre), 'preflightMax': max(pre), 'preflightN': len(pre),
            'byTimepoint': by_tp,
        }
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('wrote', out_path, list(out['analytes']))


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--fetch':
        refresh(sys.argv[2])
    else:
        main(*sys.argv[1:4])
