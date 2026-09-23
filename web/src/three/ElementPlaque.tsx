import { Html } from '@react-three/drei';
import { formatOxidation } from '../chemistry/bonds';
import { ATOMIC_NAMES, ELEMENTS } from '../chemistry/elements';
import type { ElementSymbol } from '../chemistry/types';

export interface ElementPlaqueProps {
  symbol: ElementSymbol;
  position: [number, number, number];
  onAskIon: () => void;
  onInspect: () => void;
}

/**
 * Museum-style signage anchored next to the atom in the room, rather than
 * information living only in the flat HUD panel — the point of "walk up
 * and see it" is that what you're looking at explains itself right there.
 * The two buttons are the plaque's real job: it's the launch point for the
 * two "go deeper" paths that already exist (Ion chat, full Inspect mode)
 * rather than a third thing to learn.
 */
export function ElementPlaque({ symbol, position, onAskIon, onInspect }: ElementPlaqueProps) {
  const el = ELEMENTS[symbol];
  return (
    <Html position={position} center occlude={false} zIndexRange={[1, 1]}>
      <div className="element-plaque">
        <div className="plaque-head">
          <span className="plaque-symbol">{symbol}</span>
          <div>
            <div className="plaque-name">{ATOMIC_NAMES[symbol]}</div>
            <div className="plaque-sub">Z={el.number} &middot; {el.category.replace(/-/g, ' ')}</div>
          </div>
        </div>
        <div className="plaque-row">
          <span>Mass</span>
          <span>{el.mass != null ? `${el.mass.toFixed(3)} u` : 'not settled'}</span>
        </div>
        <div className="plaque-row">
          <span>Config</span>
          <span>{el.config}</span>
        </div>
        <div className="plaque-row">
          <span>Oxidation</span>
          <span>{el.oxidation.length ? el.oxidation.map(formatOxidation).join(', ') : '—'}</span>
        </div>
        <div className="plaque-row">
          <span>Electroneg.</span>
          <span>{el.en != null ? el.en.toFixed(2) : 'not established'}</span>
        </div>
        <div className="plaque-row">
          <span>Position</span>
          <span>Period {el.period}{el.group != null ? ` · Group ${el.group}` : ''} · {el.block}-block</span>
        </div>
        <div className="plaque-row">
          <span>Valence</span>
          <span>{el.valence} electron{el.valence === 1 ? '' : 's'}</span>
        </div>
        {el.fact && <p className="plaque-fact">{'💡'} {el.fact}</p>}
        <div className="plaque-actions">
          <button type="button" className="plaque-btn" onClick={onAskIon}>{'💬'} Ask Ion</button>
          <button type="button" className="plaque-btn" onClick={onInspect}>{'🔎'} Inspect</button>
        </div>
      </div>
    </Html>
  );
}
