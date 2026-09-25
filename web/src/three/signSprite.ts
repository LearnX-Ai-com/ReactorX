import * as THREE from 'three';

/** A canvas-texture sprite for a short symbol (+, →) that should always face
 * the camera and sit in world space alongside the molecules it separates.
 * Kept off the HTML layer deliberately: these are universal math/reaction
 * symbols, not translatable UI copy. */
export function makeSignSprite(text: string, color: string, scale = 1.6): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // Tuned for a 1-2 char sign (+, →, a bare element symbol) at 96px — a
  // longer string (e.g. an ion label like "Hg²⁺") would overflow this fixed
  // canvas and clip at its edges, so shrink the font until it actually fits
  // rather than assuming every caller's text is short. No-op (still 96px)
  // for every existing short-text caller.
  let fontSize = 96;
  const maxWidth = 116;
  ctx.font = `700 ${fontSize}px "Space Grotesk", sans-serif`;
  while (fontSize > 28 && ctx.measureText(text).width > maxWidth) {
    fontSize -= 4;
    ctx.font = `700 ${fontSize}px "Space Grotesk", sans-serif`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  // Scaled up from the original 0.85 — ReactionChamberModel now renders at
  // CENTER_SCALE (0.26) inside ChamberRoom's compact wall, which shrank
  // these connector symbols to the point of being hard to notice next to
  // the molecules they separate. `scale` defaults to that same 1.6 for
  // every existing caller; BondStoryViewer is the first to need a size
  // that varies per atom/label (an ion label reveal is meant to read as
  // bigger than the resting element symbol it replaces).
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

/** A white filled-circle alpha mask — shared by makeDotSprite below and by
 * BohrAtom.tsx's quantum-cloud Points material (one texture, tinted per use
 * via each material's own `color`, rather than baking a separate colored
 * texture per caller). Drawn as a canvas arc rather than a Unicode bullet
 * character: a font-rendered glyph risks the same missing/fallback-glyph
 * problem a text sprite hit for the reversible-reaction arrow (⇌) — a plain
 * circle drawn directly has no such dependency. */
export function makeDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(32, 32, 24, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

/** A small filled-circle sprite tinted `color` — used for Lewis-dot
 * notation (see BohrAtom.tsx's Lewis view). */
export function makeDotSprite(color: string): THREE.Sprite {
  const texture = makeDotTexture();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthWrite: false }));
  sprite.scale.set(0.28, 0.28, 1);
  return sprite;
}
