import * as THREE from 'three';

// Split out of PeriodicTableRoom.tsx (a component file) so it doesn't mix
// component and non-component exports in one module — see layout.ts's
// identical rationale ("mixing component and non-component exports in one
// file defeats fast refresh").
const labelTextureCache = new Map<string, THREE.CanvasTexture>();
export function labelTexture(symbol: string): THREE.CanvasTexture {
  let tex = labelTextureCache.get(symbol);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '700 34px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = '#0a0f1c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, 32, 36);
  tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  labelTextureCache.set(symbol, tex);
  return tex;
}
