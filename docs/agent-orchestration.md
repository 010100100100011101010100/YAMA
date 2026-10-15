# Three birds, one conversation

2026-10-07. The user wants three distinct agents, direct voice/text access, natural handoffs, common and specialist function calls, and individual skill files. Birds remain a liked direction; exact silhouettes and voices are still provisional.

## Roles and tools

| Agent | User-facing job | Specialist capabilities |
| --- | --- | --- |
| **Saathi · Your account** | Listen, clarify, reconstruct the timeline, and prepare details for review | `propose_draft_assertions`, `propose_timeline`, `identify_missing_information` |
| **Drishti · Connections** | Find permitted similar incidents and explain similarities, differences, and uncertainty | `find_similar_cases`, `query_connection_paths`, `compare_entities`, `explain_connection` |
| **Disha · Next steps** | Offer practical options and prepare material the user can inspect | `find_reporting_options`, `prepare_incident_summary`, `prepare_evidence_manifest`, `propose_next_actions` |

All three share `read_own_account`, `read_authorized_evidence`, `ask_user_question`, `lookup_verified_assistance`, `request_handoff`, and `delegate_task`. This lets the current companion help immediately and arrange specialist work without impersonating a colleague.

`agents/capabilities.json` defines allowlists and confirmation requirements. `agents/shared-policy.md` supplies common constraints; each role has its own `SKILL.md`. `load_profile()` combines common policy with exactly one role's instructions/tools. These are Yama runtime files, not global Codex skills. The [authenticated dispatcher](agent-dispatcher.md) now connects owned report/evidence reads, Saathi fixture proposals, Drishti's existing graph comparison and Disha's draft summary/manifest. Remaining assistance/action capabilities are future contracts.

The coordinator checks the **worker's** permissions for delegated tasks. Saathi can ask Drishti to search but cannot acquire Drishti's graph tools. Graph and connection tools require explicit confirmation of the current report revision. Disha's assistance can begin earlier. No role can confirm a report, write graph assertions, run arbitrary database queries, change payment entitlements, submit complaints, send messages, or publish content.

## What the user sees

Keep one shared transcript, composer, and microphone. A compact row shows three dithered birds with their names and purpose. A quiet “Speaking” or “Responding” label identifies the current companion; another can show “Checking similar cases.” Inactive birds remain still. Pose differences can express listening, careful observation, and orientation; species and finished assets are not yet selected.

Choosing a bird means “talk to this agent,” not opening a separate chat or restarting the story. Support “let me speak to Disha” and “stay with Saathi” through the same trusted selection/preference controller. A user can switch voice/text at any point. The transcript retains speaker attribution and the report stays beside the conversation when review or evidence is needed.

On a handoff, keep the transcript and reading position in place. Attribute the outgoing bridge to its real speaker, then update the active bird and begin the incoming response. Do not animate a full-screen scene change, create three competing chat panes, or run theatrical inter-agent banter. Distinct identities should make responsibility legible without making a sensitive account feel like a performance.

In voice, keep captions visible and use a distinct, consistent Sarvam TTS voice per agent: two female voices and one male voice, assigned after auditions. Offer English, Hindi, and Hinglish for both text and voice, with more Indian languages later. Name the incoming agent briefly on first entry and handoff. In text, use a persistent name and bird beside each message. Do not rely on colour, sound, or animation alone to identify the speaker.

The bird selector should use ordinary labelled buttons with a visible active state. Announce a completed handoff once in a polite status region; do not announce every streamed character. Automatic handoffs never move keyboard focus. Manual selections keep focus on the selected control. Preserve scroll position unless the user is following the newest messages. Under reduced motion, poses stay static and statuses remain readable.

## Example: a search runs while help continues

