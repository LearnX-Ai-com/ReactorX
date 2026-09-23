export interface LookState {
  yaw: number;
  pitch: number;
}

const PITCH_LIMIT = 1.1; // radians, keeps the view from flipping over

/**
 * First-person "turn your head" look controls — fixed eye position, drag to
 * change yaw/pitch. This is deliberately a different model from
 * orbitControls.ts (which orbits a camera AROUND an object at a fixed
 * look-at point): a room you stand inside needs the camera itself to stay
 * put and the *view direction* to rotate, which is also exactly what a
 * WebXR session's head tracking drives — so this is the control scheme a
 * real Quest headset replaces outright, not one it needs to be adapted for.
 */
export function attachLookControls(canvasEl: HTMLElement, state: LookState): () => void {
  canvasEl.style.touchAction = 'none';
  canvasEl.style.cursor = 'grab';
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onPointerDown(e: PointerEvent): void {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvasEl.style.cursor = 'grabbing';
    canvasEl.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    state.yaw += dx * 0.006;
    state.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, state.pitch - dy * 0.006));
  }
  function release(): void {
    dragging = false;
    canvasEl.style.cursor = 'grab';
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
