import { bondInfo, bondTypeLabel, formatOxidation, oxidationBySymbol } from '../chemistry/bonds';
import { ELEMENTS } from '../chemistry/elements';
import { formatIonLabel, molarMass, toSubscript } from '../chemistry/formulas';
import { MOLECULE_INFO } from '../chemistry/molecules';
import { getKnownMolecule, getMoleculeName } from '../chemistry/moleculeSource';
import type { Bond, BondType, ElementSymbol } from '../chemistry/types';

export type MoleculeFocus =
  | { kind: 'molecule'; formula: string }
  | { kind: 'bond'; formula: string; bondType: BondType; elementA: ElementSymbol; elementB: ElementSymbol; order: number };

function InfoChip({ children }: { children: React.ReactNode }) {
  return <span className="chip">{children}</span>;
}

function InspectButton({ symbol, onInspectElement }: { symbol: ElementSymbol; onInspectElement: (symbol: ElementSymbol) => void }) {
  return (
    <button type="button" className="chip molecule-card-inspect" onClick={() => onInspectElement(symbol)}>
      🔎 Inspect {symbol}
    </button>
  );
}

/**
 * The docked info panel for the chamber's molecule detail view (App.tsx's
 * MoleculeDetailOverlay, "Molecule" tab) — ported from the original
 * single-file prototype's showMoleculeCard/showBondCard, minus the on-wall
 * <Html> anchoring an earlier pass of this feature used (superseded: the
 * whole molecule now gets its own full-screen tabbed view, like the
 * original, rather than a small floating card in the 3D room). A molecule
 * with no hand-authored MOLECULE_INFO entry (an AI-discovered reaction
 * product) still gets a name via getMoleculeName, just without a fun fact —
 * never fabricated client-side.
 */
export function MoleculeOverview({ formula, onClose, onInspectElement }: {
  formula: string;
  /** Only rendered when provided — the full-screen detail view already has
   * its own top-level back button, so this stays unset there. */
  onClose?: () => void;
  onInspectElement: (symbol: ElementSymbol) => void;
}) {
  const def = getKnownMolecule(formula);
  const info = MOLECULE_INFO[formula];
  const name = getMoleculeName(formula) ?? toSubscript(formula);
  const category = info?.category ?? (def && def.atoms.length === 1 ? 'Element' : 'Compound');
  const hasBonds = !!def?.bonds.length;
  const oxidation = oxidationBySymbol(formula);
  // Unique elements in this molecule, in first-seen order — one Inspect
  // button per element (a single button for e.g. O2, one each for H2O).
  const elements = def ? Array.from(new Set(def.atoms.map((a) => a.el))) : [];

  return (
    <>
      {onClose && <button type="button" className="molecule-card-close" onClick={onClose} aria-label="Close">{'←'} Back to chamber</button>}
      <div className="molecule-card-formula">{toSubscript(formula)}</div>
      <div className="molecule-card-name">{name}</div>
      <div className="molecule-card-chips">
        <InfoChip>{category}</InfoChip>
        <InfoChip>{bondTypeLabel(formula)}</InfoChip>
      </div>
      {Object.keys(oxidation).length > 0 && (
        <div className="molecule-card-chips">
          {Object.entries(oxidation).map(([el, n]) => (
            <InfoChip key={el}>{el} {formatOxidation(n ?? 0)}</InfoChip>
          ))}
        </div>
      )}
      <div className="molecule-card-stat">
        <span>Molar mass</span>
        <strong>{molarMass(formula).toFixed(2)} g/mol</strong>
      </div>
      {info?.fact && <p className="molecule-card-fact">{info.fact}</p>}
      {hasBonds && <p className="molecule-card-hint">Click a bond in the model to see why it&apos;s {bondTypeLabel(formula).toLowerCase()}.</p>}
      {elements.length > 0 && (
        <div className="molecule-card-chips molecule-card-inspect-row">
          {elements.map((el) => <InspectButton key={el} symbol={el} onInspectElement={onInspectElement} />)}
        </div>
      )}
    </>
  );
}

