# ReactorX — Project Specification

*Chemistry you can walk into.* An immersive WebXR chemistry lab.

Status: v1.2, derived from `index.html` (single file). Sections marked **Proposed** are not implemented; everything else describes shipped behavior.

## 1. Overview

### 1.1 The problem
Chemistry is usually taught through static diagrams and memorized equations: Bohr models on a page, ionic bonds in a textbook, balanced reactions on a whiteboard. Students rarely see what is actually happening. Why does sodium become Na⁺? Why does oxygen form a double bond? What happens to the electrons when two elements react? When the mechanism is memorized instead of understood, chemistry becomes abstract and intimidating.

### 1.2 The solution
ReactorX is a browser-based 3D/WebXR chemistry laboratory. The student picks two reactants and watches the reaction unfold in real time. It can:

- balance the chemical equation automatically;
- show molecules colliding and reacting;
- show bonds breaking and forming, with a live caption of which bonds;
- show the resulting products;
- let students zoom from the whole reaction down to a single atom;
- show atoms as interactive Bohr models with protons, neutrons and electron shells (and quarks inside nucleons);
- answer questions in a built-in chat assistant, **Ion**, that knows which atom, bond or reaction is on screen;
- let students click any bond to see the electron mechanism behind it: **ionic** bonds show electrons transferring from metal to nonmetal, **covalent** bonds show shared electron pairs, with single, double and triple bonds shown as one, two or three shared pairs.

The goal is to move from "memorize the diagram" to "explore the mechanism": not just *what* happens, but *why*.

### 1.3 Built on real chemistry
Visualizations are driven by data, not hand-drawn effects:

