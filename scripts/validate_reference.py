"""Independent depot/central ODE check. Requires numpy and scipy; no fitted drug values."""
import json
from datetime import datetime
from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp

runs = json.loads(Path('.local/reference-fixtures.json').read_text())
report = []
for run in runs:
    scenario = run['scenario']; model = scenario['model']
    origin = datetime.fromisoformat(run['from'].replace('Z', '+00:00')).timestamp()
    times = np.array([(x[0] / 1000 - origin) / 3600 for x in run['points']])
    observed = np.array([x[1] for x in run['points']]); expected = np.zeros_like(times)
    for event in scenario['events']:
        dose_time = (datetime.fromisoformat(event['at'].replace('Z', '+00:00')).timestamp() - origin) / 3600
        selected = times >= dose_time
        t = times[selected] - dose_time
        if not len(t) or max(t) == 0: continue
        # Depot loses by absorption while central compartment simultaneously gains and eliminates.
        solution = solve_ivp(lambda _, y: [-model['ka'] * y[0], model['ka'] * y[0] - model['ke'] * y[1]], (0, max(t)), [event['doseMg'] * model['fraction'] * model['scale']['bioavailability'], 0], t_eval=t, rtol=1e-10, atol=1e-12)
        expected[selected] += solution.y[1] / model['scale']['volumeL']
    error = float(np.max(np.abs(expected - observed)))
    assert error < 1e-8, error
    report.append({'ka': model['ka'], 'ke': model['ke'], 'points': len(times), 'max_absolute_error_mg_per_L': error, 'passed': True})
Path('data/research/numerical-reference-report.json').write_text(json.dumps({'method': 'SciPy solve_ivp RK45; rtol=1e-10, atol=1e-12', 'scope': 'Synthetic numerical correctness only; not clinical validation', 'results': report}, indent=2))
print(json.dumps(report, indent=2))
