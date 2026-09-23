import { describe, expect, it } from 'vitest';
import { checkBalance } from './checkBalance';

describe('checkBalance', () => {
  it('flags 1:1:1 water formation as unbalanced', () => {
    const result = checkBalance(['H2', 'O2'], [1, 1], ['H2O'], [1]);
    expect(result.balanced).toBe(false);
    expect(result.tally.H).toEqual({ left: 2, right: 2, balanced: true });
    expect(result.tally.O).toEqual({ left: 2, right: 1, balanced: false });
  });

  it('confirms 2:1:2 water formation as balanced', () => {
    const result = checkBalance(['H2', 'O2'], [2, 1], ['H2O'], [2]);
    expect(result.balanced).toBe(true);
  });

  it('confirms the Haber process at 1:3:2', () => {
    const result = checkBalance(['N2', 'H2'], [1, 3], ['NH3'], [2]);
    expect(result.balanced).toBe(true);
  });

  it('flags a wrong guess for the Haber process', () => {
    const result = checkBalance(['N2', 'H2'], [1, 1], ['NH3'], [1]);
    expect(result.balanced).toBe(false);
    expect(result.tally.H.balanced).toBe(false);
  });
});
