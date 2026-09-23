# ReactorX

### Three-Wall VR Chemistry Lab

ReactorX is an immersive **WebXR chemistry laboratory** designed for K–12 education.

Students can explore the periodic table, select reactants, run virtual chemical reactions, observe molecular changes, and ask an AI chemistry tutor for explanations.

The experience is designed around **three connected virtual walls**:

* **Left Wall — Element Explorer**
* **Center Wall — Reaction Theater**
* **Right Wall — Learning Companion**

The goal is to make chemistry interactive, visual, and understandable rather than purely theoretical.

## Status (2026-09-23)

This document is the target product vision. It supersedes the previous version of this file, which specced the original single-file `index.html` demo — that demo still exists at the repo root for reference, but active development has moved to the `web/` (React + Three.js/R3F) and `functions/` (Neon Function + Postgres + Anthropic API) rebuild described in `DEPLOYMENT.md` and the root `package.json`.

**Already built, in the current terms of this spec:**

- **The three-wall room exists and is first-person/VR-ready** (`web/src/three/ChamberRoom.tsx`), using head-turn look-controls (`lookControls.ts`) rather than an orbit camera — the same pattern as the atom explorer's room (`ElementsRoom.tsx`). This is deliberately *not* the flat, always-visible 3-panel dashboard layout a 2D mockup of this spec might suggest; panel content below should be read as "what appears on each wall," not "three fixed screen regions."
- **Left Wall (Element Explorer):** a 3D periodic table wall (`PeriodicTableRoom.tsx`) plus an atom tray (`ChamberAtomTray.tsx`) — click elements to stack them into a reactant, with a live "looks like X" guess once the stack matches a known molecule, and a confirm step that either resolves instantly (single atoms, diatomic gases) or calls the AI backend for a real multi-element composition. No search/filter or category buttons (All/Metals/Nonmetals/Noble Gases) yet.
- **Center Wall (Reaction Theater):** the reaction animation (`ReactionChamber.tsx`) — reactants collide, bonds break, products form, with a live caption per stage. Currently only React/Show solution/Reset exist as playback controls (no Step or Speed control), and equation/balance/coefficient editing currently live in a docked HTML subpanel rather than on-wall, by explicit prior decision (small interactive controls are easier to use in a fixed screen panel than projected onto a 3D point).
- **Right Wall:** currently just Ion (small, docked) plus the "Ask Ion" chat panel opened by clicking her — not yet styled as a dedicated info/tutor wall panel with tabs (Info/Steps), reaction-detail breakdown, or a persistent always-visible chat surface.
- **AI backend:** `/molecules/from-atoms` (Neon Function + Anthropic Claude Sonnet 5) proposes a real molecule's structure for an arbitrary atom composition, validated against the requested atoms before being trusted, cached in Postgres. This is the seam this spec's "chemistry engine" section maps onto, though it is not yet split out into the fuller Reactions/Molecules/Validation architecture described below.
- **Ion** exists as a procedural 3D character (not a 2D avatar) with a scripted, keyword-matched answer engine (`ion/answers.ts`) — not yet the context-aware, learning-level-adaptive tutor described in Wall 3 below, and not yet backed by a live LLM for open-ended questions (only the molecule-structure generation uses the AI so far).
- **Not yet built:** VR controller/hand-tracking input, voice interaction, Explore/Learn/Challenge learning modes, prediction workflow, student progress tracking, teacher mode, and the dedicated chemistry-engine/validation layer as a separate module (reaction logic currently lives directly in `web/src/chemistry/`).

Treat the rest of this document as the target to scope future work against, not a description of shipped behavior — where it conflicts with something already decided differently (e.g. the room-vs-dashboard layout, or balancing controls staying off-wall), the decision already made in the codebase wins unless revisited explicitly.

---

## ✨ Features

