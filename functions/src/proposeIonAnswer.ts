import Anthropic from '@anthropic-ai/sdk';

// Mirrors (a subset of) web/src/ion/answers.ts's ChatContext — this is a
// separate deployable unit (see formula.ts/balance.ts's identical
// "duplicated by hand" convention) and has no access to web/src's chemistry
// data files at all, so the client sends whatever grounding facts it
// already has on screen (the exact same reaction/element data the Info
// panels show) rather than the server re-deriving or re-fetching them —
// keeps the AI's answer consistent with what the student is actually
// looking at, not a possibly-different re-lookup.
export interface IonAnswerContext {
  kind: 'chamber' | 'elements' | 'molecule' | 'none';
  reactantA?: string;
  reactantB?: string;
  reaction?: {
    name: string;
    type: string;
    products: string[];
    note: string;
    energyChange?: string;
    conditions?: string;
    catalyst?: string;
    reversible?: boolean;
    whatsHappening?: string;
    labSteps?: string[];
    safetyNote?: string;
  } | null;
  symbol?: string;
  element?: {
    name: string;
    number: number;
    mass: number | null;
    config: string;
    oxidation: number[];
    en: number | null;
    period: number;
    group: number | null;
    block: string;
    category: string;
    valence: number;
    fact?: string;
  };
  molecule?: {
    formula: string;
    name: string;
    category: string;
    molarMass: number;
    bonds: string[];
    oxidation: { symbol: string; state: number }[];
    fact?: string;
  };
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildGrounding(context: IonAnswerContext): string {
  if (context.kind === 'chamber') {
    if (!context.reaction) {
      return `The student is in the reaction chamber with reactants ${context.reactantA || '(none picked)'} and ${context.reactantB || '(none picked)'} — no known reaction has been found for this pair yet.`;
    }
    const r = context.reaction;
    const facts = [
      `Reaction: ${context.reactantA} + ${context.reactantB} -> ${r.products.join(' + ')} ("${r.name}", a ${r.type} reaction).`,
      r.note && `Note: ${r.note}`,
      r.energyChange && `Energy change: ${r.energyChange}`,
      r.conditions && `Conditions required: ${r.conditions}`,
      r.catalyst && `Catalyst: ${r.catalyst}`,
      r.reversible != null && `Reversible: ${r.reversible ? 'yes' : 'no'}`,
      r.whatsHappening && `What's happening: ${r.whatsHappening}`,
      r.labSteps?.length && `Lab procedure: ${r.labSteps.join(' ')}`,
      r.safetyNote && `Safety note: ${r.safetyNote}`,
    ].filter(Boolean);
    return `The student is looking at this reaction in the chamber:\n${facts.join('\n')}`;
  }
  if (context.kind === 'elements' && context.element) {
    const el = context.element;
    const facts = [
      `Element: ${el.name} (${context.symbol}), atomic number ${el.number}.`,
      `Category: ${el.category.replace(/-/g, ' ')}, period ${el.period}${el.group != null ? `, group ${el.group}` : ''}, ${el.block}-block.`,
      `Standard atomic mass: ${el.mass != null ? `${el.mass.toFixed(3)} u` : 'not established (synthetic/superheavy)'}.`,
      `Electron configuration: ${el.config}, with ${el.valence} valence electron${el.valence === 1 ? '' : 's'}.`,
      `Common oxidation states: ${el.oxidation.length ? el.oxidation.join(', ') : 'none well-established'}.`,
      `Electronegativity (Pauling): ${el.en != null ? el.en.toFixed(2) : 'not established'}.`,
      el.fact && `Fun fact on file: ${el.fact}`,
    ].filter(Boolean);
    return `The student is looking at this element:\n${facts.join('\n')}`;
  }
  if (context.kind === 'molecule' && context.molecule) {
    const m = context.molecule;
    const facts = [
      `Molecule: ${m.name} (${m.formula}).`,
      `Category: ${m.category}.`,
      `Molar mass: ${m.molarMass.toFixed(2)} g/mol.`,
      m.bonds.length > 0 && `Bonds: ${m.bonds.join(', ')}.`,
      m.oxidation.length > 0 && `Oxidation states: ${m.oxidation.map((o) => `${o.symbol} is ${o.state > 0 ? '+' : ''}${o.state}`).join(', ')}.`,
      m.fact && `Fun fact on file: ${m.fact}`,
    ].filter(Boolean);
    return `The student is looking at this molecule (they can also tap one of its elements to zoom into that atom):\n${facts.join('\n')}`;
  }
  return 'The student is not currently looking at a specific reaction, element, or molecule.';
}

/**
 * Ion's AI-backed chat answer — replaces the old purely-scripted keyword
 * matcher (web/src/ion/answers.ts, kept as an offline/error fallback) with
 * a real model call, grounded in whatever reaction/element data the client
 * already has on screen. Short, K-12-appropriate answers; free to draw on
 * general chemistry knowledge beyond the grounding facts (that's the whole
 * point of wiring this up to a real model), but instructed to stay
 * consistent with the given facts rather than contradicting them.
 */
export async function proposeIonAnswer(question: string, context: IonAnswerContext): Promise<string> {
  const grounding = buildGrounding(context);
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    system:
      "You are Ion, a friendly, encouraging chemistry-tutor character inside ReactorX, a K-12 chemistry app. "
      + 'A student is asking you a question while looking at a specific reaction or element in the app — some '
      + 'established facts about exactly what they\'re looking at are given below; ground your answer in them '
      + "rather than contradicting them, but you're free to draw on your own general chemistry knowledge for "
      + 'anything they don\'t cover. Keep answers short (1-4 sentences), warm, and pitched at a K-12 student — '
      + 'simple language, no unexplained jargon. If the question is off-topic (not chemistry-related), gently '
      + 'steer back to the subject rather than answering it directly.',
    messages: [
      { role: 'user', content: `${grounding}\n\nStudent's question: ${question}` },
    ],
  });
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );
  const answer = textBlock?.text.trim();
  if (!answer) throw new Error('Model returned no text');
  return answer;
}
