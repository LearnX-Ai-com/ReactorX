import { describe, expect, it } from 'vitest';
import { balanceEquation } from './balance';
import { REACTIONS } from './reactions';

describe('balanceEquation', () => {
  it('balances water formation 2H2 + O2 -> 2H2O', () => {
    const result = balanceEquation(['H2', 'O2'], ['H2O']);
    expect(result).toEqual({ coeffs: [2, 1, 2], total: 5 });
  });

  it('balances the Haber process N2 + 3H2 -> 2NH3', () => {
    const result = balanceEquation(['N2', 'H2'], ['NH3']);
    expect(result).toEqual({ coeffs: [1, 3, 2], total: 6 });
  });

  it('balances methane combustion CH4 + 2O2 -> CO2 + 2H2O', () => {
    const result = balanceEquation(['CH4', 'O2'], ['CO2', 'H2O']);
    expect(result).toEqual({ coeffs: [1, 2, 1, 2], total: 6 });
  });

  it('leaves an already-balanced equation at 1:1:1', () => {
    const result = balanceEquation(['C', 'O2'], ['CO2']);
    expect(result).toEqual({ coeffs: [1, 1, 1], total: 3 });
  });

  it('balances every reaction in the chamber data set', () => {
    for (const r of REACTIONS) {
      const result = balanceEquation([r.a, r.b], r.products);
      expect(result, `${r.a} + ${r.b} -> ${r.products.join(' + ')}`).not.toBeNull();
    }
  });
});
