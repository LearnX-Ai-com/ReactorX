import { createXRStore } from '@react-three/xr';

// One store for the app's whole lifetime — createXRStore() must only ever
// be called once (it owns the WebXR session state), so this lives at
// module scope rather than inside a component. AppCanvas wraps every
// scene in <XR store={xrStore}>; EnterVRButton (App.tsx) calls
// xrStore.enterVR() from a real click handler, which WebXR requires (a
// session can only start from a user gesture, not programmatically on
// mount).
//
// emulate: false — createXRStore() defaults to auto-injecting a simulated
// Meta Quest 3 session (plus its own UI and a handful of multi-MB sample
// "room scan" assets — an office, a living room, a music room — used as
// fake tracked surfaces) whenever the page loads on localhost, and wires
// up a global Alt+Meta+E shortcut that can trigger the same thing on any
// domain, production included. That's a devtool for testing WebXR without
// real hardware, not something this app wants turned on by default —
// we're testing against an actual headset, so the real thing should never
// get silently swapped for a simulated one.
export const xrStore = createXRStore({ emulate: false });
