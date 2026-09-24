import { useMemo, useRef, useState, useEffect } from 'react';
import './App.css';
import { ParticleInfoCard } from './components/ParticleInfoCard';
import { ATOMIC_NAMES } from './chemistry/elements';
import { standardElementalForm } from './chemistry/standardForm';
import { toSubscript, canonicalFormula } from './chemistry/formulas';
import { balanceEquation } from './chemistry/balance';
import { checkBalance, type BalanceCheck } from './chemistry/checkBalance';
import { fetchMoleculeFromAtoms, MoleculeNotPossibleError } from './chemistry/api';
import { cacheMolecule, getKnownMolecule, getMoleculeName } from './chemistry/moleculeSource';
import { reactionArrow } from './chemistry/reactions';
import type { CategoryFilter } from './chemistry/elementFilter';
import type { ElementSymbol, Reaction, ReactantSlot, TrayCard } from './chemistry/types';
import { AppCanvas } from './three/AppCanvas';
import { HubScene } from './three/HubScene';
import { Ion } from './three/Ion';
import {
  BohrAtomModel, type BohrAtomHandle, type BohrSceneState,
  JUMP_OUT_MS, JUMP_HOLD_MS, JUMP_BACK_MS,
} from './three/BohrAtom';
import type { ChamberPhase, ChamberSnapshot, ReactionChamberHandle } from './three/ReactionChamber';
import { ChamberRoom, type WallFocus } from './three/ChamberRoom';
import { ElementsRoom } from './three/ElementsRoom';
import { ELEMENTS_ION_DOCK } from './three/layout';
import { IonChatBody } from './ion/ChatBody';
import type { ChatContext } from './ion/answers';
import { speak } from './ion/speech';

type View = 'home' | 'chamber' | 'elements';

const MIN_COEFF = 1;
const MAX_COEFF = 8;