1. **Saathi** gathers the account and prepares the original-source review. The user corrects and explicitly confirms the current revision.
2. The coordinator registers **Drishti's** similar-case task. Only after the worker adapter actually accepts that work may the UI say it is running.
3. **Saathi:** “Drishti is checking for similar cases. Disha can help you organise next steps while that runs.” Saathi requests Disha; the speaker changes after the bridge finishes.
4. **Disha:** “I'm Disha. We can organise your evidence and reporting options while that runs.” Disha continues useful assistance without requiring a match.
5. Drishti's result becomes ready. It does not interrupt Disha or the user. At an appropriate boundary, **Disha:** “Drishti has a possible connection to explain.” A ready-result handoff names the exact task.
6. **Drishti** explains the permitted result with support, a difference, and limits. The user can ask a question, return to Disha for options, or choose Saathi to correct the account.

The dialogue above is illustrative. If the user is answering a question, an urgent need takes priority, or the search fails, do not perform that scheduled transition. Ready results can wait. No match and insufficient evidence are valid outcomes.

```mermaid
sequenceDiagram
    participant U as User
    participant S as Saathi
    participant C as Coordinator
    participant R as Drishti
    participant D as Disha
    U->>S: Narrate, review, and confirm
    S->>C: Delegate similar-case search
    C->>R: Start permitted background work
    S->>U: Brief bridge to Disha
    S->>C: Bridge delivery complete
    C->>D: Grant speaking turn
    D->>U: Offer practical next steps
    R-->>C: Current result ready
    Note over C,D: Result waits; it does not interrupt
    D->>C: Request Drishti after finishing
    C->>R: Grant speaking turn
    R->>U: Explain support, differences, and limits
```

## Coordinator contracts implemented now

`yama_agents/coordinator.py` is a provider-independent, standard-library Python foundation for the future voice worker. It stores turn metadata and opaque task references in memory; it does not itself store transcripts, execute tools, authenticate, persist evidence or call models. `yama_agents/dispatcher.py` adds authenticated domain reads and bounded fixture execution around those same leases, with backend revision/confirmation synchronization.

| Contract | Behavior |
| --- | --- |
| `OutputLease` | Binds one generation to its agent, mode, epoch, and report revision. Only the foreground agent can obtain one. Every text/audio chunk must pass `accepts_output()` before delivery. |
| `request_handoff()` | Queues a valid target and reason against the current output. Self/competing requests are rejected. Connection-ready transitions require a ready Drishti connection task. |
| `complete_output()` | Releases the turn and commits a queued handoff. Call after final text delivery or acknowledged audio playout, never merely after model generation/TTS synthesis. Duplicate or stale completion has no effect. |
| `begin_user_turn()` | Cancels current output and a pending handoff; no agent can begin speaking until `end_user_turn()`. Background work can continue. |
| `select_agent()` / `set_auto_handoffs()` | Trusted direct selection overrides pending transitions. “Stay with this agent” disables automatic changes. Automatic chains are limited to three handoffs until a user turn or manual selection. |
| `set_mode()` | Invalidates old output and cancels a pending transition while keeping the active agent, confirmation, and background tasks. Late audio is rejected. |
| `confirm_report(revision)` | Trusted user-action boundary, absent from the model tool registry. An acknowledgement for an old revision is rejected. |
| `edit_report()` | Increments revision, removes confirmation, cancels current output/transition, and marks running/ready tasks stale. Older result references are hidden. |
| `start_task()` | Checks the requesting turn, the worker's allowlist, background eligibility, and confirmation policy; creates a revision-bound receipt. The adapter starts actual work. |
| `complete_task()` / `cancel_task()` | Record exactly one outcome; duplicate, cancelled, or stale callbacks cannot turn into success. Task completion never seizes the speaking turn. |

Events contain only type, agent, target, opaque generation/task ID, mode, epoch, and current revision. They deliberately omit dialogue, instructions, evidence, and result payloads. They are an in-memory trace, not a persistent audit implementation. Result references must resolve through an authorized store; they are not public download URLs.

Run calls serially on one worker event loop. Lease identity is not authentication: future API adapters must bind agents and callbacks to the authenticated server session. Do not expose role-selection or confirmation methods directly as arbitrary LLM tools. A trusted tool adapter must validate arguments, recheck account/evidence authorization and revision around awaited work, filter disclosures **before** the model sees them, and register real service outcomes. These are required integration boundaries; the current coordinator cannot prove database ACLs or graph privacy.

