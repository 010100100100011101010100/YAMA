import type { ConnectionsResult, PatternSource } from "@/lib/connections";
import type { Language } from "@/lib/demo-state";
import type { IdentifierSource } from "@/lib/case-identifiers";
import { patternLabel } from "@/lib/persistence-copy";

const labels = {
  en: { sources: "Original statements", withheld: "Statements not used as support", corrected: "Corrected by you", original: "Earlier tag", quote: "Original wording", revision: "Revision", verification: "Your reviewed statements; not independently verified.",
    supporting: "Used as support", blocked: "Other statements dispute this detail", excluded: "Excluded by you", contradicted: "Contradicted", uncertain: "Uncertain", evidence: "Reviewed file source", phone: "Phone", email: "Email", telegram: "Telegram" },
  hi: { sources: "मूल विवरण", withheld: "समर्थन में नहीं लिए गए विवरण", corrected: "आपके द्वारा सुधारा गया", original: "पहले का पैटर्न", quote: "मूल शब्द", revision: "संस्करण", verification: "आपकी समीक्षा की गई बातें; स्वतंत्र रूप से सत्यापित नहीं।",
    supporting: "समर्थन में शामिल", blocked: "अन्य विवरण इस जानकारी का विरोध करते हैं", excluded: "आपने बाहर रखा", contradicted: "विरोध", uncertain: "अनिश्चित", evidence: "समीक्षा की गई फ़ाइल का स्रोत", phone: "फ़ोन", email: "ईमेल", telegram: "टेलीग्राम" },
  hinglish: { sources: "Original statements", withheld: "Support mein use nahi hue statements", corrected: "Aapne correct kiya", original: "Pehle ka tag", quote: "Original wording", revision: "Revision", verification: "Aapke reviewed statements; independently verify nahi hue.",
    supporting: "Support mein use hua", blocked: "Doosre statements is detail ko dispute karte hain", excluded: "Aapne exclude kiya", contradicted: "Contradicted", uncertain: "Uncertain", evidence: "Reviewed file ka source", phone: "Phone", email: "Email", telegram: "Telegram" },
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
function IdentifierStatement({ source, language }: { source: IdentifierSource; language: Language }) {
  const text = labels[language];
  return <section>
    <h4>{text[source.kind]} · {text[source.status]}</h4>
    <p>{text.quote}:</p><blockquote dir="auto" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{source.quote}</blockquote>
    {source.evidenceId && <p>{text.evidence} · {source.evidenceId}</p>}
  </section>;
}
export function ConnectionSources({ result, language, assertionIds }: { result: ConnectionsResult; language: Language; assertionIds?: string[] }) {
  const text = labels[language];
  const sources = assertionIds ? result.sources.filter(source => assertionIds.includes(source.assertionId)) : result.sources.filter(source => source.status !== "supporting");
  const identifiers = (result.identifierSources ?? []).filter(source => assertionIds ? assertionIds.includes(source.assertionId) : source.status !== "supporting");
  if (!sources.length && !identifiers.length) return null;
  return <details className="comparison-source">
    <summary>{assertionIds ? text.sources : text.withheld} · {text.revision} {result.revision} · {sources.length + identifiers.length}</summary>
    <p>{text.verification}</p>
    {sources.map(source => <SourceStatement key={source.assertionId} source={source} language={language} />)}
    {identifiers.map(source => <IdentifierStatement key={`${source.assertionId}:${source.kind}:${source.value}`} source={source} language={language} />)}
  </details>;
}
