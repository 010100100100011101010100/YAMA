# Signed-in Codex text demo

Yama can use the local Codex CLI as its text provider when the OpenAI Platform API
has no credits. It reuses the owner's existing **ChatGPT sign-in**, not an API key.
The CLI is local, but the model runs on OpenAI servers and consumes that account's
Codex allowance. It is not an offline model or an unlimited/free inference service.

This adapter is restricted to the private, synthetic localhost demo. Do not expose
the CLI, account session, or this provider to a public deployment. Production uses
the separate server-side API provider.

## Configuration

Set these server-side values in the ignored `.env.local`:

```dotenv
YAMA_DEMO_ONLY=true
YAMA_TEXT_PROVIDER=codex
YAMA_CODEX_ENABLED=true
YAMA_CODEX_BINARY=/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex
YAMA_CODEX_TIMEOUT_SECONDS=120
YAMA_CODEX_MAX_CALLS=100
```

Use the absolute path to the installed CLI on another machine, or omit the binary
setting to resolve `codex` from the worker's PATH. Other relative paths and shell
commands are rejected. Run that executable
with `login status` to verify **Logged in using ChatGPT**. The adapter refuses an
API-key login. It never reads, copies, or prints the native authentication tokens
and does not change the user's global Codex configuration or sign-in.

Restart the application and agent worker after configuration changes. No
`OPENAI_API_KEY` is required or passed to Codex. The selected provider is explicit:
errors do not silently switch providers or return authored fixture answers.

## Three agents and the dashboard

The application keeps conversation history, addressing, revision checks, ownership,
and speaking turns. Each generation invokes one selected role using its existing
trusted policy. All three can request bounded handoffs; only the server grants the
next turn. `@Drishti` addresses Drishti directly. Writing `Disha` without an @handle
starts with Saathi's explicit transfer to Disha. Existing automatic-handoff and
cycle limits still apply.

The first invocation initializes a reviewable project at `.local/codex-project/`
with `AGENTS.md` and all three `agents/<role>/SKILL.md` policies. It contains no
credentials, incident messages, or chat transcript. Every run copies trusted role
policies into its own temporary working directory. The selected role and bounded
account context arrive on stdin; no repository or `.env` is supplied.

Both structured dialogue and source-linked assertion extraction use the same
transport. The application validates handoffs and exact source quotes/UTF-16
offsets before accepting output. A Codex response cannot confirm a report, write
the graph, send email, charge money, or claim identity from a shared pattern.
Drishti's comparison findings must come from the application's scoped database
results, not from the CLI searching files or recalling another user's conversation.

## Isolation and failure behavior

- Invoke a fixed executable with `create_subprocess_exec`, never a shell command.
- Allow only the minimal native-auth environment; drop app keys, connection
  strings, provider overrides, proxy settings, and inherited execution settings.
- Ignore user config/rules, skip inherited project instructions, use ephemeral
  mode and a read-only sandbox, and disable shell, browser, apps/plugins, hooks,
  host skill discovery, delegated agents, and external web search.
- Request final JSON with `--output-schema`; bound execution time and output
  bytes, reject tool-execution events, kill on timeout/cancellation, and delete
  temporary output. The parent worker also kills the invocation process group
  when its request is cancelled or becomes stale.
- Never forward raw CLI errors or authentication diagnostics to the dashboard.
- Persist provider provenance as `codex`, `codex-session`, version `1`, `live:true`.
  `codex-session` identifies session routing; it is not a claim that a particular
  underlying model snapshot was used.

If the ChatGPT session is unavailable, its quota is exhausted, or output cannot be
validated, the operation fails visibly. Reauthenticate using Codex itself or switch
the explicit provider after resolving the issue. API credentials do not rescue a
Codex-session failure.

## Verification

Offline transport, cancellation, output bounds, environment, role, handoff and
source-validation checks:

```sh
.venv/bin/python -m unittest discover -s tests -p test_codex_model.py -v
```

A real synthetic Saathi generation and source-linked extraction were verified on the installed CLI using its
ChatGPT sign-in, with no Platform API key and with the restricted settings above.
It referred to the supplied fictional payment and asked a relevant clarification.
Extraction returned four proposals accepted by the exact original-source validator.

Official references: [non-interactive mode and structured outputs](https://learn.chatgpt.com/docs/non-interactive-mode),
[CLI flags](https://learn.chatgpt.com/docs/developer-commands?surface=cli),
[authentication and account access](https://learn.chatgpt.com/docs/auth), and
[configuration controls](https://learn.chatgpt.com/docs/config-file/config-reference).
