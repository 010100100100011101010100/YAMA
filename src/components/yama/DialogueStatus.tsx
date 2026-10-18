import type { Dialogue } from "@/lib/dialogue";
import type { Language } from "@/lib/demo-state";
import AgentPortrait from "./AgentPortrait";
import {chatText} from "@/lib/chat-copy";
import { Button } from "@/components/atoms/Button";
import { AGENT_NAMES } from "./AgentRail";
import StreamingText from "@/components/primitives/StreamingText";
import { ChatMessageView } from "@/components/primitives/ChatComposer";

export function dialogueText(language: Language) {
  if (language === "hi") return { working: "उत्तर तैयार हो रहा है", queued: "उत्तर का इंतज़ार है", stop: "उत्तर रोकें", retry: "चुने हुए एजेंट से पूछें",
    refreshFailed: "बातचीत फिर लोड नहीं हो सकी। आपके संदेश सुरक्षित हैं।", refreshRetry: "फिर लोड करें",
    failed: "उत्तर नहीं आया। आपकी बात सेव है।", canceled: "उत्तर रोक दिया गया।", stale: "नोट्स बदल गए। नया उत्तर माँगें।", fixture: "लिखा हुआ डेमो उत्तर", ai: "AI का उत्तर · सत्यापित नहीं", older: "पुराना उत्तर", revision: "संस्करण" };
  if (language === "hinglish") return { working: "Reply taiyar ho raha hai", queued: "Reply ka intezaar hai", stop: "Reply rokein", retry: "Selected agent se poochein",
    refreshFailed: "Conversation refresh nahi hui. Aapke messages saved hain.", refreshRetry: "Phir load karein",
    failed: "Reply nahi aaya. Aapki baat saved hai.", canceled: "Reply rok diya gaya.", stale: "Notes badal gaye. Naya reply maangein.", fixture: "Authored demo reply", ai: "AI reply · verified nahi", older: "Purana reply", revision: "Revision" };
  return { working: "Preparing a reply", queued: "Waiting for a reply", stop: "Stop reply", retry: "Ask selected agent",
    refreshFailed: "The conversation couldn’t refresh. Your messages are saved.", refreshRetry: "Retry loading",
    failed: "The reply is unavailable. Your words are saved.", canceled: "Reply stopped.", stale: "Your notes changed. Ask for a new reply.", fixture: "Authored demo reply", ai: "AI reply · not verified", older: "Earlier reply", revision: "Revision" };
}
export default function DialogueStatus({ dialogue, language, error, readError = "", busy, onStop, onRetry, onReload = onRetry,revision }: {
  revision?:number; dialogue: Dialogue | null; language: Language; error: string; busy: boolean; onStop: () => void; onRetry: () => void;
  readError?: string; onReload?: () => void;
}) {
  const text = dialogueText(language), turn = dialogue?.turn;
  const processing = !!turn && !dialogue?.voiceSessionId && (revision===undefined||turn.revision===revision) && ["queued", "running"].includes(turn.status);
  const failed = !!error || turn && ["failed", "canceled", "stale"].includes(turn.status);
  if (readError && !error) return <div className="agent-work">
    <p role="alert">{text.refreshFailed}</p>
    <Button variant="secondary" size="sm" disabled={busy} onClick={onReload}>{text.refreshRetry}</Button>
    {processing && <Button variant="quiet" size="sm" disabled={busy} onClick={onStop}>{text.stop}</Button>}
  </div>;
  if (processing) return <>
    {turn.preview?.text && <><hr className="message-divider" aria-hidden="true"/><ChatMessageView id={`preview-${turn.id}`} label={AGENT_NAMES[turn.agent]} role={language === "hi" ? "लिख रहे हैं…" : "Writing…"} fromUser={false}
      avatar={<AgentPortrait className="message-avatar" agent={turn.agent} speaking={false}/>}
      body={<StreamingText text={turn.preview.text} streaming language={language === "hi" ? "hi" : "en"}/>}/></>}
    <div className="agent-work">
    <div className="typing-indicator" role="status" aria-live="polite"><AgentPortrait className="message-avatar" agent={turn.agent} speaking={false}/><span>{language==="en"&&turn.status==="queued"?`${chatText(language).waiting} ${AGENT_NAMES[turn.agent]}`:`${AGENT_NAMES[turn.agent]} ${turn.status==="queued"?chatText(language).waiting:chatText(language).typing}`}</span><span className="typing-dots" aria-hidden="true"><i/><i/><i/></span></div>
    <Button variant="secondary" size="sm" disabled={busy} onClick={onStop}>{text.stop}</Button>
  </div></>;
  if (failed || dialogue && (!turn || turn.status === "delivered")) return <div className="agent-work">
    {failed && <p role={error ? "alert" : "status"}>{error ? text.failed : turn?.status === "stale" ? text.stale : turn?.status === "canceled" ? text.canceled : text.failed}</p>}
    <Button variant="secondary" size="sm" disabled={busy} onClick={onRetry}>{text.retry}</Button>
  </div>;
  return null;
}
