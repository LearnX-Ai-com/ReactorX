# Deploying ReactorX to Netlify

ReactorX is a static site: one [index.html](index.html), no build step and no server code. Netlify only has to serve the files in this repo.

**Live site:** <https://reactor-x.netlify.app/>

## Netlify settings

| Setting | Value |
| --- | --- |
| Build command | *(leave empty)* |
| Publish directory | `.` (the repo root) |
| Functions directory | *(none)* |
| Environment variables | *(none needed)* |
| Node version | Not applicable, nothing is built |

## Option 1: Continuous deploy from GitHub (recommended)

Every push to `main` redeploys the site automatically.

1. Sign in to [app.netlify.com](https://app.netlify.com).
2. Choose **Add new site → Import an existing project → GitHub**.
3. Authorize Netlify for the GitHub account that owns the repo (`Neha3-code`) and pick the **ReactorX** repository.
4. Set the branch to deploy to `main`, leave **Build command** empty and set **Publish directory** to `.`.
5. Click **Deploy**. The first deploy takes under a minute and gives you a `https://<site-name>.netlify.app` URL.
6. Optional: under **Site configuration → Change site name** pick a friendlier subdomain.

After this, deploying a change is just:

```bash
git add index.html
git commit -m "Describe the change"
git push origin main
```

Netlify picks up the push and publishes it. Deploy status and logs are under the site's **Deploys** tab.

## Option 2: Manual drag-and-drop

1. Open [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the project folder onto the page.

This does not update on push. To update the site, drag the folder onto the site's **Deploys** tab again.

## Option 3: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify deploy --dir=. --prod
```

Run `netlify deploy --dir=.` without `--prod` first to get a preview URL.

## Verifying a deploy

Open the site URL and check:

1. The 3D scene renders (floor grid, the two reactant molecules, the arrow).
2. Pick two reactants, click **Balance equation** then **React**. The reaction animates.
3. Click a molecule and a bond. The card opens.
4. Open the browser console (F12). There should be no errors. A failed request for `three.min.js` means the CDN was blocked.

## Virtual reality (WebXR)

WebXR needs HTTPS. Netlify serves every site over HTTPS by default, so VR works on the deployed URL. On a headset browser such as Meta Quest Browser, open the site and use **Enter VR**, which appears only if the device supports it.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| Blank page, console error about `THREE` | The Three.js CDN was blocked or offline. Check the network, or vendor `three.min.js` into the repo and update the `<script>` tag. |
| Text looks like a default system font | Google Fonts was blocked. The app still works. |
| Site shows an old version | Hard-refresh (Ctrl+Shift+R). On Netlify, check that the latest deploy under **Deploys** succeeded and is published. |
| Push does not trigger a deploy | Confirm the site is linked to the right repo and that the deploy branch is `main` (**Site configuration → Build & deploy → Continuous deployment**). |
| `git push` returns 403 | Git is signed in to a GitHub account without write access. Sign in as the repo owner. |
| Deploy fails with a build error | The build command should be empty. Clear it in **Build & deploy → Build settings**. |
| **Enter VR** does not appear | The browser or device does not support `immersive-vr`, or the page is not on HTTPS. |

## Optional: `netlify.toml`

Settings can be stored in the repo instead of the Netlify UI. If you want that, add a `netlify.toml` at the repo root:

```toml
[build]
  publish = "."
```

This is not required, since the defaults above are enough.
