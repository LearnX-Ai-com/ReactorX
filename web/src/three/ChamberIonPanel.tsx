import { Html } from '@react-three/drei';
import { useState } from 'react';
import { toSubscript } from '../chemistry/formulas';
import { formatReactionType } from '../chemistry/reactions';
import type { Reaction } from '../chemistry/types';
import { IonChatBody } from '../ion/ChatBody';
import type { ChatContext } from '../ion/answers';
import type { ChamberPhase } from './ReactionChamber';

export interface ChamberIonPanelProps {
  /** World-space anchor on the right wall. */
  position: [number, number, number];
  reactantA: string;
  reactantB: string;
  reaction: Reaction | null;
  caption: string;
  phase: ChamberPhase;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

type InfoTab = 'info' | 'steps';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ion-info-cell">
      <span className="ion-info-label">{label}</span>
      <span className="ion-info-value">{value}</span>
    </div>
  );
}

/**
 * The right wall's "Learning Companion" — reaction info plus Ion's chat,
 * floating in the room as a drei <Html> block anchored to a 3D point (same
 * technique ElementPlaque.tsx uses), not a screen-docked panel. Always
 * visible, not click-to-open: matches SPEC.md's Wall 3. Wider and boxier
 * than the original narrow card, with an Info/Steps tab bar — Info shows a
 * property table (type, energy change, conditions, catalyst, reversible)
 * plus a "what's happening" writeup; Steps shows the ordered lab procedure
 * plus a safety callout when one applies. Every field shown is either
 * hand-authored (reactions.ts) or came back from the same AI call that
 * found the reaction (reactionApi.ts) — never invented client-side.
 */
export function ChamberIonPanel({ position, reactantA, reactantB, reaction, caption, phase, inputRef }: ChamberIonPanelProps) {
  const [tab, setTab] = useState<InfoTab>('info');
  const context: ChatContext = { kind: 'chamber', reactantA, reactantB, reaction };

  return (
    <Html position={position} center occlude={false} zIndexRange={[1, 1]}>
      <div className="ion-panel">
        <div className="ion-panel-header">Reaction Details</div>
        <div className="ion-panel-tabs">
          <button type="button" className={tab === 'info' ? 'ion-tab ion-tab-active' : 'ion-tab'} onClick={() => setTab('info')}>Info</button>
          <button type="button" className={tab === 'steps' ? 'ion-tab ion-tab-active' : 'ion-tab'} onClick={() => setTab('steps')}>Steps</button>
        </div>
        <div className="ion-panel-body">
          {tab === 'info' && (
            reaction ? (
              <>
                <div className="ion-info-grid">
                  <InfoRow label="Type" value={formatReactionType(reaction.type)} />
                  {reaction.energyChange && <InfoRow label="Energy Change" value={reaction.energyChange} />}
                  {reaction.conditions && <InfoRow label="Conditions" value={reaction.conditions} />}
                  {reaction.catalyst && <InfoRow label="Catalyst" value={reaction.catalyst} />}
                  {reaction.reversible != null && <InfoRow label="Reversible" value={reaction.reversible ? 'Yes' : 'No'} />}
                </div>
                <div className="ion-info-writeup-block">
                  <p className="ion-info-writeup-title">What&apos;s happening?</p>
                  <p className="ion-info-writeup">{reaction.whatsHappening || caption || reaction.note}</p>
                </div>
              </>
            ) : phase === 'checking' ? (
              <p className="note">Asking Ion whether {toSubscript(reactantA)} and {toSubscript(reactantB)} react…</p>
            ) : (
              <p className="note">
                {reactantA && reactantB
                  ? <>No reaction on file for {toSubscript(reactantA)} + {toSubscript(reactantB)} — {caption || "these don't react under normal conditions."}</>
                  : <>Build reactants on the left wall to try a combination.</>}
              </p>
            )
          )}
          {tab === 'steps' && (
            reaction ? (
              reaction.labSteps?.length ? (
                <>
                  {reaction.safetyNote && (
                    <p className="ion-safety-note">
                      <span className="ion-safety-icon">{'⚠'}</span> {reaction.safetyNote}
                    </p>
                  )}
                  <ol className="ion-steps-list">
                    {reaction.labSteps.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </>
              ) : (
                <p className="note">No lab procedure on file for this reaction yet.</p>
              )
            ) : (
              <p className="note">Pick reactants that react to see how it&apos;s performed.</p>
            )
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
