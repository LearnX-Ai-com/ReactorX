# ReactorX Roadmap

Planned work, grouped by priority. The app is deployed to Netlify (see [DEPLOYMENT.md](DEPLOYMENT.md)) and the core visuals are done. The biggest gaps are the education layer, proof that VR works, and a few reliability items.

Known limitations and the original engineering roadmap are in [SPEC.md](SPEC.md) §9. This file is the prioritized plan and does not replace it.

## Already done

- [x] Live public URL on Netlify: <https://reactor-x.netlify.app/>
- [x] README and deployment guide
- [x] Consistent ReactorX branding (title, header, metadata)
- [x] Ion, a scripted AI lab assistant: context-aware chat and suggestion chips that answer from live app data (SPEC §2.5)
- [x] Center-view button, and reactants stay clickable after a reaction
- [x] Landscape-only phone experience with a rotate prompt

## 1. Must-have next

| Item | Why it matters |
| --- | --- |
| **Verify WebXR on a real headset** (Meta Quest Browser) | VR is central to the "chemistry you can walk into" pitch, and today VR shows only the 3D chamber with no controller input. Fix controller / gaze selection and give the HUD an in-headset equivalent. See SPEC §9 item 5. |
| **First-run onboarding** | A short intro ("pick two reactants, click anything to explore") so a new visitor isn't dropped into a lab with no hint. |
| **Demo video (60–90 s)** | Show a reaction, an ionic bond transfer, then the atom explorer. Link it from the README. |
| **Screenshots or a GIF in the README** | The README currently has text only. Include Ion answering a question. |

## 2. Education layer

The step that turns a demo into a learning tool.

- **Guided lessons.** For example "Make table salt and explain why Na becomes Na⁺", with step-by-step prompts.
- **Quizzes and checkpoints.** "Which atom gains the electron?" or "Balance this equation yourself", with instant feedback.
- **Learning objectives per lesson**, mapped to a curriculum such as NGSS or CBSE/ICSE.
- **Progress tracking.** Completed lessons and badges, stored in the browser (`localStorage`), so no accounts or backend are needed.
- **More reactions and elements.** Acids and bases, water reactions, and a few more metals and non-metals. Currently 8 elements and 11 reactions.
- **Periodic table picker** as an entry point into the atom explorer.

## 3. Accessibility and reach

- **Mobile and touch pass.** Tap-target sizes, small-screen layout and pinch gestures.
- **Keyboard navigation and screen-reader labels**, including a text description of the 3D scene state.
- **Colorblind-safe palette option.** The ionic and covalent bond colors currently depend on hue alone.
- **Low-end device mode.** Reduced quality for Chromebooks and other machines with weak GPUs.
- **Presentation mode.** Larger labels for projecting in a classroom.

## 4. Polish and reliability

- **Loading state and a WebGL-unsupported fallback**, so there is never a blank page.
- **Bundle Three.js and the fonts locally** instead of loading them from CDNs. This removes the failure mode where a slow or blocked CDN leaves a white screen, and lets the app work offline.
- **Performance check** across every reaction and atom.
- **Split the single 3,000-line `index.html`** into a few files (data, scenes, UI), and extract the pure chemistry logic so it can be tested (SPEC §7).

## 5. Later (needs a backend or paid services)

These conflict with the current "no accounts, no network calls" design (SPEC §5), so they are deliberately last.

- **Classroom mode.** A teacher shares a code and students join the same lesson.
- **Teacher dashboard** with class progress and quiz scores. This needs a database and hosting for a backend.
- **Live LLM behind Ion.** Ion already answers from the atom or bond on screen using scripted, data-driven replies. Swapping in a real model means replacing one function (`ionAnswer`) and sending `assistantContext` with the question, which needs an LLM API and a server to hold the key. Adaptive hints on wrong quiz answers would build on this.

## Suggested order if time is short

1. Verify VR on a headset
2. One guided lesson with a quiz
3. Onboarding
4. README screenshots and demo video
5. Bundle Three.js locally and add the WebGL fallback