* 🧪 Interactive periodic table
* ⚛️ 3D atoms and molecules
* 🔬 Interactive chemical reactions
* 🎬 Molecular reaction animations
* 📖 Step-by-step explanations
* 🤖 Ion AI chemistry tutor
* 🎯 Guided learning activities
* 🧠 Prediction and challenge modes
* 🎮 VR controller support
* ✋ Hand-tracking support where available
* 💻 Desktop fallback
* ♿ Accessibility features
* 📊 Student progress and learning feedback

---

# 🏗️ Experience Architecture

ReactorX is organized into three connected walls.

```text
┌──────────────────────┐
│                      │
│   LEFT WALL          │
│   Element Explorer   │
│                      │
│  Periodic Table      │
│  Search              │
│  Element Info        │
│  Reactant Selection  │
│                      │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│                                         │
│             CENTER WALL                 │
│             Reaction Theater             │
│                                         │
│       Reactants → Reaction → Products   │
│                                         │
│        3D Molecules / Animation         │
│                                         │
│     ▶  ⏸  ⏭  ↻  Speed Controls         │
│                                         │
└─────────────────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│                      │
│   RIGHT WALL         │
│   Learning Companion │
│                      │
│   🤖 Ion             │
│   Explanation        │
│   Reaction Info      │
│   Learning Prompts   │
│                      │
└──────────────────────┘
```

All three walls share the same **experiment state**.

---

# 🧱 Wall 1 — Element Explorer

The left wall is responsible for element discovery and experiment setup.

## Components

### Periodic Table

Students can:

* Browse elements
* Search by name
* Search by symbol
* Search by atomic number
* Explore element families
* Select an element
* View basic element information

### Element Information

Selecting an element can display:

```text
Hydrogen

H
Atomic Number: 1

Category:
Nonmetal

Basic information about the element...
```

### Reactant Selection

Students can add appropriate elements or reactants to their current experiment.

```text
Selected Reactants

[ H₂ ] [ O₂ ]

        +

[ Add Reactant ]
```

The selection immediately updates the center and right walls.

---

# 🧪 Wall 2 — Reaction Theater

The center wall is the primary learning area.

It displays the actual chemical reaction using interactive 3D molecular models.

## Example

```text
              REACTION THEATER

             Reactants

             H₂ + O₂

                 ↓

          Molecular Reaction

                 ↓

             Products

              H₂O


       2H₂ + O₂ → 2H₂O


    [▶] [⏸] [STEP] [RESET] [SPEED]
```

## Reaction Visualization

The simulation should show:

1. Reactant molecules
2. Molecular movement
3. Bond changes
4. Atom rearrangement
5. Product formation
6. Final products

The animation must correspond to the chemistry model being taught.

It should not generate visually impressive but chemically incorrect reactions.

---

# 🤖 Wall 3 — Learning Companion

The right wall contains **Ion**, the ReactorX AI chemistry tutor.

Ion helps students understand what they are seeing.

## Ion can:

* Explain elements
* Explain reactions
* Explain chemical equations
* Give contextual hints
* Ask questions
* Help students make predictions
* Explain molecular changes
* Adjust explanations to the student's learning level

Example:

```text
┌──────────────────────────────┐
│            🤖 ION            │
│                              │
│ Why do you think the         │
│ hydrogen atoms are forming   │
│ bonds with oxygen?           │
│                              │
│ [ Ask Ion... ]               │
│                              │
│ Hint: Look at the atoms      │
│ before and after the         │
│ reaction.                    │
└──────────────────────────────┘
```

Ion should behave as a **learning assistant**, not simply provide answers.

---

# 🔄 Shared Experiment State

The three walls must stay synchronized.

```text
ExperimentState

├── selectedElements
├── selectedReactants
├── currentReaction
├── currentStage
├── simulationStatus
├── playbackSpeed
├── learningMode
├── studentProgress
└── ionContext
```

Example:

```text
Student selects H₂

        ↓

Left Wall
Reactant selection updated

        ↓

Center Wall
H₂ appears in reaction setup

        ↓

Right Wall
Ion explains hydrogen's role
```

