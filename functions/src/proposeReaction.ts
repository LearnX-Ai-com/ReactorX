import Anthropic from '@anthropic-ai/sdk';

export const REACTION_TYPES = [
  'Synthesis', 'Decomposition', 'Combustion', 'Oxidation', 'SingleDisplacement', 'DoubleDisplacement', 'AcidBase',
] as const;
export type ReactionTypeName = (typeof REACTION_TYPES)[number];

export const ENERGY_CHANGES = ['', 'Exothermic', 'Endothermic'] as const;
export type EnergyChangeName = (typeof ENERGY_CHANGES)[number];

export interface ProposedReaction {
  possible: boolean;
  reason: string;
  products: string[];
  type: ReactionTypeName;
  name: string;
  note: string;
  /** '' when not possible or genuinely unclear — never guessed. */
  energyChange: EnergyChangeName;
  /** Plain-language conditions, e.g. "Room temperature" — '' if not possible. */
  conditions: string;
  /** Catalyst name, or '' if none applies / not possible. */
  catalyst: string;
  reversible: boolean;
  /** 1-3 sentences: what the reactants/products are doing, and any visible
   * cue a student would observe. '' if not possible. */
  whatsHappening: string;
  /** Ordered lab procedure steps, empty array if not possible or if there's
   * no safe/practical way to demonstrate it in or near a school setting. */
  labSteps: string[];
  /** One-line safety callout — e.g. "Teacher demonstration only, toxic gas
   * produced." '' only when there's genuinely no notable hazard beyond
   * standard lab practice (safety glasses, etc.). */
  safetyNote: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * The AI's entire job: given two reactant formulas, say whether they react
 * under normal/well-known conditions and, if so, name the products (not
 * coefficients — chemistry/balance.ts solves the actual stoichiometry from
 * the identities returned here) plus a K-12-appropriate type/name/note.
 * Forced tool use + `strict: true` guarantees the shape; composition/balance
 * validation happens in the caller (index.ts), not here.
 */
export async function proposeReaction(a: string, b: string): Promise<ProposedReaction> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    system:
      'You are a chemistry reaction engine for a K-12 education app. Given two reactant formulas, decide '
      + 'whether they react with each other under normal, well-known conditions (room temperature/pressure, or '
      + 'a clearly common condition like combustion) to form real, stable, well-known products. Be conservative: '
      + "if you are not confident, or the reactants don't meaningfully react (e.g. two noble gases, or the "
      + 'products would be exotic/theoretical), set possible to false with a plain, student-friendly reason '
      + 'rather than guessing. When possible, give: the actual product formulas (their chemical identity, not '
      + 'stoichiometric coefficients); a K-12-appropriate reaction type; a short descriptive name (e.g. '
      + '"Formation of water" or "Rusting of iron"); a one-sentence factual note; whether it is exothermic or '
      + 'endothermic; plain-language conditions (e.g. "Room temperature" or "Needs an ignition source") — never a '
      + 'fabricated precise temperature or pressure figure you cannot back up, general well-known phrasing only; '
      + 'a catalyst name if one commonly applies, otherwise an empty string; whether the reaction is genuinely '
      + 'reversible under normal conditions (most are not — only mark true for a real, commonly-taught '
      + 'equilibrium reaction); a 1-3 sentence "what\'s happening" writeup covering what bonds break and '
      + 'form and any visible cue a student would actually observe (color change, gas released, flame, '
      + 'precipitate); ordered lab procedure steps a school could actually follow to observe this reaction — if '
      + "the real reaction isn't safe or practical for a school setting (toxic gas, explosive, requires "
      + 'industrial conditions), say so plainly in the first step and either describe it as a teacher-only '
      + 'demonstration with real safety measures (fume hood, safety screen, tongs, forceps — whatever genuinely '
      + 'applies) or suggest a safe, standard substitute/analog demo, rather than writing unsafe instructions for '
      + 'a student to follow themselves; and a one-line safety note flagging any real hazard (toxic gas, open '
      + "flame, reactive metal, bright light) — empty only when there's truly nothing beyond standard lab "
      + 'practice. Leave any field empty/false rather than guessing when you are not confident about it '
      + 'specifically, even if the reaction itself is real.',
    messages: [
      { role: 'user', content: `Reactant A: ${a}\nReactant B: ${b}` },
    ],
    tools: [
      {
        name: 'propose_reaction',
        description: 'State whether these two reactants react under normal conditions, and if so, the products.',
        strict: true,
        input_schema: {
          type: 'object',
          properties: {
            possible: { type: 'boolean', description: 'True only if these reactants genuinely react under normal/well-known conditions.' },
            reason: { type: 'string', description: 'One sentence: why they do (or do not) react.' },
            products: {
              type: 'array',
              description: 'Chemical formulas of the products (1 or 2), e.g. ["H2O"]. Empty array if not possible.',
              items: { type: 'string' },
            },
            type: { type: 'string', enum: REACTION_TYPES as unknown as string[] },
            name: { type: 'string', description: 'Short descriptive name, e.g. "Formation of water". Empty string if not possible.' },
            note: { type: 'string', description: 'One-sentence factual, student-friendly note. Empty string if not possible.' },
            energyChange: { type: 'string', enum: ENERGY_CHANGES as unknown as string[], description: 'Exothermic, Endothermic, or "" if not possible/not confident.' },
            conditions: { type: 'string', description: 'Plain-language conditions, e.g. "Room temperature" or "Needs an ignition source". Never a fabricated precise number. "" if not possible.' },
            catalyst: { type: 'string', description: 'Catalyst name if one commonly applies, else "".' },
            reversible: { type: 'boolean', description: 'True only for a real, commonly-taught equilibrium reaction. Most reactions are false.' },
            whatsHappening: { type: 'string', description: "1-3 sentences: what's happening at the bond level and any visible cue. \"\" if not possible." },
            labSteps: {
              type: 'array',
              description: 'Ordered lab procedure steps. If unsafe/impractical for a school, say so in step 1 and describe the real teacher-demonstration approach or a safe substitute instead — never unsafe instructions. Empty array if not possible.',
              items: { type: 'string' },
            },
            safetyNote: { type: 'string', description: 'One-line hazard callout, e.g. "Teacher demonstration only, toxic gas produced." "" only if there is no notable hazard.' },
          },
          required: [
            'possible', 'reason', 'products', 'type', 'name', 'note', 'energyChange', 'conditions', 'catalyst',
            'reversible', 'whatsHappening', 'labSteps', 'safetyNote',
          ],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'propose_reaction' },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) throw new Error('Model did not call propose_reaction');
  return toolUse.input as ProposedReaction;
}
