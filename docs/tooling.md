# Tooling status

Updated on 2026-10-07. This distinguishes installation from functional verification.

| Integration | Installed / connected | Functional verification |
| --- | --- | --- |
| BeautifulUI component registry | Public source retrieved; no application imports or new MCP installed | Six AI primitives plus their three shared registry dependencies downloaded and hashed. Live Prompt Bar and Approval Card inspected. MIT notice preserved. See `design/beautifului-source/manifest.json` and `component-review.md`. |
| beUI MCP | Registered globally at `https://mcp.beui.dev/mcp`; tools loaded in this chat | Source retrieval passed for all nine shortlisted components on 2026-10-06. Native MCP calls and closer inspection of four intake/evidence components passed on 2026-10-07. See `beui-verification.json` and `component-review.md`. |
| ASCII Magic MCP | Registered at `https://www.ascii-magic.com/mcp`; OAuth and native tools working | Account confirmed Free; two free dither looks rendered; recipe encoding/decoding passed; replay of the saved recipe was pixel-identical at 512 × 512. Browser animation controls are available, but the GIF export produced no download event within 30 seconds and remains unverified. |
| Official tldraw plugin | Latest catalogue checks on 2026-10-07 report uninstalled; no tldraw tools exposed | Board creation/editing pending. The 2026-10-06 catalogue result had reported installed, so that historical result no longer establishes current access. |
| Official Excalidraw MCP | Registered globally at `https://mcp.excalidraw.com`, using the user-authorized fallback; native tools now exposed | Earlier endpoint create/edit/read-back and wireframe export passed. Native `read_me` and `create_view` now passed in this chat; a new synthetic agent/tool map was created, edited through checkpoint restoration, and read back from the server. See `tool-map-verification.json` and `design/yama-tool-map.excalidraw`. |

## Configuration preservation

ASCII Magic and beUI were initially added to `/Users/shera/.codex/config.toml`. A parsed comparison confirmed all pre-existing configuration remained equal to the backup after removing those additions. Excalidraw was added on 2026-10-07; a second parsed comparison confirmed all settings remained equal to the immediately preceding backup after excluding its entry. The CLI omitted an existing empty `node_repl` argument list while serializing; it was restored before verification.

Backup: `/Users/shera/.codex/config.toml.yama-20261006-233059.bak` (mode 0600). Keep it outside the repository because the global configuration can contain private settings.

Excalidraw backup: `/Users/shera/.codex/config.toml.yama-excalidraw-20261007-121302.bak` (mode 0600).

Commands used:

```sh
codex mcp add beui --url https://mcp.beui.dev/mcp
codex mcp add ascii-magic --url https://www.ascii-magic.com/mcp
codex mcp add excalidraw --url https://mcp.excalidraw.com
```

The official tldraw plugin installation flow was offered, but usable access did not materialize. The fallback is Excalidraw's own MCP, not a community tldraw server.

## Sketching fallback

After the restart, ASCII Magic and beUI tools are loaded and functional. tldraw still has no tools, and its catalogue status is uninstalled. Desktop automation of Codex's own UI is blocked, so the agent cannot complete that installation through native UI control. The official web installation page was opened; its browser session is signed out.

The user authorized another sketching MCP on 2026-10-07. The [official Excalidraw server](https://github.com/excalidraw/excalidraw-mcp) supplied `read_me`, `create_view`, `export_to_excalidraw`, and checkpoint tools. Its endpoint redirects to `/mcp`; the verification script uses that canonical route. No account sign-in was requested by these smoke checks. We proceeded with the verified fallback and completed an editable design proposal.

The creation result supplies a checkpoint. A subsequent call restored it, deleted the original title, and added a replacement. Reading the resulting scene proved the replacement was present and the original element was absent. The exported board also loaded in the browser editor. Only synthetic design examples were sent.

The initial Python default user agent received HTTP 403 from beUI. A Codex user agent succeeded. The reproducible check uses that agent; no global HTTP-header configuration was changed.

## Remaining smoke checks

1. Refine the design proposal and outstanding alternate states against `wireframe-brief.md` before their frontend implementation.
2. Before using animated avatars in the frontend, complete an actual browser animation export and verify the saved file. GIF and MP4 controls alone do not establish successful export.

Native Excalidraw access is verified. The new board contains only synthetic provider architecture. Embedded Excalidraw/Cytoscape/report SDKs proposed for the Yama product are a separate future integration; a working design MCP does not implement those features or authorize exporting private reports.

The original, non-sensitive artwork check is saved in `../assets/artwork-check/`, together with its recipe and export-control screenshot. It is a toolkit smoke-test sample; final agent artwork remains a design-stage task. The editable Excalidraw board and a clickable visual walkthrough are ready for UX review. Component installation, the actual application, database, voice-provider requests, and payments remain future stages.
