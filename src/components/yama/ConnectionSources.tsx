import type { ConnectionsResult, PatternSource } from "@/lib/connections";
import type { Language } from "@/lib/demo-state";
import { patternLabel } from "@/lib/persistence-copy";

const labels = {
  en: { sources: "Original statements", withheld: "Statements not used as support", corrected: "Corrected by you", original: "Earlier tag", quote: "Original wording", revision: "Revision", verification: "Confirmed by you; not independently verified.",
    supporting: "Used as support", blocked: "Other statements dispute this tag", excluded: "Excluded by you", contradicted: "Contradicted", uncertain: "Uncertain", evidence: "Reviewed file source" },
  hi: { sources: "मूल विवरण", withheld: "समर्थन में नहीं लिए गए विवरण", corrected: "आपके द्वारा सुधारा गया", original: "पहले का पैटर्न", quote: "मूल शब्द", revision: "संस्करण", verification: "आपने पुष्टि की है; स्वतंत्र रूप से सत्यापित नहीं।",
    supporting: "समर्थन में शामिल", blocked: "अन्य विवरण इस पैटर्न का विरोध करते हैं", excluded: "आपने बाहर रखा", contradicted: "विरोध", uncertain: "अनिश्चित", evidence: "समीक्षा की गई फ़ाइल का स्रोत" },
  hinglish: { sources: "Original statements", withheld: "Support mein use nahi hue statements", corrected: "Aapne correct kiya", original: "Pehle ka tag", quote: "Original wording", revision: "Revision", verification: "Aapne confirm kiya; independently verify nahi hua.",
    supporting: "Support mein use hua", blocked: "Doosre statements is tag ko dispute karte hain", excluded: "Aapne exclude kiya", contradicted: "Contradicted", uncertain: "Uncertain", evidence: "Reviewed file ka source" },
};
function SourceStatement({ source, language }: { source: PatternSource; language: Language }) {
  const text = labels[language];
  return <section>
    <h4>{patternLabel(source.value, language)} · {text[source.status]}</h4>
    {source.agentSource && <p>{language === "hi" ? "साथी का प्रस्ताव, आपकी समीक्षा के बाद शामिल" : "Proposed by Saathi and included after your review"} · {source.agentSource.provider}</p>}
    {source.corrected && <p>{text.corrected} · {text.original}: {patternLabel(source.originalValue, language)}</p>}
    <p>{text.quote}:</p><blockquote dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{source.quote}</blockquote>
    {source.evidence && <p>{text.evidence} · {source.evidence.id}</p>}
  </section>;
}
export function ConnectionSources({ result, language, assertionIds }: { result: ConnectionsResult; language: Language; assertionIds?: string[] }) {
  const text = labels[language];
  const sources = assertionIds ? result.sources.filter(source => assertionIds.includes(source.assertionId)) : result.sources.filter(source => source.status !== "supporting");
  if (!sources.length) return null;
  return <details className="comparison-source">
    <summary>{assertionIds ? text.sources : text.withheld} · {text.revision} {result.revision} · {sources.length}</summary>
    <p>{text.verification}</p>
    {sources.map(source => <SourceStatement key={source.assertionId} source={source} language={language} />)}
  </details>;
}
