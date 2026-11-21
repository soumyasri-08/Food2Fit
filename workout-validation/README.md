# Workout validation training process

## Current application model

AI workout generation now uses the raw-feature classifier bundled in
`server/services/workoutValidation/raw-model.json`, with inference in `raw-model.js`.
Its 24 aggregate features replace the legacy seven rule flags as model inputs.
The selected weights come from `raw-experiments/1795195945590-10632/model.json`.
Training uses 7,000 examples, validation uses 1,500 for threshold selection, and
the synthetic test split contains 1,500 examples. The source experiment's
`deployed` field records its status when trained, not current app integration.

The app retains deterministic checks and saves the model score and prediction
under workout `validation`, with version `workout-raw-v1`. Predictions are advisory:
the model does not override rule failures or reject an otherwise valid workout.
This model is not medically validated. The legacy rule-flag training process below
remains reproducible but is no longer the model used for app predictions.

## Interpreting perfect scores

Accuracy and precision are numeric measurements, not boolean `true` values.
The original synthetic score of 1 means 100% agreement with rule-derived labels;
the model receives those same rule flags, making this an easy classification task.
It does not establish real AI accuracy. Run `node dataset-validation/evaluate.js`
from the project root for an additional `reports/challenge-evaluation.json` here:
10,332 cases across all exercises and equipment levels, numeric boundaries, schedule errors, combined violations, malformed-input abstention checks, per-case predictions
and classification coverage. Reports contain synthetic evaluation metrics. A perfect
boundary-test result is retained honestly, never lowered by adding fake errors.

This is a trained logistic-regression baseline for **structured workout consistency**.
It does not learn medical safety, effectiveness or individual coaching expertise.
The main backend runs it on Gemini workouts after its existing structural,
equipment, movement-slot and recovery checks. The validation result is saved with
the workout. Recipe generation is unchanged.

## Process

1. Read the application's **72-exercise library**, including names, equipment and
   movement types. This is project exercise data, not PROTEIN NAP nutrition data.
2. Generate base routines using eligible exercises and bounded numeric fields until
   the split targets are reached (1310 groups with the current seed).
3. Keep each base routine as a consistent example and make seven corrupted variants:
   unknown name, unavailable equipment, missing day, duplicate exercise, excessive
   sets, invalid repetitions/duration, and insufficient rest.
4. Remove exact duplicate inputs globally and keep generating until there are
   exactly **10,000 examples**. The final group's variants may be truncated to fit
   its partition, and that group is never reused in another partition.
5. Assign rule-derived labels: 0 passes implemented checks; 1 violates a check.
   These labels are synthetic, not expert annotations and not actual Gemini outputs.
6. Represent each example by seven binary rule-violation flags. This deliberately
   simple baseline learns to combine known checks; it cannot discover new ones.
7. Keep all versions of a base routine together: **7,000 training**, **1,500 validation**,
   **1,500 testing** examples. Exercise identities and corruption types are shared across
   splits; this is not an unseen-exercise or unseen-error evaluation.
8. Fit logistic regression with gradient descent for 1,800 iterations. Save learned
   weights and bias. Choose the classification threshold on validation data only.
9. Evaluate once on held-out test routines. Test result: **1,500/1,500 rule labels matched**,
   including 1,303 inconsistent and 197 consistent examples. Deterministic rules also
   achieve 100% by definition. The model has not shown improvement over those rules.
10. Export the model and inference code into `server/services/workoutValidation/` so
    the deployed backend can run it without importing the training folder.

## Live application behavior

Gemini response → existing structural and workout constraints → trained model →
save workout with validation status and prediction → display in Fitness Planner.
Rules always override the model. Missing required structure cannot be verified;
violations are rejected. A model score is not calibrated confidence. Passing checks
does not certify clinical suitability, technique, progression or effectiveness.

The existing backend performs additional movement, goal and recovery checks not
represented in this small learned model. Old saved workouts have no validation
record until regenerated. Preview workouts do not call Gemini or this model.

## Files and commands

- `data/*.jsonl`: labeled examples with input, label, features and group ID.
- `data/exercises.json`: reference library snapshot.
- `model/workout-model.json`: trained parameters.
- `reports/evaluation.json`: metrics and limitations.
- `examples/`: valid and invalid structured inputs.

From the repository root:

```powershell
node workout-validation/train.js
node workout-validation/validator.js workout-validation/examples/invalid-workout.json
```

Training uses seed 20261030 and also refreshes the backend's model bundle. It makes
an artifact backup under the project-root `validation-backups/` before replacing
existing training outputs and the bundled model. It makes
no API requests. The original nutrition model remains separate and is not used for
workouts. Real Gemini evaluation and independent expert labels are still needed
before claiming real-world workout-validation accuracy.

## Expanded exercise catalog

The source catalog contains 72 exercises, including 48 added bodyweight, resistance-band, dumbbell, machine, cable and cardio variations. All 72 appear in consistent training examples; the report lists their names under trainingExerciseCoverage. Generation cycles through none, home and gym equipment.

The catalog is project-curated. Movement groups, difficulty and goal tags are application classifications. Home/gym equipment categories are broad and do not track individual items. Exercise naming was cross-checked against the general ACE exercise-library categories: https://www.acefitness.org/resources/everyone/exercise-library/ . This is not an imported ACE dataset or an expert-reviewed training prescription.

The seed catalog is in server/seed/data/exercises.json. The offline training snapshot is in workout-validation/data/exercises.json. Existing database records require the exercise seed command to import additional catalog entries.
