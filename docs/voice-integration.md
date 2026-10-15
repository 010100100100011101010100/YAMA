# Sarvam / LiveKit voice — local demo increment

Implemented 2026-10-12. Voice uses the owned MongoDB report, existing three-agent coordinator and existing OpenAI/fixture dialogue worker. Live Sarvam account verification remains pending credentials.

```mermaid
sequenceDiagram
    participant U as User / browser
    participant A as Next.js API
    participant L as Local LiveKit
    participant V as Python voice worker
    participant S as Sarvam
    participant D as Existing dialogue worker
    U->>A: Connect voice explicitly
    A-->>U: Owned session + short microphone-only token
    V->>L: Join with a separate subscribe-only token
    U->>L: Microphone frames after worker readiness
    L->>V: Expected participant's microphone audio
    V->>S: Saaras v4 streaming transcription
    S-->>V: Proposed words / speech-start events
    V->>A: Proposed transcript; no report mutation
    U->>A: Edit and save reviewed words
    A->>D: Queue selected agent through existing coordinator
    D-->>A: Revision-bound reply and proposed handoff
    A->>S: Bulbul v3 bounded speech synthesis
    A-->>U: Private short-lived audio clip
    U->>A: Actual playback-start / completion receipts
    A->>D: Append delivered reply and permit handoff
```

## User flow

Select Voice and connect deliberately. Voice-first sessions can create an empty private draft without invented narration. The microphone stays off until the worker joins. Final transcriptions appear in an editable review field. Saving adds unconfirmed notes, preserves original STT wording separately, and requests the selected agent's reply. It does not confirm a report or file a complaint. Unreviewed speech survives disconnection and must be accepted or discarded before replacing that report's voice session.

Web Audio completion triggers the handoff. Synthesis, displaying text, pausing, canceling or stopping an audio source does not acknowledge completion. The server checks ownership, session, revision, dialogue version, nonce, expiry, playback start and minimum duration. These checks enforce sequencing; browser receipts cannot prove a person heard the audio. Current catalogue receipts are checked again before delivering a comparison.

Interrupting revokes the active generation. Local microphone activity cancels playback; Sarvam speech-start events revoke queued/running/ready replies. Echo cancellation is enabled, but device behavior and barge-in thresholds need live testing. Switching to chat preserves an already generated reply for text delivery. Backgrounding the tab mutes microphone capture and pauses output; resume is explicit. Disconnects require deliberate reconnection, with a new budget reservation.

This first increment buffers short TTS responses before playback. It is not streaming TTS or a latency-tuned duplex conference call. Replies above 2,500 UTF-16 units fall back to chat. WAV output is mono PCM16 at 16 kHz, limited to 90 seconds / 2.88 MB of PCM. Python synthesis has a 25-second deadline and a 30-second process boundary. Streaming playout can follow while preserving cancellation and completion rules.

| Agent | Bulbul v3 voice | Role |
| --- | --- | --- |
| Saathi | `priya` — female | Intake and corrections |
| Drishti | `shubh` — male | Similar-case explanations |
| Disha | `suhani` — female | Guidance and next actions |

