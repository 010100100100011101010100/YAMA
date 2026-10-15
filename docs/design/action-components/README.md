# Selected buttons and feature components — 2026-10-08

This pass implements the user's supplied component choices. Animal animation was rejected and is deferred at the user's request. There is no claim of visual approval.

| Supplied choice | Use in Yama | Application adaptation |
| --- | --- | --- |
| Aceternity Magnetic Button Demo | Shared `src/components/atoms/Button.tsx`: Send, Try an example, Check my notes, voice play/pause/stop, correction save/cancel/edit, confirmation, comparison, next steps, report download, file removal, and panel close | Copied the inner button's vertical gradient, 8 px corners, inset ring/offset, medium weight, 150 ms transition, and 0.98 press feedback. The magnetic wrapper, pointer handlers, dashed hover frame, demo label, and console action are omitted. Primary blue starts at blue-600 for better white-text contrast; supporting actions use the same geometry with neutral colours. Critical controls have 44 px targets, and press scaling is disabled under reduced motion. |
| Rare UI Folder Component | `EvidencePicker.tsx`, in the Files panel | Preserves the black theme's SVG cards, translucent flap, inset shading, spring hover fan, and supplied small scale. A native labelled button opens the actual local file picker on Enter, Space, or click. Focus also reveals the hover fan; reduced motion renders it statically. The source's large click-open card flight is omitted because it overlaps the panel heading and clicking here performs file selection. SVG filter IDs are unique per instance. The filename list and removal controls are always readable, independent of illustration motion. |
| Rare UI Matrix Orb | `TaskStatus.tsx`, only while the fixture comparison is running | Uses the source canvas renderer in `thinking` state, at 48 px with nine dots and a neutral colour, alongside the actual task label and Cancel action. It unmounts on completion/cancellation/failure. Reduced motion draws a static frame and responds to a preference change; cleanup cancels the animation frame. It is never presented as live microphone input. |
| Fraud | Not used | The supplied command lists dependencies, not a component source. Source/link requested. No security verdicts or authentication states are invented. |
| OTP | Not used | The supplied command lists dependencies, not a component source. Source/link requested. Authentication remains a later stage. |

The official shadcn CLI `view` command retrieved the two Rare UI registry items and Aceternity demo/dependency. Their raw JSON and extracted TSX snapshots are saved here; `manifest.json` records source hashes. Application files were copied/adapted manually after inspecting the CLI dry run, rather than installing the magnetic demo and its unused wrapper. The source's `cn` utility import uses one local `clsx`/`tailwind-merge` helper. Those are the only new direct dependencies; the existing Motion version is preserved. `react-icons` is not installed because no selected component needs it.

The former BeautifulUI LoadingState runtime file and the obsolete native pill/button CSS were removed when their call sites moved to these components. Its supplied source remains a historical review snapshot. Other BeautifulUI components retain their source styles and controlled application behaviour.

## Sources and notices

- [Aceternity Magnetic Button](https://ui.aceternity.com/components/magnetic-button), demo by Manu Arora; [published licensing terms](https://ui.aceternity.com/licence). These review snapshots and adaptations are for Yama's application, not a component/template resale package.
- [Rare UI](https://rareui.com), by Swami Malode; [official repository](https://github.com/swamimalode07/rare-ui). Copyright (c) 2026 Swami Malode. Its **MIT + Commons Clause + Attribution** notice is preserved in `licenses/RareUI.txt`, source comments, and the project README credit. It permits application use, and restricts selling or redistributing the components themselves.

## Verification

`npm run check` passes TypeScript, ESLint, 53 tests across seven frontend test files, and the production build. Four new tests cover keyboard file selection, readable file/removal and type rejection, static reduced-motion rendering with preference changes and frame cleanup, and removal of the thinking state on cancellation. Existing tests cover correction, explicit confirmation, focus restoration, failures/retries, source provenance, semantic accessibility, language switching, and message input behaviour.

Live-browser review: 1280 px desktop, 320 px Hindi, no mobile horizontal overflow, native keyboard file selection using the synthetic fixture, selected-local/not-uploaded labelling, keyboard correction/save with return focus, confirmation, actual fixture work/Orb rendering, completion, and panel focus return. Manual assistive-technology and OS reduced-motion browser review are not part of this pass. The canvas drawing is inspected in the live browser; jsdom supplies a context only in the lifecycle test.

- [Files and action buttons](desktop-files.jpg)
- [Actual comparison work with Matrix Orb](comparison-running.jpg)
- [Hindi mobile Files panel](mobile-hindi.jpg)

Provider text/voice, authentication, uploads, graph/database operations, and payments remain unconnected. File selection stores local metadata only.