- electronegativity (Pauling scale);
- valence electron counts;
- oxidation states (common states per element, and the state of each atom in a given substance, **derived from that substance's bonds**);
- electron configurations (subshell notation) and shell distributions;
- bonding relationships (bond type, order, electrons transferred per bond).

Where a model is simplified (Bohr shells, discrete ionic units), the UI says so.

### 1.4 Why it matters
- **Students:** chemistry becomes something to manipulate rather than memorize: tap, rotate, zoom, explore from the atomic level up.
- **Teachers:** an interactive, projectable classroom demo that replaces static slides, with virtually no setup.
- **Schools:** no specialized hardware. The same app runs in a standard browser on laptops, tablets, phones and Chromebooks, and also supports immersive WebXR on a compatible VR/XR headset.

### 1.5 Audience
Secondary-school and early-undergraduate chemistry students, teachers running demos, and curious general users. Headset users are a secondary audience.

### 1.6 Non-goals
Quantitative simulation (kinetics, thermodynamics, quantum accuracy), user-defined reactions or molecules, accounts or persistence, and full periodic-table coverage.

## 2. User Experience

The app has two full-screen contexts: the **Chamber** (main view) and the **Detail View** (zoomed exploration overlay).

### 2.1 Chamber (main view)

- 3D scene on a dark, single-theme instrument-panel look with a floor grid.
- **Top bar:** title, *Hide/Show panel* toggle, and *Enter VR* (shown only when `immersive-vr` is supported).
- **Reaction HUD (bottom panel):**
  - Two reactant dropdowns (A and B).
  - Live equation, with a **balanced / unbalanced** badge.
  - Reaction type chip (Synthesis, Combustion, Oxidation), reaction name, and a short note.
  - Buttons: **⚖ Balance equation**, **⚗ React** (disabled until balanced), **↺ Reset** (shown after a reaction).
  - Legend for covalent vs. ionic bonds and a hint line (click / drag / scroll).
- **Camera:** orbit by drag, zoom by scroll/pinch or on-screen +/− buttons, pan by Shift/right/middle drag or two-finger drag. Camera auto-fits the chamber to the reactants/products. Changing the reactant pair resets the view. A **⌖ center view** button (and double-clicking empty space) recenters on the reaction, resets rotation and refits the zoom.
- **Tagline:** "Chemistry you can walk into." sits under the title (hidden below 520 px width).
- **Molecule card:** clicking a molecule focuses the camera on it and shows a card (name, category, formula, **oxidation-state chips per element**, molar mass, bond type, fun fact) with a *Learn more →* button and a *Back to chamber* button. Clicking a bond inside a focused molecule shows a bond card (type, both atoms' electronegativity and **valence electron counts**, EN difference, and the explanation of why the bond is ionic or covalent).

### 2.2 Core flow

1. Choose reactants A and B. If the pair is a supported reaction, the equation skeleton and reactant molecule instances are shown. Otherwise the app shows a "no reaction defined" message and disables Balance and React.
2. Press **Balance**. The equation is balanced and coefficients are applied. Reactant and product instance counts in the scene match the coefficients. Badge turns to *balanced* and **React** is enabled.
3. Press **React**. Fixed-timing animation, with a caption under the equation for each stage:
   - 0–350 ms *"Reactants collide…"*: reactants converge to the centre and shrink.
   - 350–900 ms *"Breaking bonds: O=O, H–H"*: the reactants' bond cylinders shrink to nothing (the list comes from the reactants' bond data; single atoms such as Na have none to break).
   - ~900 ms: particle burst and a flash from a point light. Reactant atoms become semi-transparent "ghosts" (55% opacity) that stay at their anchors as a record of what went in, since their atoms are now in the products. Ghosts can still be clicked and inspected.
   - 900–1150 ms *"Atoms rearrange…"*: products start to grow in at their rest positions.
   - 1150–2150 ms *"Forming bonds: O–H"*: the products' bonds grow in.
   - After 2150 ms: phase is `done`, the caption reverts to the reaction note, Reset appears, and the camera eases to fit the result.
4. **Reset** (or changing a dropdown) returns to step 1.

Phases: `unbalanced → balanced → reacting → done`.

### 2.3 Detail View

Opened with *Learn more →* on a molecule card. Full-screen overlay with a Back button, an element/formula heading, and tabs: one per distinct element in the molecule, plus **🧬 Molecule** when the formula has more than one atom.

- **Atom tab (Bohr-style scene):**
  - Nucleus of protons and neutrons; electron shells with electrons.
  - Ghost placeholders where an atom has no neutrons (e.g. H-1).
  - Tapping a particle or shell opens an info panel (proton, neutron, electron, valence vs. inner shell). Other particles are dimmed/isolated while one is selected.
  - Protons and neutrons offer *Explore inside this proton/neutron →*, which shows quarks (proton = uud, neutron = udd) with charge arithmetic and a *Back* control.
  - Element panel with atomic number, shells, **electron configuration, valence electrons, electronegativity, common oxidation states, and the oxidation state in this substance**.
  - Live particle counter, and an **ⓘ** popover explaining that the electron model is a simplification (probability, not planetary orbits).
- **Molecule tab:**
  - Full 3D ball-and-stick molecule with a molecule overview panel (including oxidation-state chips).
  - Tapping a bond opens a bond panel with a **replay** button that runs the bond-story animation (below).
  - A small **molecule locator** widget highlights which atom is being viewed and lets the user jump to that element's tab.
- **Bond story animations** (per bond, replayable):
  - *Covalent:* atoms approach to a computed separation and shared electron pairs appear. Bond order 1/2/3 is shown for e.g. H₂, O₂ (double), N₂ (triple), CO₂ (double).
  - *Ionic:* outer-shell electrons travel from donor to receiver. Ions are labelled with charges (Na⁺, Cl⁻, Mg²⁺, Fe³⁺, …). Handles multi-electron transfer (MgO) and split transfer (Fe₂O₃).
  - Iron uses `bondShellDepth: 2` so the third electron is shown coming from the inner shell.
  - Multi-atom ionic compounds use an ionic-network layout with donor and receiver rows.

### 2.4 VR

- If `navigator.xr` reports `immersive-vr` support, an *Enter VR* button appears.
- On session start, the lab group is repositioned in front of and slightly above the user (`(0, 0.9, −2.4)`) using a `local-floor` reference space. It returns to the origin on session end.
- If the session fails to start, show a short "VR unavailable here" status message.
- The HTML HUD and Detail View are not available inside the headset (see §9).

### 2.5 Ion, the lab assistant

A chat assistant that answers questions about whatever the student is looking at. It runs entirely in the browser with scripted, data-driven replies: no backend, no API key, no network call.

- **Entry point:** a floating **Ask Ion** button, bottom-right in both the chamber (above the HUD) and the Detail View. It does not overlap the zoom controls or the info cards.
- **Panel:** a 340 px side panel on desktop and landscape screens. On desktop the 3D canvas shrinks to sit beside it, so the whole reaction stays visible and interactive; controls on the right edge slide out of its way. On a narrow portrait window it becomes a bottom sheet (max 60% of the height). Escape or ✕ closes it.
- **Contents:** header ("Ion · your lab assistant"), message list with a three-dot typing indicator (about 600 ms before each reply), a "Talking about:" context label, three suggestion chips, an input with Send, and the footer note "AI can make mistakes. Check with your teacher." Ion's first message greets the student and names what is on screen.
- **Context tracking:** one shared `assistantContext` object, `{ view, reaction, element, shell, particle, molecule, bond }`, updated from the same hooks that drive the info panels (`selectReaction`, `showMoleculeCard` / `showBondCard`, `showAtom`, `enterBondStory`, and the Bohr scene's state callback). Opening the Detail View saves the chamber's context and restores it on close. The label shows it in plain words, e.g. "Fe₂O₃ · ionic bond".
- **Suggestion chips** change with the view: an ionic bond offers "Why does sodium give its electron away?", a shell offers "What's a valence electron?", a reaction offers "Why does this need balancing?", and so on.
- **Answer engine:** keyword scoring over about ten topics (oxidation state, ionic bond, covalent bond, electronegativity, valence, balancing, reactions, subatomic particles, shells, plus greetings and help). Replies are built from `ELEMENTS`, `MOLECULES`, `MOLECULE_INFO`, `REACTIONS`, `bondInfo()` and the derived oxidation states, quoting real values (for example Na 0.93 vs Cl 3.16). Explanations of transition-metal states are derived from the electron configuration (Fe³⁺: the 4s² pair leaves first, then one 3d electron). Replies are at most three sentences and end with a follow-up question where it fits. If the question mentions an element or a state ("Why is iron 3+?"), that takes priority over the current selection.
- **Swap-in point:** the engine is one call, `ionAnswer(question) → string`, plus `assistantContext`. A live LLM would replace that call and receive the same context.

**Demo script this supports:** open the Na + Cl₂ reaction, click the ionic bond and open Ion (the chip answer cites 0.93 vs 3.16); switch to Fe₂O₃ and ask "Why is iron 3+?"; click a shell in the atom view and ask "What's a valence electron?".

## 3. Content Model

All data is hard-coded constants in `index.html`.

### 3.1 Elements (8)
H, C, N, O, Na, Mg, Cl, Fe. Each has: display colour, sphere radius, molar mass, atomic number, neutron count (most abundant isotope), Bohr shell distribution, Pauling electronegativity, **valence electron count, common oxidation states, and electron configuration**. Fe also has `bondShellDepth` (its valence count is 2, the 4s pair; the 3d electrons that give Fe³⁺ are shown in the bond story).

Per-substance oxidation states are not stored. `oxidationStates(formula)` derives them from the bond list by assigning each bonded pair's electrons to the more electronegative atom (equal-EN pairs contribute 0). For all 19 species this gives the textbook values (e.g. H₂O: O −2, H +1; CO₂: C +4; CH₄: C −4; Fe₂O₃: Fe +3, O −2).

### 3.2 Molecules / species (19)
- **Elements:** H₂, O₂, N₂, Cl₂, Na, Fe, Mg, C.
- **Compounds:** H₂O, CH₄, CO₂, NH₃, HCl, NaCl, MgO, Fe₂O₃, Na₂O, FeCl₃, MgCl₂.

Each species has atoms with local 3D positions and bonds `[i, j, 'covalent'|'ionic', order?]`. For ionic bonds the fourth value is the number of electrons transferred across that bond (default 1). Each species also has an info record (name, category, fun fact).

### 3.3 Reactions (11)
| Reactants | Products | Type |
|---|---|---|
| H₂ + O₂ | H₂O | Synthesis |
| N₂ + H₂ | NH₃ | Synthesis (Haber process) |
| CH₄ + O₂ | CO₂ + H₂O | Combustion |
| Na + Cl₂ | NaCl | Synthesis |
| Fe + O₂ | Fe₂O₃ | Oxidation |
| Mg + O₂ | MgO | Combustion |
| C + O₂ | CO₂ | Combustion |
| H₂ + Cl₂ | HCl | Synthesis |
| Na + O₂ | Na₂O | Synthesis |
| Fe + Cl₂ | FeCl₃ | Synthesis |
| Mg + Cl₂ | MgCl₂ | Synthesis |

Lookup is order-independent. Reactant options: H₂, O₂, N₂, CH₄, Na, Cl₂, Fe, Mg, C.

## 4. Functional Requirements

| ID | Requirement |
|---|---|
| F1 | The user can select any two reactants; the app resolves a reaction regardless of A/B order. |
| F2 | Unsupported pairs show a clear message, disable Balance and React, and do not leave stale molecules in the scene. |
| F3 | Equation balancing finds the **smallest-total** integer coefficients (1–8) that conserve every element. Formulas are parsed from strings, so balancing is derived from the data, not stored. |
| F4 | React is only possible from the `balanced` phase. |
| F5 | The scene shows the balanced coefficient as the number of molecule instances of each species. |
| F5a | During a reaction, reactant bonds visibly break and product bonds visibly form, with captions naming the bonds, derived from the species data. Consumed reactants remain as semi-transparent ghosts that can still be clicked. |
| F5b | Oxidation states, valence electrons, electronegativity and electron configuration are shown from data (§3.1) on molecule cards, bond cards and the atom panel. |
| F6 | Clicking a molecule focuses the camera on it (animated) and shows its card. Back returns to the previous view. |
| F7 | Detail View exposes atom, particle, quark, molecule, and bond levels as in §2.3, with a consistent Back path at each level. |
| F8 | Bond-story animations are replayable, and reflect bond type, bond order, and electron-transfer counts from the data. |
| F9 | Camera orbit and zoom work with mouse, touch (pinch), and on-screen buttons, with min/max zoom clamps. |
| F10 | Formulas are rendered with Unicode subscripts and charges with superscripts. |
| F11 | The HUD can be hidden to leave the 3D view unobstructed. |
| F12 | VR entry is offered only when supported, and fails gracefully. |
| F13 | The camera can be recentered on the whole reaction from a visible control at any time, including after panning, rotating or a focus zoom. |
| F14 | Ion answers the questions in §2.5 from live app data, never from per-element scripts, so new elements and reactions are covered automatically. Off-topic input gets a polite redirect, never an error. |
| F15 | On a touch phone held in portrait the app shows a "rotate your phone" screen; it is designed for landscape. |

## 5. Non-Functional Requirements

- **Platform:** current evergreen desktop and mobile browsers with WebGL. VR on WebXR-capable headset browsers (e.g. Meta Quest Browser).
- **Performance:** target 60 fps on a mid-range laptop and a stable frame rate on a recent phone. Pixel ratio is capped at 2. Only one detail scene (atom, molecule, bond story, or locator) is active at a time, and inactive ones are disposed.
- **Responsiveness:** layout works from ~360 px width upward. Controls are touch-sized and the canvas uses `touch-action: none`.
- **Accessibility:** buttons have accessible labels, the equation is an `aria-live` region, and text/background contrast is high. Gaps: the 3D content has no text alternative and keyboard operation of the canvas is not supported (see §9).
- **Visual design:** single dark theme (Space Grotesk / Inter / JetBrains Mono), teal accent, amber for "needs action" states. Deliberately not light/dark adaptive.
- **Scientific honesty:** simplified models are labelled as such (Bohr shells with a disclaimer, uud/udd quark note). Any new content must not present a simplification as literal fact.
- **Privacy:** no accounts, cookies, analytics, or network calls beyond loading fonts and Three.js. Ion's questions and answers stay in the browser and are not stored.

## 6. Technical Architecture

- **Delivery:** static site, one `index.html` with inline CSS and JS in an IIFE (`"use strict"`). No build step, no bundler, no backend.
- **Dependencies (CDN):**
  - Three.js r128 (`cdnjs.cloudflare.com`).
  - Google Fonts (Space Grotesk, Inter, JetBrains Mono).
- **Rendering:** one WebGL renderer for the main chamber (`#scene`), plus separate renderers/scenes for `#detailCanvas` and `#moleculeLocatorCanvas`, created on demand and disposed on exit.
- **Main modules (logical, all in the one file):**
  - *Data:* `ELEMENTS`, `MOLECULES`, `MOLECULE_INFO`, `REACTIONS`, name maps.
  - *Chemistry utilities:* `parseFormula`, `molarMass`, `toSubscript`, `bondTypeLabel`, `balanceEquation` (brute-force search).
  - *Scene builders:* `buildMoleculeMesh`, `buildBohrScene`, `buildMoleculeSceneFull`, `buildMoleculeLocator`, `buildBondStoryScene` (covalent/ionic hub-and-spoke), `buildIonicNetworkScene`.
  - *Interaction:* `attachOrbitControls`, main chamber orbit camera, tap/raycast handlers, focus tween.
  - *UI/state:* reaction state machine (`current.phase`), molecule/bond/particle/quark info panels, detail-view lifecycle.
  - *Assistant (Ion):* `assistantContext` and its setter, the answer engine (`ionAnswer` and per-topic reply builders, delimited by `ION-ENGINE-START/END` markers so it can be extracted for testing), and the chat panel UI.
- **State:** in-memory only. Nothing is persisted, and there is no URL routing (see §9).
- **Browser support:** ES2017+ (`async/await`), WebGL 1, WebXR Device API (optional).

## 7. Testing & Acceptance

Currently there are no automated tests. **Proposed** minimum:

1. **Unit tests** (extractable pure functions): `parseFormula`, `balanceEquation` against every entry in `REACTIONS`, `molarMass`, and `findReaction` order-independence.
2. **Data integrity checks:** every species referenced by a reaction exists in `MOLECULES` and `MOLECULE_INFO`; every atom's element exists in `ELEMENTS` and `ATOMIC_NAMES`; every bond index is in range; ionic electron transfers sum consistently with element valence.
3. **Smoke test** (Playwright, headless Chromium): load page, balance, react, open molecule card, open Detail View, switch tabs, and replay a bond story with no console errors.

**Acceptance for v1:**
- All 11 reactions can be balanced, and the produced coefficients are correct.
- Every species can be opened in Detail View without errors, and every tab works.
- No console errors during a full walkthrough on desktop Chrome, Safari, and Firefox, and on a mobile browser.
- The Enter VR button appears only where WebXR is supported, and entering and exiting VR does not break the desktop view.

## 8. Development & Deployment

- **Run locally:** open `index.html`, or serve the folder (`python3 -m http.server`) since WebXR requires a secure context (`localhost` or HTTPS).
- **Deploy:** any static host (GitHub Pages, Netlify, Cloudflare Pages). HTTPS is required for VR.
- **Repo:** single `main` branch, one commit so far.
- **Adding a reaction:**
  1. Add any new species to `MOLECULES` and `MOLECULE_INFO`.
  2. Add any new element to `ELEMENTS` and `ATOMIC_NAMES`.
  3. Add the reaction to `REACTIONS`, and add reactants to `REACTANT_OPTIONS` and `ELEMENT_NAMES` if new.
  4. Verify balancing, the reaction animation, and each bond story.

## 9. Known Limitations & Proposed Roadmap

**Known limitations**
- Balancer is brute force: at most 4 compounds and coefficients up to 8, so larger equations will fail or be slow.
- The VR session shows only the 3D chamber. It has no controller input, and the HUD and Detail View are HTML overlays that are not usable in-headset. This is the largest gap against the "walk into it" vision.
- Only 8 elements and 11 reactions. Reactants are limited to a fixed list.
- Ionic compounds are drawn as small discrete units, not crystal lattices.
- Bespoke atom explanations exist only for H and O. Other elements use templated text.
- Single-file structure makes the code hard to test and review as it grows.
- Canvas content is not keyboard-accessible and has no text alternatives.
- Ion is scripted: it covers about ten topics and falls back to a redirect for anything else. It has no memory of earlier messages and does not persist chats.
- The lab is designed for landscape on phones; portrait shows a rotate prompt, and small-phone layouts are not fully tuned.
- The CDN dependency means the app does not work offline.

**Proposed roadmap**
1. **Quality:** extract pure logic and add tests (§7); split into ES modules with Vite; vendor Three.js and fonts for offline use.
2. **Content:** more elements and reactions (e.g. acid–base, displacement, decomposition), and reaction-condition notes (energy, catalyst).
3. **Learning features:** guided "challenge" mode (balance this equation), quizzes, and shareable deep links to a reaction, molecule, or atom.
4. **Accessibility:** keyboard controls for camera and selection, screen-reader descriptions of the scene state, and a reduced-motion setting.
5. **VR (highest priority for the vision):** in-headset UI panels (three-mesh-ui or DOM overlay) for choosing reactants and running Balance/React/Reset, controller ray-cast selection of molecules and bonds, and hand-tracking grab and rotate. Test on Quest Browser.
6. **Realism:** ionic lattice view, orbital (probability-cloud) mode for electrons, and isotope selection.

## 10. Open Questions

- Is the primary target audience classroom use (needs teacher tooling, offline mode, sharing) or self-directed learners?
- Should the project stay dependency-free and single-file, or move to a modular build?
- How much in-headset interaction is needed for the first classroom release (§9 item 5)?
- Naming: the product is now called *ReactorX* (page title, header and this spec). The in-app "Reaction Chamber" wording no longer appears.
