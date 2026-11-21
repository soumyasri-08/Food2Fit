# Diet response labels: reference arithmetic, then human review

This workflow is for **diet plans only**, not recipe generation. It does not replace
the application's current dataset-generated diet planner with Gemini.

## What is checked

For every food, calculate each nutrient as:

`reference nutrient per 100 g × ingredient grams / 100`

Sum ingredients for each meal, then sum meals for the daily total. Compare both
meal and daily numbers independently against Gemini's claims. This schema is for
one person's day, so there is no hidden serving-size division.

Reference: the audited 383-food PROTEIN NAP selection. Exact source ID and name
must match, including raw/cooked preparation. Missing or unknown food weights
return `cannot_verify`, never a fabricated zero or successful match.

Labels:
- `numerically_consistent`: all compared nutrients fall within the chosen tolerance.
- `numerically_inconsistent`: at least one nutrient differs beyond tolerance.
- `cannot_verify`: missing/ambiguous reference mapping or input.

Tolerance is max(20% of reference, 20 kcal for energy or 2 g for other nutrients).
This is a documented **project heuristic**, not a clinical standard. These labels
do not establish nutritional adequacy, personal suitability or safety.

## Collect actual Gemini responses

```powershell
node dataset-validation/collect-diet.js
```

Uses the private settings in `server/.env`. Sends one bounded evaluation request
(with the existing provider retry limits). It sends names and IDs but **withholds
reference nutrient values**. No real user's measurements are sent. The collector
uses one fixed, constrained scenario; it is not representative of general diet
requests. Provider failure saves no successful record.

Success writes the raw diet, prompt, model, time, ingredient contributions, every
comparison, reference fingerprint and proposed label to `diet-labels/pending/`.
Every new record has `trainingEligible: false`. Predictions from the trained model
are never used as ground-truth labels.

## Review before training

Open a pending JSON record and check:
1. ID and food name identify the intended food and preparation state.
2. Gram amounts are unambiguous and cover the ingredients being assessed.
3. Per-100-g calculations, meal totals and daily totals are correct.
4. The numerical label follows the documented tolerance.

An actual reviewer can then run:

```powershell
node dataset-validation/review-diet.js <pending-record.json> <reviewer-name> "Checked matching, weights and arithmetic"
```

This recalculates the label and saves a reviewed copy. It refuses unverifiable
cases. A review record is an accountability trail, not proof of medical expertise.
Do not mark records reviewed without performing the checks.

## Next training stage

Collect diverse independently reviewed examples across food combinations, quantities,
meal counts and plausible nutrition errors. Include both consistent and inconsistent
real responses; keep deliberately corrupted synthetic examples separately labeled.
Group duplicate/near-duplicate diet templates together before train/validation/test
splitting. Freeze a real-response test set before tuning and report class counts,
precision, recall, confusion matrix and the fraction that could not be verified.

No retraining on real responses has been performed by these scripts. The previous
synthetic nutrition-model score does not transfer to this dataset. A small or
single-class collection is insufficient evidence of generalization. Direct
arithmetic is the baseline; only claim a model benefit if evaluation shows one.

## Verification

```powershell
node --test --test-isolation=none dataset-validation/diet-labels.test.js
node dataset-validation/diet-labels.js <diet.json>
```

The tests check known arithmetic, wrong meal totals despite correct daily totals,
wrong daily totals, and abstention for unmatched food IDs/names or missing weights.
