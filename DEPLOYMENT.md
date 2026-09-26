# Deploying ReactorX

ReactorX has two deployable pieces that both need to be live for the app to fully work:

| Piece | What it is | Hosted on |
| --- | --- | --- |
| Frontend (`web/`) | The Vite + React + Three.js app | Netlify |
| Backend (`functions/`) | A Hono API (AI chat, molecule/reaction lookups) + Postgres | Neon |

The frontend calls the backend over HTTP (`VITE_FUNCTIONS_URL`), so deploy the backend first, then point the frontend at its URL.

> The previous version of this doc described the original single-file `index.html` prototype as a static, no-build site. That app was rebuilt into the Vite app in `web/` with a real backend in `functions/` — this doc reflects the current architecture.

## Prerequisites

- A [Neon](https://neon.tech) account with access to this project (`DATABASE_URL` in the root `.env` points at it already).
- A [Netlify](https://netlify.com) account.
- Neon CLI: `npm install -g neon`, then `neon login` (opens a browser — do this yourself, not from an automated shell).
- This repo's GitHub remote (`Ponnusa/ReactorX`) connected to both accounts.

## Part 1: Deploy the backend to Neon

The backend is already declared as infrastructure-as-code in [neon.ts](neon.ts) — a Neon Function (`functions/src/index.ts`) plus the AI Gateway. `ANTHROPIC_API_KEY` is read from `process.env` when you deploy, so make sure it's in whatever `--env` file you pass (the root `.env` already has it).

```bash
neon link                     # links this repo to your Neon project (writes .neon, gitignored)
neon deploy --env .env        # provisions/updates the function + AI Gateway, uploads ANTHROPIC_API_KEY
neon functions get api        # prints the function's public invocation_url
```

Keep that `invocation_url` — it's what `VITE_FUNCTIONS_URL` needs to point at in Part 2. It looks like `https://<branch-id>-api.compute.<cell>.<region>.aws.neon.tech`.

Database schema/seed data (only needed once, or after a schema change):

```bash
node db/migrate.mjs
node db/seed-elements.mjs
```

These read `DATABASE_URL` from your local `.env` and run directly against Neon Postgres — no separate deploy step.

## Part 2: Deploy the frontend to Netlify

Settings are already committed in [netlify.toml](netlify.toml) (base directory `web`, build command `npm run build`, publish directory `web/dist`), so Netlify's defaults just work once the site is connected.

### Continuous deploy from GitHub (recommended)

1. Sign in to [app.netlify.com](https://app.netlify.com).
2. **Add new site → Import an existing project → GitHub**, authorize Netlify, pick the **ReactorX** repo.
3. Netlify reads `netlify.toml` automatically — confirm branch is `main` and click **Deploy**.
4. Once the first deploy finishes, go to **Site configuration → Environment variables** and add:

   | Key | Value |
   | --- | --- |
   | `VITE_FUNCTIONS_URL` | the `invocation_url` from Part 1 |

5. **Deploys → Trigger deploy → Deploy site** (env vars only take effect on the next build, not retroactively).

After this, every push to `main` redeploys the frontend automatically. Deploying a backend change still needs its own `neon deploy`.

### Netlify CLI (alternative)

```bash
npm install -g netlify-cli
netlify login                 # opens a browser, do this yourself
netlify link                  # connect this repo to a Netlify site (or `netlify init` to create one)
netlify env:set VITE_FUNCTIONS_URL "<the Neon function's invocation_url>"
netlify deploy --prod
```

## Verifying a deploy

1. Open the Netlify site URL. The hub scene should render (Ion, the starfield, the two rotating 3D nav models).
2. Open the reaction chamber, pick two reactants, and react them.
3. Click a molecule, then a bond — the molecule detail view should open.
4. Click **Ask Ion** anywhere and ask a question. If you get a real, specific answer, the backend is wired correctly. If you get a generic answer tagged "offline answer", `VITE_FUNCTIONS_URL` is wrong, unset, or the Neon Function isn't responding — check `neon functions get api` and the Netlify env var match.
5. Open the browser console (F12) — no errors expected.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Netlify build fails on `tsc -b` | A type error slipped through — run `cd web && npx tsc -b --noEmit` locally first. |
| Site loads but every Ion chat reply is tagged "offline answer" | `VITE_FUNCTIONS_URL` isn't reaching a live Neon Function. Check it's set in Netlify's env vars and matches `neon functions get api`'s `invocation_url`, then trigger a fresh deploy. |
| AI molecule/reaction lookups fail (chamber says "not a known molecule" for things that should work) | `ANTHROPIC_API_KEY` didn't make it into the deployed function — re-run `neon deploy --env .env` with that key present in the env file. |
| Site shows an old version | Hard-refresh (Ctrl+Shift+R). Check the latest deploy under Netlify's **Deploys** tab succeeded. |
| `git push` returns 403 | Git is signed in to a GitHub account without write access to `Ponnusa/ReactorX`. |
| 3D scene is blank/mostly missing | Check the browser console — a failed model load (`web/public/models/*.glb`) or a WebGL context error is the usual cause. |
