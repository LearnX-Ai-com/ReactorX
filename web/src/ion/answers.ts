import { bondList, formatOxidation, oxidationBySymbol } from '../chemistry/bonds';
import { ELEMENTS } from '../chemistry/elements';
import { toSubscript } from '../chemistry/formulas';
import type { ElementSymbol, Reaction } from '../chemistry/types';

export type ChatContext =
  | { kind: 'chamber'; reactantA: string; reactantB: string; reaction: Reaction | null }
  | { kind: 'elements'; symbol: ElementSymbol }
  | { kind: 'none' };

/**
 * Ion's answers are scripted keyword matching over the app's own chemistry
 * data — the same approach the original chamber's Ion used, and consistent
 * with keeping AI out of anything the app can already compute deterministically.
 * A real LLM can slot in later without changing this function's contract
 * (context in, string out).
 */
export function answerIonQuestion(question: string, ctx: ChatContext): string {
  const q = question.toLowerCase();

  if (ctx.kind === 'none') {
    return "I'm not sure what we're looking at right now — head into the chamber or the atom explorer and ask me again.";
  }

  if (ctx.kind === 'elements') {
    const el = ELEMENTS[ctx.symbol];
    if (q.includes('fact') || q.includes('interesting') || q.includes('fun') || q.includes('cool')) {
      return el.fact ?? `I don't have a fun fact on file for ${ctx.symbol} yet — ask me about its electron configuration, oxidation states, mass, or electronegativity instead.`;
    }
    if (q.includes('electroneg')) {
      return el.en != null
        ? `${ctx.symbol}'s electronegativity is ${el.en.toFixed(2)} on the Pauling scale — how strongly it pulls on shared electrons in a bond.`
        : `${ctx.symbol} doesn't have an established electronegativity value — that's true of the noble gases and most of the heaviest elements in real reference tables too, not just here.`;
    }
    if (q.includes('oxidat') || q.includes('charge')) {
      return el.oxidation.length
        ? `${ctx.symbol} commonly forms ${el.oxidation.map(formatOxidation).join(', ')} ions.`
        : `${ctx.symbol} doesn't have a well-established common oxidation state on file.`;
    }
    if (q.includes('config') || q.includes('electron')) {
      return `${ctx.symbol}'s electron configuration is ${el.config}, with ${el.valence} electron${el.valence === 1 ? '' : 's'} in its outermost shell.`;
    }
    if (q.includes('mass') || q.includes('weight')) {
      return el.mass != null ? `${ctx.symbol}'s standard atomic mass is about ${el.mass.toFixed(3)} u.` : `${ctx.symbol} is synthetic/superheavy — no settled standard atomic mass to cite.`;
    }
    if (q.includes('categor') || q.includes('type') || q.includes('metal')) {
      return `${ctx.symbol} is classified as a ${el.category.replace(/-/g, ' ')}.`;
    }
    if (q.includes('period') || q.includes('group') || q.includes('block') || q.includes('position') || q.includes('where')) {
      return `${ctx.symbol} sits in period ${el.period}${el.group != null ? `, group ${el.group}` : ''}, in the ${el.block}-block of the table.`;
    }
    return `${ctx.symbol}, atomic number ${el.number}. Ask me about its electron configuration, oxidation states, mass, electronegativity, position on the table, or a fun fact.`;
  }

  // kind === 'chamber'
  if (!ctx.reaction) {
    return "I don't have a reaction on file for this pair yet — try a different combination, or ask me about the elements individually in the atom explorer.";
  }
  const { reaction, reactantA, reactantB } = ctx;

  if (q.includes('bond')) {
    const bonds = Array.from(new Set([reactantA, reactantB, ...reaction.products].flatMap((f) => bondList(f))));
    return bonds.length
      ? `The bonds in play here: ${bonds.join(', ')}.`
      : 'These are single atoms on both sides — no bonds to speak of yet.';
  }
  if (q.includes('oxidat') || q.includes('electron') || q.includes('charge')) {
    const states = [reactantA, reactantB, ...reaction.products].flatMap((f) => {
      const bySymbol = oxidationBySymbol(f);
      return Object.entries(bySymbol).map(([el, n]) => `${el} is ${formatOxidation(n ?? 0)} in ${toSubscript(f)}`);
    });
    return states.length ? states.join('; ') + '.' : "I can't derive oxidation states without at least one polar or ionic bond here.";
  }
  if (q.includes('type') || q.includes('kind') || q.includes('what is this')) {
    return `This is a ${reaction.type.toLowerCase()} reaction: ${reaction.name}.`;
  }
  if (q.includes('balanc')) {
    return `The balanced equation is ${toSubscript(reactantA)} + ${toSubscript(reactantB)} → ${reaction.products.map(toSubscript).join(' + ')} once the coefficients line up — use the "Show solution" button if you want me to fill them in.`;
  }
  return reaction.note;
}
