# Simulation model specification

Engine version: `bateman-1.0.0`.

For elapsed time t in hours after an extravascular administration, the central-compartment shape is:

```text
t <= 0: shape(t) = 0
ka != ke: shape(t) = ka / (ka - ke) * (exp(-ke*t) - exp(-ka*t))
ka == ke: shape(t) = ka * t * exp(-ke*t)
```

The implementation uses `expm1` and an equal-rate series to reduce cancellation and avoid overflow for slow absorption. Both absorption and elimination occur before the peak. Rate constants must be positive, finite and expressed in inverse hours.

Contributions from exact dose timestamps are additive for the same linear model. Visible date ranges select output samples; they do not discard earlier administrations. Fixed-dose normalization uses the model's own single-dose peak for a stated reference amount. It is unaffected by chart zoom and is not a potency scale.

The numerical engine has a synthetic-test absolute parameterization: dose in mg, active-moiety fraction, bioavailability, volume in L and output in mg/L. For apparent V/F, bioavailability is not applied again. The application API currently rejects absolute saved scenarios because catalog validation has not established a releasable quantitative capability.

The production catalog exposes reduced relative shapes for testosterone cypionate IM and enanthate SC/IM. These omit endogenous production, suppression/recovery and fitted covariates. They are not total testosterone models. No universal estradiol, hCG-response or aromatase-inhibition model is implemented.

The sampler includes a uniform grid plus event boundaries and absorption-peak neighborhoods. AUC uses trapezoidal integration in hours. Peak/trough values are sampled estimates; convergence and additional peak-search work remain release tasks. Fluctuation is (peak − trough) / average for the named integration window. No steady-state or washout result is currently exposed.

Inputs preserve catalog/model versions, parameter-source notes, dose-event origin and scenario mode. A generic scale-only fitting helper exists for identifiable synthetic/absolute inputs, but clinical lab calibration is not enabled in the application.

## Numerical validation

`scripts/validate_reference.py` independently solves depot and central-compartment ODEs with SciPy RK45. Four synthetic irregular-dose cases cover ordinary, equal, nearly equal and absorption-limited rates. The recorded results in `data/research/numerical-reference-report.json` agree to below 9e-12 mg/L maximum absolute error.

This verifies numerical implementation only. It does not establish published-data agreement, external clinical validity or individualized predictive accuracy.
