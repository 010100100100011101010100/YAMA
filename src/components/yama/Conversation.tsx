"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Copy } from "@/lib/copy";
import { messageCopy } from "@/lib/copy";
import type { AgentId, Language, Message } from "@/lib/demo-state";
import { AGENT_NAMES } from "./AgentRail";
import AgentPortrait from "./AgentPortrait";
import { ChatMessageView } from "@/components/primitives/ChatComposer";
import StreamingText from "@/components/primitives/StreamingText";
import { dialogueText } from "./DialogueStatus";
import { ArrowRight } from "lucide-react";
import { chatText } from "@/lib/chat-copy";
import { Button } from "@/components/atoms/Button";

export default function Conversation({ messages, language, copy, activity, speakingAgent, deliveryId, onDelivered, onConnections }: { messages: Message[]; language: Language; copy: Copy; activity?: ReactNode; speakingAgent: AgentId | null; deliveryId?: string; onDelivered?: (id: string) => void; onConnections?: () => void }) {
  const transcript = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const [seenCount, setSeenCount] = useState(messages.length);
  const latest = messages.at(-1);
  useEffect(() => {
    if (!deliveryId || !onDelivered) return;
    // StreamingText renders the whole validated reply immediately. Acknowledge
    // only after its DOM commit, and defer background-tab delivery until visible.
    const deliver = () => { if (document.visibilityState !== "hidden") onDelivered(deliveryId); };
    deliver(); document.addEventListener("visibilitychange", deliver);
    return () => document.removeEventListener("visibilitychange", deliver);
  }, [deliveryId, onDelivered]);
  useLayoutEffect(() => {
    if (following && transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages.length, following]);
  useEffect(() => {
    const node = transcript.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      // A work disclosure can resize the log without adding a message.
      // Follow only when the reader has already chosen to remain at the end.
      if (following) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [following]);
  return <section className={`conversation ${messages.length === 1 ? "conversation-empty" : ""}`}>
    <div ref={transcript} className="transcript" role="log" aria-label="Conversation" aria-live="off" tabIndex={0}
      onScroll={event => {
        const node = event.currentTarget;
        if (following) setSeenCount(messages.length);
        setFollowing(node.scrollHeight - node.clientHeight - node.scrollTop < 36);
      }}>
      <div ref={content} className="transcript-content">
      {messages.length === 1 && <h2 className="conversation-invite">{copy.storyTitle}</h2>}
      {messages.map(message => <ChatMessageView key={message.id} id={`message-${message.id}`}
        fromUser={message.agent === "you"} label={message.agent === "you" ? message.evidenceSource ? `${copy.source} · ${message.evidenceSource.name}` : copy.you : AGENT_NAMES[message.agent]}
        role={message.agent === "you" ? undefined : message.dialogue?.handoff ? `→ ${AGENT_NAMES[message.dialogue.handoff.target]}` : chatText(language).everyone}
        avatar={message.agent !== "you" ? <AgentPortrait className="message-avatar" agent={message.agent} speaking={latest?.id === message.id && speakingAgent === message.agent} /> : undefined}
        language={message.id === "example-story" ? "en" : message.dialogue ? message.dialogue.language === "hi" ? "hi" : "en" : message.agent === "you" ? undefined : language === "hi" ? "hi" : "en"}
        body={message.agent === "you" ? <>{message.text}{message.voiceSource&&<details className="comparison-source"><summary>{language==="hi"?"समीक्षा किया गया वॉइस पाठ":"Reviewed voice transcription"}</summary><p dir="auto" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{message.voiceSource.rawTranscript}</p><p>{language==="hi"?"मूल स्वचालित पाठ; आपकी समीक्षा किए गए शब्द ऊपर हैं।":"Original automatic transcript; your reviewed words are shown above."}</p></details>}</> : <><StreamingText text={message.key ? messageCopy(message.key, language, copy) : message.text} />
          {message.dialogue?.handoff&&<p className="agent-handoff"><span>{AGENT_NAMES[message.agent as AgentId]}</span><ArrowRight size={14} aria-hidden="true"/><span>{AGENT_NAMES[message.dialogue.handoff.target]}</span><span className="handoff-reason">{chatText(language)[message.dialogue.handoff.reason]}</span></p>}
          {message.dialogue?.older && <p className="earlier-reply">{dialogueText(language).older}</p>}
          {message.dialogue?.connectionReceipt && !message.dialogue.older && onConnections && <Button variant="quiet" size="sm" onClick={onConnections}>{language === "hi" ? "तुलना के स्रोत देखें" : language === "hinglish" ? "Comparison ke sources dekhein" : "View comparison sources"}</Button>}</>} />)}
      {activity}
      </div>
    </div>
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {following && latest && latest.agent !== "you" && latest.id !== "welcome" && <span key={latest.id}>{AGENT_NAMES[latest.agent]}: {latest.key ? messageCopy(latest.key, language, copy) : latest.text}</span>}
      {!following && messages.length > seenCount && <span>{language === "hi" ? "नए संदेश उपलब्ध हैं" : "New messages are available"} ({messages.length - seenCount})</span>}
    </div>
    {!following && messages.length > seenCount && <button className="new-messages" onClick={() => setFollowing(true)}>{language === "hi" ? "नए संदेश देखें" : "See new messages"} ({messages.length - seenCount})</button>}
  </section>;
}
