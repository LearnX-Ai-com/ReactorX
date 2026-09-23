import { describe, expect, it } from 'vitest';
import { molarMass, parseFormula, toSubscript } from './formulas';

describe('parseFormula', () => {
  it('parses multi-element formulas with counts', () => {
    expect(parseFormula('CH4')).toEqual({ C: 1, H: 4 });
    expect(parseFormula('Fe2O3')).toEqual({ Fe: 2, O: 3 });
  });

  it('defaults an absent count to 1', () => {
    expect(parseFormula('NaCl')).toEqual({ Na: 1, Cl: 1 });
  });
});

describe('toSubscript', () => {
  it('converts digits to Unicode subscripts', () => {
    expect(toSubscript('H2O')).toBe('H₂O');
    expect(toSubscript('Fe2O3')).toBe('Fe₂O₃');
  });
});

describe('molarMass', () => {
  it('computes water within rounding tolerance of 18.015 g/mol', () => {
    expect(molarMass('H2O')).toBeCloseTo(18.015, 2);
  });

  it('computes carbon dioxide within rounding tolerance of 44.01 g/mol', () => {
    expect(molarMass('CO2')).toBeCloseTo(44.009, 2);
  });
});
