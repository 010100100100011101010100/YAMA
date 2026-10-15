"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ArrowRight, FileText, FolderOpen, MessageCircle, Mic, Pause, Play, Settings2, Square, Check } from "lucide-react";
import { createDemoState, demoReducer, hasCurrentConfirmation, matchesComparisonFixture } from "@/lib/demo-state";
import { getCopy } from "@/lib/copy";
import { runDemoComparison } from "@/lib/demo-adapter";
import PromptBar from "@/components/primitives/PromptBar";
import ChatComposer from "@/components/primitives/ChatComposer";
import { Button } from "@/components/atoms/Button";
import SidebarNav from "@/components/primitives/SidebarNav";
import { AGENTS, AGENT_NAMES, roleFor } from "./AgentRail";
import AgentPortrait from "./AgentPortrait";
import Conversation from "./Conversation";
import ReportReview from "./ReportReview";
import EvidencePicker from "./EvidencePicker";
import SavedEvidencePicker from "./SavedEvidencePicker";
import TaskStatus from "./TaskStatus";
import Connections from "./Connections";
import NextSteps from "./NextSteps";
import SidePanel from "./SidePanel";
import { useReportPersistence } from "@/lib/use-report-persistence";
import { getSavedCopy, persistenceText } from "@/lib/persistence-copy";
import type { ReportApi } from "@/lib/report-api";
import type { AgentApi } from "@/lib/agent-api";
import AgentProposalReview from "./AgentProposalReview";
import extractionExamples from "../../../agents/fixtures/incidents.json";
import { useDialogue } from "@/lib/use-dialogue";
import type { DialogueApi } from "@/lib/dialogue-api";
import { conversationMessages } from "@/lib/dialogue-view";
import DialogueStatus from "./DialogueStatus";
import VoiceCall from "./VoiceCall";
import ChatHistory from "./ChatHistory";
import AgentInfo from "./AgentInfo";
import { reportApi } from "@/lib/report-api";
import { useChats } from "@/lib/use-chats";
import { chatText, agentNature } from "@/lib/chat-copy";
import { AGENT_ALIASES, resolveAgentAddress } from "@/lib/agent-addressing";

type Panel = "review" | "connections" | "steps" | "evidence" | "settings";

