import { useMemo, useRef, useState, useEffect } from 'react';
import './App.css';
import { ParticleInfoCard } from './components/ParticleInfoCard';
import { ATOMIC_NAMES } from './chemistry/elements';
import { standardElementalForm } from './chemistry/standardForm';
import { toSubscript, canonicalFormula } from './chemistry/formulas';
import { balanceEquation } from './chemistry/balance';
import { checkBalance } from './chemistry/checkBalance';
import { fetchMoleculeFromAtoms, MoleculeNotPossibleError } from './chemistry/api';
import { cacheMolecule, getKnownMolecule, getMoleculeName } from './chemistry/moleculeSource';
import type { CategoryFilter } from './chemistry/elementFilter';
import type { ElementSymbol, Reaction, ReactantSlot, TrayCard } from './chemistry/types';
import { AppCanvas } from './three/AppCanvas';
import { HubScene } from './three/HubScene';
import { Ion } from './three/Ion';
import {
  BohrAtomModel, type BohrAtomHandle, type BohrSceneState,
  JUMP_OUT_MS, JUMP_HOLD_MS, JUMP_BACK_MS,
} from './three/BohrAtom';
import type { ChamberSnapshot, ReactionChamberHandle } from './three/ReactionChamber';
import { ChamberRoom } from './three/ChamberRoom';
import { ElementsRoom } from './three/ElementsRoom';
import { ELEMENTS_ION_DOCK } from './three/layout';
import { IonChatBody } from './ion/ChatBody';
import type { ChatContext } from './ion/answers';
import { speak } from './ion/speech';

type View = 'home' | 'chamber' | 'elements';

function formatSide(formulas: string[], coeffs: number[]): string {
  return formulas
    .map((f, i) => (coeffs[i] > 1 ? `${coeffs[i]} ${toSubscript(f)}` : toSubscript(f)))
    .join(' + ');
}

const MIN_COEFF = 1;
const MAX_COEFF = 8;

/* ---------------- Reaction chamber: state + 3D room + HTML chrome ---------------- */

