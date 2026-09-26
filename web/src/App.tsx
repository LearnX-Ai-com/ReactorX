import { useMemo, useRef, useState, useEffect } from 'react';
import './App.css';
import { ParticleInfoCard } from './components/ParticleInfoCard';
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
import {
  BohrAtomModel, type BohrAtomHandle, type BohrSceneState,
  JUMP_OUT_MS, JUMP_HOLD_MS, JUMP_BACK_MS,
} from './three/BohrAtom';
import type { ChamberPhase, ChamberSnapshot, ReactionChamberHandle } from './three/ReactionChamber';
import { ChamberRoom, type WallFocus } from './three/ChamberRoom';
import { ElementsRoom, type WallFocus as ElementsWallFocus } from './three/ElementsRoom';
import { BondDetail, BondStoryPanel, MoleculeOverview, type MoleculeFocus } from './three/MoleculeDetailCard';
import { MoleculeViewerModel, type MoleculeBondHit } from './three/MoleculeViewer';
import { BondStoryViewerModel, type BondStoryViewerHandle } from './three/BondStoryViewer';
import { IonChatBody } from './ion/ChatBody';
import type { ChatContext } from './ion/answers';
import { speak } from './ion/speech';
import { xrStore } from './three/xr';
import { XRHud } from './three/XRHud';

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

  // ---- Molecule detail view: tapping a reactant/product (or a bond on it)
  // opens a full-screen view with a tab per constituent element plus a
  // "Molecule" tab — mirrors the original single-file prototype's
  // openDetailView, reusing BohrAtomModel/ParticleInfoCard for the element
  // tabs (the same components the standalone Inspect mode already uses)
  // instead of building a second atom-detail screen from scratch.
  const [detail, setDetail] = useState<{ focus: MoleculeFocus; tab: string } | null>(null);
  const [detailAtomState, setDetailAtomState] = useState<BohrSceneState>({ mode: 'atom' });
  const [detailJumpBusy, setDetailJumpBusy] = useState(false);
  const detailBohrRef = useRef<BohrAtomHandle>(null);
  const bondStoryRef = useRef<BondStoryViewerHandle>(null);
  function replayBondStory(): void {
    bondStoryRef.current?.replay();
  }

  function openDetail(focus: MoleculeFocus): void {
    setDetail({ focus, tab: 'molecule' });
    setDetailAtomState({ mode: 'atom' });
  }
  function closeDetail(): void {
    setDetail(null);
  }
  function setDetailTab(tab: string): void {
    setDetail((d) => (d ? { ...d, tab } : d));
    setDetailAtomState({ mode: 'atom' });
  }
  function backToMoleculeOverview(): void {
    setDetail((d) => (d ? { ...d, focus: { kind: 'molecule', formula: d.focus.formula } } : d));
  }
  function handleDetailBondTap(hit: MoleculeBondHit): void {
    setDetail((d) => (d ? { ...d, focus: { kind: 'bond', formula: d.focus.formula, ...hit } } : d));
  }
  function handleDetailAtomTap(symbol: ElementSymbol): void {
    setDetail((d) => (d ? { ...d, tab: symbol } : d));
    setDetailAtomState({ mode: 'atom' });
  }
  function triggerDetailJump(): void {
    const result = detailBohrRef.current?.triggerJump();
    if (!result) return;
    setDetailJumpBusy(true);
    window.setTimeout(() => setDetailJumpBusy(false), JUMP_OUT_MS + JUMP_HOLD_MS + JUMP_BACK_MS + 700);
  }

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
    detail, openDetail, closeDetail, setDetailTab, backToMoleculeOverview,
    handleDetailBondTap, handleDetailAtomTap,
    detailAtomState, setDetailAtomState, detailBohrRef, detailJumpBusy, triggerDetailJump,
    bondStoryRef, replayBondStory,
  };
}

type ChamberController = ReturnType<typeof useChamberController>;

