import { useEffect, useRef, useState } from 'react';
import { toSubscript } from '../chemistry/formulas';
import { answerIonQuestion, type ChatContext } from './answers';
import { askIon } from './api';

interface ChatMessage {
  from: 'ion' | 'user';
  text: string;
  /** True for a reply that came from the scripted fallback (askIon failed —
   * usually the functions dev server isn't running) rather than a real AI
   * call. Surfaced visibly rather than silently, so "the AI answers seem
   * generic" is actually noticeable instead of looking like a wiring bug. */
  fallback?: boolean;
}

function greetingFor(ctx: ChatContext): string {
  if (ctx.kind === 'chamber') {
    return ctx.reaction
      ? `Ask me about ${toSubscript(ctx.reactantA)} + ${toSubscript(ctx.reactantB)} — bonds, energy change, conditions, catalyst, safety, lab steps, oxidation states, balancing, anything.`
      : "I don't have a reaction loaded for this pair, but ask away — I'll tell you what I can.";
  }
  if (ctx.kind === 'elements') return `Ask me about ${ctx.symbol} — its electron configuration, oxidation states, mass, or category.`;
  if (ctx.kind === 'molecule') return `Ask me about ${toSubscript(ctx.formula)} — its bonds, oxidation states, molar mass, or a fun fact.`;
  return "Head into the chamber or the atom explorer and I'll have more to say.";
}

/** Identity string for "is this genuinely a different thing to talk about" —
 * a chamber context with the same reactant pair but, say, a different
 * caption isn't a new topic; a different pair (or a pair that newly
 * resolved/lost a reaction) is. */
function contextIdentity(ctx: ChatContext): string {
  if (ctx.kind === 'chamber') return `chamber:${ctx.reactantA}|${ctx.reactantB}|${ctx.reaction?.name ?? ''}`;
  if (ctx.kind === 'elements') return `elements:${ctx.symbol}`;
  if (ctx.kind === 'molecule') return `molecule:${ctx.formula}`;
  return 'none';
}

export interface IonChatBodyProps {
  context: ChatContext;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

/**
 * The message log + input, shared by every surface that hosts an Ion
 * conversation — the atom explorer's click-to-open panel (App.tsx) and the
 * chamber's always-visible, wall-anchored one (three/ChamberIonPanel.tsx).
 * Seeds once per mount (lazy initial state, not an effect) — the parent
 * controls "when should this reset" by mounting a fresh IonChatBody
 * (React's own key/conditional-render remount idiom), rather than this
 * component watching a dependency array. Context changes don't wipe the
 * conversation, but do inform every new answer (send() closes over the
 * latest prop).
 */
export function IonChatBody({ context, inputRef }: IonChatBodyProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [{ from: 'ion', text: greetingFor(context) }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const identityRef = useRef(contextIdentity(context));
  // send() is async now (a real AI call, not an instant lookup) — this
  // tracks the in-flight request generation so a reply that lands after
  // the student has already moved on to a different question (or the
  // context itself changed) doesn't get appended out of order.
  const requestIdRef = useRef(0);

  // The panel itself never remounts as the student swaps reactants or picks
  // a new element — it's a fixed wall fixture — so without this the log's
  // opening line (and Ion's sense of "what are we looking at") would stay
  // frozen on whatever was loaded when the panel first mounted. Re-greeting
  // on a genuine topic change keeps every later answer grounded in what's
  // actually in the chamber right now, while still leaving prior Q&A in
  // place rather than wiping the conversation.
  useEffect(() => {
    const next = contextIdentity(context);
    if (next !== identityRef.current) {
      identityRef.current = next;
      setMessages((m) => [...m, { from: 'ion', text: greetingFor(context) }]);
    }
  }, [context]);

  async function send(): Promise<void> {
    const question = input.trim();
    if (!question) return;
    setInput('');
    setMessages((m) => [...m, { from: 'user', text: question }]);
    setBusy(true);
    const requestId = ++requestIdRef.current;
    try {
      const reply = await askIon(question, context);
      if (requestId !== requestIdRef.current) return; // superseded — drop it
      setMessages((m) => [...m, { from: 'ion', text: reply }]);
    } catch (err) {
      console.error('[IonChatBody] askIon failed, falling back to scripted answer', err);
      if (requestId !== requestIdRef.current) return;
      // Graceful degradation, not silence — a network hiccup still gets the
      // student a (less flexible, but still grounded) answer, flagged as a
      // fallback in the UI rather than looking identical to a real AI reply.
      setMessages((m) => [...m, { from: 'ion', text: answerIonQuestion(question, context), fallback: true }]);
    } finally {
      if (requestId === requestIdRef.current) setBusy(false);
    }
  }

  return (
    <>
      <div className="chat-log">
        {messages.map((m, i) => (
          <div key={i} className={m.from === 'ion' ? 'chat-msg chat-ion' : 'chat-msg chat-user'}>
            {m.fallback && <span className="chat-fallback-tag">offline answer</span>}
            {m.text}
          </div>
        ))}
        {busy && <div className="chat-msg chat-ion chat-thinking">Ion is thinking…</div>}
      </div>
      <form
        className="chat-input-row"
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about bonds, oxidation, balancing…"
          disabled={busy}
        />
        <button type="submit" className="chip chip-accent" disabled={busy}>Send</button>
      </form>
    </>
  );
}