English STT uses `en-IN`; Hindi uses `hi-IN` / verbatim; Hinglish uses `unknown` / codemix. TTS targets `en-IN` for English and `hi-IN` for Hindi/Hinglish. Each agent retains its voice across preferences. Pronunciation and mixed-script quality await auditions. [Saaras integration](https://docs.livekit.io/agents/models/stt/sarvam/), [Bulbul integration](https://docs.livekit.io/agents/models/tts/sarvam/), [Bulbul v3 limits and recommendations](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/bulbul-v3-best-practices).

## Installed runtime and startup

JavaScript SDKs: `livekit-client@2.22.4`, `livekit-server-sdk@2.19.1`. Python voice uses a separate `.venv-voice` and frozen `requirements-voice.lock`, including `livekit-agents[sarvam]==1.8.6` and `livekit-api==1.2.1`. LiveKit's OpenAI/OTel pins cannot alter the existing OpenAI/Langfuse `.venv`; both environments pass dependency checks.

LiveKit `v1.13.9`, commit `6fbe7f7e648aab4b2f734d6044a416bc2cbc482c`, is built into ignored `.local/runtime/bin` with a scoped Go 1.26.0 toolchain. System Go is preserved. macOS/Colima forwarded media failed the RTC probe; the native server passes it with scoped tokens. MongoDB and FalkorDB retain the existing 2 GB Colima VM. Native signalling binds TCP `127.0.0.1:7880`, media binds UDP `127.0.0.1:7882`, and ICE/TCP is disabled. Socket bindings were inspected. [Local server guidance](https://docs.livekit.io/transport/self-hosting/local/), [pinned source](https://github.com/livekit/livekit/tree/v1.13.9).

```sh
# Existing database setup must already be available.
npm run voice:setup
npm run voice:server:setup
npm run db:init
# Run each long-lived service in a separate terminal.
npm run voice:server
npm run worker:voice
npm run worker:agents
npm run dev
```

Setup preserves existing `.env.local` values, adds missing settings and writes ignored mode-0600 secrets. No keys are printed. Server setup needs Git and an existing Go launcher, checks the source commit and uses checksum-verified Go downloads. First compilation takes several minutes; regular startup does not compile.

## Keys, data and cost

Voice is disabled by default. Add `SARVAM_API_KEY` server-side, complete Sarvam dashboard training/retention controls and disable automatic recharge. Then explicitly set `YAMA_SARVAM_DATA_POLICY_ACKNOWLEDGED=true` and `YAMA_VOICE_LIVE_ENABLED=true`, and restart the app/worker. The acknowledgement is not a verified dashboard audit. Model API zero-retention controls must not be assumed to cover an unrelated product. Use fictional incidents until production handling requirements are resolved. [Sarvam controls](https://docs.sarvam.ai/api/platform/data-retention).

Defaults permit one active session in the demo database, 120 seconds per connection, 300 lifetime reserved STT seconds and 20 lifetime reserved TTS calls. Two complete 120-second reservations fit. Reservations are atomic/shared; uncertain outcomes are not refunded. Provider retries and automatic room reconnects are disabled. Explicit reconnection reserves duration again. The existing OpenAI call budget is shared by text and voice dialogue. Free-credit balances and billing were not checked.

Yama stores no microphone bytes. Proposed words/review status live in an owned session; accepted raw/corrected wording remains in report provenance. Generated assistant clips use private Mongo binary data with a 10-minute TTL and are erased on cancellation/completion. TTL cleanup is asynchronous; reads enforce expiry immediately. Transcript/report retention and purge remain a separate increment.

Voice subprocesses receive required voice credentials/fixed bindings, without database, auth, OpenAI or Langfuse credentials. Sarvam destinations are fixed, redirects disabled, responses bounded, and transcript diagnostics suppressed. Join tokens last 60 seconds, use random identities, expose no owner/report metadata and grant no data/admin permission. The client publishes microphone audio only and cannot subscribe; the worker subscribes and cannot publish. Track handling also verifies the expected participant and microphone publication.

## API and checks

Report routes reuse Better Auth ownership and same-origin mutation rules. Schemas are strict; responses expose no provider keys or raw worker errors.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/voice/config` | Enabled state, duration, speaker names |
| `POST /api/voice/start` | Idempotent owned session, optional empty draft |
| `GET /api/reports/:id/voice` | Owned session and transcripts |
| `POST /api/reports/:id/voice` | Stop, text fallback, interrupt, discard |
| `POST /api/reports/:id/voice/accept` | Explicit transcript review |
| `POST /api/reports/:id/voice/speech` | Synthesize bounded reply / clip receipt |
| `GET /api/reports/:id/voice/audio` | Current owned clip; private/no-store |
| `POST /api/reports/:id/voice/playback` | Started/ended receipts and coordinated handoff |

`npm run test:voice` exercises the installed Sarvam SDK with in-memory responses and no provider calls. Integration tests use generated Mongo namespaces and synthetic audio through the actual local LiveKit server. Checks include provenance, ownership, duplicate starts/synthesis/completion, budget reservations, late synthesis, delayed connection cancellation and chat fallback. See `voice-verification.json` for final results. Real Sarvam STT/TTS, device echo, microphone permission and pronunciation await credentials/device testing.
