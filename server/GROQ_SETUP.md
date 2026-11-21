# Groq setup

## Free-tier diet request update

Groq now arranges seven personalized daily menus calculated by the dataset engine,
instead of generating 28 verbose meal objects. It estimates seven daily nutrition
totals, which the server compares with independent dataset calculations. The output
budget is 1,200 tokens. Meal-level AI estimates are not requested or labeled checked.
This is AI-assisted menu arrangement, not unconstrained AI meal creation.

When quota, timeout or service-unavailable errors occur, the diet endpoint saves a
personalized dataset plan and baseline workout instead, with `generationMethod:
dataset` and a visible explanatory note. It never labels that fallback AI-generated.
Invalid or repeated AI outputs still fail validation; database failures remain errors.

Text recipes, diet plans and workouts now use the configured `AI_PROVIDER`.
The local settings select `groq`, model `openai/gpt-oss-20b`.

1. Create a key at https://console.groq.com/keys using the free plan.
2. Add it privately to `server/.env` as `GROQ_API_KEY=...`.
3. Restart the backend with `npm run dev:server` from the repository root.

Do not put the key in chat, frontend settings, screenshots or Git. The server
uses Groq's HTTPS chat-completions endpoint and strict structured output; every
response also passes the application's original schema and semantic checks.

No paid billing is enabled. Request and token limits still apply. One request is
attempted per action, except a `json_validate_failed` structured-generation error,
which gets one JSON-mode retry with the full schema in the prompt and local validation.
Quota, auth and other provider errors do not trigger automatic
retries or silent provider switching. Diet and AI workout generation are separate
actions to avoid immediately spending two requests on every plan update. The
baseline exercise-library workout is labeled until an AI workout is requested.

GPT-OSS is text-only. Optional image ingredient detection retains the existing
Gemini integration and its quota. Text generation never silently falls back to
Gemini. Change `AI_PROVIDER=gemini` explicitly to switch text providers back.

Recipe cache keys include provider and model. Saved plans retain their provider
in `generationMethod` (`dataset`, `gemini`, or `groq`); old records remain readable.
Diet nutrition recalculation and workout validation remain active.

Mock tests need no live key. Actual Groq generation must still be verified after
adding the key, particularly seven-day diets near free-tier token limits. Truncated
outputs are rejected; no partial plan is saved as complete.

Provider documentation: https://console.groq.com/docs/structured-outputs
and https://console.groq.com/docs/rate-limits.