function useChamberController() {
  const [reactantA, setReactantA] = useState('H2');
  const [reactantB, setReactantB] = useState('O2');
  const [snapshot, setSnapshot] = useState<ChamberSnapshot>({ phase: 'no-reaction', reaction: null, caption: '' });
  const [coeffs, setCoeffs] = useState<number[] | null>(null);
  const [ionWaveKey, setIonWaveKey] = useState(0);
  const chamberRef = useRef<ReactionChamberHandle>(null);
  const prevReactionRef = useRef<Reaction | null>(null);
  const prevPhaseRef = useRef<ChamberSnapshot['phase']>('no-reaction');

  const { reaction, phase, caption } = snapshot;

  function handleChamberState(s: ChamberSnapshot): void {
    setSnapshot(s);
    if (s.reaction !== prevReactionRef.current) {
      prevReactionRef.current = s.reaction;
      setCoeffs(s.reaction ? new Array(2 + s.reaction.products.length).fill(1) : null);
    }
    if (s.phase !== prevPhaseRef.current) {
      prevPhaseRef.current = s.phase;
      setIonWaveKey((k) => k + 1);
    }
  }

  const check = useMemo(() => {
    if (!reaction || !coeffs) return null;
    return checkBalance([reaction.a, reaction.b], coeffs.slice(0, 2), reaction.products, coeffs.slice(2));
  }, [reaction, coeffs]);

  function showSolution(): void {
    if (!reaction) return;
    const result = balanceEquation([reaction.a, reaction.b], reaction.products);
    if (result) setCoeffs(result.coeffs);
  }

  function handleReset(): void {
    chamberRef.current?.reset();
    if (reaction) setCoeffs(new Array(2 + reaction.products.length).fill(1));
  }

  function handleReact(): void {
    chamberRef.current?.react();
  }

  // ---- Left-wall periodic table category filter ----
  const [elementCategory, setElementCategory] = useState<CategoryFilter>('all');

  // ---- Left-wall atom tray: build a reactant atom by atom ----
  const [activeBuildSlot, setActiveBuildSlot] = useState<ReactantSlot>('a');
  const [trayCards, setTrayCards] = useState<Record<ReactantSlot, TrayCard[]>>({ a: [], b: [] });
  const [trayBusy, setTrayBusy] = useState(false);
  const [trayError, setTrayError] = useState<string | null>(null);
  const [liveGuess, setLiveGuess] = useState<string | null>(null);
  const nextCardId = useRef(0);

  function addTrayCard(symbol: string): void {
    nextCardId.current += 1;
    setTrayError(null);
    setTrayCards((prev) => ({
      ...prev,
      [activeBuildSlot]: [...prev[activeBuildSlot], { id: nextCardId.current, symbol }],
    }));
  }
  function removeTrayCard(slot: ReactantSlot, id: number): void {
    setTrayCards((prev) => ({ ...prev, [slot]: prev[slot].filter((c) => c.id !== id) }));
  }
  function switchBuildSlot(slot: ReactantSlot): void {
    setActiveBuildSlot(slot);
    setTrayError(null);
  }

  function trayComposition(cards: TrayCard[]): Record<string, number> {
    return cards.reduce<Record<string, number>>((acc, c) => {
      acc[c.symbol] = (acc[c.symbol] ?? 0) + 1;
      return acc;
    }, {});
  }

  // Debounced, client-only "does this already look like something" hint —
  // checks the local cache only (chemistry/moleculeSource.ts), never the AI
  // backend, so idle stacking/unstacking never costs a request.
  useEffect(() => {
    const cards = trayCards[activeBuildSlot];
    // Clearing (empty tray) fires near-instantly; a real guess still waits
    // out the debounce — both go through the timeout callback rather than
    // calling setState directly in the effect body.
    const timer = window.setTimeout(() => {
      if (cards.length === 0) {
        setLiveGuess(null);
        return;
      }
      const formula = canonicalFormula(trayComposition(cards));
      const known = getKnownMolecule(formula);
      setLiveGuess(known ? (getMoleculeName(formula) ?? toSubscript(formula)) : null);
    }, cards.length === 0 ? 0 : 700);
    return () => window.clearTimeout(timer);
  }, [trayCards, activeBuildSlot]);

  // A lone diatomic-eligible atom (H, N, O, F, Cl, Br, I) still becomes its
  // natural gas form on confirm — settled chemistry per standardForm.ts, not
  // something to ask the AI about. Anything else goes through the AI backend
  // for a real structure (chemistry/api.ts).
  async function confirmTray(): Promise<void> {
    const cards = trayCards[activeBuildSlot];
    if (cards.length === 0) return;
    setTrayBusy(true);
    setTrayError(null);
    try {
      const formula = cards.length === 1
        ? standardElementalForm(cards[0].symbol)
        : await fetchMoleculeFromAtoms(trayComposition(cards)).then((result) => {
          cacheMolecule(result.formula, result.def, result.name);
          return result.formula;
        });
      if (activeBuildSlot === 'a') setReactantA(formula); else setReactantB(formula);
      setTrayCards((prev) => ({ ...prev, [activeBuildSlot]: [] }));
    } catch (err) {
      setTrayError(err instanceof MoleculeNotPossibleError
        ? err.message
        : 'Could not generate that molecule — try a different combination.');
    } finally {
      setTrayBusy(false);
    }
  }

  return {
    reactantA, reactantB,
    snapshot, phase, caption, reaction, coeffs, setCoeffs,
    check, ionWaveKey, chamberRef, handleChamberState, showSolution, handleReset, handleReact,
    activeBuildSlot, switchBuildSlot, trayCards, addTrayCard, removeTrayCard,
    trayBusy, trayError, liveGuess, confirmTray,
    elementCategory, setElementCategory,
  };
}

type ChamberController = ReturnType<typeof useChamberController>;

function ChamberSceneContent({ c }: { c: ChamberController }) {
  return (
    <ChamberRoom
      chamberRef={c.chamberRef}
      reactantA={c.reactantA}
      reactantB={c.reactantB}
      coeffs={c.coeffs}
      onChamberStateChange={c.handleChamberState}
      reaction={c.reaction}
      caption={c.caption}
      activeBuildSlot={c.activeBuildSlot}
      onSwitchSlot={c.switchBuildSlot}
      trayCards={c.trayCards}
      onAddCard={c.addTrayCard}
      onRemoveCard={c.removeTrayCard}
      liveGuess={c.liveGuess}
      trayBusy={c.trayBusy}
      trayError={c.trayError}
      onConfirmTray={c.confirmTray}
      elementCategory={c.elementCategory}
      onElementCategoryChange={c.setElementCategory}
      ionWaveKey={c.ionWaveKey}
    />
  );
}

