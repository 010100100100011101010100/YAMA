# Product

## Register

product

## Users

People in India who experienced or witnessed a harmful incident and want to explain it naturally, organize their account, understand possible connections, and choose appropriate next steps. Support English, Hindi, and Hinglish in voice and text, with more Indian languages later. The current milestone is a localhost demo using synthetic incidents; acceptance of real reports belongs to a separately reviewed public-launch stage.

## Product Purpose

Yama supports **Narrate → Confirm → Connect → Understand → Act**. Saathi supports intake, Drishti explains potential connections and their limits, and Disha presents next actions. A user should never need to understand graph databases or investigation terminology. Yama handles reports and assertions with provenance, never findings of guilt.

The three agents share one conversation in voice or text. Users can select an agent directly or let them hand off at a speaking boundary. Only one speaks at a time; another can perform permitted work in the background. Every role can also coordinate a specialist handoff within its own permissions. In text, @mentions address an agent directly; a plain agent name reaches Saathi first for an explicit @target bridge. The next-message selector defaults to Saathi independently of the current speaker. Corrections invalidate older results. Each role has distinct tools alongside shared capabilities, enforced by the conversation coordinator; see `docs/agent-orchestration.md`.

Sarvam is selected for speech, with two female voices and one male voice; OpenAI for text intelligence. MongoDB owns application reports, revisions, sessions and durable jobs; FalkorDB holds confirmed incident/connection graphs and is the graph discovery source. Evidence binaries will use private storage. Exa and Firecrawl are selected for approved current public-information requests. Langfuse is selected for agent monitoring; Resend is primary mail with Nodemailer/Gmail fallback. DigiLocker is deferred to a future partnership stage, potentially supporting consented identity/document access within an official police complaint workflow; complaint submission would require a separate approved channel. Better Auth remains the account/session layer. The MongoDB/FalkorDB backend foundation and anonymous demo authentication are implemented separately from the fixture frontend; live providers remain unconnected. Exact model/voice assignments, provider setup constraints, and the unresolved India-only processing gate are recorded in `docs/third-party-services.md`.

## Brand Personality

Patient, non-judgmental, explanatory. The user confirmed a **dark, expressive, dithered** visual direction on 2026-10-07 after rejecting the first green visual proposal. Expression should come from deliberate artwork and hierarchy while controls and incident content remain clear.

The identity direction is an eagle, a wolf, and an elephant with visible monochrome texture, replacing the emoji-like birds. The latest feedback rejects excessive pixelation: use the finer portraits with a green glowing boundary and subtle movement while speaking. The current frontend maps Saathi to the eagle, Drishti to the wolf, and Disha to the elephant. Names and readable states identify the active speaker and background work; artwork does not replace those labels. Voice assignments remain provisional.

## Anti-references

The first proposal's muted mint/green surfaces, Space Grotesk and Inter treatment, generic rounded panels, and hand-styled controls were explicitly rejected. The second black-and-silver workspace was rated 6/10 and still generic. Avoid interchangeable AI-app presentation, decorative success states, giant voice orbs, dashboard scores, repeated eyebrow labels, and interfaces that look like policing or surveillance. Do not copy restricted ForgeUI source. The user now prefers BeautifulUI as the source for AI-specific components; beUI remains available for supporting controls.

The 2026-10-08 frontend was rated 2/10: the user rejected the font, workflow layout, formal language, and small text. The current interface must center chat or a conference call, with larger readable text and natural language. Review and evidence are supporting panels rather than the main page.

The subsequent revision was rated 5/10 and described as a children's platform. The user reiterated that components must come from BeautifulUI. Use its real registry rendering patterns, compact agent identifiers, restrained surfaces, and a mature chat workspace. Large mascot participant tiles and playful rounding are rejected.

The user then supplied twelve BeautifulUI component sources directly. Eleven are integrated into the conversation and supporting panels; AgentScreen remains optional for a future capture workflow. The latest request explicitly restores original component typography, spacing, shadows, radii, and motion, with colour overrides only. Preserve those designs while connecting actions and states to the application. The integration mapping and unchanged supplied files are recorded in `docs/design/beautifului-supplied/`; the CSS restoration is documented in `docs/design/beautifului-original-css/`.

## Design Principles

1. Give the user control over their own account: correction and removal precede confirmation.
2. Show why a connection is suggested, including sources, uncertainty, differences, and negative evidence.
3. Keep entity linkage separate from incident-pattern similarity. Neither implies guilt.
4. Keep private reports private. A graph path is not permission to reveal another person's information.
5. Keep essential assistance and the user's supplied information free. Deeper intelligence is optional.

## Accessibility & Inclusion

Readable English, Hindi, and Hinglish, predictable keyboard/focus behavior, accessible status announcements, responsive layouts, and reduced-motion alternatives are required. Preserve Roman Hindi and mixed-script input without silently changing the original. Voice interruption must preserve the account and offer text fallback. Decorative artwork cannot replace names, microphone labels, instructions, or evidence. Public launch for all ages requires the safeguarding, consent, escalation, and security work recorded in the accepted implementation plan.

## Sources

Confirmed product context and implementation plan: `docs/product-context.txt` and `docs/implementation-plan.md`. Latest visual preferences and anti-references include the user's 2026-10-07/08 feedback. The earlier proposal in `docs/visual-direction-v3.md` is historical. Current design rules are in `DESIGN.md`; no final visual system has been approved.
