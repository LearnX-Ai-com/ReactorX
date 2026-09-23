// Per-view world-space anchors for where Ion stands — kept in their own
// module (not alongside a component) so component files stay fast-refresh
// friendly (mixing component and non-component exports in one file defeats it).
// Room-mode views (ChamberRoom, ElementsRoom) keep their own local anchors
// instead — this file is for the flat/non-room views' Ion docking.
//
// In the atom explorer's inspect mode, Ion stays small and docked to a side
// (the atom is the visual focus, matching the original app's restraint — a
// small "Ask Ion" presence, not a giant character).
//
// Kept well above the particle plane and the bottom HUD panel — Ion
// previously sat near y=0.4, which put it right behind the panel and made
// it invisible/unclickable.
export const ELEMENTS_ION_DOCK: [number, number, number] = [3.0, 2.5, 2.2];
