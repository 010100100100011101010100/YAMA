"use client";

import { useId, useRef, useState } from "react";
import ApprovalCard from "@/components/primitives/ApprovalCard";
import { Button } from "@/components/atoms/Button";
import type { DialogueQuestion } from "@/lib/dialogue";
import type { Language } from "@/lib/demo-state";

export default function FollowUpQuestion({ question, language, disabled, onAnswer }: {
  question: DialogueQuestion; language: Language; disabled: boolean; onAnswer: (answer: string) => Promise<boolean>;
}) {
  const id = useId(), lock = useRef(false);
  const [value, setValue] = useState(""), [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const text = language === "hi" ? { send: "जवाब भेजें", sent: "जवाब भेजा गया", failed: "जवाब नहीं भेजा गया। फिर कोशिश करें।" }
    : language === "hinglish" ? { send: "Jawab bhejein", sent: "Jawab bhej diya", failed: "Jawab nahi gaya. Phir try karein." }
      : { send: "Send answer", sent: "Answer sent", failed: "Your answer wasn’t sent. Try again." };
  const busy = disabled || phase === "sending" || phase === "sent";
  async function submit(answer: string) {
    if (busy || lock.current || !answer.trim()) return;
    lock.current = true; setPhase("sending");
    try { setPhase(await onAnswer(answer.trim()) ? "sent" : "error"); }
    catch { setPhase("error"); }
    finally { lock.current = false; }
  }
  return <div className="chat-question">
    {question.kind === "choice" ? <ApprovalCard questions={[{ q: question.prompt, type: "radio", options: question.options }]}
      labels={{ send: phase === "sending" ? "…" : text.send, sentMessage: text.sent }} confirmed={phase === "sent"} disabled={busy}
      onSubmitted={answers => { const answer = question.options[answers[0]?.[0]]; if (answer) void submit(answer); }} />
      : <form className="rounded-card bg-surface shadow-card primitive-card-pad" onSubmit={event => { event.preventDefault(); void submit(value); }}>
        <label htmlFor={id}>{question.prompt}</label>
        <input id={id} value={value} disabled={busy} maxLength={500} placeholder={question.placeholder ?? undefined} onChange={event => setValue(event.target.value)} />
        <Button type="submit" variant="primary" size="sm" disabled={busy || !value.trim()}>{phase === "sent" ? text.sent : phase === "sending" ? "…" : text.send}</Button>
      </form>}
    {phase === "error" && <p role="alert" className="error-text">{text.failed}</p>}
  </div>;
}