export function BondDetail({ focus, onBack, onInspectElement }: {
  focus: Extract<MoleculeFocus, { kind: 'bond' }>;
  onBack: () => void;
  onInspectElement: (symbol: ElementSymbol) => void;
}) {
  const { formula, bondType, elementA, elementB, order } = focus;
  const info = bondInfo(bondType, elementA, elementB, order);
  const enA = ELEMENTS[elementA].en;
  const enB = ELEMENTS[elementB].en;

  return (
    <>
      <button type="button" className="molecule-card-close" onClick={onBack}>{'←'} {toSubscript(formula)} overview</button>
      <div className="molecule-card-formula">{info.title}</div>
      <div className="molecule-card-name">{info.kind}</div>
      <div className="molecule-card-chips">
        <InfoChip>{elementA} EN {enA != null ? enA.toFixed(2) : '—'}</InfoChip>
        <InfoChip>{elementB} EN {enB != null ? enB.toFixed(2) : '—'}</InfoChip>
      </div>
      <div className="molecule-card-chips">
        <InfoChip>{elementA} valence e⁻ {ELEMENTS[elementA].valence}</InfoChip>
        <InfoChip>{elementB} valence e⁻ {ELEMENTS[elementB].valence}</InfoChip>
      </div>
      <div className="molecule-card-stat">
        <span>EN difference</span>
        <strong>{info.diff}</strong>
      </div>
      <p className="molecule-card-fact">{info.body}</p>
      <div className="molecule-card-chips molecule-card-inspect-row">
        {Array.from(new Set([elementA, elementB])).map((el) => (
          <InspectButton key={el} symbol={el} onInspectElement={onInspectElement} />
        ))}
      </div>
    </>
  );
}

/**
 * The docked panel for the "Bond" tab (App.tsx's MoleculeDetailOverlay,
 * paired with three/BondStoryViewer's animated diagram) — the same
 * electronegativity-gap reasoning bondInfo() already gives per bond, plus
 * every atom's oxidation/ion state up front (formatIonLabel), since that's
 * exactly the "which way did the electrons go, and by how much" question
 * the animation is answering visually. oxidationBySymbol/bondInfo are both
 * derived purely from the molecule's own MoleculeDef (real bond type/order
 * decided once, at creation time — by the AI for an AI-discovered molecule,
 * BondStoryViewer/functions/proposeMolecule.ts's own doc comment — never
 * re-guessed or re-fetched here), so this needs no extra network request.
 */
export function BondStoryPanel({ formula }: { formula: string }) {
  const def = getKnownMolecule(formula);
  if (!def) return null;
  const name = getMoleculeName(formula) ?? toSubscript(formula);
  const oxidation = oxidationBySymbol(formula);

  // Distinct bond kinds only (H2O's two O-H bonds are identical) — keyed by
  // the sorted element pair + type + order, so a molecule with more than
  // one kind of bond (e.g. an ionic bond alongside a covalent one) still
  // gets an explanation for each, not just the first bond in the list.
  const seen = new Set<string>();
  const distinctBonds: { elementA: ElementSymbol; elementB: ElementSymbol; bondType: BondType; order: number }[] = [];
  def.bonds.forEach(([a, b, bondType, order]: Bond) => {
    const elementA = def.atoms[a].el;
    const elementB = def.atoms[b].el;
    const key = [elementA, elementB].slice().sort().join('-') + bondType + (order || 1);
    if (seen.has(key)) return;
    seen.add(key);
    distinctBonds.push({ elementA, elementB, bondType, order: order || 1 });
  });

  return (
    <>
      <div className="molecule-card-formula">{toSubscript(formula)}</div>
      <div className="molecule-card-name">{name} — electron transfer</div>
      {Object.keys(oxidation).length > 0 && (
        <div className="molecule-card-chips">
          {Object.entries(oxidation).map(([el, n]) => (
            <InfoChip key={el}>{formatIonLabel(el, n ?? 0)}</InfoChip>
          ))}
        </div>
      )}
      {distinctBonds.map((b) => {
        const info = bondInfo(b.bondType, b.elementA, b.elementB, b.order);
        return (
          <p key={`${b.elementA}-${b.elementB}-${b.bondType}-${b.order}`} className="molecule-card-fact">
            <strong>{info.title}:</strong> {info.body}
          </p>
        );
      })}
    </>
  );
}