function CoefficientEditor({
  reaction, coeffs, onChange,
}: { reaction: Reaction; coeffs: number[]; onChange: (next: number[]) => void }) {
  const compounds = [reaction.a, reaction.b, ...reaction.products];

  function bump(index: number, delta: number): void {
    const next = coeffs.slice();
    next[index] = Math.min(MAX_COEFF, Math.max(MIN_COEFF, next[index] + delta));
    onChange(next);
  }

  return (
    <div className="coeff-editor">
      {compounds.map((formula, i) => (
        <div className="coeff-cell" key={`${formula}-${i}`}>
          {i === 2 && <span className="coeff-arrow">{'→'}</span>}
          {i > 0 && i !== 2 && <span className="coeff-plus">+</span>}
          <button type="button" className="coeff-step" onClick={() => bump(i, -1)} disabled={coeffs[i] <= MIN_COEFF}>−</button>
          <span className="coeff-value">{coeffs[i]} {toSubscript(formula)}</span>
          <button type="button" className="coeff-step" onClick={() => bump(i, 1)} disabled={coeffs[i] >= MAX_COEFF}>+</button>
        </div>
      ))}
    </div>
  );
}

function BalanceTally({ tally }: { tally: Record<string, { left: number; right: number; balanced: boolean }> }) {
  return (
    <table className="tally-table">
      <thead>
        <tr><th>Element</th><th>Left</th><th>Right</th><th /></tr>
      </thead>
      <tbody>
        {Object.entries(tally).map(([el, t]) => (
          <tr key={el} className={t.balanced ? 'tally-ok' : 'tally-off'}>
            <td>{el}</td>
            <td>{t.left}</td>
            <td>{t.right}</td>
            <td>{t.balanced ? '✓' : '✗'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChamberOverlay({ c, onBack }: { c: ChamberController; onBack: () => void }) {
  const [panelOpen, setPanelOpen] = useState(true);
  const { reaction, coeffs, phase, caption, check } = c;

  function handleReact(): void {
    c.handleReact();
    setPanelOpen(false);
  }

  return (
    <>
      {reaction && coeffs && (
        <div className="reaction-banner">
          <span className="equation">
            {formatSide([c.reactantA, c.reactantB], coeffs.slice(0, 2))}
            {' → '}
            {formatSide(reaction.products, coeffs.slice(2))}
          </span>
          <span className={check?.balanced ? 'badge badge-ok' : 'badge badge-warn'}>
            {check?.balanced ? 'balanced' : 'unbalanced'}
          </span>
          <span className="badge badge-type">{reaction.type.toLowerCase()}</span>
          <p className="note">{caption || reaction.note}</p>
        </div>
      )}

      <div className={panelOpen ? 'hud-dock' : 'hud-dock hud-dock-collapsed'}>
        <button type="button" className="icon-btn icon-btn-back" onClick={onBack} aria-label="Back to hub">{'←'}</button>
        <button
          type="button"
          className="icon-btn icon-btn-toggle"
          onClick={() => setPanelOpen((o) => !o)}
          aria-label={panelOpen ? 'Minimize panel' : 'Expand panel'}
        >
          {panelOpen ? '−' : '+'}
        </button>

        {panelOpen && (
          <div className="hud-grid hud-grid-chamber">
            <div className="hud-col hud-col-center">
              {reaction && coeffs ? (
                <>
                  <CoefficientEditor reaction={reaction} coeffs={coeffs} onChange={c.setCoeffs} />
                  {check && <BalanceTally tally={check.tally} />}
                </>
              ) : (
                <p className="note">
                  No reaction on file yet between {toSubscript(c.reactantA)} and {toSubscript(c.reactantB)} — this
                  pair hasn't been hand-authored or AI-generated. Build reactants on the left wall to try another
                  combination.
                </p>
              )}
            </div>

            <div className="hud-col hud-col-actions">
              <button
                type="button"
                className="chip chip-accent"
                disabled={!check?.balanced || phase !== 'idle'}
                onClick={handleReact}
              >
                React
              </button>
              <button type="button" className="chip" disabled={!reaction || check?.balanced} onClick={c.showSolution}>
                Show solution
              </button>
              {phase === 'done' && (
                <button type="button" className="chip" onClick={c.handleReset}>
                  Reset
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------------- Atom explorer: state + 3D children + HTML overlay ---------------- */

type ElementsMode = 'room' | 'inspect';

function useElementsController() {
  const [symbol, setSymbol] = useState<ElementSymbol>('Fe');
  const [mode, setMode] = useState<ElementsMode>('room');
  const [state, setState] = useState<BohrSceneState>({ mode: 'atom' });
  const [ionWaveKey, setIonWaveKey] = useState(0);
  const [narration, setNarration] = useState<string | null>(null);
  const [jumpBusy, setJumpBusy] = useState(false);
  const bohrRef = useRef<BohrAtomHandle>(null);

  function pickSymbol(s: string): void {
    setIonWaveKey((k) => k + 1);
    setSymbol(s as ElementSymbol);
  }
  function enterInspect(): void {
    setState({ mode: 'atom' });
    setMode('inspect');
  }
  function exitInspect(): void {
    setMode('room');
  }

  // Demonstrates E=hν rather than just stating it: animates the selected
  // electron jumping to an adjacent shell (see BohrAtom's triggerJump), with
  // Ion narrating on-screen (staged to roughly match the animation) and
  // aloud via speech synthesis at the same time.
  function triggerJumpDemo(): void {
    const result = bohrRef.current?.triggerJump();
    if (!result) return;
    const { kind, fromLetter, toLetter } = result;
    setJumpBusy(true);

    const spoken = kind === 'emit'
      ? `Watch this electron drop from the ${fromLetter} shell to the ${toLetter} shell, releasing a photon of light. That's the formula E equals h nu in action.`
      : `Watch this electron absorb a photon of light and jump from the ${fromLetter} shell up to the ${toLetter} shell. That's the formula E equals h nu in action.`;
    speak(spoken);

    const lines = kind === 'emit'
      ? ['Watch this electron…', `…dropping from the ${fromLetter} shell to the ${toLetter} shell…`, '…releasing a photon of light — that’s E = hν!']
      : ['Watch this electron absorb a photon of light…', `…and jump from the ${fromLetter} shell up to the ${toLetter} shell.`];

    setNarration(lines[0]);
    window.setTimeout(() => setNarration(lines[1] ?? null), 300);
    if (kind === 'emit') window.setTimeout(() => setNarration(lines[2] ?? null), JUMP_OUT_MS);
    window.setTimeout(() => {
      setNarration(null);
      setJumpBusy(false);
    }, JUMP_OUT_MS + JUMP_HOLD_MS + JUMP_BACK_MS + 700);
  }

  return {
    symbol, mode, state, setState, ionWaveKey, narration, jumpBusy, bohrRef,
    pickSymbol, enterInspect, exitInspect, triggerJumpDemo,
  };
}

type ElementsController = ReturnType<typeof useElementsController>;

function ElementsSceneContent({ e, onIonClick }: { e: ElementsController; onIonClick: () => void }) {
  if (e.mode === 'inspect') {
    return (
      <>
        <BohrAtomModel ref={e.bohrRef} symbol={e.symbol} onStateChange={e.setState} />
        <Ion variant="small" position={ELEMENTS_ION_DOCK} smallPosition={ELEMENTS_ION_DOCK} waveKey={e.ionWaveKey} onClick={onIonClick} />
      </>
    );
  }
  return (
    <ElementsRoom symbol={e.symbol} onSelectElement={e.pickSymbol} ionWaveKey={e.ionWaveKey} onIonClick={onIonClick} onInspect={e.enterInspect} />
  );
}

function ElementsOverlay({ e, onBack }: { e: ElementsController; onBack: () => void }) {
  const [panelOpen, setPanelOpen] = useState(true);
  return (
    <>
      {e.mode === 'inspect' && (
        <>
          <ParticleInfoCard
            symbol={e.symbol}
            state={e.state}
            onEnterQuark={(nucleonType) => e.bohrRef.current?.enterQuark(nucleonType)}
            onExitQuark={() => e.bohrRef.current?.exitQuark()}
            onTriggerJump={e.triggerJumpDemo}
            jumpDisabled={e.jumpBusy}
          />
          {e.narration && (
            <div className="jump-narration">
              <span className="ion-dot" />
              <p>{e.narration}</p>
            </div>
          )}
        </>
      )}

      <div className={panelOpen ? 'hud-dock' : 'hud-dock hud-dock-collapsed'}>
        <button
          type="button"
          className="icon-btn icon-btn-back"
          onClick={e.mode === 'inspect' ? e.exitInspect : onBack}
          aria-label={e.mode === 'inspect' ? 'Back to room' : 'Back to hub'}
        >
          {'←'}
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-toggle"
          onClick={() => setPanelOpen((o) => !o)}
          aria-label={panelOpen ? 'Minimize panel' : 'Expand panel'}
        >
          {panelOpen ? '−' : '+'}
        </button>
        {panelOpen && (
          <>
            {e.mode === 'room' ? (
              <div className="row">
                <p className="note">Turn to look around the room — the periodic table is in front of you, {ATOMIC_NAMES[e.symbol]} is on your right. Click a tile to change it.</p>
                <button type="button" className="chip chip-accent" onClick={e.enterInspect}>
                  {'🔎'} Inspect {e.symbol}
                </button>
              </div>
            ) : (
              <p className="note">Click a particle or shell ring to learn what it does. Click Ion for questions.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ---------------- Ion chat panel ---------------- */

/** Click-to-open chat, used by the atom explorer (not part of the chamber's
 * three-wall structure, so it keeps the toggle behavior rather than becoming
 * a persistent panel). Mounting/unmounting IonChatBody on open/close is what
 * gives it a fresh greeting each time it's reopened. The chamber's own Ion
 * panel is three/ChamberIonPanel.tsx — wall-anchored, always visible. */
function IonChatPanel({ open, onClose, context }: { open: boolean; onClose: () => void; context: ChatContext }) {
  if (!open) return null;
  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="ion-dot" />
        <span>Ask Ion</span>
        <button type="button" className="chat-close" onClick={onClose} aria-label="Close chat">{'✕'}</button>
      </div>
      <IonChatBody context={context} />
    </div>
  );
}

/* ---------------- Home hub ---------------- */

interface HubItem {
  key: View;
  icon: string;
  label: string;
  line: string;
  soon?: boolean;
}

const HUB_LEFT: HubItem[] = [
  { key: 'chamber', icon: '⚗️', label: 'Reaction Chamber', line: "Let's react something! Pick two elements and I'll show you what happens." },
  { key: 'elements', icon: '🔬', label: 'Explore Elements', line: 'Every element has a story. Tap one and I’ll take you inside its atom.' },
];

function Hub({ onNavigate, waveKey }: { onNavigate: (v: View) => void; waveKey: number }) {
  const [message, setMessage] = useState("Hi, I'm Ion. Where should we start?");
  const [label, setLabel] = useState('Choose where to start');

  function handlePick(item: HubItem): void {
    setMessage(item.line);
    setLabel(item.label);
    onNavigate(item.key);
  }

  return (
    <div className="hub-overlay">
      <div className="hub-eyebrow">
        <span>ReactorX</span>
        <b>Ion&apos;s Lab</b>
      </div>

      <div className="nameplate">
        <span className="nameplate-dot" />
        <span>{label}</span>
      </div>

      <nav className="menu left">
        {HUB_LEFT.map((item) => (
          <button key={item.key} type="button" className="menu-item" onClick={() => handlePick(item)}>
            <span className="menu-icon">{item.icon}</span>
            <span className="menu-label">{item.label}</span>
          </button>
        ))}
        <button type="button" className="menu-item soon" disabled>
          <span className="menu-icon">{'⚡'}</span>
          <span className="menu-label">Redox &middot; soon</span>
        </button>
      </nav>

      <nav className="menu right">
        <button type="button" className="menu-item soon" disabled>
          <span className="menu-icon">{'🔋'}</span>
          <span className="menu-label">Electrolysis &middot; soon</span>
        </button>
      </nav>

      <div className="hub-bubble" key={waveKey}>
        <span className="ion-dot" />
        <p>{message}</p>
      </div>
    </div>
  );
}

/* ---------------- App shell ---------------- */

function App() {
  const [view, setView] = useState<View>('home');
  const [hubWaveKey, setHubWaveKey] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const chamber = useChamberController();
  const elements = useElementsController();

  function goHome(): void {
    setHubWaveKey((k) => k + 1);
    setView('home');
  }
  function goTo(v: View): void {
    setHubWaveKey((k) => k + 1);
    setView(v);
  }

  const elementsChatContext: ChatContext = { kind: 'elements', symbol: elements.symbol };

  return (
    <div id="app">
      <AppCanvas className="scene-layer">
        {view === 'home' && <HubScene ionWaveKey={hubWaveKey} />}
        {view === 'chamber' && <ChamberSceneContent c={chamber} />}
        {view === 'elements' && <ElementsSceneContent e={elements} onIonClick={() => setChatOpen(true)} />}
      </AppCanvas>

      {view === 'home' && <Hub onNavigate={goTo} waveKey={hubWaveKey} />}
      {view === 'chamber' && <ChamberOverlay c={chamber} onBack={goHome} />}
      {view === 'elements' && <ElementsOverlay e={elements} onBack={goHome} />}

      {view === 'elements' && (
        <IonChatPanel open={chatOpen} onClose={() => setChatOpen(false)} context={elementsChatContext} />
      )}
    </div>
  );
}

export default App;
