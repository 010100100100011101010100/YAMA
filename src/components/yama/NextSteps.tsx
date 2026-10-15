import { ArrowDownToLine, FileText, Archive, CornerUpRight } from "lucide-react";
import type { Copy } from "@/lib/copy";
import type { DemoState } from "@/lib/demo-state";
import { reviewedReport } from "@/lib/demo-state";
import RecommendationCard from "@/components/primitives/RecommendationCard";
import type { SavedReport } from "@/lib/report-api";
import { PrivateActionReview } from "./PrivateActionReview";
import { AssistanceOptions } from "./AssistanceOptions";
import { actionWords } from "@/lib/actions-copy";
import { Button } from "@/components/atoms/Button";

export default function NextSteps({ state, copy, onFiles, persisted = false, report, disabled = false }: { state: DemoState; copy: Copy; onFiles: () => void; persisted?: boolean; report?: SavedReport | null; disabled?: boolean }) {
  function download() {
    const url = URL.createObjectURL(new Blob([reviewedReport(state)], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `yama-demo-report-r${state.revision}.txt`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (persisted) return <div className="next-content">
    {report ? <PrivateActionReview key={`${report._id}:${report.revision}`} report={report} language={state.language} disabled={disabled} /> : <p>{actionWords[state.language].start}</p>}
    <Button size="sm" onClick={onFiles}>{copy.files}</Button>
    <AssistanceOptions language={state.language} />
  </div>;
  return <div className="next-content">
    <RecommendationCard options={[
      { key: "report", body: <><ArrowDownToLine size={20} className="mb-2" aria-hidden />{copy.reportText}</>, short: copy.reportTitle, label: state.language === "hi" ? "स्थानीय डाउनलोड" : "Local download", cta: copy.download, disabled: !state.details.some(detail => detail.included) },
      { key: "files", body: copy.preserveText, short: copy.preserveTitle, label: state.language === "hi" ? "इस उपकरण की फ़ाइलें" : "Files on your device", cta: copy.files },
    ]} labels={{ title: copy.nextTitle, alternatives: state.language === "hi" ? "अन्य विकल्प" : "Alternatives", otherOptions: state.language === "hi" ? "अन्य कदम" : "Other steps" }} onConfirm={key => key === "report" ? download() : onFiles()} />
    <section className="next-row"><Archive size={22} aria-hidden="true" /><div><h3>{copy.preserveTitle}</h3><p>{copy.preserveText}</p></div></section>
    <section className="next-row"><FileText size={22} aria-hidden="true" /><div><h3>{copy.reportTitle}</h3><p>{copy.reportText}</p></div></section>
    <section className="next-row"><CornerUpRight size={22} aria-hidden="true" /><div><h3>{copy.helpTitle}</h3><p>{copy.helpText}</p></div></section>
    <aside className="advanced-note"><strong>{copy.advanced}</strong><p>{copy.advancedText}</p></aside>
  </div>;
}
