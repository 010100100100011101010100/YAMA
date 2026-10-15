"use client";

import { Button } from "@/components/atoms/Button";

// BeautifulUI TaskRows, List variant (MIT). Kept the row and ring rendering;
// status and actions are supplied by Yama, with no scripted success sequence.
// Upstream source: docs/design/beautifului-2026-10-08/task-rows-TaskRows.tsx.txt
export type TaskRow = {
  key: string; label: string; status: "running" | "ready" | "failed" | "canceled" | "stale";
  action?: { label: string; onClick: () => void };
};

function SpinnerRing() {
  const size = 24, stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return <span className="relative inline-flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
    <svg width={size} height={size} className="task-ring">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--ink-2)" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${circumference * 0.28} ${circumference * 0.72}`} />
    </svg>
  </span>;
}

export default function TaskRows({ rows }: { rows: TaskRow[] }) {
  return <div className="task-rows flex w-full flex-col overflow-hidden rounded-card bg-surface shadow-card">
    {rows.map(row => <section key={row.key} className={`task-status task-${row.status} border-b border-line last:border-0`} aria-label={row.label}>
      <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
        {row.status === "running" ? <SpinnerRing /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {row.status === "ready" ? <path d="M20 6L9 17l-5-5" /> : row.status === "failed" ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M5 12h14" />}
        </svg>}
      </span>
      <strong className="min-w-0 flex-1 text-[13px] font-medium text-ink" role="status" aria-live="polite" aria-atomic="true">{row.label}</strong>
      {row.action && <Button variant="quiet" size="sm" onClick={row.action.onClick}>{row.action.label}</Button>}
    </section>)}
  </div>;
}
