export interface CameraOrbitState {
  theta: number;
  phi: number;
  radius: number;
}

/**
 * Drag-to-orbit + scroll/pinch-to-zoom for a canvas, independent of any
 * library controls — like steering a camera around a tabletop solar system
 * model: the model animates on its own, the viewer moves around it.
 *
 * Mutates `state` in place; read it from a render loop (e.g. useFrame).
 * Returns a cleanup function that removes all listeners.
 */
export function attachOrbitControls(
  canvasEl: HTMLElement,
  state: CameraOrbitState,
  minRadius: number,
  maxRadius: number,
  onTap?: (clientX: number, clientY: number) => void,
): () => void {
  canvasEl.style.touchAction = 'none';
  canvasEl.style.cursor = 'grab';
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist: number | null = null;
  let pinchRadius: number | null = null;
  let tapCandidate: { id: number; x: number; y: number; moved: boolean } | null = null;

  function onPointerDown(e: PointerEvent): void {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvasEl.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvasEl.style.cursor = 'grabbing';
      tapCandidate = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    } else if (pointers.size === 2) {
      dragging = false;
      tapCandidate = null;
      const pts = Array.from(pointers.values());
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRadius = state.radius;
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tapCandidate && tapCandidate.id === e.pointerId) {
      if (Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y) > 6) tapCandidate.moved = true;
    }
    if (pointers.size === 2 && pinchDist) {
      const pts = Array.from(pointers.values());
      const d = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      state.radius = Math.min(maxRadius, Math.max(minRadius, (pinchRadius as number) * (pinchDist / d)));
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    state.theta -= dx * 0.008;
    state.phi = Math.min(2.6, Math.max(0.4, state.phi - dy * 0.008));
  }

  function release(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = null;
    if (pointers.size === 0) {
      dragging = false;
      canvasEl.style.cursor = 'grab';
    }
  }

  function onPointerUp(e: PointerEvent): void {
    const isTap = !!onTap && !!tapCandidate && tapCandidate.id === e.pointerId && !tapCandidate.moved && pointers.size === 1;
    const tapX = tapCandidate ? tapCandidate.x : e.clientX;
    const tapY = tapCandidate ? tapCandidate.y : e.clientY;
    release(e);
    tapCandidate = null;
    if (isTap) onTap!(tapX, tapY);
  }

  function onPointerCancel(e: PointerEvent): void {
    release(e);
    tapCandidate = null;
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    state.radius = Math.min(maxRadius, Math.max(minRadius, state.radius * Math.exp(e.deltaY * 0.0015)));
  }

  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', onPointerUp);
  canvasEl.addEventListener('pointercancel', onPointerCancel);
  canvasEl.addEventListener('wheel', onWheel, { passive: false });

  return () => {
    canvasEl.removeEventListener('pointerdown', onPointerDown);
    canvasEl.removeEventListener('pointermove', onPointerMove);
    canvasEl.removeEventListener('pointerup', onPointerUp);
    canvasEl.removeEventListener('pointercancel', onPointerCancel);
    canvasEl.removeEventListener('wheel', onWheel);
  };
}
