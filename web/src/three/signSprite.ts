import * as THREE from 'three';

/** A canvas-texture sprite for a short symbol (+, →) that should always face
 * the camera and sit in world space alongside the molecules it separates.
 * Kept off the HTML layer deliberately: these are universal math/reaction
 * symbols, not translatable UI copy. */
export function makeSignSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '700 96px "Space Grotesk", sans-serif';
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
  // the molecules they separate.
  sprite.scale.set(1.6, 1.6, 1);
  return sprite;
}
