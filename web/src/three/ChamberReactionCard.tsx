import { Html } from '@react-three/drei';
import { formatReactionType } from '../chemistry/reactions';
import type { Reaction } from '../chemistry/types';
import type { ChamberPhase } from './ReactionChamber';

export interface ChamberReactionCardProps {
  /** World-space anchor, close above the reacting molecule cluster (not
   * high overhead) so it's visible without looking up — see ChamberRoom.tsx. */
  position: [number, number, number];
  reaction: Reaction;
  caption: string;
  phase: ChamberPhase;
}

/**
 * A single line of text floating just above the reaction — not a bordered
 * info card, just text drifting up and fading in. While the reaction is
 * actually playing, this narrates the mechanism (the live caption:
 * "Breaking bonds…", "Forming bonds…"); once it settles, the line becomes
 * the reaction's name + type (e.g. "Formation of water · Synthesis") and
 * stays there — the "what was that called" recap, not just the blow-by-blow.
 * Keying the line on its own text makes React remount it whenever it
 * changes, re-triggering the float/fade-in for each new line.
 */
export function ChamberReactionCard({ position, reaction, caption, phase }: ChamberReactionCardProps) {
  // Catalyst is part of the reaction's own static description, so it only
  // rides along with the settled states (idle before reacting, done after)
  // — not mid-animation, where the line is narrating the collision itself.
  const catalystNote = reaction.catalyst ? ` — catalyst: ${reaction.catalyst}` : '';
  const base = phase === 'done' ? `${reaction.name} · ${formatReactionType(reaction.type)}` : (caption || reaction.note);
  const text = phase === 'done' || phase === 'idle' ? `${base}${catalystNote}` : base;
  return (
    <Html position={position} center occlude={false} zIndexRange={[1, 1]}>
      <p key={text} className="reaction-sky-text">{text}</p>
    </Html>
  );
}