function ChamberSceneContent({ c }: { c: ChamberController }) {
  if (c.detail) {
    const { focus, tab } = c.detail;
    if (tab === 'molecule') {
      return <MoleculeViewerModel formula={focus.formula} onBondTap={c.handleDetailBondTap} onAtomTap={c.handleDetailAtomTap} />;
    }
    if (tab === 'bond') {
      return <BondStoryViewerModel ref={c.bondStoryRef} formula={focus.formula} />;
    }
    return (
      <BohrAtomModel
        ref={c.detailBohrRef}
        symbol={tab as ElementSymbol}
        onStateChange={c.setDetailAtomState}
        viewMode="bohr"
      />
    );
  }
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
      onOpenDetail={c.openDetail}
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

/** One pill per constituent element, plus "🧬 Molecule" and (only when the
 * molecule actually has bonds — a lone atom doesn't) "⚡ Bonds" — the same
 * accent-on-active pill styling WallFocusPills/ViewModePills already use
 * elsewhere in this app, just switching which of MoleculeDetailOverlay's
 * panes is shown instead of a camera wall or a Bohr view mode. */
function MoleculeDetailTabBar({ elements, tab, onSelect, hasBonds }: {
  elements: ElementSymbol[];
  tab: string;
  onSelect: (tab: string) => void;
  hasBonds: boolean;
}) {
  return (
    <div className="detail-tabs">
      {elements.map((el) => (
        <button
          key={el}
          type="button"
          className={tab === el ? 'wall-focus-pill wall-focus-pill-active' : 'wall-focus-pill'}
          onClick={() => onSelect(el)}
        >
          {el}
        </button>
      ))}
      <button
        type="button"
        className={tab === 'molecule' ? 'wall-focus-pill wall-focus-pill-active' : 'wall-focus-pill'}
        onClick={() => onSelect('molecule')}
      >
        🧬 Molecule
      </button>
      {hasBonds && (
        <button
          type="button"
          className={tab === 'bond' ? 'wall-focus-pill wall-focus-pill-active' : 'wall-focus-pill'}
          onClick={() => onSelect('bond')}
        >
          ⚡ Bonds
        </button>
      )}
    </div>
  );
}

/**
 * Full-screen molecule detail view — opened by tapping a reactant/product
 * (or a bond on one) in the chamber (ChamberRoom's onOpenDetail). Ported
 * from the original single-file prototype's openDetailView/.detail-view: a
 * tab per constituent element (reusing the same BohrAtomModel/
 * ParticleInfoCard machinery the standalone Inspect mode already uses,
 * rather than a second atom-detail screen), a "Molecule" tab showing the
 * ball-and-stick structure and its own click-a-bond drill-down
 * (MoleculeViewerModel + MoleculeOverview/BondDetail), and a "Bonds" tab
 * animating every one of the molecule's bonds at once — the shared pair or
 * transferred electron(s) physically moving, ending in real ion notation
 * for an ionic bond (BondStoryViewerModel + BondStoryPanel).
 */
function MoleculeDetailOverlay({ c, onOpenChat }: { c: ChamberController; onOpenChat: () => void }) {
  const detail = c.detail;
  if (!detail) return null;
  const { focus, tab } = detail;
  const def = getKnownMolecule(focus.formula);
  const elementList = def ? Array.from(new Set(def.atoms.map((a) => a.el))) : [];
  const hasBonds = !!def?.bonds.length;

  return (
    <>
      <div className="detail-header">
        <button type="button" className="icon-btn" onClick={c.closeDetail} aria-label="Back to chamber">{'←'}</button>
        <div className="detail-header-text">
          <div className="detail-header-label">Compound</div>
          <div className="detail-header-formula">{toSubscript(focus.formula)}</div>
        </div>
      </div>

      <MoleculeDetailTabBar elements={elementList} tab={tab} onSelect={c.setDetailTab} hasBonds={hasBonds} />

      {tab === 'molecule' && (
        <div className="molecule-card molecule-detail-card">
          {focus.kind === 'molecule'
            ? <MoleculeOverview formula={focus.formula} onInspectElement={c.setDetailTab} />
            : <BondDetail focus={focus} onBack={c.backToMoleculeOverview} onInspectElement={c.setDetailTab} />}
        </div>
      )}
      {tab === 'bond' && (
        <div className="molecule-card molecule-detail-card">
          <BondStoryPanel formula={focus.formula} />
          <button type="button" className="chip molecule-card-replay" onClick={c.replayBondStory}>
            {'↻'} Replay
          </button>
        </div>
      )}
      {tab !== 'molecule' && tab !== 'bond' && (
        <ParticleInfoCard
          symbol={tab as ElementSymbol}
          state={c.detailAtomState}
          onEnterQuark={(nucleonType) => c.detailBohrRef.current?.enterQuark(nucleonType)}
          onExitQuark={() => c.detailBohrRef.current?.exitQuark()}
          onTriggerJump={c.triggerDetailJump}
          jumpDisabled={c.detailJumpBusy}
        />
      )}

      <button type="button" className="ask-ion-btn" onClick={onOpenChat}>
        <span className="ion-dot" /> Ask Ion
      </button>
    </>
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
function ChamberOverlay({ c, onBack, onOpenChat }: { c: ChamberController; onBack: () => void; onOpenChat: () => void }) {
  if (c.detail) {
    return <MoleculeDetailOverlay c={c} onOpenChat={onOpenChat} />;
  }

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

type BohrViewMode = 'bohr' | 'cloud' | 'lewis' | 'ionize';

function useElementsController() {
  const [symbol, setSymbol] = useState<ElementSymbol>('Fe');
  const [mode, setMode] = useState<ElementsMode>('room');
  const [state, setState] = useState<BohrSceneState>({ mode: 'atom' });
  const [ionWaveKey, setIonWaveKey] = useState(0);
  const [narration, setNarration] = useState<string | null>(null);
  const [jumpBusy, setJumpBusy] = useState(false);
  const [viewMode, setViewMode] = useState<BohrViewMode>('bohr');
  const [charge, setCharge] = useState(0);
  const bohrRef = useRef<BohrAtomHandle>(null);

  // ---- Wall-focus camera (room mode only) — a chip click just turns the
  // camera to face that wall from the room's fixed standing spot, no zoom
  // (see ElementsRoom.tsx's module doc for why, unlike the chamber's dock).
  const [focusWall, setFocusWall] = useState<ElementsWallFocus>('center');
  const [focusKey, setFocusKey] = useState(0);
  function requestFocus(wall: ElementsWallFocus): void {
    setFocusWall(wall);
    setFocusKey((k) => k + 1);
  }

  function pickSymbol(s: string): void {
    setIonWaveKey((k) => k + 1);
    setSymbol(s as ElementSymbol);
  }
  // Fresh guidance toast every time Inspect mode is entered (not just the
  // first ever) — fades on its own after 30s (see .inspect-toast, App.css,
  // whose CSS animation is timed to match). Set directly here, at the
  // actual event that causes the entry, rather than reactively in an
  // effect watching `mode` in ElementsOverlay.
  const [showInspectToast, setShowInspectToast] = useState(false);
  function enterInspect(): void {
    setState({ mode: 'atom' });
    setMode('inspect');
    setShowInspectToast(true);
    window.setTimeout(() => setShowInspectToast(false), 30000);
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
    focusWall, focusKey, requestFocus, showInspectToast,
    viewMode, setViewMode, charge, setCharge,
  };
}

type ElementsController = ReturnType<typeof useElementsController>;

function ElementsSceneContent({ e }: { e: ElementsController }) {
  if (e.mode === 'inspect') {
    // No Ion mascot here (unlike room mode) — "Ask Ion" is a plain 2D
    // button in ElementsOverlay instead, same pattern the chamber's
    // molecule detail view already uses. The atom itself is the whole
    // point of this screen; a floating character over it was competing
    // for attention rather than adding to it.
    return <BohrAtomModel ref={e.bohrRef} symbol={e.symbol} onStateChange={e.setState} viewMode={e.viewMode} onChargeChange={e.setCharge} />;
  }
  return (
    <ElementsRoom
      symbol={e.symbol}
      onSelectElement={e.pickSymbol}
      ionWaveKey={e.ionWaveKey}
      focusWall={e.focusWall}
      focusKey={e.focusKey}
      onInspect={e.enterInspect}
    />
  );
}

/** Wall-focus shortcuts for the elements room — same component shape as
 * the chamber's WallFocusPills, just with this room's own wall assignment
 * (table is center here, not a side wall) and labels. */
function ElementsWallFocusPills({ e }: { e: ElementsController }) {
  return (
    <div className="wall-focus-pills">
      {(['left', 'center', 'right'] as const).map((wall) => (
        <button
          key={wall}
          type="button"
          className={e.focusWall === wall ? 'wall-focus-pill wall-focus-pill-active' : 'wall-focus-pill'}
          onClick={() => e.requestFocus(wall)}
        >
          {wall === 'left' ? 'Atom' : wall === 'center' ? 'Table' : 'Info'}
        </button>
      ))}
    </div>
  );
}

/** Bohr/quantum-cloud/Lewis view-mode toggle for Inspect mode — same
 * pill-row shape as the wall-focus pills, just switching how the atom
 * itself is drawn rather than the camera. */
function ViewModePills({ e }: { e: ElementsController }) {
  return (
    <div className="wall-focus-pills">
      {(['bohr', 'cloud', 'lewis', 'ionize'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className={e.viewMode === mode ? 'wall-focus-pill wall-focus-pill-active' : 'wall-focus-pill'}
          onClick={() => e.setViewMode(mode)}
        >
          {mode === 'bohr' ? 'Bohr' : mode === 'cloud' ? 'Cloud' : mode === 'lewis' ? 'Lewis' : 'Ionize'}
        </button>
      ))}
    </div>
  );
}

/** Transient guidance shown on entering Inspect mode, fading out on its
 * own — replaces what used to be permanent static text in the (now
 * always-minimized, see ElementsOverlay) bottom dock. e.showInspectToast is
 * set directly by enterInspect() (useElementsController) every time
 * Inspect mode is entered, not just the first ever. */
function InspectEntryToast() {
  return (
    <div className="inspect-toast">
      <span className="ion-dot" />
      <p>Click a particle or shell ring to learn what it does. Tap &quot;Ask Ion&quot; for questions.</p>
    </div>
  );
}

function ElementsOverlay({ e, onBack, onOpenChat }: { e: ElementsController; onBack: () => void; onOpenChat: () => void }) {
  const roomMode = e.mode === 'room';

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
            charge={e.charge}
            isIonize={e.viewMode === 'ionize'}
            onAddElectron={() => e.bohrRef.current?.addElectron()}
            onResetIons={() => e.bohrRef.current?.resetIons()}
          />
          {e.narration && (
            <div className="jump-narration">
              <span className="ion-dot" />
              <p>{e.narration}</p>
            </div>
          )}
          {e.showInspectToast && !e.narration && <InspectEntryToast />}
          <button type="button" className="ask-ion-btn ask-ion-btn-top" onClick={onOpenChat}>
            <span className="ion-dot" /> Ask Ion
          </button>
        </>
      )}

      {/* Both modes stay permanently compact now — room mode's own "which
       * element + Inspect" content lives in a floating panel above the
       * table (ElementsRoom.tsx's TableStatusPanel), and Inspect mode's
       * former expanded note is the transient toast above instead — so
       * neither has anything left to expand into, and no minimize/expand
       * toggle is needed for either. */}
      <div className="hud-dock hud-dock-inline-top hud-dock-mini">
        <div className="hud-top-row">
          <button
            type="button"
            className="icon-btn"
            onClick={e.mode === 'inspect' ? e.exitInspect : onBack}
            aria-label={e.mode === 'inspect' ? 'Back to room' : 'Back to hub'}
          >
            {'←'}
          </button>
          {roomMode && <ElementsWallFocusPills e={e} />}
          {e.mode === 'inspect' && <ViewModePills e={e} />}
        </div>
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
}

// Both entries are now rotating 3D objects in HubScene (tap to navigate —
// see App()'s onSelectChamber/onSelectElements), not 2D cards — this array
// only supplies the message/label text pickHubItem puts on the speech
// bubble/status bar, regardless of which 3D object triggered the pick.
// Redox/Electrolysis (previously disabled "soon" cards) are gone entirely.
const HUB_LEFT: HubItem[] = [
  { key: 'chamber', icon: '⚗️', label: 'Reaction Chamber', line: "Let's react something! Pick two elements and I'll show you what happens." },
  { key: 'elements', icon: '🔬', label: 'Explore Elements', line: 'Every element has a story. Tap one and I’ll take you inside its atom.' },
];

function Hub({ message, label, waveKey }: { message: string; label: string; waveKey: number }) {
  return (
    <div className="hub-overlay">
      <div className="hub-eyebrow">
        <span>ReactorX</span>
        <b>Ion&apos;s Lab</b>
      </div>

      <div className="hub-bubble" key={waveKey}>
        <span className="ion-dot" />
        <p>{message}</p>
      </div>

      <div className="hub-startbar">
        <span className="nameplate-dot" />
        <span>{label}</span>
      </div>
    </div>
  );
}

/* ---------------- App shell ---------------- */

/**
 * Only rendered when the browser actually reports immersive-vr support
 * (checked once via navigator.xr — most desktop/mobile browsers have no
 * `navigator.xr` at all, and this stays hidden there rather than showing a
 * button that would just fail). Starting an XR session has to happen from
 * a real user gesture (a click handler), which is exactly what this is —
 * xrStore.enterVR() can't be called on mount or from anywhere else.
 * Visible across every screen (not just the hub) since AppCanvas's single
 * persistent Canvas means whichever scene is currently active is what
 * you'd see in the headset.
 */
function EnterVRButton() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    navigator.xr?.isSessionSupported('immersive-vr')
      .then((ok) => { if (!cancelled) setSupported(ok); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!supported) return null;
  return (
    <button type="button" className="enter-vr-btn" onClick={() => { void xrStore.enterVR(); }}>
      {'\u{1F97D}'} Enter VR
    </button>
  );
}

function App() {
  const [view, setView] = useState<View>('home');
  const [hubWaveKey, setHubWaveKey] = useState(0);
  // Ion's hub-screen dialogue — was local to Hub, lifted up here since the
  // "Reaction Chamber" pick can now come from either the 2D menu (Hub) or
  // the 3D rotating model (HubScene's onSelectChamber), and both need to
  // drive the same speech-bubble/status-bar text.
  const [hubMessage, setHubMessage] = useState("Hi, I'm Ion. Where should we start?");
  const [hubLabel, setHubLabel] = useState('Choose where to start');
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
  function pickHubItem(item: HubItem): void {
    setHubMessage(item.line);
    setHubLabel(item.label);
    goTo(item.key);
  }

  const elementsChatContext: ChatContext = { kind: 'elements', symbol: elements.symbol };
  // The molecule detail view's own "Ask Ion" grounds the chat in whichever
  // tab is currently open — the molecule itself (Molecule and Bonds tabs
  // both ground in the same molecule context, since the Bonds tab is still
  // fundamentally about this molecule's own chemistry), or the element
  // currently being inspected — same ChatContext shapes the rest of the app
  // already uses, just sourced from the chamber's detail state instead of a
  // screen.
  const detailChatContext: ChatContext | null = chamber.detail
    ? (chamber.detail.tab === 'molecule' || chamber.detail.tab === 'bond'
      ? { kind: 'molecule', formula: chamber.detail.focus.formula }
      : { kind: 'elements', symbol: chamber.detail.tab as ElementSymbol })
    : null;
  // Same idea as elementsChatContext/detailChatContext above, just unified
  // across every screen (including plain chamber browsing with no detail
  // view open) for XRHud — the one place that needs "whatever's currently
  // relevant" regardless of which view/mode is active, since it's always
  // mounted (it just renders nothing outside an XR session).
  const xrHudContext: ChatContext = view === 'elements'
    ? elementsChatContext
    : view === 'chamber'
      ? (detailChatContext ?? { kind: 'chamber', reactantA: chamber.reactantA, reactantB: chamber.reactantB, reaction: chamber.reaction })
      : { kind: 'none' };

  return (
    <div id="app">
      <AppCanvas className="scene-layer">
        {view === 'home' && (
          <HubScene
            ionWaveKey={hubWaveKey}
            onSelectChamber={() => pickHubItem(HUB_LEFT[0])}
            onSelectElements={() => pickHubItem(HUB_LEFT[1])}
          />
        )}
        {view === 'chamber' && <ChamberSceneContent c={chamber} />}
        {view === 'elements' && <ElementsSceneContent e={elements} />}
        <XRHud context={xrHudContext} />
      </AppCanvas>

      <EnterVRButton />

      {view === 'home' && <Hub message={hubMessage} label={hubLabel} waveKey={hubWaveKey} />}
      {view === 'chamber' && <ChamberOverlay c={chamber} onBack={goHome} onOpenChat={() => setChatOpen(true)} />}
      {view === 'elements' && <ElementsOverlay e={elements} onBack={goHome} onOpenChat={() => setChatOpen(true)} />}

      {view === 'elements' && (
        <IonChatPanel open={chatOpen} onClose={() => setChatOpen(false)} context={elementsChatContext} />
      )}
      {view === 'chamber' && detailChatContext && (
        <IonChatPanel open={chatOpen} onClose={() => setChatOpen(false)} context={detailChatContext} />
      )}
    </div>
  );
}

export default App;