The proposed additional graph recipes, Exa/Firecrawl lookup, private maps, reviewed exports, DigiLocker consent and email previews are recorded in [agent-tool-catalogue.md](agent-tool-catalogue.md). Langfuse is the selected monitoring sink, not an authority to execute tools. These adapters remain unimplemented; the current connected scope is limited to the ten tools in [agent-dispatcher.md](agent-dispatcher.md).

## Live voice and text integration

Use one LiveKit session and three agent profiles rather than three independent microphones. The coordinator chooses the active profile; background specialists receive the permitted task context without acquiring the voice turn. Share the user's authorized conversation turns, goal, language, report revision, source references, open questions, and preferences. The new role receives its own instructions; do not carry the outgoing system prompt into the incoming role.

LiveKit documents `AgentSession.update_agent()` for switching profiles, typed `userdata` for session state, and explicit `chat_ctx` transfer because new agents otherwise start with fresh LLM history. Preserve conversation turns using `chat_ctx.copy(exclude_instructions=True)` and load the incoming role's policy. This is the intended adapter mapping, not an installed LiveKit implementation. [LiveKit handoffs and context preservation](https://docs.livekit.io/agents/logic/agents-handoffs/)

The voice adapter must wait for the bridge's `SpeechHandle` playout before completing the coordinator turn, check whether it was interrupted, and cancel/flush old generation and audio buffers on a user turn, selection, mode change, or edit. The lease check rejects late deliveries; it cannot retract audio already sent to a speaker. [LiveKit speech control](https://docs.livekit.io/agents/multimodality/audio/)

The user's updated selection is Sarvam `saaras:v4` for transcription and `bulbul:v3` for synthesis, with **OpenAI** for active dialogue and schema-validated extraction/explanation. Exact OpenAI model IDs remain pending evaluation. Agent differences come from instructions, permissions, context, and the selected TTS `speaker`. The registry's three `speaker` fields remain null until two female voices and one male voice are auditioned and assigned; the live adapter must fail clearly when a voice is not configured. [Sarvam speaker selection](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/how-to/change-the-speaker-voice)

Database-first retrieval and optional public web functions are specified in `third-party-services.md`. These functions are not yet registered live tools. OpenAI is selected for synthetic testing; the existing India-only requirement for real reports still needs resolution.

Schedule provider/service calls only for requested work, with bounded concurrency and cost controls in the future adapter. Do not keep three inference streams running continuously. Credentials, training/retention settings, authenticated transport, persistence, reconnection, audio playout tests, ACL checks, and real function implementations remain part of the accepted database/backend/integration stages.

## Local verification

```sh
python3 -m unittest discover -s tests -v
python3 -m scripts.demo_agent_handoff --mode text
python3 -m scripts.demo_agent_handoff --mode voice
```

The 32 coordinator tests cover speaker ownership, delayed handoffs, interruption/mode changes, selection, bounded chains, role permissions, confirmation, backend revision synchronization, background outcomes, foreign leases and metadata-only events. Dispatcher/gateway tests bring the Python total to 69. Eight additional real-service integration tests connect these contracts to MongoDB, FalkorDB and authenticated HTTP sessions. This does not verify browser dispatcher delivery, screen readers, live audio or safeguarding. See [current verification](agent-dispatcher-verification.json).

Both demo modes exercise the real coordinator with a scripted synthetic conversation. Voice mode tests voice-mode ownership and simulated playout acknowledgements; it produces no audio and accesses no microphone, model, graph, or paid API.

All three role files also passed the skill-creator frontmatter validator. Its PyYAML dependency was installed only in an ignored `.local/skill-validation` environment; the coordinator, tests, and demos need no third-party Python packages.

## Addressed chat and peer coordination

The composer now supports @agent addressing and plain-name forwarding through Saathi. Every role can coordinate a handoff while retaining its own tool permissions. The persisted text/voice reply service limits each request to two handoffs and excludes already heard roles. This is separate from the lower-level session coordinator ceiling described above. See [agent addressing](agent-addressing.md) for precedence, picker behaviour, voice handling and verification.
