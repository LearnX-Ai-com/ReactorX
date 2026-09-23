import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../chemistry/elements';
import type { CategoryFilter } from '../chemistry/elementFilter';
import { toSubscript } from '../chemistry/formulas';
import { getMoleculeName } from '../chemistry/moleculeSource';
import type { ReactantSlot, TrayCard } from '../chemistry/types';
import { ease } from './math';
import { ElementTile } from './PeriodicTableRoom';

const SPACING = 0.5;
const TRAY_COLS = 6;
const DROP_MS = 320;
const DROP_HEIGHT = 1.1;

function TrayCardMesh({ symbol, x, y, onRemove }: { symbol: string; x: number; y: number; onRemove: () => void }) {
  const groupRef = useRef<THREE.Group>(null!);
  // Captured on mount (not during render) — each card mounts once when its
  // click adds it to the tray, so "time since mount" is exactly "time since
  // dropped".
  const startRef = useRef<number | null>(null);
  useEffect(() => { startRef.current = performance.now(); }, []);
  useFrame(() => {
    if (startRef.current == null) return;
    const t = Math.min(1, (performance.now() - startRef.current) / DROP_MS);
    groupRef.current.position.set(x, y + (1 - ease(t)) * DROP_HEIGHT, 0);
  });
  const el = ELEMENTS[symbol];
  if (!el) return null;
  return (
    <group ref={groupRef} position={[x, y + DROP_HEIGHT, 0]}>
      <ElementTile el={el} x={0} y={0} isSelected={false} onSelectElement={onRemove} />
    </group>
  );
}

function ReactantTab({
  slot, formula, active, onClick,
}: { slot: ReactantSlot; formula: string; active: boolean; onClick: () => void }) {
  const name = formula ? getMoleculeName(formula) : undefined;
  return (
    <button type="button" className={active ? 'tray-tab tray-tab-active' : 'tray-tab'} onClick={onClick}>
      <span className="tray-tab-label">Reactant {slot.toUpperCase()}</span>
      {formula && (
        <span className="tray-tab-value">
          {name ?? toSubscript(formula)}
          {name && <span className="tray-tab-formula">{toSubscript(formula)}</span>}
        </span>
      )}
    </button>
  );
}

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'metal', label: 'Metals' },
  { value: 'nonmetal', label: 'Nonmetals' },
  { value: 'noble-gas', label: 'Noble Gases' },
];

export interface ChamberAtomTrayProps {
  /** World-space anchor; the tray and its controls sit below this point
   * (same wall the periodic table itself is centered on). */
  center: [number, number, number];
  /** Same rotation passed to PeriodicTableRoom for this wall — the 3D card
   * stack needs to face the same way the table above it does, or the cards
   * read edge-on same as an unrotated table would. */
  rotation?: [number, number, number];
  activeSlot: ReactantSlot;
  cards: Record<ReactantSlot, TrayCard[]>;
  onSwitchSlot: (slot: ReactantSlot) => void;
  onRemoveCard: (slot: ReactantSlot, id: number) => void;
  liveGuess: string | null;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  reactantA: string;
  reactantB: string;
  category: CategoryFilter;
  onCategoryChange: (v: CategoryFilter) => void;
}

/**
 * The left wall's atom tray: every periodic-table click drops a card in here
 * (see ChamberRoom/PeriodicTableRoom's onSelectElement wiring). The card
 * stack is real 3D content on the wall; the tabs/chips/confirm controls are
 * a drei <Html> block anchored to the same wall (floats with the room as
 * you look around, rather than a screen-fixed overlay) — no search input
 * here by design, just the category filter, per explicit direction that a
 * search bar didn't belong on this panel. Purely presentational: tray
 * state, live-guess, and confirm handling all live in useChamberController
 * (App.tsx).
 */
// The table (PeriodicTableRoom) spans local y +2.4 (row 1, top) down to -2.4
// (row 10, the f-block overflow, bottom) around `center`. The filter chips
// sit just above the top row — grouped with the table itself, not down with
// the tray, which is a separate floating panel that has to clear the
// bottom edge with real margin or it (and the tray panel below it) sits
// right on top of the lanthanide/actinide rows, hiding both the table and
// any cards dropped there.
const FILTER_Y_OFFSET = 2.9;
const TRAY_Y_OFFSET = 3.4;
const PANEL_Y_OFFSET = 1.3;

export function ChamberAtomTray({
  center, rotation, activeSlot, cards, onSwitchSlot, onRemoveCard, liveGuess, busy, error, onConfirm, reactantA, reactantB,
  category, onCategoryChange,
}: ChamberAtomTrayProps) {
  const filterCenter: [number, number, number] = [center[0], center[1] + FILTER_Y_OFFSET, center[2]];
  const trayCenter: [number, number, number] = [center[0], center[1] - TRAY_Y_OFFSET, center[2]];
  const activeCards = cards[activeSlot];

  return (
    <>
      <Html position={filterCenter} center occlude={false} zIndexRange={[1, 1]}>
        <div className="category-filter-panel">
          <div className="category-filter">
            {CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={category === opt.value ? 'category-btn category-btn-active' : 'category-btn'}
                onClick={() => onCategoryChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Html>

      <group position={trayCenter} rotation={rotation}>
        {activeCards.map((card, i) => {
          const col = i % TRAY_COLS;
          const row = Math.floor(i / TRAY_COLS);
          return (
            <TrayCardMesh
              key={card.id}
              symbol={card.symbol}
              x={(col - (TRAY_COLS - 1) / 2) * SPACING}
              y={-row * SPACING}
              onRemove={() => onRemoveCard(activeSlot, card.id)}
            />
          );
        })}
      </group>

      <Html position={[trayCenter[0], trayCenter[1] - PANEL_Y_OFFSET, trayCenter[2]]} center occlude={false} zIndexRange={[1, 1]}>
        <div className="atom-tray-panel">
          <div className="atom-tray-tabs">
            <ReactantTab slot="a" formula={reactantA} active={activeSlot === 'a'} onClick={() => onSwitchSlot('a')} />
            <ReactantTab slot="b" formula={reactantB} active={activeSlot === 'b'} onClick={() => onSwitchSlot('b')} />
          </div>

          {/* Text list, not just the 3D cards on the wall above — guaranteed
           * visible regardless of where those cards land on screen. */}
          {activeCards.length === 0 ? (
            <p className="note">Click atoms on the wall to add them here.</p>
          ) : (
            <div className="atom-chips">
              {activeCards.map((card) => (
                <span key={card.id} className="atom-chip">
                  {card.symbol}
                  <button type="button" onClick={() => onRemoveCard(activeSlot, card.id)} aria-label={`Remove ${card.symbol}`}>×</button>
                </span>
              ))}
            </div>
          )}
          {liveGuess && <p className="tray-guess">{'→'} looks like {liveGuess}</p>}
          {error && <p className="note note-warn">{error}</p>}

          <button type="button" className="chip chip-accent" disabled={activeCards.length === 0 || busy} onClick={onConfirm}>
            {busy ? 'Asking Ion…' : `Set as Reactant ${activeSlot.toUpperCase()}`}
          </button>
        </div>
      </Html>
    </>
  );
}
