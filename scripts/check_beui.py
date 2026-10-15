"""Read-only smoke check of the official public beUI MCP; no API key required."""

import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ENDPOINT = "https://mcp.beui.dev/mcp"
SLUGS = (
    "message", "message-scroller", "prompt-input", "file-upload",
    "image-viewer", "input", "collapsible", "tabs", "loader",
)


def rpc(method, params, request_id):
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps({
            "jsonrpc": "2.0", "id": request_id, "method": method, "params": params,
        }).encode(),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "User-Agent": "codex/1.0",
            "MCP-Protocol-Version": "2025-03-26",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if payload.get("id") != request_id or "error" in payload:
        raise RuntimeError(f"Invalid or failed MCP response for {method}")
    result = payload["result"]
    if result.get("isError"):
        raise RuntimeError(f"MCP tool failed for {params.get('name', method)}")
    return result


def component(slug, request_id):
    result = rpc("tools/call", {
        "name": "get_component", "arguments": {"slug": slug},
    }, request_id)
    blocks = [item["text"] for item in result["content"] if item["type"] == "text"]
    if len(blocks) != 1:
        raise RuntimeError(f"Unexpected component response for {slug}")
    source = json.loads(blocks[0])
    if source.get("slug") != slug or not source.get("files"):
        raise RuntimeError(f"Missing component source for {slug}")
    files = []
    for file in source["files"]:
        content = file.get("content")
        if not isinstance(content, str) or not content:
            raise RuntimeError(f"Empty source file in {slug}")
        files.append({
            "path": file["path"],
            "sha256": hashlib.sha256(content.encode()).hexdigest(),
            "characters": len(content),
        })
    return {
        "slug": slug, "name": source["name"],
        "dependencies": source.get("dependencies", []), "files": files,
    }


def main():
    initialization = rpc("initialize", {
        "protocolVersion": "2025-03-26", "capabilities": {},
        "clientInfo": {"name": "yama-beui-verification", "version": "1.0.0"},
    }, 1)
    # beUI is stateless and returns JSON without a session identifier.
    available = rpc("tools/list", {}, 2)
    tool_names = [tool["name"] for tool in available["tools"]]
    if "get_component" not in tool_names:
        raise RuntimeError("beUI did not advertise component retrieval")
    verified = []
    for request_id, slug in enumerate(SLUGS, start=3):
        verified.append(component(slug, request_id))
        print(f"Verified source retrieval: {slug}")
    report = {
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "endpoint": ENDPOINT,
        "serverInfo": initialization["serverInfo"],
        "tools": tool_names,
        "components": verified,
        "scope": "MCP source retrieval only; components not installed or UI-tested",
    }
    destination = Path(__file__).resolve().parents[1] / "docs/beui-verification.json"
    destination.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Saved verification report: {destination}")


if __name__ == "__main__":
    main()
