"""Build editable synthetic wireframes and verify the official Excalidraw MCP.

Uses only the Python standard library. No reports, credentials, or paid APIs.
"""

import argparse
import json
import textwrap
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = "https://mcp.excalidraw.com/mcp"


def rpc(method, params, request_id):
    request = Request(ENDPOINT, json.dumps({"jsonrpc": "2.0", "id": request_id,
                      "method": method, "params": params}).encode(), headers={
                      "Content-Type": "application/json",
                      "Accept": "application/json, text/event-stream"})
    with urlopen(request, timeout=45) as response:
        body = response.read().decode()
    if body.lstrip().startswith("{"):
        message = json.loads(body)
    else:
        messages = [json.loads(line[6:]) for line in body.splitlines()
                    if line.startswith("data: ")]
        message = next(item for item in messages if item.get("id") == request_id)
    if "error" in message:
        raise RuntimeError(message["error"])
    outcome = message["result"]
    if outcome.get("isError"):
        raise RuntimeError(outcome)
    return outcome


def scene():
    elements = []

    def shape(kind, x, y, width, height, fill="transparent", **extra):
        element = {"id": f"yama-{len(elements)}", "type": kind, "x": x, "y": y,
                   "width": width, "height": height, "angle": 0,
                   "strokeColor": "#173b3b", "backgroundColor": fill,
                   "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
                   "roughness": 0, "opacity": 100, "groupIds": [], "frameId": None,
                   "roundness": None, "seed": len(elements) + 17, "version": 1,
                   "versionNonce": len(elements) + 43, "isDeleted": False,
                   "boundElements": None, "updated": 1791331200000,
                   "link": None, "locked": False, **extra}
        elements.append(element)
        return element

    def text(x, y, content, size=18, color="#173b3b"):
        lines = content.splitlines()
        return shape("text", x, y, max(len(line) for line in lines) * size * .56,
                     len(lines) * size * 1.25, text=content, originalText=content,
                     fontSize=size, fontFamily=2, textAlign="left",
                     verticalAlign="top", baseline=size, containerId=None,
                     lineHeight=1.25, autoResize=True, strokeColor=color)

    def box(x, y, w, h, content, fill="#eef4f2", size=18):
        wrapped = "\n".join(textwrap.fill(line, max(1, int((w - 32) / (size * .56))))
                            for line in content.splitlines())
        h = max(h, len(wrapped.splitlines()) * size * 1.25 + 32)
        shape("rectangle", x, y, w, h, fill, roundness={"type": 3})
        text(x + 16, y + 16, wrapped, size)

    titles = ["01 / Welcome", "02 / Saathi: voice", "03 / Saathi: text",
              "04 / Correct a transcript", "05 / Add evidence", "06 / Review and confirm",
              "07 / Processing", "08 / Drishti: connections", "09 / Why this connection?",
              "10 / Disha: next steps", "11 / Optional checkout", "12 / Public exploration"]
    notes = [
        "Choose language and voice/text. No account wall for demo.\nNext: 02 or 03. Focus follows the chosen route.",
        "Mic state is text, not just an animated face.\nReconnect preserves transcript; text fallback stays available.",
        "Enter sends; Shift+Enter inserts a line; IME stays intact.\nNew messages do not pull a reader away from older text.",
        "Keep the original utterance and correction separately.\nSave returns focus to the edited row. Hindi must wrap.",
        "Upload and text extraction are separate states.\nEvidence is optional. Reject, quarantine, retry, remove.",
        "Confirmation means user-reviewed, not independently verified.\nNo graph commitment before this step; stale revisions fail.",
        "Keep confirmed facts readable while work continues.\nPartial / timeout / retry states; static reduced-motion loader.",
        "Separate entity linkage from narrative pattern similarity.\nList first, graph optional. No guilt scores or private leakage.",
        "Supporting facts AND contradictory facts stay visible.\nNo other reporter's name, identifier, transcript or evidence.",
        "Essential assistance and the user's own report stay free.\nSave/export errors visible; human escalation not invented.",
        "About 30% advanced intelligence free; $10 buys 10 details.\nEntitlements follow verified webhook, never the redirect.",
        "Only synthetic/public/licensed/approved aggregate data.\nPrivate reports cannot appear through a public graph path.",
    ]
    text(0, -190, "YAMA / proposed user journey", 36)
    text(0, -125, "Synthetic wireframes: Narrate > Confirm > Connect > Understand > Act", 24)
    text(0, -80, "Editable design proposal / desktop frames / mobile reflow and alternate states annotated below", 18)

    for index, title in enumerate(titles):
        x, y = (index % 3) * 700, (index // 3) * 660
        shape("rectangle", x, y, 620, 480, "#ffffff")
        text(x + 22, y + 16, "yama", 22)
        text(x + 340, y + 18, "Synthetic demo / English", 16)
        shape("line", x + 20, y + 56, 580, 0, points=[[0, 0], [580, 0]])
        text(x + 24, y + 78, title, 26)
        if index == 0:
            text(x + 24, y + 140, "Tell it in your own words.", 30)
            text(x + 24, y + 190, "Review the facts. Understand possible\nconnections. Choose what to do next.", 21)
            box(x + 24, y + 270, 272, 72, "Talk to Saathi", "#c3fae8", 22)
            box(x + 316, y + 270, 272, 72, "Write instead", size=22)
            text(x + 24, y + 375, "Use a synthetic example. No real reports yet.", 18)
        elif index in (1, 2):
            text(x + 24, y + 125, "Saathi / What happened?", 21)
            box(x + 24, y + 170, 370, 116,
                "I paid INR 4,800 for a used phone.\nThe seller stopped replying.\n[Original transcript / synthetic]", size=18)
            box(x + 414, y + 170, 182, 190, "Your report\n\nAmount: 4,800\nDate: uncertain\nNot confirmed", size=16)
            if index == 1:
                box(x + 24, y + 320, 370, 70, "Mic: listening / Pause / End", "#c3fae8")
                text(x + 24, y + 416, "Type instead                     Review details >", 18)
            else:
                box(x + 24, y + 320, 370, 70, "Write a message...           Send")
                text(x + 24, y + 416, "Switch to voice                  Review details >", 18)
        elif index == 3:
            text(x + 24, y + 128, "Change only what is wrong.", 21)
            box(x + 24, y + 175, 570, 84, "Original: I paid INR 4,800.\nSource: your transcript, message 1", size=18)
            box(x + 24, y + 284, 570, 70, "Corrected amount: [ 4,300 ]", "#c3fae8", 21)
            text(x + 24, y + 395, "Cancel                                Save correction >", 18)
        elif index == 4:
            text(x + 24, y + 130, "Add something that helps explain it.", 21)
            box(x + 24, y + 182, 570, 80, "Choose a screenshot or document", size=21)
            box(x + 24, y + 286, 570, 84, "chat-example.png / upload complete\nText extraction: not started", size=18)
            text(x + 24, y + 408, "Skip for now                         Review report >", 18)
        elif index == 5:
            text(x + 24, y + 132, "These are your statements, not verified findings.", 18)
            for row, content in enumerate(["Amount / INR 4,300 / edited", "Item / used phone / transcript 1", "Date / unknown / keep uncertain"]):
                box(x + 24, y + 180 + row * 68, 570, 58, content + "   Edit / Remove", size=16)
            text(x + 24, y + 414, "Back                         Confirm these details >", 18)
        elif index == 6:
            box(x + 24, y + 150, 340, 240, "Confirmed report\n\nUsed phone\nINR 4,300 / corrected\nDate still uncertain\n\nStill readable while processing", size=18)
            box(x + 384, y + 150, 210, 240, "Drishti\n\nFinding links\nThen patterns\n\nCancel / Retry", "#c3fae8", 18)
        elif index == 7:
            text(x + 24, y + 132, "Possibilities to review, not a verdict.", 21)
            box(x + 24, y + 190, 272, 180, "Entity linkage\n\nNo supported\nidentity link.\nWhy?", size=20)
            box(x + 316, y + 190, 272, 180, "Incident patterns\n\nSimilar selling\nsequence.\nRead explanation >", "#c3fae8", 20)
            text(x + 24, y + 414, "View graph (optional)                     Next steps >", 18)
        elif index == 8:
            box(x + 24, y + 150, 272, 230, "Supports similarity\n\nPayment first\nNo delivery described\nReplies stopped\n\nSource references", "#c3fae8", 18)
            box(x + 316, y + 150, 272, 230, "Limits / differences\n\nDate is unknown\nNo shared identifier\nSimilar wording alone\ncannot link people", size=18)
            text(x + 24, y + 416, "Back to findings                           Next steps >", 18)
        elif index == 9:
            for row, content in enumerate(["1 / Keep original messages and receipt", "2 / Record dates you can verify", "3 / Export your own report [free]"]):
                box(x + 24, y + 145 + row * 76, 570, 64, content, size=19)
            text(x + 24, y + 399, "Optional: 10 additional details / $10", 18)
            text(x + 24, y + 435, "Essential assistance remains free.", 18)
        elif index == 10:
            text(x + 24, y + 140, "10 additional intelligence details", 24)
            text(x + 24, y + 193, "$10 / test checkout", 30)
            box(x + 24, y + 260, 570, 94, "Hosted checkout >\nPurchase pending until verified webhook", "#c3fae8", 20)
            text(x + 24, y + 404, "Cancel returns to free next steps.", 18)
        else:
            text(x + 24, y + 133, "Public patterns / synthetic dataset", 23)
            box(x + 24, y + 195, 570, 70, "Category [online purchase] / Source [synthetic]", size=18)
            box(x + 24, y + 291, 570, 100, "Example sequence: payment > no delivery\nSource: authored demo fixtures\nNo private reporter records in this view", size=18)
        annotation = "\n".join(textwrap.fill(line, 60) for line in notes[index].splitlines())
        text(x, y + 500, annotation, 18, "#365a57")

    # Compact stage map is separate from the individual screen layouts.
    for index, label in enumerate(["Narrate", "Confirm", "Connect", "Understand", "Act"]):
        box(index * 260, 2720, 220, 70, label, "#c3fae8", 24)
        if index < 4:
            shape("arrow", index * 260 + 224, 2755, 30, 0,
                  points=[[0, 0], [30, 0]], endArrowhead="arrow",
                  startArrowhead=None, startBinding=None, endBinding=None,
                  elbowed=False)
    # A narrow companion frame shows real reflow rather than a scaled desktop.
    shape("rectangle", 2120, 0, 360, 780, "#ffffff")
    text(2140, 20, "yama / synthetic demo", 20)
    text(2140, 65, "Tell / Review / Links / Why / Act", 16)
    text(2140, 118, "Mobile / Saathi", 25)
    text(2140, 165, "What happened?", 24)
    box(2140, 218, 320, 138,
        "I paid INR 4,800 for a used\nphone. Then replies stopped.\n\nOriginal transcript / sample", size=18)
    box(2140, 385, 320, 80, "Mic: paused\nTalk / Type instead", "#c3fae8", 18)
    box(2140, 496, 320, 70, "Review my details >", "#c3fae8", 20)
    box(2140, 600, 320, 138, "Your report so far\nAmount: 4,800\nDate: uncertain\nNot confirmed", size=18)
    text(2120, 800, "Context follows the main task.\nNo narrow transcript column.\nTouch targets remain usable.", 18, "#365a57")
    box(2120, 918, 360, 200,
        "Interrupted voice\n\nReconnecting / transcript kept\nRetry voice\nContinue with text", "#fff3bf", 18)
    return {"type": "excalidraw", "version": 2,
            "source": "Yama synthetic wireframe proposal",
            "elements": elements, "appState": {"viewBackgroundColor": "#ffffff",
            "gridSize": None}, "files": {}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--share", action="store_true",
                        help="Upload only these synthetic design frames to Excalidraw")
    args = parser.parse_args()
    drawing = scene()
    destination = ROOT / "docs/design/yama-wireframes.excalidraw"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(drawing, indent=2) + "\n")
    ids = [element["id"] for element in drawing["elements"]]
    assert len(ids) == len(set(ids))
    print(f"Saved 12 desktop wireframes and a mobile companion ({len(ids)} elements).")
    if not (args.verify or args.share):
        return
    initialize = rpc("initialize", {"protocolVersion": "2024-11-05",
                     "capabilities": {}, "clientInfo": {"name": "yama-design", "version": "1.0"}}, 1)
    available = rpc("tools/list", {}, 2)
    # The reference was read before this builder was authored. No repeated read_me call.
    commands = [{"type": "cameraUpdate", "width": 800, "height": 600,
                 "x": -40, "y": -40}]
    commands.extend(drawing["elements"])
    created = rpc("tools/call", {"name": "create_view", "arguments": {
                  "elements": json.dumps(commands, separators=(",", ":"))}}, 3)
    checkpoint = created["structuredContent"]["checkpointId"]
    original_id = drawing["elements"][0]["id"]
    edited_title = {**drawing["elements"][0], "id": "yama-title-reviewed",
                    "text": "YAMA / proposed user journey / editable",
                    "originalText": "YAMA / proposed user journey / editable"}
    edited = rpc("tools/call", {"name": "create_view", "arguments": {"elements": json.dumps([
                 {"type": "restoreCheckpoint", "id": checkpoint},
                 {"type": "cameraUpdate", "width": 800, "height": 600, "x": -40, "y": -40},
                 {"type": "delete", "ids": original_id}, edited_title])}}, 4)
    edited_checkpoint = edited["structuredContent"]["checkpointId"]
    readback = rpc("tools/call", {"name": "read_checkpoint", "arguments": {"id": edited_checkpoint}}, 5)
    restored = json.loads(readback["content"][0]["text"])
    assert any(element.get("text") == edited_title["text"] for element in restored["elements"])
    assert not any(element.get("id") == original_id for element in restored["elements"])
    report = {"checked_at": "2026-10-07", "endpoint": ENDPOINT,
              "server": initialize["serverInfo"],
              "tools": [tool["name"] for tool in available["tools"]],
              "created_checkpoint": checkpoint, "edited_checkpoint": edited_checkpoint,
              "creation": "passed", "edited_scene_readback": "passed",
              "native_chat_tools": "requires a session that reloads MCP configuration",
              "content": "12 desktop wireframes and a mobile companion; synthetic design examples only"}
    if args.share:
        shared = rpc("tools/call", {"name": "export_to_excalidraw", "arguments": {
                     "json": json.dumps(drawing)}}, 6)
        report["share_result"] = shared
        print(json.dumps(shared))
    (ROOT / "docs/excalidraw-verification.json").write_text(json.dumps(report, indent=2) + "\n")
    print("Official MCP creation, deletion, replacement and edited-scene readback passed.")


if __name__ == "__main__":
    main()
