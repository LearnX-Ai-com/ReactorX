import { describe, expect, it } from 'vitest';
import { buildElectronConfiguration } from './electronConfig';

// Ground truth: the 8 elements the original chamber hand-authored shells/
// valence/config for (index.html ELEMENTS). If this generator can't
// reproduce those exactly, it can't be trusted for the other 110.
describe('buildElectronConfiguration', () => {
  it('matches hand-authored H (Z=1)', () => {
    const c = buildElectronConfiguration(1);
    expect(c.shells).toEqual([1]);
    expect(c.valence).toBe(1);
    expect(c.configString).toBe('1s¹');
    expect(c.bondShellDepth).toBeUndefined();
  });

  it('matches hand-authored O (Z=8)', () => {
    const c = buildElectronConfiguration(8);
    expect(c.shells).toEqual([2, 6]);
    expect(c.configString).toBe('1s² 2s² 2p⁴');
  });

  it('matches hand-authored N (Z=7)', () => {
    expect(buildElectronConfiguration(7).shells).toEqual([2, 5]);
  });

  it('matches hand-authored C (Z=6)', () => {
    expect(buildElectronConfiguration(6).shells).toEqual([2, 4]);
  });

  it('matches hand-authored Cl (Z=17)', () => {
    const c = buildElectronConfiguration(17);
    expect(c.shells).toEqual([2, 8, 7]);
    expect(c.configString).toBe('1s² 2s² 2p⁶ 3s² 3p⁵');
  });

  it('matches hand-authored Na (Z=11)', () => {
    expect(buildElectronConfiguration(11).shells).toEqual([2, 8, 1]);
  });

  it('matches hand-authored Mg (Z=12)', () => {
    expect(buildElectronConfiguration(12).shells).toEqual([2, 8, 2]);
  });

  it('matches hand-authored Fe (Z=26), including the bondShellDepth note', () => {
    const c = buildElectronConfiguration(26);
    expect(c.shells).toEqual([2, 8, 14, 2]);
    expect(c.valence).toBe(2);
    expect(c.bondShellDepth).toBe(2);
    expect(c.configString).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶ 4s²');
  });

  it('applies the Cr/Cu 4s1 exceptions', () => {
    expect(buildElectronConfiguration(24).configString).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁵ 4s¹'); // Cr
    expect(buildElectronConfiguration(29).configString).toBe('1s² 2s² 2p⁶ 3s² 3p⁶ 3d¹⁰ 4s¹'); // Cu
  });

  it('applies the Pd full-d, empty-s exception', () => {
    const c = buildElectronConfiguration(46);
    expect(c.configString).toContain('4d¹⁰');
    expect(c.configString).not.toContain('5s');
  });

  it('produces a noble gas full outer shell for Ne, Ar', () => {
    expect(buildElectronConfiguration(10).shells).toEqual([2, 8]);
    expect(buildElectronConfiguration(18).shells).toEqual([2, 8, 8]);
  });

  it('accounts for every electron exactly once, for every element 1-118', () => {
    for (let z = 1; z <= 118; z++) {
      const c = buildElectronConfiguration(z);
      const total = c.subshells.reduce((sum, s) => sum + s.electrons, 0);
      expect(total, `Z=${z}`).toBe(z);
      const shellTotal = c.shells.reduce((sum, n) => sum + n, 0);
      expect(shellTotal, `Z=${z}`).toBe(z);
    }
  });
});