// The Add-to-Reaction "did this combination actually form something" result
// — lives purely in the HUD now (see SlotChips' fusion-aware rendering), not
// a separate 3D object: several attempts at a floating 3D fusion chamber
// all had the same problem, getting positioned/scaled sensibly relative to
// the zoomed-in camera was fighting the room geometry rather than working
// with it, so this reuses the tray chips that are already proven to work.
type FusionState =
  | { status: 'pending'; symbols: string[] }
  | { status: 'success'; formula: string; symbols: string[] }
  | { status: 'failure'; message: string; symbols: string[] };

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
      // Starts unbalanced (1 each) — the student's job, via the always-on
      // CoefficientEditor, is to fix that before React unlocks. showSolution
      // is the only path that jumps straight to the answer.
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
    // Reset replays the chamber for another run — it does NOT re-scramble
    // the coefficients back to 1 each. Re-setting them (as a new array, so
    // the coeffs-changed effect actually re-fires) keeps an already-balanced
    // equation balanced, so React re-enables immediately instead of forcing
    // the student to re-balance from scratch before every run.
    if (coeffs) setCoeffs([...coeffs]);
  }

  function handleReact(): void {
    // play() covers both the first run (idle) and replaying after 'done' —
    // it resets and re-syncs coefficients synchronously before reacting, so
    // a still-balanced equation can be played again with one click instead
    // of needing Reset pressed first (see ReactionChamber.tsx).
    chamberRef.current?.play();
  }

  // ---- Wall-focus camera: which wall the desktop look-controls should
  // smoothly turn to face. focusKey bumps on every button press (even
  // re-pressing the wall already in view) so ChamberRoom's tween always
  // has something to react to. Requesting a wall also zooms the camera in
  // toward it — reading the table or the equation from the default standing
  // distance was too far away to be worth much, whether the HUD is
  // expanded or minimized.
  const [focusWall, setFocusWall] = useState<WallFocus>('center');
  const [focusKey, setFocusKey] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  function requestFocus(wall: WallFocus): void {
    setFocusWall(wall);
    setFocusKey((k) => k + 1);
    setZoomed(true);
  }

  // ---- Balancing panel minimize: lifted out of ChamberOverlay so the 3D
  // room (ChamberSceneContent) can see it too. Minimizing zooms in on
  // whichever wall is currently focused (via requestFocus) rather than
  // always the center wall, so e.g. minimizing from the Ion wall keeps the
  // camera on the Ion wall; expanding always steps back out to the
  // standing view, even if a side wall was zoomed in on beforehand — the
  // full picker/balance panel wants the wider framing.
  const [panelOpen, setPanelOpen] = useState(true);
  function toggleMinimized(): void {
    const next = !panelOpen;
    setPanelOpen(next);
    if (!next) requestFocus(focusWall); else setZoomed(false);
  }

  // ---- Left-wall periodic table category filter ----
  const [elementCategory, setElementCategory] = useState<CategoryFilter>('all');

  // ---- Left-wall atom tray: build a reactant atom by atom ----
  // No manual tab-switching: whichever slot is still unset is where new
  // picks go (A first, then B) — a derived value, not state. Clearing a
  // confirmed chip empties that slot's reactant, which reopens it here.
  const activeBuildSlot: ReactantSlot = !reactantA ? 'a' : !reactantB ? 'b' : 'a';
  const [trayCards, setTrayCards] = useState<Record<ReactantSlot, TrayCard[]>>({ a: [], b: [] });
  const [trayBusy, setTrayBusy] = useState(false);
  const [trayError, setTrayError] = useState<string | null>(null);
  const [liveGuess, setLiveGuess] = useState<string | null>(null);
  // The "did this combination actually form something" reveal, shown on the
  // tray chips themselves (see SlotChips) — only set for multi-atom picks
  // that actually go through the AI backend (see confirmTray), not the
  // single-atom shortcut, and cleared whenever a fresh attempt starts.
  const [fusion, setFusion] = useState<FusionState | null>(null);
  const nextCardId = useRef(0);

  function addTrayCard(symbol: string): void {
    nextCardId.current += 1;
    setTrayError(null);
    setFusion(null);
    setTrayCards((prev) => ({
      ...prev,
      [activeBuildSlot]: [...prev[activeBuildSlot], { id: nextCardId.current, symbol }],
    }));
  }
  function removeTrayCard(slot: ReactantSlot, id: number): void {
    setTrayCards((prev) => ({ ...prev, [slot]: prev[slot].filter((c) => c.id !== id) }));
  }
  function clearSlot(slot: ReactantSlot): void {
    if (slot === 'a') setReactantA(''); else setReactantB('');
    setTrayCards((prev) => ({ ...prev, [slot]: [] }));
    setTrayError(null);
    setFusion(null);
  }

  // A successful fusion lingers a few seconds (long enough to read the
  // spinning molecule + name) then clears itself — the confirmed reactant
  // chip already carries the result forward, so it doesn't need to stay up
  // forever. A failure stays up until the student starts a new attempt.
  useEffect(() => {
    if (fusion?.status !== 'success') return;
    const timer = window.setTimeout(() => setFusion(null), 4500);
    return () => window.clearTimeout(timer);
  }, [fusion]);

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
    // Fusion display is only worth showing for an actual AI-backed attempt —
    // a single atom never fails and isn't "fusing" anything.
    const isFusion = cards.length > 1;
    const symbols = cards.map((card) => card.symbol);
    if (isFusion) setFusion({ status: 'pending', symbols });
    try {
      let formula: string;
      if (cards.length === 1) {
        formula = standardElementalForm(cards[0].symbol);
      } else {
        // Same "settled chemistry, don't ask the AI" principle as the
        // single-atom case above, extended to a multi-atom pick that's
        // already known (e.g. two H atoms = H2, both hand-authored in
        // molecules.ts) — checked locally before ever hitting the network,
        // so a composition that needs no AI call can't be derailed by one.
        const canonical = canonicalFormula(trayComposition(cards));
        const known = getKnownMolecule(canonical);
        formula = known
          ? canonical
          : await fetchMoleculeFromAtoms(trayComposition(cards)).then((result) => {
            cacheMolecule(result.formula, result.def, result.name);
            return result.formula;
          });
      }
      if (activeBuildSlot === 'a') setReactantA(formula); else setReactantB(formula);
      setTrayCards((prev) => ({ ...prev, [activeBuildSlot]: [] }));
      if (isFusion) setFusion({ status: 'success', formula, symbols });
    } catch (err) {
      const message = err instanceof MoleculeNotPossibleError
        ? err.message
        : 'Could not generate that molecule — try a different combination.';
      setTrayError(message);
      if (isFusion) setFusion({ status: 'failure', message, symbols });
    } finally {
      setTrayBusy(false);
    }
  }

  return {
    reactantA, reactantB,
    snapshot, phase, caption, reaction, coeffs, setCoeffs,
    check, ionWaveKey, chamberRef, handleChamberState, showSolution, handleReset, handleReact,
    activeBuildSlot, trayCards, addTrayCard, removeTrayCard, clearSlot,
    trayBusy, trayError, liveGuess, confirmTray, fusion,
    elementCategory, setElementCategory,
    focusWall, focusKey, requestFocus,
    panelOpen, toggleMinimized, zoomed,
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
      phase={c.phase}
      activeBuildSlot={c.activeBuildSlot}
      trayCards={c.trayCards}
      onAddCard={c.addTrayCard}
      elementCategory={c.elementCategory}
      onElementCategoryChange={c.setElementCategory}
      ionWaveKey={c.ionWaveKey}
      focusWall={c.focusWall}
      focusKey={c.focusKey}
      zoomed={c.zoomed}
    />
  );
}

