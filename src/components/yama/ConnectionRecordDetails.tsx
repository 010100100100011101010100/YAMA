import type { ConnectionsResult } from "@/lib/connections";
import type { Language } from "@/lib/demo-state";
import styles from "./ConnectionRecordDetails.module.css";
import RelatedMedia from "./RelatedMedia";

type Candidate = ConnectionsResult["candidates"][number];

const labels = {
  en: { identifiers: "Exact identifier matches", phone: "Phone", email: "Email", telegram: "Telegram", proof: "View matching statements", yours: "Your confirmed statement", related: "Related case statement",
    shared: "Shared identifier", unassessed: "Not assessed", outcome: "Reported outcome", resolved: "Resolved", unresolved: "Unresolved", partially_resolved: "Partially resolved",
    reported: "Reported in this report; not independently verified.", noActions: "No follow-up action was recorded.", evidence: "Uploaded evidence", image: "Image · PNG", text: "Text file", fingerprint: "File fingerprint", private: "Source case files stay private. Only file details are shown." },
  hi: { identifiers: "हूबहू मिलते पहचान-संबंधी विवरण", phone: "फ़ोन", email: "ईमेल", telegram: "टेलीग्राम", proof: "मिलते हुए मूल विवरण देखें", yours: "आपकी पुष्टि की गई बात", related: "संबंधित मामले की बात",
    shared: "साझा पहचान-संबंधी विवरण", unassessed: "पहचान की जाँच नहीं हुई", outcome: "बताया गया परिणाम", resolved: "सुलझा हुआ", unresolved: "अनसुलझा", partially_resolved: "आंशिक रूप से सुलझा",
    reported: "इस मामले में बताया गया परिणाम; स्वतंत्र रूप से सत्यापित नहीं।", noActions: "आगे की कोई कार्रवाई दर्ज नहीं है।", evidence: "अपलोड किए गए सबूत", image: "चित्र · PNG", text: "टेक्स्ट फ़ाइल", fingerprint: "फ़ाइल का डिजिटल फ़िंगरप्रिंट", private: "मूल मामले की फ़ाइलें निजी हैं। केवल फ़ाइल का विवरण दिखाया गया है।" },
  hinglish: { identifiers: "Exact identifier matches", phone: "Phone", email: "Email", telegram: "Telegram", proof: "Matching statements dekhein", yours: "Aapka confirmed statement", related: "Related case ka statement",
    shared: "Shared identifier", unassessed: "Identity check nahi hui", outcome: "Reported outcome", resolved: "Resolved", unresolved: "Unresolved", partially_resolved: "Partially resolved",
    reported: "Is report mein report hua; independently verify nahi hua.", noActions: "Koi follow-up action record nahi hua.", evidence: "Uploaded evidence", image: "Image · PNG", text: "Text file", fingerprint: "File fingerprint", private: "Source case ki files private hain. Sirf file details dikh rahi hain." },
};

export function connectionLinkageLabel(candidate: Candidate, language: Language) {
  return labels[language][candidate.linkage.status === "possible_shared_identifier" ? "shared" : "unassessed"];
}

export function ConnectionRecordDetails({ candidate, language, context }: { candidate: Candidate; language: Language; context?: { reportId: string; revision: number } }) {
  const text = labels[language];
  return <div className={styles.record}>
    {candidate.media?.map((media, index) => <RelatedMedia key={index} media={media} caseId={candidate.id} version={candidate.explanation.catalogueVersion} context={context} />)}
    {!!candidate.details?.length && <section aria-label={language === "hi" ? "खोज में मिला विवरण" : "Discovery details"}>
      <h4>{language === "hi" ? "खोज में मिला विवरण" : "Why this report was retrieved"}</h4>
      <ul className={styles.identifiers}>{candidate.details.map(detail => <li key={detail.key}>
        <span className={styles.identifierKind}>{detail.kind === "reported_alias" ? "Reported alias" : detail.kind === "amount" ? "Amount" : "Item"}</span>
        <bdi className={styles.identifierValue}>{detail.value}</bdi>
        <details><summary>{text.proof}</summary><p>{text.yours}</p><blockquote dir="auto">{detail.quote}</blockquote><p>{text.related}</p><blockquote dir="auto">{detail.catalogueQuote}</blockquote></details>
      </li>)}</ul>
    </section>}
    {candidate.semantic && <section>
      <h4>{language === "hi" ? "मिलते-जुलते विवरण" : "Similar account details"}</h4>
      <details><summary>{text.proof}</summary><p>{text.yours}</p><blockquote dir="auto">{candidate.semantic.query}</blockquote><p>{text.related}</p><blockquote dir="auto">{candidate.semantic.quote}</blockquote></details>
    </section>}
    {Boolean(candidate.identifiers?.length) && <section aria-label={text.identifiers}>
      <h4>{text.identifiers}</h4>
      <ul className={styles.identifiers}>{candidate.identifiers!.map(identifier => <li key={`${identifier.kind}:${identifier.value}`}>
        <span className={styles.identifierKind}>{text[identifier.kind]}</span>
        <bdi dir="ltr" className={styles.identifierValue}>{identifier.value}</bdi>
        <details><summary>{text.proof}</summary>
          <p>{text.yours}</p><blockquote dir="auto">{identifier.quote}</blockquote>
          <p>{text.related}</p><blockquote dir="auto">{identifier.catalogueSource.quote}</blockquote>
        </details>
      </li>)}</ul>
    </section>}
    <p className={styles.caution} lang="en">{candidate.linkage.explanation}</p>
    {candidate.resolution && <section aria-label={text.outcome}>
      <div className={styles.outcomeHeading}><h4>{text.outcome}</h4><span className={styles.status} data-status={candidate.resolution.status}>{text[candidate.resolution.status]}</span></div>
      <p lang="en">{candidate.resolution.summary}</p>
      <p className={styles.sourceNote}>{text.reported}</p>
      {candidate.resolution.actions.length ? <ol className={styles.actions}>{candidate.resolution.actions.map(action => <li key={`${action.sourceMessageId}:${action.kind}:${action.date}`}>
        <time dateTime={action.date}>{new Intl.DateTimeFormat(language === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${action.date}T00:00:00Z`))}</time>
        <p lang="en">{action.description}</p>
      </li>)}</ol> : <p className={styles.sourceNote}>{text.noActions}</p>}
    </section>}
    {Boolean(candidate.evidence?.length) && <details className={styles.evidence}>
      <summary>{text.evidence} · {candidate.evidence!.length}</summary>
      <ul>{candidate.evidence!.map(file => <li key={file.id}>
        <strong>{file.name}</strong><p>{file.format === "png" ? text.image : text.text}</p>
        <details><summary>{text.fingerprint}</summary><code>{file.sha256}</code></details>
      </li>)}</ul>
      <p className={styles.sourceNote}>{text.private}</p>
    </details>}
  </div>;
}