---

# 🎮 Interaction

ReactorX should support both VR controllers and hand tracking.

| Action          | Controller         | Hand Tracking     |
| --------------- | ------------------ | ----------------- |
| Select          | Point + Trigger    | Point + Pinch     |
| Add Reactant    | Trigger            | Pinch             |
| Rotate Molecule | Grab               | Pinch + Drag      |
| Zoom            | Controller Gesture | Two-Hand Gesture  |
| Play/Pause      | Trigger            | Pinch             |
| Ask Ion         | Select UI          | Select UI / Voice |
| Reset           | Select Button      | Pinch Button      |

A desktop fallback should also be available for development, demonstrations, and classroom projection.

---

# 📚 Learning Modes

## Explore Mode

Designed for younger students.

Features:

* Guided exploration
* Simple explanations
* Large controls
* Element discovery
* Basic molecular visualization

---

## Learn Mode

Designed for intermediate students.

Features:

* Select reactants
* Predict products
* Explore molecular changes
* Balance equations
* Learn reaction types
* Investigate energy changes

---

## Challenge Mode

Designed for advanced students.

Features:

* Construct equations
* Balance equations
* Predict products
* Investigate reaction conditions
* Explain observations
* Identify mistakes
* Complete assessments

---

# 🧠 Chemistry Engine

The UI should not be responsible for determining chemical validity.

ReactorX should have a dedicated chemistry layer.

```text
                 ReactorX

                     │
                     ▼

              Chemistry Engine

        ┌────────────┼────────────┐
        ▼            ▼            ▼
   Reactions      Molecules    Validation
        │            │            │
        └────────────┼────────────┘
                     ▼
              Simulation State
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       Left Wall  Center Wall  Right Wall
```

The chemistry engine should handle:

* Supported reactions
* Reactants
* Products
* Molecular structures
* Atom conservation
* Stoichiometry
* Chemical equations
* Reaction conditions
* Reaction stages

---

# 🛡️ Chemistry Safety

ReactorX is a virtual educational environment.

The application should clearly distinguish between:

* Virtual simulation
* Educational chemistry model
* Real-world laboratory procedures

The system should not imply that a virtual experiment is automatically safe to reproduce in a real laboratory.

Ion should use validated chemistry information and avoid inventing chemical facts.

---

# 🎨 UX Principles

## 1. One continuous laboratory

The three walls should feel like one environment.

Students should never feel like they are switching between three unrelated applications.

---

## 2. Center wall gets the most attention

The reaction visualization is the main experience.

The left and right walls support it.

```text
        SUPPORT          MAIN          SUPPORT

     ┌──────────┐   ┌──────────────┐   ┌──────────┐
     │          │   │              │   │          │
     │ Elements │   │   REACTION   │   │   ION    │
     │          │   │   THEATER    │   │          │
     │          │   │              │   │          │
     └──────────┘   └──────────────┘   └──────────┘
```

---

## 3. Minimize unnecessary head movement

Important controls should remain within comfortable viewing angles.

Students should not constantly have to turn around to operate the application.

---

## 4. Visualize chemistry

Whenever possible, explain concepts through:

* Molecules
* Atoms
* Bonds
* Motion
* Labels
* Equations
* Before/after comparisons

---

## 5. Let students predict

Instead of immediately showing the answer:

```text
What do you think will happen?

        ↓

      [Predict]

        ↓

     Run Reaction

        ↓

      Observe

        ↓

      Explain
```

This creates a learning loop rather than a passive animation.

---

# 🗺️ User Flow