/** One reactant/product as a big rounded card: +/- steppers to balance it,
 * an × badge to clear it (a reactant clears just that slot; a product's ×
 * clears both, since there's no independent "just this product" concept),
 * and its common name underneath. */
function CompoundCard({
  formula, coeff, onBump, onClear, clearLabel,
}: { formula: string; coeff: number; onBump: (delta: number) => void; onClear: () => void; clearLabel: string }) {
  const name = getMoleculeName(formula);
  return (
    <div className="compound-card">
      <div className="compound-card-pill">
        <button type="button" className="coeff-step" onClick={() => onBump(-1)} disabled={coeff <= MIN_COEFF}>−</button>
        <span className="compound-card-formula">{coeff > 1 ? `${coeff} ` : ''}{toSubscript(formula)}</span>
        <button type="button" className="coeff-step" onClick={() => onBump(1)} disabled={coeff >= MAX_COEFF}>+</button>
        <button type="button" className="compound-card-clear" onClick={onClear} aria-label={clearLabel}>×</button>
      </div>
      {name && <span className="compound-card-label">{name}</span>}
    </div>
  );
}

function EquationRow({
  reaction, coeffs, onChange, onClearSlotA, onClearSlotB, onChangeReactants,
}: {
  reaction: Reaction; coeffs: number[]; onChange: (next: number[]) => void;
  onClearSlotA: () => void; onClearSlotB: () => void; onChangeReactants: () => void;
}) {
  const compounds = [reaction.a, reaction.b, ...reaction.products];

  function bump(index: number, delta: number): void {
    const next = coeffs.slice();
    next[index] = Math.min(MAX_COEFF, Math.max(MIN_COEFF, next[index] + delta));
    onChange(next);
  }

  return (
    <div className="equation-row">
      {compounds.map((formula, i) => (
        <div className="equation-cell" key={`${formula}-${i}`}>
          {i === 2 && <span className="coeff-arrow">{reactionArrow(reaction)}</span>}
          {i > 0 && i !== 2 && <span className="coeff-plus">+</span>}
          <CompoundCard
            formula={formula}
            coeff={coeffs[i]}
            onBump={(delta) => bump(i, delta)}
            onClear={i === 0 ? onClearSlotA : i === 1 ? onClearSlotB : onChangeReactants}
            clearLabel={i === 0 ? 'Clear reactant A' : i === 1 ? 'Clear reactant B' : 'Change reactants'}
          />
        </div>
      ))}
    </div>
  );
}

/** Elements as columns (not rows) — matches counting on your fingers: one
 * row per side, colored per-element so a mismatch jumps out without a
 * separate checkmark column to scan. */
