import { ArrowRight, GitBranch } from "lucide-react";
import type { Copy } from "@/lib/copy";
import type { DemoState } from "@/lib/demo-state";
import { matchesComparisonFixture } from "@/lib/demo-state";
import InsightCards from "@/components/primitives/InsightCards";
import { Button } from "@/components/atoms/Button";
import { patternLabel, persistenceText } from "@/lib/persistence-copy";
import { ConnectionSources } from "./ConnectionSources";

export default function Connections({ state, copy, onRun, onNext }: { state: DemoState; copy: Copy; onRun: () => void; onNext: () => void }) {
  if (state.backend) return <SavedConnections state={state} copy={copy} onRun={onRun} onNext={onNext} />;
  if (!matchesComparisonFixture(state)) return <p className="empty-note">{copy.customComparison}</p>;
  if (state.task?.status !== "ready") return <div className="empty-note"><p>{copy.taskDetail}</p><Button variant="primary" onClick={onRun} disabled={state.task?.status === "running"}>{copy.runComparison}</Button></div>;
  return <div className="connection-content">
    <div className="comparison-caption"><GitBranch size={17} />{copy.comparisonLabel}</div>
    <div className="measure-row"><div><span>{copy.pattern}</span><strong>{copy.patternValue}</strong></div><div><span>{copy.linkage}</span><strong>{copy.linkageValue}</strong></div></div>
    <div className="comparison-columns">
      <section><h3>{copy.supports}</h3><p>{copy.supportsText}</p><span className="source-id">Example 1 + Example 2</span></section>
      <section><h3>{copy.differences}</h3><p>{copy.differencesText}</p><span className="source-id">Example 2 · fictional laptop account</span></section>
    </div>
    <details className="comparison-source"><summary>{copy.viewSource}: Example 2</summary><p>I paid ₹12,000 for a used laptop on 12 September. The seller promised delivery, but it did not arrive and replies stopped.</p><span className="small-muted">Authored synthetic fixture. Not a real report.</span></details>
    <section className="connection-limit"><h3>{copy.unknown}</h3><p>{copy.unknownText}</p></section>
    <InsightCards labels={{ title: state.language === "hi" ? "समानता समझें" : "A closer look", previous: state.language === "hi" ? "पिछली जानकारी" : "Previous insight", next: state.language === "hi" ? "अगली जानकारी" : "Next insight" }} pages={[
      { key: "pattern", prose: copy.pattern, content: <><h3>{copy.patternValue}</h3><p className="mt-2 text-[18px] leading-relaxed">{copy.supportsText}</p><span className="source-id">Example 1 + Example 2</span></> },
      { key: "limits", prose: copy.linkage, content: <><h3>{copy.linkageValue}</h3><p className="mt-2 text-[18px] leading-relaxed">{copy.unknownText}</p><span className="source-id">Example 1 + Example 2</span></> },
    ]} />
    <Button variant="primary" onClick={onNext}>{copy.steps}<ArrowRight size={17} /></Button>
  </div>;
}

function SavedConnections({ state, copy, onRun, onNext }: { state: DemoState; copy: Copy; onRun: () => void; onNext: () => void }) {
  const text = persistenceText(state.language);
  if (state.task?.status !== "ready" || !state.connections) return <div className="empty-note"><p>{copy.taskDetail}</p><Button variant="primary" onClick={onRun} disabled={state.task?.status === "running"}>{copy.runComparison}</Button></div>;
  const candidates = state.connections.candidates;
  if (!candidates.length) return <div className="connection-content"><p className="empty-note">{state.details.some(detail => detail.field === "pattern" && detail.included) ? text.noMatches : text.noPatterns}</p><ConnectionSources result={state.connections} language={state.language} /><p>{copy.unknownText}</p><Button variant="primary" onClick={onNext}>{copy.steps}<ArrowRight size={17} /></Button></div>;
  return <div className="connection-content">
    <div className="comparison-caption"><GitBranch size={17} />{copy.comparisonLabel} · {candidates.length}</div>
    <InsightCards labels={{ title: text.title, previous: state.language === "hi" ? "पिछला उदाहरण" : "Previous example", next: state.language === "hi" ? "अगला उदाहरण" : "Next example" }} pages={candidates.map(candidate => ({ key: candidate.id, prose: candidate.title, content: <>
      <p lang="en">{candidate.summary}</p>
      <div className="measure-row"><div><span>{text.shared}</span><strong>{candidate.pattern.shared.length}</strong></div><div><span>{copy.linkage}</span><strong>{copy.linkageValue}</strong></div></div>
      <section><h3>{copy.supports}</h3><ul>{candidate.pattern.shared.map(key => <li key={key}>{patternLabel(key, state.language)}</li>)}</ul></section>
      <ConnectionSources result={state.connections!} language={state.language} assertionIds={candidate.explanation.paths.flatMap(path => path.assertionIds)} />
      <section><h3>{copy.differences}</h3>{candidate.differences.map(difference => <p key={difference} lang="en">{difference}</p>)}
        {candidate.pattern.different.length ? <p>{text.other}: {candidate.pattern.different.map(key => patternLabel(key, state.language)).join(" · ")}</p> : !candidate.differences.length && <p>{text.none}</p>}</section>
      <details className="comparison-source"><summary>{text.source}: {candidate.id}</summary><p lang="en">{candidate.summary}</p><p>{state.language === "hi" ? "लेखक का काल्पनिक उदाहरण; वास्तविक शिकायत नहीं।" : "Authored fictional example; not a real complaint."}</p></details>
    </> }))} />
    <ConnectionSources result={state.connections} language={state.language} />
    <section className="connection-limit"><h3>{copy.unknown}</h3><p>{copy.unknownText}</p></section>
    <Button variant="primary" onClick={onNext}>{copy.steps}<ArrowRight size={17} /></Button>
  </div>;
}
