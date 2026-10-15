"use client";

import { useState } from "react";

// BeautifulUI FilterTable (MIT), supplied filters/pills/table rendering.
// Counts come from rows; native table semantics and actual filtering replace clipped div rows.
type Status = "todo" | "progress" | "done";
export type TableRow = { task: string; date: string; status: Status; owner: string };
export type FilterTableLabels = { columns: { task: string; date: string; status: string; owner: string }; all: string; todo: string; progress: string; done: string; region: string };
const filters = ["all", "todo", "progress", "done"] as const;
export default function FilterTable({ rows, labels }: { rows: TableRow[]; labels: FilterTableLabels }) {
  const [filter, setFilter] = useState<"all" | Status>("all");
  return <div data-beautifului="FilterTable" className="w-full">
    <div className="-mx-1 mb-1 flex items-center overflow-x-auto gap-1 px-1 py-1">
      {filters.map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`flex h-6.5 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-[background-color,box-shadow,color] duration-200 ${filter === key ? "bg-surface text-ink shadow-btn" : "text-ink-2 hover:bg-hover"}`}>
        {labels[key]} <span className="rounded-[4px] bg-field px-1 text-[10.5px] text-ink-2 tabular-nums">{rows.filter(row => key === "all" || row.status === key).length}</span>
      </button>)}
    </div>
    <div role="region" aria-label={labels.region} tabIndex={0} className="overflow-x-auto rounded-card bg-surface shadow-card">
      <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
        <thead><tr className="border-b border-[var(--grid-line)] text-[12.5px] text-ink-2">{Object.values(labels.columns).map(label => <th key={label} scope="col" className="px-3 py-2 font-medium">{label}</th>)}</tr></thead>
        <tbody>{rows.filter(row => filter === "all" || row.status === filter).map(row => <tr key={row.task} className="border-b border-line hover:bg-hover">
          <td className="px-3 py-2 font-medium text-ink">{row.task}</td><td className="px-3 py-2 text-ink-2">{row.date}</td>
          <td className="px-3 py-2"><span className={`inline-flex h-[23px] items-center whitespace-nowrap rounded-[8px] border px-[7px] text-[13px] font-medium filter-status-${row.status}`}>{labels[row.status]}</span></td><td className="px-3 py-2 text-ink-2">{row.owner}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