type StoryroomProps = {persisted?:boolean;api?:ReportApi;agentTasksApi?:AgentApi;conversationsApi?:DialogueApi};
export default function Storyroom(props:StoryroomProps) {
  const [navigation,setNavigation]=useState<{id:string|null|undefined;key:number;drafts:Record<string,string>}>({id:undefined,key:0,drafts:{}});
  return <StoryroomView {...props} key={navigation.key} initialReportId={navigation.id} initialDraft={navigation.drafts[navigation.id??"new"]??""} onOpenChat={(id,currentId,draft)=>{
    if(id!==null&&id===currentId)return;
    setNavigation(current=>{const drafts={...current.drafts,[currentId??"new"]:draft};if(current.id==null&&currentId!==null)delete drafts.new;return {id,key:current.key+1,drafts};});
  }}/>;
}
function StoryroomView({ persisted = true, api=reportApi, agentTasksApi, conversationsApi,initialReportId,initialDraft,onOpenChat }: StoryroomProps & {initialReportId?:string|null;initialDraft:string;onOpenChat:(id:string|null,currentId:string|null,draft:string)=>void}) {
  const [state, dispatch] = useReducer(demoReducer, undefined, () => ({ ...createDemoState(), backend: persisted }));
  const persistence = useReportPersistence(persisted, state, dispatch, api, initialReportId);
  const chats=useChats(persisted,api,persistence.report);
  const handle = persistence.handle;
  const dialogue = useDialogue(persisted, persistence.report, conversationsApi);
  const savedDialogue = dialogue.state;
  useEffect(() => {
    if (savedDialogue) dispatch({ type: "sync-dialogue", agent: savedDialogue.activeAgent, automatic: savedDialogue.automatic, language: savedDialogue.language });
  }, [savedDialogue]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const selectionFocused=useRef(false);
  useEffect(()=>{
    if(initialReportId===undefined||persistence.phase!=="ready"||selectionFocused.current)return;
    selectionFocused.current=true;
    if(!panel)document.getElementById("message")?.focus({preventScroll:true});
  },[initialReportId,persistence.phase,panel]);
  const [draft, setDraft] = useState(initialDraft);
  const [recipient, setRecipient] = useState<typeof state.activeAgent>("saathi");
  const [sendError, setSendError] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiceBusy,setVoiceBusy]=useState(false);
  const [liveSpeaker,setLiveSpeaker]=useState<typeof state.activeAgent|null>(null);
  const voiceStop=useRef<(()=>Promise<void>)|null>(null);
  const registerVoiceStop=useCallback((stop:(()=>Promise<void>)|null)=>{voiceStop.current=stop;},[]);
  const [failMessage, setFailMessage] = useState(false);
  const [failComparison, setFailComparison] = useState(false);
  const [request, setRequest] = useState<{ id: string; fail: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const voiceControls = useRef<HTMLDivElement>(null);
  const closePanel = useCallback(() => setPanel(null), []);
  const copy = persisted ? getSavedCopy(state.language) : getCopy(state.language);
  const savedCopy = persistenceText(state.language);
  const chatCopy=chatText(state.language);
  const switchDisabled=persistence.busy||sending||dialogue.busy||voiceBusy||persistence.phase==="error";
  async function openChat(id:string|null) {if(switchDisabled)return;if(voiceStop.current)await voiceStop.current();onOpenChat(id,state.reportId,draft);}
  const task = state.task;
  const messages = conversationMessages(state.messages, savedDialogue, state.revision);
  const latestMessage = messages.at(-1)!;
  const deliver = dialogue.deliver;
  const deliverReply = useCallback((id: string) => { void deliver(id); }, [deliver]);
  const deliveryId = !savedDialogue?.voiceSessionId && !persistence.busy && !sending && state.mode === "text" && savedDialogue?.turn?.status === "ready" && savedDialogue.turn.revision === state.revision ? savedDialogue.turn.id : undefined;
  function selectAgent(agent: typeof state.activeAgent) {
    setRecipient(agent);
    dispatch({ type: "select-agent", agent });
    if (persisted) void dialogue.control({ operation: "select", agent });
  }
  function changeMode(mode: typeof state.mode) {
    dispatch({ type: "mode", mode });
    if (persisted && state.mode !== "voice") void dialogue.control({ operation: "stop" });
  }
  const [replyPresentation, setReplyPresentation] = useState({ id: latestMessage.id, active: false });
  if (replyPresentation.id !== latestMessage.id) {
    // Track a new delivered message, without replaying it on unrelated changes.
    setReplyPresentation({ id: latestMessage.id, active: latestMessage.agent !== "you" });
  }

  useEffect(() => {
    if (!replyPresentation.active) return;
    // A short arrival cue for a delivered text reply, never simulated audio.
    const timer = setTimeout(() => setReplyPresentation(current => ({ ...current, active: false })), 2400);
    return () => clearTimeout(timer);
  }, [replyPresentation.id, replyPresentation.active]);
  const speakingAgent = state.mode === "voice"
    ? persisted ? liveSpeaker : state.voice === "playing" ? state.activeAgent : null
    : replyPresentation.active && latestMessage.agent !== "you" && latestMessage.agent === state.activeAgent ? latestMessage.agent : null;

  useEffect(() => {
    if (persisted) return;
    if (task?.status !== "running" || !request || request.id !== task.id) return;
    const controller = new AbortController();
    runDemoComparison(controller.signal, request.fail).then(outcome => {
      if (!controller.signal.aborted) dispatch({ type: "finish-task", id: task.id, revision: task.revision, outcome });
    }).catch(error => {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError"))
        dispatch({ type: "finish-task", id: task.id, revision: task.revision, outcome: "failed" });
    });
    return () => controller.abort();
  }, [task, request, persisted]);

  function openPanel(destination: Panel) {
    if (destination === "review" || destination === "steps" || destination === "connections") {
      const effective = destination === "connections" && !hasCurrentConfirmation(state) ? "review" : destination;
      dispatch({ type: "navigate", stage: effective });
      setPanel(effective);
    } else setPanel(destination);
  }
  function runComparison() {
    if (!hasCurrentConfirmation(state) || persistence.busy || state.task?.status === "running") return;
    const id = crypto.randomUUID();
    setRequest({ id, fail: failComparison }); setFailComparison(false);
    handle({ type: "start-task", id });
    setPanel(null);
  }
  function chooseFile() { openPanel("evidence"); if (!persisted || state.reportId) fileInput.current?.click(); }
  async function sendMessage() {
    if (!draft.trim() || sending || voiceBusy) return;
    if (failMessage) { setFailMessage(false); setSendError(true); return; }
    const submitted = draft;
    const address = resolveAgentAddress(submitted, recipient);
    setSending(true);
    if(persisted&&state.mode==="voice"&&voiceStop.current)await voiceStop.current();
    if (persisted && savedDialogue?.turn && ["queued", "running", "ready"].includes(savedDialogue.turn.status)) await dialogue.control({ operation: "stop" });
    const saved = await handle({ type: "send-message", id: crypto.randomUUID(), text: submitted, recipient });
    if (saved === false) { setSendError(true); setSending(false); return; }
    setDraft(current => current === submitted ? "" : current); setSendError(false);
    if (persisted) {
      dispatch({ type: "mode", mode: "text" });
      const report = persistence.currentReport();
      if (report) await dialogue.requestReply(report, address.initialAgent, state.automaticHandoffs, state.language);
    }
    setSending(false);
  }
  function showComparison() { dispatch({ type: "show-comparison" }); setPanel("connections"); }
  const panelTitle = panel ? { review: copy.reviewTitle, connections: copy.connectionsTitle, steps: copy.nextTitle, evidence: copy.files, settings: copy.settingsTitle }[panel] : "";
  const notice = state.notice && !["taskReady", "taskFailed", "taskCanceled"].includes(state.notice)
    && !(task?.status === "stale" && state.notice === "changed") ? copy[state.notice] : "";
  const saveStatus = persisted && (persistence.error || persistence.phase === "loading" || persistence.phase === "saving") && <div className="demo-note" role={persistence.error ? "alert" : "status"}>
    {persistence.error ? persistence.error === "revision_conflict" || persistence.error === "confirmation_required" ? savedCopy.conflict : persistence.phase === "session_lost" ? savedCopy.sessionLost : persistence.error === "projection_pending" ? savedCopy.pending : task?.status === "failed" ? copy.taskFailed : state.reportId || sendError ? savedCopy.failed : savedCopy.loadFailed
      : persistence.phase === "loading" ? savedCopy.loading : savedCopy.saving}
    {persistence.error && persistence.phase === "error" && <Button variant="quiet" size="sm" onClick={persistence.retryLoad}>{savedCopy.retry}</Button>}
    {persistence.phase === "session_lost" && <Button variant="quiet" size="sm" onClick={() => window.location.reload()}>{savedCopy.reload}</Button>}
  </div>;

  return <div className="storyroom" lang={state.language === "hi" ? "hi" : "en"}>
    <a className="skip-link" href="#main">{state.language === "hi" ? "मुख्य भाग पर जाएँ" : "Skip to main content"}</a>
    <SidebarNav label={chatCopy.chats}
      collapseLabel={state.language === "hi" ? "साइडबार छोटा करें" : "Collapse sidebar"} expandLabel={state.language === "hi" ? "साइडबार खोलें" : "Expand sidebar"}
      closeLabel={state.language === "hi" ? "साइडबार बंद करें" : "Close sidebar"}
      onNavigate={key => openPanel(key as Panel)} items={[]}
      footer={<><label className="language-picker"><span className="sr-only">{copy.language}</span>
        <select value={state.language} disabled={dialogue.busy||voiceBusy} onChange={event => { const language = event.target.value as typeof state.language; dispatch({ type: "language", language }); if (persisted) void dialogue.control({ operation: "language", language }); }}><option value="en">English</option><option value="hi">हिन्दी</option><option value="hinglish">Hinglish</option></select>
      </label><Button data-sidebar-dismiss variant="quiet" size="icon" aria-label={copy.options} aria-expanded={panel === "settings"} onClick={() => openPanel("settings")}><Settings2 size={20} /></Button></>}>
        <ChatHistory chats={chats.chats} activeId={state.reportId} language={state.language} disabled={switchDisabled} loading={chats.loading} error={chats.error} onSelect={id=>{void openChat(id);}} onNew={()=>{void openChat(null);}} onRetry={chats.retry}/>
    </SidebarNav>
    <main id="main" tabIndex={-1} className={`room-body ${panel ? "has-panel" : ""}`}>
      <ChatComposer title={copy.conversationTitle} className={state.mode === "voice" ? "voice-workspace" : ""}
        selectedTab={state.mode} onTabChange={mode => changeMode(mode as typeof state.mode)}
        tabs={[{ id: "text", label: copy.text, icon: <MessageCircle size={18} /> }, { id: "voice", label: copy.voiceMode, icon: <Mic size={18} /> }]}>
        <div className="conversation-tools">
          <Button variant="quiet" size="sm" onClick={()=>openPanel("review")} aria-expanded={panel==="review"}><FileText size={16}/>{copy.notes}</Button>
          <Button variant="quiet" size="sm" onClick={()=>openPanel("evidence")} aria-expanded={panel==="evidence"}><FolderOpen size={16}/>{copy.files}</Button>
          <Button variant="quiet" size="sm" onClick={()=>openPanel("steps")} aria-expanded={panel==="steps"}><ArrowRight size={16}/>{copy.steps}</Button>
          {chats.status&&<div className="chat-resolution-controls"><span className="current-chat-status" role="status" aria-live="polite" data-resolution={chats.status.resolution}><span className="chat-status-dot" aria-hidden="true"/>{chatCopy[chats.status.resolution]}</span><Button variant="quiet" size="sm" disabled={chats.saving||switchDisabled} onClick={()=>{void chats.toggle();}}>{chats.status.resolution==="resolved"?<MessageCircle size={16}/>:<Check size={16}/>} <span className="chat-resolution-label">{chats.status.resolution==="resolved"?chatCopy.reopen:chatCopy.resolve}</span></Button></div>}
          {chats.statusError&&<p role="alert" className="chat-status-error">{chatCopy.statusFailed}<Button variant="quiet" size="sm" onClick={chats.retry}>{chatCopy.retry}</Button></p>}
        </div>
        <div className={`conversation-stage ${state.messages.length === 1 ? "stage-empty" : ""}`}>
        {state.mode === "voice" && <div className="voice-preview">
          <div className="voice-speaker"><AgentPortrait className="voice-portrait" agent={state.activeAgent} speaking={speakingAgent === state.activeAgent} /><h2>{AGENT_NAMES[state.activeAgent]}</h2><p>{roleFor(copy, state.activeAgent)}</p></div>
          {persisted ? <VoiceCall report={persistence.report} dialogue={savedDialogue} language={state.language} disabled={persistence.busy||sending||dialogue.busy} onReport={persistence.adoptReport} onSpeaking={setLiveSpeaker} onBusy={setVoiceBusy} onControl={registerVoiceStop} onText={()=>dispatch({type:"mode",mode:"text"})}/> : <><div ref={voiceControls} className="voice-controls"><Button variant="primary" onClick={() => dispatch({ type: "voice", status: state.voice === "playing" ? "paused" : "playing" })}>{state.voice === "playing" ? <Pause size={18} /> : <Play size={18} />}{state.voice === "playing" ? copy.pause : state.voice === "paused" ? copy.resume : copy.play}</Button>
            <Button variant="secondary" disabled={state.voice !== "playing" && state.voice !== "paused"} onClick={() => { dispatch({ type: "voice", status: "interrupted" }); voiceControls.current?.querySelector("button")?.focus({ preventScroll: true }); }}><Square size={16} />{copy.interrupt}</Button>
          </div>
          <span className="voice-state" role="status">{state.voice === "interrupted" ? copy.interrupted : state.voice === "playing" ? copy.voicePlaying : state.voice === "paused" ? copy.voicePaused : copy.voiceOff}</span>
          <p className="voice-note">{copy.voiceNote}</p></>}
        </div>}
        <Conversation messages={messages} language={state.language} copy={copy} speakingAgent={speakingAgent} deliveryId={deliveryId} onDelivered={deliverReply}
          onConnections={() => { runComparison(); openPanel("connections"); }}
          activity={<>{persisted && state.reportId && <DialogueStatus dialogue={savedDialogue} revision={state.revision} language={state.language} error={dialogue.error} readError={dialogue.readError} busy={dialogue.busy || persistence.busy} onStop={() => { void dialogue.control({ operation: "stop" }); }} onRetry={() => dialogue.retry(recipient)} onReload={dialogue.retryRead} />}
            <TaskStatus task={task} copy={copy} backend={persisted} comparisonAvailable={persisted ? !!state.connections?.candidates.length : matchesComparisonFixture(state)} onCancel={() => dispatch({ type: "cancel-task" })} onRetry={runComparison} onShow={showComparison} /></>} />
        </div>
        <div className="composer-area">
          <div className={state.notice === "handoff" ? "sr-only" : "notice"} role={state.notice === "acknowledgeNeeded" ? "alert" : "status"} aria-live="polite">{notice}</div>
          {!panel && saveStatus}
          <PromptBar value={draft} onChange={setDraft} onSend={sendMessage} onAttach={chooseFile} error={sendError && !persisted} disabled={persistence.busy || sending || voiceBusy} pending={persistence.phase === "saving" || sending || voiceBusy} copy={copy} placeholder={state.language === "hi" ? `${AGENT_NAMES[recipient]} को संदेश लिखें…` : `${copy.talkingTo} ${AGENT_NAMES[recipient]}…`}
            onVoice={state.mode === "text" ? () => changeMode("voice") : undefined}
            mentionLabel={state.language === "hi" ? "एजेंट" : "Agents"}
            mentionActions={AGENTS.map(agent => ({ key: agent, name: `@${AGENT_NAMES[agent]}`, description: agentNature[state.language][agent].nature,
              insertText: `@${AGENT_NAMES[agent]} `, keywords: Object.entries(AGENT_ALIASES).filter(([, target]) => target === agent).map(([name]) => name) }))}
            sourceActions={[
              { key: "files", name: copy.addEvidence, description: state.language === "hi" ? "इस उपकरण से फ़ाइल चुनें" : "Add a file from this device", onPick: chooseFile },
              { key: "notes", name: copy.notes, description: copy.reviewTitle, onPick: () => openPanel("review") },
            ]}
            commandActions={[
              { key: "review", name: "/review", description: copy.reviewTitle, onPick: () => openPanel("review") },
              { key: "files", name: "/files", description: copy.evidence, onPick: () => openPanel("evidence") },
              { key: "steps", name: "/next", description: copy.nextTitle, onPick: () => openPanel("steps") },
            ]}
            agentControl={<div className="composer-agent-control"><label className="composer-agent"><span className="sr-only">{state.language === "hi" ? "एजेंट चुनें" : "Choose an agent"}</span><select disabled={dialogue.busy||voiceBusy||sending} value={recipient} onChange={event => selectAgent(event.target.value as typeof state.activeAgent)}>{AGENTS.map(agent => <option key={agent} value={agent}>{AGENT_NAMES[agent]}</option>)}</select></label><AgentInfo key={recipient} agent={recipient} language={state.language}/></div>} />
          <div className="story-actions"><Button variant="secondary" disabled={state.example || persistence.busy||voiceBusy} onClick={() => { void handle({ type: "load-example" }); }}>{state.example ? copy.exampleUsed : copy.example}<ArrowRight size={16} /></Button>
            {state.details.length > 0 && <Button variant="primary" onClick={() => openPanel("review")}>{copy.reviewAction}<ArrowRight size={16} /></Button>}
          </div>
        </div>
      </ChatComposer>
      <SidePanel open={panel !== null} panelId={panel} title={panelTitle} closeLabel={copy.closePanel} onClose={closePanel}>
        {panel && saveStatus}
        {panel === "review" && <><p className="panel-lead">{copy.reviewLead}</p>
          {persisted && <AgentProposalReview report={persistence.report} language={state.language} disabled={persistence.busy||voiceBusy} api={agentTasksApi}
            onAccept={async (taskId, resultHash, proposalIds) => await handle({ type: "accept-proposals", taskId, resultHash, proposalIds }) === true}
            onExample={async () => {
              const example = extractionExamples.find(example => example.language === (persistence.report?.language ?? state.language))!;
              return await handle({ type: "send-message", id: crypto.randomUUID(), text: example.narrative }) === true;
            }} />}
          <ReportReview state={state} copy={copy} dispatch={handle} onRun={runComparison} busy={persistence.busy||voiceBusy} /></>}
        {panel === "connections" && <><p className="panel-lead">{copy.connectionsLead}</p><Connections state={state} copy={copy} onRun={runComparison} onNext={() => openPanel("steps")} /></>}
        {panel === "steps" && <><p className="panel-lead">{copy.nextLead}</p><NextSteps state={state} copy={copy} persisted={persisted} report={persistence.report} disabled={persistence.busy || sending} onFiles={() => openPanel("evidence")} /></>}
        <div hidden={panel !== "evidence"}>{persisted
          ? <SavedEvidencePicker key={state.reportId ?? "empty"} reportId={state.reportId} inputRef={fileInput} copy={copy} language={state.language} disabled={persistence.busy||voiceBusy} onAttempt={() => openPanel("evidence")} onReview={async (id, sha256, textSha256) => await handle({ type: "review-evidence", id, sha256, textSha256 }) === true} />
          : <EvidencePicker evidence={state.evidence} inputRef={fileInput} copy={copy} onAttempt={() => openPanel("evidence")} onAdd={evidence => dispatch({ type: "add-evidence", evidence })} onRemove={id => dispatch({ type: "remove-evidence", id })} />}</div>
        {panel === "settings" && <div className="conversation-settings"><label className="handoff-option"><input type="checkbox" checked={state.automaticHandoffs} disabled={dialogue.busy||voiceBusy} onChange={event => { dispatch({ type: "automatic-handoffs", enabled: event.target.checked }); if (persisted) void dialogue.control({ operation: "automatic", enabled: event.target.checked }); }} />{copy.automatic}</label>
          {!persisted && <details className="demo-controls"><summary>{copy.controls}</summary><div><label><input type="checkbox" checked={failMessage} onChange={event => setFailMessage(event.target.checked)} />{copy.failMessage}</label><label><input type="checkbox" checked={failComparison} onChange={event => setFailComparison(event.target.checked)} />{copy.failComparison}</label></div></details>}
        </div>}
      </SidePanel>
    </main>
  </div>;
}
