# Run and deploy Food2Fit

## Local preview

Use Node.js 24 LTS. The development machine used Node 25 during verification.

```powershell
npm --prefix client ci
npm --prefix server ci
npm run dev:client
```

Open `http://127.0.0.1:5174`. For a local-only preview, open `/dashboard?preview=1`. Diet plans use 54 PROTEIN NAP foods; workouts use the 72-record exercise library. Changing preferences and selecting **Generate dataset plan** recalculates both plans locally using the same engine as the backend. No MongoDB or Gemini credentials are needed for this preview. Recipe examples and initial weight history remain illustrative samples. PROTEIN NAP data is used only for fitness/diet, never to generate recipes. Old saved sample diet plans are automatically migrated while retaining favorites and progress.

For live functionality, copy the example environment files once and fill in your own settings:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

Do not overwrite an existing `.env`. `server/.env` needs `MONGO_URI`, a randomly generated `JWT_SECRET` of at least 32 bytes, `CLIENT_URL=http://127.0.0.1:5174`, and `AI_PROVIDER=groq`, `GROQ_API_KEY` and `GROQ_MODEL` for text AI; Gemini settings are optional for photo detection. `client/.env` uses `VITE_API_URL=http://127.0.0.1:5000`. Never put secrets in `VITE_` variables.

Create indexes and import the included PROTEIN NAP food selection, then start the backend in a second terminal:

```powershell
npm --prefix server run db:indexes
npm --prefix server run seed:protein-nap
npm --prefix server run seed:exercises
npm run dev:server
```

Register an account from the UI. Create your fitness profile to generate the plan. Text recipes and photo detection additionally need a Gemini model with image and structured-output support. MongoDB must be Atlas or a replica set for atomic plan saving. The official PROTEIN NAP source and a 54-food planner selection are included; see `protein-nap-dataset/PROTEIN-NAP.md` for attribution, noncommercial license terms and added classifications. Seeding preserves existing foods; use a fresh database for a real-data-only collection. Browser preview uses real diet data; recipe examples and initial weight history remain labeled samples.

## Vercel: two projects

1. Upload this repository to your Git provider. Keep `.env`, `node_modules` and build output out of Git.
2. Import a server project in Vercel with **Root Directory `server`**, Node.js 24, and the supplied `vercel.json`. Leave the build command/output directory empty for the API function layout. `api/index.js` exports the app; it does not listen on a port.
3. Add `MONGO_URI`, `JWT_SECRET`, `AI_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL`, `CLIENT_URL` and `NODE_ENV=production`. Add `GEMINI_API_KEY` and `GEMINI_MODEL` if photo detection is enabled to the server project. `CLIENT_URL` must be the exact HTTPS frontend origin without a trailing slash. If necessary, update it once the client URL is known and redeploy.
4. Import a client project with **Root Directory `client`**, Vite preset, build command `npm run build`, output `dist`, Node.js 24. Set `VITE_API_URL` to the deployed server origin (no `/api` suffix). The client rewrite supports direct React Router page visits.
5. Use Atlas M0, a database user scoped to Food2Fit, and the requested `0.0.0.0/0` network access rule for Vercel connections. Run the index and seed commands against that database before serving live users. Production does not build indexes on every cold start.
6. Deploy both projects. Confirm `/api/health` returns HTTP 200 with `database: connected`, and test sign-in and a protected request from the deployed frontend. Preview URLs require their own allowed `CLIENT_URL`; wildcard CORS is not enabled.

No deployment has been performed from this workspace. Provider accounts, credentials, project URLs and free-tier eligibility must be configured by the owner. There are no paid dependencies or automatic upgrades; provider quotas and availability still apply. Gemini 429 responses are bounded and return saved favorites when available. The server function duration is 60 seconds. Long provider retries can exceed that limit; check quota/error behavior on the hosted app before public release.

## Verification

```powershell
npm run build
npm run check:server
npm --prefix server test
```

The backend tests start temporary local MongoDB databases, including a replica set. They intercept Gemini, so they consume no API quota and do not access Atlas. They cover authentication, input validation, atomic plan saving, dataset filters, recipe caching, ownership, photo decoding, rate limiting and provider failure handling.

Before publishing, manually verify these browser flows:

- Register, sign out, sign in, refresh a protected page, and test an expired session.
- Create a fitness profile; generate and download a plan; switch meal and workout days; log a weight.
- Generate a text recipe; upload a photo; edit detected ingredients before generating; refine and regenerate.
- Save a favorite; revisit history; remove entries; open, print and share a recipe.
- Check 375 px mobile and desktop layouts, keyboard navigation, dialog Escape/focus behavior and dark mode.
- Confirm actual nutrition deviations and sample-data labels are visible.

Latest verification: 72 automated tests passed, client production build and server syntax checks passed. Browser checks covered phone/tablet layouts, navigation, preview favorites/history and a successful PDF download. Provider calls were mocked in automated tests; production hosting, live AI availability and Google sign-in still require verification after deployment.

## Frontend behavior

- JWTs are stored in sessionStorage for the current browser tab. Theme and explicitly selected sample data are localStorage preferences. Logout clears the token. There is no refresh-token flow.
- Recipe photos are resized with the browser helper; the server independently validates and re-encodes them. Photos are never persisted.
- The dashboard shows **planned** nutrition, not logged food consumption. Weight logs are separate from profile measurements.
- Meal/recipe photographs are illustrative remote Unsplash images, not photographs of generated recipes.
- PDF export uses jsPDF and includes targets, actual meal totals, exercises, plan notes and sources.
- Sample preview actions stay in the browser and are labeled. Real account actions use the protected REST API.

API references: `server/FITNESS_API.md`, `server/RECIPES_API.md`, and the authentication section of `README.md`.

## Gemini recipes and workouts

Save `GEMINI_API_KEY` and the model ID in `server/.env`; the current local setup uses `gemini-3.5-flash`. Keep keys out of chat and client settings. `MONGO_URI` is also required for authentication, shared rate limits, history and saved plans. Start the backend, sign in, and leave preview mode to use live AI. For this preview port, use `CLIENT_URL=http://127.0.0.1:5174` and `VITE_API_URL=http://127.0.0.1:5000`.

Create recipes in the recipe studio. In Fitness Planner, first build a dataset plan, then select **Generate Gemini workout**. PROTEIN NAP diet plans remain unchanged by that action. The offline preview still uses the local exercise engine and sample recipes.

`npm --prefix server run check:gemini` explicitly sends two synthetic requests to the configured Gemini model without MongoDB, checking recipe JSON and an exercise-library-constrained workout. It consumes API quota. Automated tests mock Gemini and do not consume quota. Gemini calls have a 15-second timeout per attempt, at most three attempts for quotas/socket resets, and low thinking level for Gemini 3 models.

## Google sign-in in production

Set `GOOGLE_CLIENT_ID` on the server and the same `VITE_GOOGLE_CLIENT_ID` on the client. Add the deployed frontend HTTPS origin to the Google OAuth web client authorized JavaScript origins. Do not put a client secret in frontend variables.
