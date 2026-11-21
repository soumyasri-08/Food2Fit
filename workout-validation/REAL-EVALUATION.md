# Real workout response collection

Run `node workout-validation/collect-real.js` from the project root.
It uses the configured server AI provider and consumes API quota. The three
fictional scenarios use no equipment, home equipment and gym equipment.
The application constructs its normal one-day workout request. The collector
saves returned proposals before downstream application rejection.

Each timestamped folder under `real-data/` contains the frozen protocol,
catalog, classifier model, reviewer code, requests, responses, review files
and a report. Existing runs are preserved. No application database writes occur.
Provider or schema failures are recorded separately, including the failed run
before network access was granted.

`real-review.js` implements the documented seven project consistency checks
independently of the classifier code. It assigns labels before predictions are
computed. This provides implementation independence under the same rule policy.
It does not supply independent expert ground truth or clinical assessment.

The successful initial pilot collected three genuine responses. All three were
consistent with the checked rules. Positive precision, recall and F1 are undefined
because there are no positive labels or predictions. The sample is too small and
constrained to establish representative performance.

For human review, open `human-review.json` in the successful run folder. It omits
predictions and automated labels. Reviewers can enter label 0 (passes checked
rules), 1 (violates checked rules), or retain null when unverifiable, with their
name and evidence. All current human labels are pending. Keep review scope
explicit; broader workout suitability requires a separately defined rubric.
