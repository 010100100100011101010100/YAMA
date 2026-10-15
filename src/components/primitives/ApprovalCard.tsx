"use client";

import { useId, useState } from "react";
import { Button } from "@/components/atoms/Button";
import GlideMenu from "./GlideMenu";

// BeautifulUI ApprovalCard (MIT), supplied question/option/footer composition.
// Explicit submission and application acknowledgement replace automatic approval.
export type ApprovalQuestion = { q: string; type: "radio" | "check"; options: string[] };
export default function ApprovalCard({ questions, labels, onSubmitted, confirmed = false, disabled = false, resetToken }: {
  questions: ApprovalQuestion[];
  labels: { send: string; sentMessage: string; continue?: string; previous?: string };
  onSubmitted: (answers: Record<number, number[]>) => void; confirmed?: boolean; disabled?: boolean; resetToken?: string;
}) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [previousToken, setPreviousToken] = useState(resetToken);
  const id = useId();
  // Clear a stale acknowledgement without replacing the focused input node.
  if (previousToken !== resetToken) {
    setPreviousToken(resetToken); setQuestionIndex(0); setAnswers({});
  }
  if (!questions.length) return null;
  const question = questions[questionIndex];
  const selected = answers[questionIndex] ?? [];
  const last = questionIndex === questions.length - 1;
  return <div data-beautifului="ApprovalCard" className="w-full max-w-80 overflow-hidden rounded-card bg-surface shadow-card">
    <div hidden={confirmed} className="primitive-card-pad">
      <fieldset disabled={disabled}>
        <legend className="text-[14px] font-medium text-ink">{question.q}</legend>
        <GlideMenu className="mt-2.5 flex flex-col gap-1" highlightClassName="inset-x-0 rounded-control bg-hover">
          {question.options.map((option, index) => <label key={option} data-menu-row className="relative z-10 flex items-center gap-1.5 rounded-control pl-1 pr-2 py-1 text-[13px] text-ink-2">
            <input className="peer sr-only" type={question.type === "check" ? "checkbox" : "radio"} name={id} checked={selected.includes(index)}
              onChange={() => setAnswers(current => ({ ...current, [questionIndex]: question.type === "radio" ? [index] : selected.includes(index) ? selected.filter(item => item !== index) : [...selected, index] }))} />
            <span aria-hidden className={`flex size-4 shrink-0 items-center justify-center transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2 ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"} ${selected.includes(index) ? "bg-ink text-canvas" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)] text-transparent"}`}>
              {question.type === "radio" ? <span className="size-1.5 rounded-full bg-canvas" /> : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
            </span>
            <span>{option}</span>
          </label>)}
        </GlideMenu>
      </fieldset>
    </div>
    <div className="primitive-card-footer flex flex-wrap items-center justify-between gap-3">
      <span className="text-[12px] font-medium text-ink-3 tabular-nums">{questionIndex + 1} / {questions.length}</span>
      <div className="flex flex-wrap items-center gap-2">
        {questionIndex > 0 && <Button size="sm" onClick={() => setQuestionIndex(questionIndex - 1)}>{labels.previous ?? "Previous"}</Button>}
        <Button variant="primary" size="sm" aria-disabled={confirmed || undefined} disabled={!confirmed && (disabled || selected.length === 0 || last && questions.some((_, index) => !answers[index]?.length))}
          onClick={() => { if (!confirmed) { if (last) onSubmitted(answers); else setQuestionIndex(questionIndex + 1); } }}>{confirmed ? labels.sentMessage : last ? labels.send : labels.continue ?? "Continue"}</Button>
      </div>
    </div>
  </div>;
}
