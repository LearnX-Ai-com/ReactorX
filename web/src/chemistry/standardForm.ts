// A periodic-table click gives a bare atomic symbol, but chemistry happens
// between the actual species present at standard conditions — H2, O2, Cl2,
// not free H, O, Cl atoms. Only 7 elements are diatomic; everything else
// (metals, carbon, noble gases, ...) reacts as its bare symbol. This is
// settled chemistry, not something to ask an LLM.
const DIATOMIC = new Set(['H', 'N', 'O', 'F', 'Cl', 'Br', 'I']);

export function standardElementalForm(symbol: string): string {
  return DIATOMIC.has(symbol) ? `${symbol}2` : symbol;
}