function BalanceTable({ tally }: { tally: Record<string, { left: number; right: number; balanced: boolean }> }) {
  const elements = Object.keys(tally);
  const allBalanced = elements.every((el) => tally[el].balanced);
  return (
    <table className="balance-table">
      <thead>
        <tr>{elements.map((el) => <th key={el}>{el}</th>)}<th /></tr>
      </thead>
      <tbody>
        <tr>
          {elements.map((el) => (
            <td key={el} className={tally[el].balanced ? 'balance-ok' : 'balance-off'}>{tally[el].left}</td>
          ))}
          <td className="balance-check">{allBalanced ? '✓' : ''}</td>
        </tr>
        <tr>
          {elements.map((el) => (
            <td key={el} className={tally[el].balanced ? 'balance-ok' : 'balance-off'}>{tally[el].right}</td>
          ))}
          <td className="balance-check">{allBalanced ? '✓' : ''}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Fuse/break feedback lives on these chips themselves now, not a separate
 * 3D object — a few attempts at a floating fusion chamber near the table
 * all fought the same problem (sizing/positioning sensibly relative to the
 * zoomed-in camera), so this reuses the tray chips that already work.
 */
function SlotChips({
  slot, formula, cards, onRemoveCard, onClear, fusion,
}: {
  slot: ReactantSlot; formula: string; cards: TrayCard[]; onRemoveCard: (id: number) => void; onClear: () => void;
  fusion: FusionState | null;
}) {
  if (formula) {
    const name = getMoleculeName(formula);
    return (
      <span className="reactant-chip reactant-chip-pop" title={name}>
        {toSubscript(formula)}
        <button type="button" className="reactant-chip-remove" onClick={onClear} aria-label={`Clear reactant ${slot.toUpperCase()}`}>×</button>
      </span>
    );
  }
  if (cards.length === 0) {
    return <span className="reactant-chip reactant-chip-empty">Reactant {slot.toUpperCase()}</span>;
  }
  const fusing = fusion?.status === 'pending';
  const failed = fusion?.status === 'failure';
  const groupClass = fusing
    ? 'atom-box-group atom-box-group-fusing'
    : failed ? 'atom-box-group atom-box-group-failed' : 'atom-box-group';
  return (
    <span className={groupClass}>
      {cards.map((card) => (
        <span key={card.id} className="atom-box-chip">
          <button
            type="button"
            className="atom-box-remove"
            onClick={() => onRemoveCard(card.id)}
            aria-label={`Remove ${card.symbol}`}
            disabled={fusing}
          >
            ×
          </button>
          {card.symbol}
        </span>
      ))}
    </span>
  );
}

/** "Look at wall X" pills — bordered, subdued when inactive, bright
 * accent border + text (not a solid fill) when active. */
function WallFocusPills({ c }: { c: ChamberController }) {
  return (
    <div className="wall-focus-pills">
      {(['left', 'center', 'right'] as const).map((wall) => (
        <button
          key={wall}
          type="button"
          className={c.focusWall === wall ? 'wall-focus-pill wall-focus-pill-active' : 'wall-focus-pill'}
          onClick={() => c.requestFocus(wall)}
        >
          {wall === 'left' ? 'Elements' : wall === 'center' ? 'Reaction' : 'Ion'}
        </button>
      ))}
    </div>
  );
}

/**
 * Minimized-view replacement for the full equation panel: formula + common
 * name per compound (read-only — no steppers, no clear, this isn't for
 * editing), with the play button sitting right next to it in the same row
 * instead of stacked below — more real estate for the equation itself, and
 * the whole thing bounded in one rounded-rectangle card.
 */
const WALL_SHORTCUTS: { wall: WallFocus; glyph: string; label: string }[] = [
  { wall: 'left', glyph: '⚛', label: 'Look at Elements wall' },
  { wall: 'center', glyph: '⚗', label: 'Look at Reaction wall' },
  { wall: 'right', glyph: 'i', label: 'Look at reaction info' },
];

function MiniReactionCard({
  reaction, coeffs, phase, check, focusWall, onReact, onFocusWall,
}: {
  reaction: Reaction; coeffs: number[]; phase: ChamberPhase; check: BalanceCheck | null;
  focusWall: WallFocus; onReact: () => void; onFocusWall: (wall: WallFocus) => void;
}) {
  const compounds = [reaction.a, reaction.b, ...reaction.products];
  return (
    <div className="mini-reaction-card">
      <div className="mini-equation-row">
        {compounds.map((formula, i) => (
          <div className="mini-equation-cell" key={`${formula}-${i}`}>
            {i === 2 && <span className="coeff-arrow">{reactionArrow(reaction)}</span>}
            {i > 0 && i !== 2 && <span className="coeff-plus">+</span>}
            <div className="mini-compound">
              <span className="mini-compound-formula">{coeffs[i] > 1 ? `${coeffs[i]} ` : ''}{toSubscript(formula)}</span>
              {getMoleculeName(formula) && <span className="mini-compound-label">{getMoleculeName(formula)}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mini-reaction-actions">
        {/* Always Play here — Reset only ever shows in the expanded panel. */}
        <button
          type="button"
          className="icon-btn-play icon-btn-play-sm"
          disabled={!check?.balanced || phase === 'reacting'}
          onClick={onReact}
          aria-label="React"
        >
          {'▶'}
        </button>
        {/* One shortcut per wall — minimized view had no way to jump to the
         * Elements or Reaction walls before, only Ion (via the old lone info
         * button); all three now live here so the camera can be steered
         * without expanding the panel first. */}
        {WALL_SHORTCUTS.map(({ wall, glyph, label }) => (
          <button
            key={wall}
            type="button"
            className={focusWall === wall ? 'icon-btn-info icon-btn-info-active' : 'icon-btn-info'}
            onClick={() => onFocusWall(wall)}
            aria-label={label}
          >
            {glyph}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Phase-based dock: only what's relevant to the current step is on screen
 * at once, so the panel stays slim regardless of how far along a student
 * is — picking reactants shows just the picker; once a reaction is found,
 * the picker gives way to the equation cards + balance table, and only one
 * primary action (Add to Reaction / React / Reset) shows at a time instead
 * of every button stacking up together. Switching to the Elements wall
 * (while expanded) drops back to the picker even with a reaction already
 * found, so picking/removing elements is always available from that wall —
 * minimized always shows the compact equation card regardless of which
 * wall is focused, since there's no picker UI to switch to there anyway.
 */
function ChamberOverlay({ c, onBack }: { c: ChamberController; onBack: () => void }) {
  const { reaction, coeffs, phase, check, panelOpen, focusWall } = c;

  function changeReactants(): void {
    c.clearSlot('a');
    c.clearSlot('b');
    // Clearing a reactant means the next thing to do is pick its
    // replacement, which only happens on the Elements wall — without this
    // the student clears a chip and is still staring at the Reaction wall.
    c.requestFocus('left');
  }

  // Ion wall, expanded: a minimal summary only — the equation and the
  // reactants'/products' names, or an empty-state message when there's
  // nothing to summarize yet. No balance table, steppers, or action
  // buttons here — those stay on the Reaction wall's own view below.
  if (panelOpen && focusWall === 'right') {
    const hasReaction = reaction && coeffs;
    return (
      <div className="hud-dock hud-dock-inline-top">
        <div className="hud-top-row">
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to hub">{'←'}</button>
          <WallFocusPills c={c} />
          {hasReaction && (
            <button
              type="button"
              className="icon-btn icon-btn-toggle"
              onClick={c.toggleMinimized}
              aria-label="Minimize panel"
            >
              {'−'}
            </button>
          )}
        </div>
        <div className="ion-view-summary">
          {hasReaction ? (
            <>
              <p className="ion-view-equation">
                {toSubscript(c.reactantA)} + {toSubscript(c.reactantB)} {reactionArrow(reaction)} {reaction.products.map((p) => toSubscript(p)).join(' + ')}
              </p>
              <p className="ion-view-names">
                {[c.reactantA, c.reactantB].map((f) => getMoleculeName(f) ?? toSubscript(f)).join(' + ')}
                {` ${reactionArrow(reaction)} `}
                {reaction.products.map((p) => getMoleculeName(p) ?? toSubscript(p)).join(' + ')}
              </p>
            </>
          ) : !c.reactantA || !c.reactantB ? (
            <p className="note">Pick both reactants on the Elements wall to see the reaction here.</p>
          ) : phase === 'checking' ? (
            <p className="note">Asking Ion whether {toSubscript(c.reactantA)} and {toSubscript(c.reactantB)} react…</p>
          ) : (
            <p className="note note-warn">
              No reaction on file for {toSubscript(c.reactantA)} + {toSubscript(c.reactantB)}.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (reaction && coeffs && (!panelOpen || focusWall !== 'left')) {
    return (
      <div className={panelOpen ? 'hud-dock hud-dock-inline-top' : 'hud-dock hud-dock-inline-top hud-dock-mini'}>
        <div className="hud-top-row">
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to hub">{'←'}</button>
          {panelOpen ? (
            <WallFocusPills c={c} />
          ) : (
            <MiniReactionCard
              reaction={reaction}
              coeffs={coeffs}
              phase={phase}
              check={check}
              focusWall={focusWall}
              onReact={c.handleReact}
              onFocusWall={c.requestFocus}
            />
          )}
          <button
            type="button"
            className="icon-btn icon-btn-toggle"
            onClick={c.toggleMinimized}
            aria-label={panelOpen ? 'Minimize panel' : 'Expand panel'}
          >
            {panelOpen ? '−' : '+'}
          </button>
        </div>
        {panelOpen && (
          <div className="hud-balance-layout">
            <div className="equation-with-balance">
              {check && <BalanceTable tally={check.tally} />}
              <div className="equation-panel">
                <EquationRow
                  reaction={reaction}
                  coeffs={coeffs}
                  onChange={c.setCoeffs}
                  onClearSlotA={() => { c.clearSlot('a'); c.requestFocus('left'); }}
                  onClearSlotB={() => { c.clearSlot('b'); c.requestFocus('left'); }}
                  onChangeReactants={changeReactants}
                />
              </div>
            </div>
            <div className="hud-actions-row">
              <div className="hud-actions-primary">
                {/* React itself replays from 'done' (see handleReact/play()),
                 * so it only needs to disable while actually mid-animation —
                 * a balanced equation can be reacted again with one click,
                 * no Reset required first. */}
                <button type="button" className="react-btn" disabled={!check?.balanced || phase === 'reacting'} onClick={c.handleReact}>
                  React
                </button>
                {/* Reset sits next to React, not in place of it — it's for
                 * stepping back to the static balanced setup without
                 * immediately replaying, not a prerequisite for reacting again. */}
                {phase === 'done' && (
                  <button type="button" className="react-btn react-btn-secondary" onClick={c.handleReset}>Reset</button>
                )}
              </div>
              {!check?.balanced && phase === 'idle' && (
                <button type="button" className="text-link" onClick={c.showSolution}>Show solution</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const activeCards = c.trayCards[c.activeBuildSlot];
  return (
    <div className="hud-dock hud-dock-inline-top">
      <div className="hud-top-row">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to hub">{'←'}</button>
        <WallFocusPills c={c} />
      </div>
      <div className="hud-grid hud-grid-chamber">
        <div className="hud-col hud-col-center">
          <div className="reactants-and-status">
            <div className="selected-reactants-row">
              <SlotChips
                slot="a"
                formula={c.reactantA}
                cards={c.trayCards.a}
                onRemoveCard={(id) => c.removeTrayCard('a', id)}
                onClear={() => c.clearSlot('a')}
                fusion={c.fusion}
              />
              <span className="reactant-plus">+</span>
              <SlotChips
                slot="b"
                formula={c.reactantB}
                cards={c.trayCards.b}
                onRemoveCard={(id) => c.removeTrayCard('b', id)}
                onClear={() => c.clearSlot('b')}
                fusion={c.fusion}
              />
            </div>
            {/* Picking both reactants here doesn't switch walls automatically
             * (see the phase-based dock), so without this a confirmed
             * reaction is invisible unless the student happens to click
             * over to the Reaction wall on their own. Sits beside the
             * reactant chips (the thing it's reporting on) rather than
             * stacked below. */}
            {reaction && (
              <p className="reaction-found-line">
                <span className="reaction-found-check">{'✓'}</span>{' '}
                <span className="reaction-found-name">{reaction.name}</span>{': '}
                <span className="reaction-found-equation">
                  {toSubscript(c.reactantA)} + {toSubscript(c.reactantB)} {reactionArrow(reaction)} {reaction.products.map((p) => toSubscript(p)).join(' + ')}
                </span>{' — '}
                <button type="button" className="text-link" onClick={() => c.requestFocus('center')}>
                  Go to Reaction wall {'→'}
                </button>
              </p>
            )}
          </div>
          {c.liveGuess && <p className="tray-guess">{'→'} looks like {c.liveGuess}</p>}
          {c.trayError && <p className="note note-warn">{c.trayError}</p>}
          {/* Only show checking/no-reaction feedback when there genuinely
           * isn't a reaction yet. */}
          {c.reactantA && c.reactantB && !reaction && phase === 'checking' && (
            <p className="note">Asking Ion whether {toSubscript(c.reactantA)} and {toSubscript(c.reactantB)} react…</p>
          )}
          {c.reactantA && c.reactantB && !reaction && phase !== 'checking' && (
            <p className="note note-warn">
              No reaction on file for {toSubscript(c.reactantA)} + {toSubscript(c.reactantB)} — {c.caption
                || "these don't react under normal conditions. Clear a reactant (×) and try another pair."}
            </p>
          )}
        </div>
        <div className="hud-col hud-col-actions">
          <button
            type="button"
            className="react-btn"
            disabled={activeCards.length === 0 || c.trayBusy}
            onClick={c.confirmTray}
          >
            {c.trayBusy ? 'Asking Ion…' : 'Add to Reaction'}
          </button>
        </div>
      </div>
    </div>
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
