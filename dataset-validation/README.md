# Food2Fit nutrition validator

## Application integration

The backend now bundles this trained model in `server/services/nutritionValidation/`.
For AI diet responses, it compares original reported nutrients with independently
recomputed reference totals before correction. Each assessed day (and each meal
when the provider reports meal totals) stores `modelAssessment`: prediction,
score and version `nutrition-logistic-v1`. The plan validation summary stores the
model version and number of model-flagged comparisons.

The classifier is advisory. Existing reference calculations and tolerance checks
still determine displayed nutrition and correction status. Dataset-only fallback
plans do not claim an AI assessment. Recipe Studio is unchanged. Synthetic test
scores do not establish performance on real AI responses or medical safety.

## Additional evaluation (no model changes)

The expanded nutrition suite also includes 2,088 multi-nutrient cases: every
combination of 58 held-out foods, six fixed error magnitudes, three sign patterns
and two portion/serving configurations. Every case is retained regardless of
prediction. Labels follow reference arithmetic; no false positives are injected.
Several individually acceptable nutrient differences can jointly push the old
additive classifier above its threshold, producing actual false positives.
New-case inputs, reference totals, labels and predictions are saved in the report.
This is a deliberately constructed stress suite, not an estimate of real AI error
prevalence. Its food identities and prior results have already been inspected.

Run `node dataset-validation/evaluate.js` from the project root to generate
`reports/challenge-evaluation.json` in both validation folders. Nutrition cases
include understatements, overstatements, near-threshold errors on held-out foods,
and unknown/malformed inputs. Workout cases cover existing sets/rest boundaries
and malformed inputs. These remain synthetic checks, not real AI evaluation.
The reports include per-case predictions, confusion counts and classification
coverage. Real AI accuracy/precision/recall are **null (not evaluated)**.
Original test results remain unchanged. Scores are never edited to force them
below 100%; undefined metrics are null. Do not tune models against this challenge
suite and subsequently claim it is an unseen test.

This folder contains training artifacts separate from the application. It reads source foods from `../protein-nap-dataset/` and contains
synthetic training examples, a trained logistic regression model, and results.
The application uses a bundled copy as described above. No Python installation, paid service,
external packages, or Gemini key is needed. Requires Node.js (project target: 24).

## What was completed

- Original food file: **1,914 records**.
- Eligible reference foods: **383**, not just the planner's 54-food selection.
- Only USDA-origin records with all five required nutrients were included.
  Other sources were excluded pending an audit of their nutrient basis;
  missing values were never filled with zero.
- **3,600 synthetic examples**: 2,400 training, 600 validation, 600 testing.
- Foods were split before example generation; IDs and exact normalized names
  cannot overlap between partitions. Similar varieties can still cross partitions.
- Validation data selected the classification threshold. Test data did not train
  the model or select its threshold.
- A logistic regression model was trained using gradient descent.

## Show these files to professors

| Folder/file | Purpose |
| --- | --- |
| `../protein-nap-dataset/protein-nap-foods.json` | Original food data, preserved unchanged |
| `../protein-nap-dataset/protein-nap-record.json` | Publisher metadata and attribution |
| `data/reference-foods.json` | 383 eligible foods, nutrients per 100 g |
| `data/train.jsonl` | Training examples; one JSON object per line |
| `data/validation.jsonl` | Threshold-selection examples |
| `data/test.jsonl` | Unseen-food test examples |
| `model/validator.json` | Learned weights, bias, threshold and feature names |
| `reports/evaluation.json` | Metrics, split identities, checks and limitations |
| `reports/exclusions.json` | Every excluded record and its reason |
| `examples/recipe.json` | Synthetic response to demonstrate the checker |
| `examples/result.json` | Its model prediction and reference nutrition |

## Run from the project root

```powershell
node dataset-validation/train.js
node dataset-validation/validator.js dataset-validation/examples/recipe.json
node --test dataset-validation/validator.test.js
```

Training is reproducible with seed 20261029 and rewrites only generated files in
this folder. To check a Gemini recipe, save its JSON to a new file and pass that
path to `validator.js`. It must contain `ingredients` (name and quantity), integer
`servings`, and `nutrition` (calories, protein, carbs, fat, fiber **per serving**).
Ingredient quantities are total recipe weights; use grams or kilograms and exact
reference food names including preparation state. Cups, spoons, vague quantities,
unknown names, and missing nutrients return `insufficient_information`.

## How training works

Reference totals are calculated from ingredient weights and divided by servings.
Features are absolute differences between reported and reference nutrition,
normalized by max(reference, 100 kcal) for energy or max(reference, 10 g) for
macronutrients/fiber, plus the largest of those five differences.

Label 0 means every normalized difference is at most 0.20. Label 1 means at least
one exceeds 0.20. These are project-defined consistency labels, **not expert
judgments or medical standards**. Synthetic consistent examples contain small
positive/negative perturbations; inconsistent examples deliberately overstate at
least one nutrient. This does not cover the full range of real AI mistakes.

The model uses reference-derived features. It is **not** a fine-tuned language
model and cannot independently understand recipes or verify arbitrary text.
Unknown-input abstention is a rule-based gate, not a trained third class.

## Results and honest interpretation

Held-out synthetic test: **597/600 correct (99.5%)**, with 297 true positives,
300 true negatives, zero false positives, and three false negatives. Here positive
means inconsistent nutrition. The score is not calibrated confidence.

These results show that the model learned the synthetic labeling pattern. The
deterministic labeling rule is an exact baseline on this generated dataset, so
these results do not demonstrate an advantage over direct calculations.
**Real Gemini response evaluation has not been performed.** Before claiming
real-world performance, collect and independently review genuine Gemini outputs,
including understatements, ambiguous names, missing ingredients and unit errors;
report both coverage and accuracy on a separate frozen evaluation set.

Nutrition consistency does not certify cooking safety, allergens, suitability for
a medical condition, or the correctness of instructions. Original preparation
states must match; cooking transformations are not modeled.

## Live Gemini demonstration

The optional live runner reuses the existing server Gemini SDK and its timeout,
retry and structured-output checks. Server dependencies must be installed.
Set `GEMINI_API_KEY` and `GEMINI_MODEL` in `server/.env`; do not put keys in this
folder or paste them into reports. Existing server settings are reused.

```powershell
node dataset-validation/gemini.js
```

This sends one recipe-generation request (up to three attempts on retryable
failures), consumes Gemini quota, and writes a timestamped report to
`reports/live/`. Only ingredient names are sent, not reference nutrient values.
The demonstration constrains names and gram units so the validator can match
ingredients. It is not representative of unrestricted Gemini responses.
Live responses are never automatically added to the synthetic training set.
A prediction is not an independently reviewed accuracy measurement.

Offline integration tests make no API calls:

```powershell
node --test --test-isolation=none dataset-validation/validator.test.js dataset-validation/gemini.test.js
```

## Source and license

PROTEIN NAP Database v1.1, DOI: https://doi.org/10.5281/zenodo.7308053.
Authors and source metadata are preserved in `../protein-nap-dataset/protein-nap-record.json`.
License: **CC BY-NC-SA 4.0**, https://creativecommons.org/licenses/by-nc-sa/4.0/.
Retain attribution, use noncommercially, identify adaptations, and share adapted
data under the same license. Filtered foods and synthetic examples are Food2Fit
adaptations; they are not endorsed or expert-validated by the original authors.
The dataset documentation describes the 54-food planner subset separately from this
383-food training selection. The original archive is in `../protein-nap-dataset/`.
