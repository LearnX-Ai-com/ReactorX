export interface LookState {
  yaw: number;
  pitch: number;
  /** Manual dolly adjustment (world units, along the current view
   * direction) layered on top of ChamberRoom's discrete wall-focus zoom —
   * driven by a two-finger pinch. Positive = closer to what you're looking
   * at (fingers spreading, the same direction a photo pinch-zoom-in uses). */
  zoomOffset: number;
}

const PITCH_LIMIT = 1.1; // radians, keeps the view from flipping over
export const ZOOM_OFFSET_MIN = -1.2;
export const ZOOM_OFFSET_MAX = 1.8;
const PINCH_SENSITIVITY = 0.006; // world units per pixel of pinch-distance change

/**
 * First-person "turn your head" look controls — fixed eye position, drag to
 * change yaw/pitch, pinch (two touches) to dolly in/out. This is
 * deliberately a different model from orbitControls.ts (which orbits a
 * camera AROUND an object at a fixed look-at point): a room you stand
 * inside needs the camera itself to stay put and the *view direction* to
 * rotate, which is also exactly what a WebXR session's head tracking
 * drives — so this is the control scheme a real Quest headset replaces
 * outright, not one it needs to be adapted for.
 */
export function attachLookControls(canvasEl: HTMLElement, state: LookState): () => void {
  // touch-action stays 'none' here deliberately, even with native pinch-zoom
  // now handled in-app: letting the browser's own page-zoom fire at the same
  // time would scale the whole page (bottom dock included) rather than just
  // dollying the 3D camera — a real bug tried once this session and reverted.
  canvasEl.style.touchAction = 'none';
  canvasEl.style.cursor = 'grab';
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  // Pointer id -> last known client position, for tracking exactly two
  // simultaneous touches as a pinch gesture (mouse/trackpad drag never has
  // a second concurrent pointer, so this doesn't affect that path at all).
  const activePointers = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0;
  let pinchStartZoom = 0;

  function pinchDistance(): number {
    const pts = Array.from(activePointers.values());
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e: PointerEvent): void {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvasEl.setPointerCapture(e.pointerId);
    if (activePointers.size === 2) {
      dragging = false; // a second touch landing mid-drag hands off to the pinch below
      pinchStartDist = pinchDistance();
      pinchStartZoom = state.zoomOffset;
    } else if (activePointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvasEl.style.cursor = 'grabbing';
    }
  }
  function onPointerMove(e: PointerEvent): void {
    if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      const delta = (pinchDistance() - pinchStartDist) * PINCH_SENSITIVITY;
      state.zoomOffset = Math.min(ZOOM_OFFSET_MAX, Math.max(ZOOM_OFFSET_MIN, pinchStartZoom + delta));
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    state.yaw += dx * 0.006;
    state.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, state.pitch - dy * 0.006));
  }
  function release(e: PointerEvent): void {
    activePointers.delete(e.pointerId);
    if (activePointers.size === 1) {
      // Dropped from a pinch back to one finger — resume dragging from
      // wherever that remaining finger already is, not the pinch's stale
      // start position (which would otherwise jump the view).
      const [remaining] = activePointers.values();
      dragging = true;
      lastX = remaining.x;
      lastY = remaining.y;
    } else if (activePointers.size === 0) {
      dragging = false;
      canvasEl.style.cursor = 'grab';
    }
  }

  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', release);
  canvasEl.addEventListener('pointercancel', release);

  return () => {
    canvasEl.removeEventListener('pointerdown', onPointerDown);
    canvasEl.removeEventListener('pointermove', onPointerMove);
    canvasEl.removeEventListener('pointerup', release);
    canvasEl.removeEventListener('pointercancel', release);
  };
}
