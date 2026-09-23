// Spoken narration, kept behind one function so the implementation can be
// swapped later without touching call sites. Today: the browser's built-in
// Web Speech API (zero backend, works now). The plan recorded for ReactorX
// is eventually server-generated audio (consistent voice/quality across
// browsers and languages, especially for non-English voices like Finnish —
// see the learnai reference pattern) once that backend exists; this function
// is the seam where that swap happens.
export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // don't let utterances stack/overlap
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Best-effort — narration audio should never break the demo it's for.
  }
}

export function stopSpeaking(): void {
  try {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}