```text
Start
  │
  ▼
Choose Learning Mode
  │
  ▼
Explore Periodic Table
  │
  ▼
Select Reactants
  │
  ▼
Validate Reaction
  │
  ├── Invalid ──→ Show Guidance
  │                    │
  │                    └────→ Select Reactants
  │
  ▼
Preview Reaction
  │
  ▼
Make Prediction
  │
  ▼
Start Simulation
  │
  ▼
Observe Molecular Changes
  │
  ▼
Ask Ion / Explore
  │
  ▼
Reaction Complete
  │
  ▼
Learning Feedback
  │
  ├── Repeat
  │
  ├── Challenge
  │
  └── Next Experiment
```

---

# 🛠️ Suggested Architecture

```text
ReactorX
│
├── WebXR Application
│
├── UI
│   ├── LeftWall
│   ├── CenterWall
│   └── RightWall
│
├── Chemistry
│   ├── Elements
│   ├── Molecules
│   ├── Reactions
│   ├── Equations
│   └── Validation
│
├── Simulation
│   ├── ReactionAnimation
│   ├── MoleculeRenderer
│   ├── PlaybackController
│   └── SimulationState
│
├── AI
│   ├── Ion
│   ├── Context
│   ├── Hints
│   └── LearningLevel
│
├── Learning
│   ├── Lessons
│   ├── Challenges
│   ├── Progress
│   └── Assessments
│
└── XR
    ├── Controllers
    ├── HandTracking
    ├── Interaction
    └── Accessibility
```

---

# 🚀 Development Roadmap

## Phase 1 — Prototype

* [x] Create WebXR environment
* [x] Create three-wall room
* [x] Implement periodic table
* [x] Implement element selection
* [x] Implement one complete reaction
* [x] Add 3D molecules
* [x] Add reaction animation
* [x] Add play/pause/reset
* [x] Add basic Ion panel

---

## Phase 2 — Interactive Chemistry

* [x] Multiple reactions
* [x] Reaction validation
* [ ] Molecular manipulation
* [ ] Equation visualization
* [x] Balancing exercises
* [ ] Step-by-step simulation
* [ ] Reaction conditions
* [ ] Explore mode

---

## Phase 3 — AI Learning

* [ ] Context-aware Ion
* [ ] Voice interaction
* [ ] Learning-level adaptation
* [ ] Hints
* [ ] Guided questions
* [ ] Prediction feedback
* [ ] Student progress

---

## Phase 4 — Classroom

* [ ] Teacher mode
* [ ] Lesson management
* [ ] Student assignments
* [ ] Progress dashboard
* [ ] Multiple-headset testing
* [ ] Accessibility testing
* [ ] Performance optimization

---

# ✅ MVP Acceptance Criteria

The first playable version is complete when a student can:

1. Enter the ReactorX lab.
2. Understand the purpose of all three walls.
3. Open the periodic table.
4. Select an element/reactant.
5. Add it to an experiment.
6. See the center reaction update.
7. Start a supported chemical reaction.
8. Watch the molecular transformation.
9. Pause, resume and reset the simulation.
10. See the corresponding chemical equation.
11. Ask Ion about the reaction.
12. Receive a contextual explanation.
13. Complete the experiment.
14. Restart or move to another experiment.

---

# 🎯 Core Product Principle

> **Choose → Predict → React → Observe → Explain → Challenge**

ReactorX should turn chemistry from something students primarily **read about** into something they can **explore and reason about**.

The three-wall architecture supports this by giving each part of the experience a clear role:

```text
┌────────────────┐
│ LEFT           │
│                │
│ CHOOSE         │
│                │
│ Elements       │
│ Reactants      │
└───────┬────────┘
        │
        ▼
┌──────────────────────────┐
│ CENTER                   │
│                          │
│ REACT + OBSERVE          │
│                          │
│ Molecular Simulation     │
│ Reaction                 │
│ Products                 │
└───────────┬──────────────┘
            │
            ▼
┌────────────────┐
│ RIGHT          │
│                │
│ EXPLAIN        │
│                │
│ Ion            │
│ Concepts       │
│ Hints          │
└────────────────┘
```

**ReactorX = an interactive chemistry laboratory where students can see the invisible world of atoms and molecules come alive.**
