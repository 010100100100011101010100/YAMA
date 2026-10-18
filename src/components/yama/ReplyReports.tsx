"use client";

import { useEffect, useState } from "react";
import type { ConnectionReceipt, ConnectionsResult } from "@/lib/connections";
import type { Language } from "@/lib/demo-state";
import type { ReportApi } from "@/lib/report-api";
import { Button } from "@/components/atoms/Button";
import InsightCards from "@/components/primitives/InsightCards";
import { ConnectionRecordDetails } from "./ConnectionRecordDetails";
import SourcePreview from "./SourcePreview";

export default function ReplyReports({ reportId, receipt, language, load, initiallyOpen = true }: { reportId: string; receipt: ConnectionReceipt; language: Language; load: ReportApi["connections"]; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [state, setState] = useState<{ result: ConnectionsResult | null; failed: boolean }>({ result: null, failed: false });
  const [attempt, setAttempt] = useState(0), [selected, setSelected] = useState<string | null>(null);
  const binding = JSON.stringify(receipt);
  useEffect(() => {
    const controller = new AbortController();
    const expected: ConnectionReceipt = JSON.parse(binding);
    if (!open || !expected.cases.length) return () => controller.abort();
    load(reportId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.status !== "ready" || result.revision !== expected.revision || expected.cases.some(reference => !result.candidates.some(candidate => candidate.id === reference.id && candidate.explanation.catalogueVersion === reference.version))) throw new Error("Sources changed");
      setState({ result: { ...result, candidates: result.candidates.filter(candidate => expected.cases.some(reference => reference.id === candidate.id)) }, failed: false });
    }).catch(() => { if (!controller.signal.aborted) setState({ result: null, failed: true }); });
    return () => controller.abort();
  }, [reportId, binding, attempt, load, open]);
  const text = language === "hi" ? { reports: "संबंधित मामले", retry: "स्रोत फिर खोलें", failed: "स्रोत नहीं खुले।", close: "मामला बंद करें", image: "नाम हटाई गई बातचीत की प्रति", privacy: "रिपोर्टर की पहचान छिपाई गई है।" }
    : { reports: "Related reports", retry: "Retry sources", failed: "Sources couldn’t be opened.", close: "Close report", image: "Conversation with reporter details removed", privacy: "Reporter details are hidden." };
  if (!receipt.cases.length) return null;
  const candidate = state.result?.candidates.find(candidate => candidate.id === selected);
  return <div className="reply-reports">
    <Button variant="quiet" size="sm" aria-expanded={open} onClick={() => setOpen(value => !value)}>{text.reports} · {receipt.cases.length}</Button>
    {open && <>
    {state.failed && <><p role="status">{text.failed}</p><Button variant="quiet" size="sm" onClick={() => setAttempt(value => value + 1)}>{text.retry}</Button></>}
    <nav aria-label={text.reports} className="reply-source-links">{state.result?.candidates.map((candidate, index) => <SourcePreview key={candidate.id}
      title={`${language === "hi" ? "मामला" : "Report"} ${index + 1}`} preview={`${candidate.title}. ${candidate.resolution?.summary ?? candidate.summary}`}
      href={`#report-${candidate.id}`} onOpen={() => setSelected(candidate.id)} />)}</nav>
    <p className="reply-privacy"><span aria-hidden className="privacy-mask" />{text.privacy}</p>
    {candidate && <div id={`report-${candidate.id}`} className="reply-report-detail">
      <InsightCards key={candidate.id} labels={{ title: text.reports, previous: "Previous report", next: "Next report" }} pages={[{ key: candidate.id, prose: candidate.title, content: <>
        <p lang="en" dir="auto" className="reply-account">{candidate.summary}</p>
        <ConnectionRecordDetails candidate={candidate} language={language} context={{ reportId, revision: receipt.revision }} />
        {candidate.evidence?.some(file => file.format === "png") && <figure className="reply-evidence-image"><img loading="lazy" src={`/api/reports/${reportId}/connections/${encodeURIComponent(candidate.id)}/image?revision=${receipt.revision}&version=${candidate.explanation.catalogueVersion}`} alt={text.image} /><figcaption>{text.image}</figcaption></figure>}
      </> }]} />
      <Button variant="quiet" size="sm" onClick={() => setSelected(null)}>{text.close}</Button>
    </div>}
    </>}
  </div>;
}
