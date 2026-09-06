---
id: darth
category: modelling
name: "DARTH: reproducible R-model review"
version: "2019"
coverage: "Selected implementation guide based on the published five-component framework; not a reporting checklist."
source: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6871515/"
retrieved: "2026-09-06"
---

# DARTH: reproducible R-model review

Selected implementation guide based on the published five-component framework; not a reporting checklist. Alarid-Escudero F et al., *A need for change! A coding framework for improving transparency in decision modeling*. Factual adaptation; examples and package implementation are available from the [authors](https://github.com/DARTH-git).

Source: [Official source](https://pmc.ncbi.nlm.nih.gov/articles/PMC6871515/).

Use with economic-methods guidance and TECH-VER. Request code, accessible or suitable example inputs, R/package versions, run instructions and expected outputs. Record separately what was reported, inspected and executed.

| Framework component | Review focus |
| --- | --- |
| 1 Inputs | Separate sourced data and parameters from calculations; document units, distributions and transformations. |
| 2 Implementation | Trace conceptual states/events, transitions and reward calculations to readable functions. |
| 3 Calibration | If used, document targets, search method, objective and resulting fit; separate calibration from validation. |
| 4 Validation | Locate reproducible checks, independent comparisons and unresolved discrepancies. |
| 5 Analysis | Separate the validated model from base-case, probabilistic, deterministic/scenario and value-of-information analyses as applicable. |

Check documented file organisation and naming, reusable functions, stochastic reproducibility and a reproducible environment. Compare rerun outputs with reported results. A different sound code organisation is not a methodological defect. Without executable artifacts, report the limits of manuscript-only review.
