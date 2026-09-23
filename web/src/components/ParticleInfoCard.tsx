import { formatOxidation } from '../chemistry/bonds';
import { ATOMIC_NAMES, ELEMENTS } from '../chemistry/elements';
import type { ElementSymbol } from '../chemistry/types';
import type { BohrSceneState } from '../three/BohrAtom';

interface Explanation {
  title: string;
  body: string;
  /** Universal physics — the same formula for every atom, shown distinctly
   * from the element-specific `body` text above it. */
  formula?: string;
  formulaNote?: string;
}

function explain(symbol: ElementSymbol, state: BohrSceneState): Explanation {
  const el = ELEMENTS[symbol];
  const name = ATOMIC_NAMES[symbol];

  if (state.mode === 'quark' && state.nucleonType) {
    const isProton = state.nucleonType === 'proton';
    return {
      title: isProton ? 'Inside a proton' : 'Inside a neutron',
      body: isProton
        ? '2 up quarks + 1 down quark (charges +⅔, +⅔, −⅓ = +1 overall). Gluons carry the strong force holding them together.'
        : '1 up quark + 2 down quarks (charges +⅔, −⅓, −⅓ = 0 overall). The same strong force holds these together too.',
    };
  }

  if (state.mode === 'atom' || !state.type) {
    return {
      title: name,
      body: `${el.number} protons, ${el.neutrons ?? '?'} neutrons, ${el.number} electrons. Tap a particle or a shell ring to find out what it does.`,
    };
  }

  if (state.type === 'proton') {
    return {
      title: 'Proton · charge +1',
      body: `One of ${el.number} protons in ${name}'s nucleus. Protons define the element itself — change this count and it's a different element entirely.`,
    };
  }

  if (state.type === 'neutron') {
    if (state.isGhost) {
      return {
        title: 'No neutron here',
        body: `${symbol}-${el.number} is the lightest possible isotope — zero neutrons. Add one and you'd have a heavier isotope of the same element.`,
      };
    }
    return {
      title: 'Neutron · no charge',
      body: `One of ${el.neutrons ?? '?'} neutrons in this isotope. Neutrons add mass without changing which element this is — different neutron counts make different isotopes of the same atom.`,
    };
  }

  if (state.type === 'electron') {
    const valenceNote = state.isValence
      ? (() => {
        const states = el.oxidation.length ? el.oxidation.map(formatOxidation).join(' or ') : 'ions';
        return `One of ${name}'s ${el.valence} valence electron${el.valence === 1 ? '' : 's'} — the outermost electrons that actually do the work in chemical bonding. This is why ${symbol} tends to form ${states}.`;
      })()
      : 'An inner-shell electron — held closer to the nucleus and not directly involved in bonding. Only the outermost (valence) shell does that.';
    return {
      title: `Electron · ${state.letter} shell${state.isValence ? ' (valence)' : ''}`,
      body: valenceNote,
      formula: 'E = hν',
      formulaNote: 'Electrons don’t drift between shells — they jump in fixed steps. Dropping to a lower shell releases a photon of light with exactly this much energy; climbing up means absorbing one of exactly that energy. Same rule for every atom — it’s what makes each element glow its own distinct colors.',
    };
  }

  if (state.type === 'shell') {
    const count = state.electronCount ?? 0;
    const n = (state.shellIndex ?? 0) + 1;
    const capacity = 2 * n * n;
    const role = state.isValence
      ? `This is ${name}'s outermost occupied shell — the one that determines how it bonds with other atoms.`
      : 'An inner shell — stable and not involved in bonding.';
    return {
      title: `${state.letter} shell (n=${n})${state.isValence ? ' · valence' : ''}`,
      body: `Holds ${count} of a possible ${capacity} electron${capacity === 1 ? '' : 's'} here. ${role}`,
      formula: `max = 2n² = 2×${n}² = ${capacity}`,
      formulaNote: 'Every shell in every atom follows this same rule — it’s just geometry/quantum mechanics, not something specific to this element.',
    };
  }

  return { title: name, body: '' };
}

export interface ParticleInfoCardProps {
  symbol: ElementSymbol;
  state: BohrSceneState;
  onEnterQuark: (nucleonType: 'proton' | 'neutron') => void;
  onExitQuark: () => void;
  onTriggerJump: () => void;
  jumpDisabled?: boolean;
}

/** The contextual explanation card in Inspect mode — changes with whatever
 * particle/shell is currently selected, framed around *why it matters
 * chemically* rather than just naming it. Shell/electron selections also
 * surface the underlying universal physics (2n² shell capacity, E=hν
 * photon emission) — the same formula for every atom, not element-specific
 * data, so it's safe to state outright rather than needing to be sourced
 * per element. Also the only place the atom's quark drill-down (already
 * built into BohrAtomHandle) is actually reachable. */
export function ParticleInfoCard({ symbol, state, onEnterQuark, onExitQuark, onTriggerJump, jumpDisabled }: ParticleInfoCardProps) {
  const { title, body, formula, formulaNote } = explain(symbol, state);
  const canZoomQuarks = state.mode === 'particle' && (state.type === 'proton' || state.type === 'neutron') && !state.isGhost;
  const canJump = state.mode === 'particle' && state.type === 'electron' && ELEMENTS[symbol].shells.length > 1;

  return (
    <div className="particle-card">
      <div className="particle-card-title">{title}</div>
      {body && <p className="particle-card-body">{body}</p>}
      {formula && (
        <div className="particle-card-formula-block">
          <div className="particle-card-formula">{formula}</div>
          {formulaNote && <p className="particle-card-formula-note">{formulaNote}</p>}
        </div>
      )}
      {canJump && (
        <button type="button" className="chip chip-accent" disabled={jumpDisabled} onClick={onTriggerJump}>
          {'▶'} Show energy jump
        </button>
      )}
      {canZoomQuarks && (
        <button type="button" className="chip chip-accent" onClick={() => onEnterQuark(state.type as 'proton' | 'neutron')}>
          {'⚛️'} Zoom into quarks
        </button>
      )}
      {state.mode === 'quark' && (
        <button type="button" className="chip" onClick={onExitQuark}>{'←'} Back to atom</button>
      )}
    </div>
  );
}
