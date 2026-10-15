"""Authored synthetic responses only; not general-purpose model extraction."""

import json
from pathlib import Path

from yama_agents.coordinator import AgentId


PATTERNS = {"paid", "promised_delivery", "not_delivered", "no_reply"}
FIELDS = {"amount", "item", "date", "pattern", "note", "narrative"}


def utf16_length(value):
    return len(value.encode("utf-16-le")) // 2


def validate_proposals(output, snapshot):
    """Validate untrusted output against original messages, not model quotes.

    Offsets use JavaScript UTF-16 units. Reject ranges inside a surrogate pair
    so Python and the frontend cannot disagree about the cited source.
    """
    if not isinstance(output, dict) or set(output) != {"proposals"}:
        raise ValueError("Invalid model output")
    proposals = output["proposals"]
    if not isinstance(proposals, list) or len(proposals) > 20:
        raise ValueError("Invalid proposal count")
    messages = {message["id"]: message["text"] for message in snapshot["messages"]}
    seen = set()
    accepted = []
    skipped = 0
    for proposal in proposals:
        if not isinstance(proposal, dict) or set(proposal) != {"field", "value", "polarity", "source", "quote"}:
            raise ValueError("Invalid proposal schema")
        source = proposal["source"]
        if not isinstance(source, dict) or set(source) != {"messageId", "start", "end"}:
            raise ValueError("Invalid source schema")
        if (proposal["field"] not in FIELDS or proposal["polarity"] not in {"affirmed", "contradicted", "uncertain"}
                or not isinstance(proposal["value"], str) or not proposal["value"].strip()
                or utf16_length(proposal["value"]) > 6000
                or type(source["start"]) is not int or type(source["end"]) is not int
                or not isinstance(source["messageId"], str) or source["messageId"] not in messages):
            raise ValueError("Invalid assertion")
        original = messages[source["messageId"]]
        if not 0 <= source["start"] < source["end"] <= utf16_length(original):
            raise ValueError("Invalid source range")
        quote = original.encode("utf-16-le")[source["start"] * 2:source["end"] * 2].decode("utf-16-le")
        if proposal["quote"] != quote:
            raise ValueError("Source quote differs")
        if proposal["field"] == "pattern":
            if proposal["value"] not in PATTERNS:
                raise ValueError("Unsupported pattern")
        elif proposal["value"] != quote:
            raise ValueError("Literal fields must preserve the source text")
        key = (proposal["field"], source["messageId"], source["start"], source["end"])
        if key in seen:
            raise ValueError("Duplicate proposal")
        seen.add(key)
        # A corrected, excluded or contradictory assertion remains authoritative
        # for this source. A later proposal cannot silently revive or overwrite it.
        if any(assertion["field"] == proposal["field"] and assertion["source"] == source
               for assertion in snapshot["assertions"]):
            skipped += 1
        else:
            accepted.append(proposal)
    return {"proposals": accepted, "skippedExisting": skipped}


class FixtureModel:
    metadata = {"provider": "fixture", "model": "authored-incident-v1", "version": "1", "live": False}

    async def propose(self, profile, snapshot):
        if profile.agent != AgentId.SAATHI:
            raise ValueError("This fixture adapter is only for Saathi")
        fixtures = json.loads((Path(__file__).resolve().parents[1] / "agents/fixtures/incidents.json").read_text())
        proposals = []
        for message in snapshot["messages"]:
            fixture = next((entry for entry in fixtures if entry["language"] == snapshot["language"]
                            and entry["narrative"] == message["text"]), None)
            if fixture is None:
                continue
            for name, quote in fixture["phrases"].items():
                start = message["text"].index(quote)
                proposals.append({"field": "pattern" if name in PATTERNS else name,
                    "value": name if name in PATTERNS else quote, "polarity": "affirmed", "quote": quote,
                    "source": {"messageId": message["id"], "start": utf16_length(message["text"][:start]),
                               "end": utf16_length(message["text"][:start + len(quote)])}})
        return {"proposals": proposals}
