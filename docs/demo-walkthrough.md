# Contact-matched conversation walkthrough

Use a new chat. The seller name below intentionally differs from the saved alias. The contact values are reserved demonstration contacts; matching uses confirmed contacts, not a name guess.

## Paste this first

> I’m in India. A seller calling himself Armaan Rane offered me a used camera through Copper Finch. I paid INR7200 before a wedding booking. He promised next-day dispatch, then asked for another INR1800 to release the courier parcel. The tracking page still says “label created”. He stopped replying when I asked for a fresh video of the camera. His phone is +1 202 555 0101, his email is gadget1@yama-demo.invalid and his Telegram is @yama_demo_gadget_01. I have the invoice and a payment screenshot. I don’t know whether Armaan is his real name.

Let Saathi help clarify the account. Any answer that changes incident facts belongs in **Add details**. Open **Your notes**, check the original words and confirm them. Confirmation is a user action.

## Ask about the saved reports

With **Ask a question** selected, send:

> @Drishti, compare these contacts with the saved reports. Give me a short summary of each matching story, what the person tried, how much they recovered, and what is still open. Keep reporters’ identities private. Does the different name change the contact match?

Expected retrieval: four contact-matched reports, even though Armaan Rane is not the saved alias. The same contact is evidence of account overlap, not verified common identity.

| Report | Story | Reported outcome |
| --- | --- | --- |
| 1 | Refurbished laptop and conflicting shipping labels | INR18,400 returned after eleven days; resolved money-loss complaint |
| 2 | Camera deposit and an extra courier-release demand | INR7,200 not recovered; no confirmed account freeze |
| 3 | Drawing tablet and an extra clearance demand | INR3,000 recovered; INR6,600 still outstanding |
| 4 | Repair-desk contact followed by portfolio-account takeover | Account recovery still open; no verified identity finding |

Hover or focus a report link for a preview. Open it to read the filtered account, reported follow-up actions and privacy copy of its conversation image. Report 2 has a playable tracking-screen reconstruction. Report 4 has an original illustration of its reported alias, clearly marked as an illustration with identity unverified. Neither is presented as a verified photograph or original recording.

No reporter names, ages, cities, occupations or original filenames should appear in related-report views or generated replies. Contact details not supplied by the current user are also hidden. A visual mask represents removed information; the identifying text is absent from the response.

## Follow up without changing the confirmed account

> @Drishti, what evidence did report 1 keep that might explain why the bank could review it? How does that differ from report 2?

The question and its answer stay in the chat. They do not create an incident assertion or invalidate confirmation. To correct incident facts, choose **Add details** or edit **Your notes**, then confirm the new revision before another comparison.

## Bring in current public sources

> @Disha, I’m in India. Explain the practical next steps for this camera payment. Search the web for official sources about consumer reporting and read the relevant page before answering. Give me the links and distinguish the published guidance from the outcomes in these reports.

This triggers a generic topic query through Exa, then Firecrawl parsing of an authorized official page. Narration, names, contacts, attachments and private graph contents are not sent to those providers. Replies receive only the bounded public-source excerpt, its exact URL, read status and retrieval time. A failed lookup cannot be described as a successful one. Search-only links are not treated as read pages.

Agent questions can appear as BeautifulUI multiple-choice controls or a fill-in field. Selecting an option does not send it until **Send answer** is pressed. A successful saved answer becomes a normal addressed chat message. It does not confirm notes, send a complaint or approve a payment.

## Scope

The catalogue is internally marked synthetic and restricted to the localhost setup. UI labels omit those repeated internal flags for the presentation. Original private evidence stays private. Essential assistance stays free. Private visual maps and reviewed PDF/DOCX exports remain deferred.

Graph grounding now uses the [official GraphRAG SDK custom retrieval strategy](graphrag-sdk-integration.md) for parameterized contact/pattern/detail traversal, exact source ranges and canonical MongoDB version validation. One supported detail can retrieve a candidate; separate agent review selects attachments before reply generation. Ontology discovery and vector ingestion remain disabled.
