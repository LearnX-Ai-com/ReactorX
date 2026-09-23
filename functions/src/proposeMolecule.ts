import Anthropic from '@anthropic-ai/sdk';

export interface ProposedBond {
  a: number;
  b: number;
  type: 'covalent' | 'ionic';
  order: number;
}

export interface ProposedMolecule {
  possible: boolean;
  reason: string;
  formula: string;
  name: string;
  category: 'Element' | 'Compound';
  bonds: ProposedBond[];
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * The AI's entire job: given a fixed, indexed list of atoms, say whether a
 * real molecule exists with exactly that composition, and if so, which
 * atoms bond to which. It never proposes 3D positions or any executable
 * code — see moleculeLayout.ts, which computes geometry from the bond graph
 * this returns. Forced tool use + `strict: true` guarantees the shape;
 * composition/index validation happens in the caller (index.ts), not here.
 */
export async function proposeMolecule(atomList: string[]): Promise<ProposedMolecule> {
  const indexList = atomList.map((el, i) => `${i}: ${el}`).join(', ');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    system:
      'You are a chemistry structure engine for a K-12 education app. Given a fixed multiset of atoms, '
      + 'decide only whether a real, well-known, stable molecule exists with EXACTLY that composition '
      + '(not more, not fewer atoms) at standard conditions, and if so, its bond structure. Be conservative: '
      + 'if you are not confident the exact composition forms a real, stable, commonly-known molecule, set '
      + 'possible to false rather than guessing. Never invent atoms not in the given list, and never include '
      + 'more or fewer atoms in your formula than were given.',
    messages: [
      { role: 'user', content: `Atoms (index: element): ${indexList}` },
    ],
    tools: [
      {
        name: 'propose_molecule',
        description: 'State whether a real, stable, known molecule exists with exactly the given atoms, and if so, its structure.',
        strict: true,
        input_schema: {
          type: 'object',
          properties: {
            possible: { type: 'boolean', description: 'True only if a real, stable molecule with exactly this composition exists.' },
            reason: { type: 'string', description: 'One sentence: why this is (or is not) a real molecule.' },
            formula: { type: 'string', description: 'Standard chemical formula, e.g. "CH4". Must use exactly the given atoms, no more, no fewer. Empty string if not possible.' },
            name: { type: 'string', description: 'Common name, e.g. "Methane". Empty string if not possible.' },
            category: { type: 'string', enum: ['Element', 'Compound'] },
            bonds: {
              type: 'array',
              description: 'Every bond in the structure, referencing the given atom indices. Empty array if not possible.',
              items: {
                type: 'object',
                properties: {
                  a: { type: 'integer', description: 'Index of the first atom.' },
                  b: { type: 'integer', description: 'Index of the second atom.' },
                  type: { type: 'string', enum: ['covalent', 'ionic'] },
                  order: { type: 'integer', description: 'Shared electron pairs for covalent bonds (1, 2, or 3), or 1 for ionic.' },
                },
                required: ['a', 'b', 'type', 'order'],
                additionalProperties: false,
              },
            },
          },
          required: ['possible', 'reason', 'formula', 'name', 'category', 'bonds'],
          additionalProperties: false,
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'propose_molecule' },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );
  if (!toolUse) throw new Error('Model did not call propose_molecule');
  return toolUse.input as ProposedMolecule;
}
