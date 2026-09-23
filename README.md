# ReactorX

*Chemistry you can walk into.* A browser-based 3D / WebXR chemistry lab.

**Live demo: <https://reactor-x.netlify.app/>**

Pick two reactants, balance the equation, and watch the reaction happen: molecules collide, bonds break and form, and products appear. Zoom from the whole reaction down to a single atom, and click any bond to see the electron mechanism behind it (ionic transfer, or shared covalent pairs).

The full product description lives in [SPEC.md](SPEC.md). Deployment steps are in [DEPLOYMENT.md](DEPLOYMENT.md), and planned work is in [ROADMAP.md](ROADMAP.md).

## Features

- **Ion, a built-in lab assistant.** Ask "Why does sodium give its electron away?" or "Why is iron 3+?" and get an answer built from the real data for the atom, bond or reaction on screen (no backend or API key)
- Automatic equation balancing with a balanced / unbalanced badge
- Animated reactions with a live caption of the bonds breaking and forming
- Reactants stay visible (semi-transparent) after the reaction and remain clickable
- Click a molecule to see its card: molar mass, bond types, oxidation states
- Click a bond to see why it is ionic or covalent (single, double, triple)
- "Learn more" detail view with interactive Bohr models, subshell configuration and quarks
- Orbit, pan, zoom, and a **center view** button (⌖) to reframe the whole reaction
- Optional immersive VR on WebXR-capable headsets (e.g. Meta Quest Browser)

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Rotate | Drag | One-finger drag |
| Pan | Shift + drag, or right / middle drag | Two-finger drag |
| Zoom | Scroll wheel, or the + / − buttons | Pinch |
| Recenter and fit everything | ⌖ button, or double-click empty space | ⌖ button |
| Inspect a molecule / bond | Click it | Tap it |
| Ask Ion a question | **Ask Ion** button (bottom-right), then type or tap a suggestion | Same |

## Ion, the lab assistant

Ion answers questions about whatever you are looking at. The label above the input shows what it is talking about (for example "Fe₂O₃ · ionic bond"), and the three suggestion chips change with the view.

- Works in the chamber and in the atom / molecule detail view
- Replies quote live values from the app's data (electronegativity, valence electrons, oxidation states, electron configurations, balanced equations), so new elements and reactions are covered automatically
- Runs entirely in the browser: no server or API key to set up, and no extra network calls
- Built so the scripted engine can be swapped for a live LLM later (see [SPEC.md](SPEC.md) §2.5)

Try it: pick Na + Cl₂, react, click the NaCl molecule and its bond, then open Ion and use the first suggestion.

On phones, ReactorX is built for landscape. In portrait it asks you to rotate the device.

## Tech stack

ReactorX is a **single static file**: [index.html](index.html) contains all the HTML, CSS and JavaScript. There is no build step, no bundler and no `package.json`.

## Requirements

### To run it

| Requirement | Details |
| --- | --- |
| A modern browser | Current Chrome, Edge, Firefox or Safari (desktop or mobile) with **WebGL** enabled. ES2017+ (`async/await`) is needed. |
| Internet access (first load) | The page loads two things from CDNs, listed below. There is nothing else to install. |
| A secure context (only for VR) | WebXR only works on `https://` or `http://localhost`. |
| A WebXR headset (optional) | Only needed for VR. The **Enter VR** button appears only when `immersive-vr` is supported. |

### Runtime dependencies (loaded from CDNs, no install needed)

| Package | Version | Loaded from | Used for |
| --- | --- | --- | --- |
| [Three.js](https://threejs.org/) | r128 | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` | 3D rendering and WebXR |
| Space Grotesk | 500 / 600 / 700 | Google Fonts | Headings |
| Inter | 400 / 500 / 600 | Google Fonts | Body text |
| JetBrains Mono | 500 / 700 | Google Fonts | Monospace labels |

No npm packages are used. If the CDNs are unreachable, the 3D scene will not load. To work offline, download `three.min.js` and the fonts into the repo and point the `<script>` / `<link>` tags in [index.html](index.html) at the local copies.

### To develop

Any text editor and any static file server. Nothing needs to be installed beyond one of the options below.

## Run locally

You can open `index.html` directly in a browser, but serving the folder is better (and required for VR testing):

```bash
# Python 3
python -m http.server 8080

# or Node.js
npx serve .
```

Then open <http://localhost:8080>.

## Build

There is no build. The file you edit is the file you deploy.

## Deploy

Any static host works (Netlify, GitHub Pages, Cloudflare Pages). See [DEPLOYMENT.md](DEPLOYMENT.md) for the Netlify steps.

## Project layout

```
ReactorX/
├── index.html      # the whole app (markup, styles, scripts)
├── SPEC.md         # product and technical specification
├── README.md       # this file
├── DEPLOYMENT.md   # how to deploy to Netlify
└── ROADMAP.md      # planned features, by priority
```

## Privacy

No accounts, cookies or analytics. The only network requests are for Three.js and the Google Fonts.
