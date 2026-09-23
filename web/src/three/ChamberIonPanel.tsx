import { Html } from '@react-three/drei';
import { toSubscript } from '../chemistry/formulas';
import type { Reaction } from '../chemistry/types';
import { IonChatBody } from '../ion/ChatBody';
import type { ChatContext } from '../ion/answers';

export interface ChamberIonPanelProps {
  /** World-space anchor on the right wall. */
  position: [number, number, number];
  reactantA: string;
  reactantB: string;
  reaction: Reaction | null;
  caption: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * The right wall's "Learning Companion" — reaction info plus Ion's chat,
 * floating in the room as a drei <Html> block anchored to a 3D point (same
 * technique ElementPlaque.tsx uses), not a screen-docked panel. Always
 * visible, not click-to-open: matches SPEC.md's Wall 3. Shows only data
 * that already exists on Reaction (type/note) — no invented energy or
 * conditions fields.
 */
export function ChamberIonPanel({ position, reactantA, reactantB, reaction, caption, inputRef }: ChamberIonPanelProps) {
  const context: ChatContext = { kind: 'chamber', reactantA, reactantB, reaction };
  return (
    <Html position={position} center occlude={false} zIndexRange={[1, 1]}>
      <div className="ion-float-panel">
        <div className="panel-header">
          <span className="panel-header-icon">{'📖'}</span>
          <span>Reaction Details</span>
        </div>
        {reaction ? (
          <div className="reaction-details">
            <div className="detail-row"><span>Type</span><span>{reaction.type}</span></div>
            <p className="detail-note">{caption || reaction.note}</p>
          </div>
        ) : (
          <p className="note">
            No reaction on file yet for {toSubscript(reactantA)} + {toSubscript(reactantB)} — build reactants on
            the left wall to try another combination.
          </p>
        )}

        <div className="panel-header panel-header-chat">
          <span className="ion-dot" />
          <span>Ion &middot; Chemistry Tutor</span>
        </div>
        <IonChatBody context={context} inputRef={inputRef} />
      </div>
    </Html>
  );
}
