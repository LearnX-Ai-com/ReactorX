import { Html } from '@react-three/drei';
import { formatOxidation } from '../chemistry/bonds';
import { ATOMIC_NAMES, ELEMENTS } from '../chemistry/elements';
import type { ElementSymbol } from '../chemistry/types';
import { IonChatBody } from '../ion/ChatBody';
import type { ChatContext } from '../ion/answers';

export interface ElementIonPanelProps {
  /** World-space anchor on the right wall. */
  position: [number, number, number];
  symbol: ElementSymbol;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ion-info-cell">
      <span className="ion-info-label">{label}</span>
      <span className="ion-info-value">{value}</span>
    </div>
  );
}

/**
 * The elements room's right wall — same wall-anchored, always-visible
 * pattern as ChamberIonPanel.tsx (a persistent drei <Html> block, not a
 * click-to-open panel), just carrying element data instead of reaction
 * data. No tab bar yet: there's no "Steps"-equivalent second view for an
 * element the way a reaction has a lab procedure, so this is a single
 * info block. Content is exactly what ElementPlaque.tsx used to show
 * (mass, config, oxidation, electronegativity, position, valence, fun
 * fact) — that component is retired now that this wall carries the same
 * information plus the always-on chat, in the room itself rather than a
 * plaque floating next to the atom.
 */
export function ElementIonPanel({ position, symbol, inputRef }: ElementIonPanelProps) {
  const el = ELEMENTS[symbol];
  const context: ChatContext = { kind: 'elements', symbol };

  return (
    <Html position={position} center occlude={false} zIndexRange={[1, 1]}>
      <div className="ion-panel">
        <div className="ion-panel-header">
          {ATOMIC_NAMES[symbol]} ({symbol})
        </div>
        <div className="ion-panel-body">
          <div className="ion-info-grid">
            <InfoRow label="Atomic Number" value={String(el.number)} />
            <InfoRow label="Mass" value={el.mass != null ? `${el.mass.toFixed(3)} u` : 'not settled'} />
            <InfoRow label="Config" value={el.config} />
            <InfoRow label="Oxidation" value={el.oxidation.length ? el.oxidation.map(formatOxidation).join(', ') : '—'} />
            <InfoRow label="Electroneg." value={el.en != null ? el.en.toFixed(2) : 'not established'} />
            <InfoRow label="Position" value={`Period ${el.period}${el.group != null ? ` · Group ${el.group}` : ''} · ${el.block}-block`} />
            <InfoRow label="Valence" value={`${el.valence} electron${el.valence === 1 ? '' : 's'}`} />
            <InfoRow label="Category" value={el.category.replace(/-/g, ' ')} />
          </div>
          {el.fact && (
            <div className="ion-info-writeup-block">
              <p className="ion-info-writeup-title">Fun fact</p>
              <p className="ion-info-writeup">{el.fact}</p>
            </div>
          )}

          <div className="ion-panel-chat-header">
            <span className="ion-dot" />
            <span>Ion &middot; Chemistry Tutor</span>
          </div>
          <IonChatBody context={context} inputRef={inputRef} />
        </div>
      </div>
    </Html>
  );
}
