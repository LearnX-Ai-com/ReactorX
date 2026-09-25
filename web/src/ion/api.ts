import { bondList, bondTypeLabel, oxidationBySymbol } from '../chemistry/bonds';
import { ATOMIC_NAMES, ELEMENTS } from '../chemistry/elements';
import { molarMass } from '../chemistry/formulas';
import { MOLECULE_INFO } from '../chemistry/molecules';
import { getKnownMolecule, getMoleculeName } from '../chemistry/moleculeSource';
import type { ChatContext } from './answers';

const BASE_URL = import.meta.env.VITE_FUNCTIONS_URL ?? 'http://localhost:8787';

// Mirrors functions/src/proposeIonAnswer.ts's IonAnswerContext — duplicated
// by hand (same convention as chemistry/formula.ts/balance.ts) since that's
// a separate deployable unit. Built from the client's own ChatContext (and,
// for elements, ELEMENTS[symbol] — the same static data the Info panels
// already read) rather than having the server re-derive or re-fetch
// anything, so Ion's answer is always grounded in exactly what's on screen.
function buildRequestContext(ctx: ChatContext): unknown {
  if (ctx.kind === 'chamber') {
    return {
      kind: 'chamber',
      reactantA: ctx.reactantA,
      reactantB: ctx.reactantB,
      reaction: ctx.reaction && {
        name: ctx.reaction.name,
        type: ctx.reaction.type,
        products: ctx.reaction.products,
        note: ctx.reaction.note,
        energyChange: ctx.reaction.energyChange,
        conditions: ctx.reaction.conditions,
        catalyst: ctx.reaction.catalyst,
        reversible: ctx.reaction.reversible,
        whatsHappening: ctx.reaction.whatsHappening,
        labSteps: ctx.reaction.labSteps,
        safetyNote: ctx.reaction.safetyNote,
      },
    };
  }
  if (ctx.kind === 'elements') {
    const el = ELEMENTS[ctx.symbol];
    return {
      kind: 'elements',
      symbol: ctx.symbol,
      element: {
        name: ATOMIC_NAMES[ctx.symbol] ?? ctx.symbol,
        number: el.number,
        mass: el.mass,
        config: el.config,
        oxidation: el.oxidation,
        en: el.en ?? null,
        period: el.period,
        group: el.group,
        block: el.block,
        category: el.category,
        valence: el.valence,
        fact: el.fact,
      },
    };
  }
  if (ctx.kind === 'molecule') {
    const { formula } = ctx;
    const info = MOLECULE_INFO[formula];
    const def = getKnownMolecule(formula);
    const category = info?.category ?? (def && def.atoms.length === 1 ? 'Element' : 'Compound');
    return {
      kind: 'molecule',
      molecule: {
        formula,
        name: getMoleculeName(formula) ?? formula,
        category: `${category} (${bondTypeLabel(formula)})`,
        molarMass: molarMass(formula),
        bonds: bondList(formula),
        oxidation: Object.entries(oxidationBySymbol(formula)).map(([symbol, state]) => ({ symbol, state: state ?? 0 })),
        fact: info?.fact,
      },
    };
  }
  return { kind: 'none' };
}

/** Calls the /ion/ask endpoint (functions/src/index.ts + proposeIonAnswer.ts)
 * for a real, grounded AI answer instead of the scripted keyword matcher in
 * answers.ts. Throws on any failure — the caller (ChatBody.tsx) falls back
 * to the scripted answerer rather than showing an error, so a network
 * hiccup degrades gracefully instead of leaving Ion silent. */
export async function askIon(question: string, context: ChatContext): Promise<string> {
  const res = await fetch(`${BASE_URL}/ion/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context: buildRequestContext(context) }),
  });
  const body = await res.json().catch(() => null);
  if (res.ok && body?.status === 'ok' && typeof body.answer === 'string') {
    return body.answer;
  }
  throw new Error(body?.message ?? `Ion's answer failed (${res.status})`);
}
