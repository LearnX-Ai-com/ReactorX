import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../chemistry/elements';
import { toSubscript } from '../chemistry/formulas';
import { ease } from './math';
import { ElementTile } from './PeriodicTableRoom';

export interface TrayCard {
  id: number;
  symbol: string;
}

export type ReactantSlot = 'a' | 'b';

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
}

/**
 * The left wall's atom tray: every periodic-table click drops a card in here
 * (see ChamberRoom/PeriodicTableRoom's onSelectElement wiring); this
 * component is purely presentational — the tray contents, live-guess text,
 * and confirm handling all live in useChamberController (App.tsx), matching
 * how the rest of the room's state is owned by the controller, not by
 * three/ components.
 */
export function ChamberAtomTray({
  center, rotation, activeSlot, cards, onSwitchSlot, onRemoveCard, liveGuess, busy, error, onConfirm, reactantA, reactantB,
}: ChamberAtomTrayProps) {
  const trayCenter: [number, number, number] = [center[0], center[1] - 1.9, center[2]];
  const activeCards = cards[activeSlot];

  return (
    <>
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

      <Html position={[trayCenter[0], trayCenter[1] - 1.1, trayCenter[2]]} center occlude={false} zIndexRange={[1, 1]}>
        <div className="atom-tray-panel">
          <div className="atom-tray-tabs">
            <button
              type="button"
              className={activeSlot === 'a' ? 'tray-tab tray-tab-active' : 'tray-tab'}
              onClick={() => onSwitchSlot('a')}
            >
              Reactant A{reactantA ? ` — ${toSubscript(reactantA)}` : ''}
            </button>
            <button
              type="button"
              className={activeSlot === 'b' ? 'tray-tab tray-tab-active' : 'tray-tab'}
              onClick={() => onSwitchSlot('b')}
            >
              Reactant B{reactantB ? ` — ${toSubscript(reactantB)}` : ''}
            </button>
          </div>

          {activeCards.length === 0 && <p className="note">Click atoms on the wall to add them here.</p>}
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
