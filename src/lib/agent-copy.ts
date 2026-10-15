import type { Language } from "./demo-state";

function fixtureCopy(language: Language) {
  const english = {
    title: "Saathi’s proposals", fixture: "Authored fixture", note: "This extraction used a fictional example. Review each proposal against your original words before adding it.",
    extract: "Extract proposals", cancel: "Cancel extraction", example: "Add extraction example", loading: "Opening saved analysis…", queued: "Waiting for extraction…", running: "Reading saved notes…",
    idle: "Ready to extract proposals from your saved notes.", ready: "Proposals are ready to review. Your draft is unchanged.", canceled: "Extraction canceled. Your draft is unchanged.", stale: "The notes changed. Extract again from the current revision.",
    empty: "No new proposals were found in this authored example. Use the extraction example below, or keep your own notes as written.",
    added: "Selected proposals were added as draft details. Review and confirm them separately.", failed: "Extraction did not finish. Your draft is unchanged. Reload the analysis or try again.",
    waiting: "Extraction is still pending. Reload analysis to check progress; your draft is unchanged.", reload: "Reload analysis", start: "Save a message or add the fictional example first.",
    acknowledge: "I reviewed the quoted sources and want to add my selected proposals to the draft.", accept: "Add selected to draft", accepted: "Added to draft", add: "Add", source: "Quoted source", original: "Read original message",
    noteField: "Note", narrative: "Account", amount: "Amount", item: "Item", date: "Date", pattern: "Pattern", all: "Select all proposals", skipped: "Existing details preserved", reference: "Saathi · authored fixture · accepted by you",
  };
  if (language === "hi") return { ...english,
    title: "साथी के प्रस्ताव", fixture: "लिखा हुआ उदाहरण", note: "यह जानकारी काल्पनिक उदाहरण से निकाली गई है। जोड़ने से पहले हर प्रस्ताव अपने मूल शब्दों से मिलाएँ।",
    extract: "प्रस्ताव निकालें", cancel: "जानकारी निकालना रोकें", example: "जानकारी निकालने का उदाहरण जोड़ें", loading: "सेव की गई जानकारी खोल रहे हैं…", queued: "जानकारी निकालने की बारी का इंतज़ार…", running: "सेव किए गए नोट्स पढ़ रहे हैं…",
    idle: "सेव किए गए नोट्स से प्रस्ताव निकाल सकते हैं।", ready: "प्रस्ताव जाँचने के लिए तैयार हैं। आपका ड्राफ़्ट नहीं बदला है।", canceled: "काम रोक दिया गया। आपका ड्राफ़्ट नहीं बदला है।", stale: "नोट्स बदल गए हैं। मौजूदा संस्करण से फिर प्रस्ताव निकालें।",
    empty: "इस उदाहरण से जोड़ने के लिए कोई नया प्रस्ताव नहीं मिला। नीचे का काल्पनिक उदाहरण लें या अपने नोट्स वैसे ही रखें।", added: "चुने हुए प्रस्ताव ड्राफ़्ट में जुड़ गए हैं। उन्हें अलग से जाँचकर पुष्टि करें।",
    failed: "काम पूरा नहीं हुआ। आपका ड्राफ़्ट नहीं बदला; जानकारी फिर खोलें या कोशिश करें।", waiting: "काम अभी बाकी है। स्थिति देखने के लिए जानकारी फिर खोलें; आपका ड्राफ़्ट नहीं बदला है।", reload: "जानकारी फिर खोलें", start: "पहले संदेश सेव करें या काल्पनिक उदाहरण जोड़ें।",
    acknowledge: "मैंने स्रोत के उद्धरण जाँच लिए हैं और चुने हुए प्रस्ताव ड्राफ़्ट में जोड़ना चाहता/चाहती हूँ।", accept: "चुने हुए प्रस्ताव ड्राफ़्ट में जोड़ें", accepted: "ड्राफ़्ट में जुड़ गया", add: "जोड़ें", source: "स्रोत का उद्धरण", original: "मूल संदेश पढ़ें",
    noteField: "नोट", narrative: "विवरण", amount: "राशि", item: "वस्तु", date: "तारीख", pattern: "पैटर्न", all: "सभी प्रस्ताव चुनें", skipped: "मौजूदा विवरण सुरक्षित रखे गए", reference: "साथी · काल्पनिक उदाहरण · आपके स्वीकार किए हुए प्रस्ताव",
  };
  if (language === "hinglish") return { ...english,
    title: "Saathi ke proposals", fixture: "Authored example", note: "Yeh extraction fictional example se hai. Add karne se pehle har proposal apne original words se check karein.",
    extract: "Proposals nikalein", cancel: "Extraction cancel karein", example: "Extraction example jodein", loading: "Saved analysis khol rahe hain…", queued: "Extraction ki baari ka wait…", running: "Saved notes padh rahe hain…",
    idle: "Saved notes se proposals nikaal sakte hain.", ready: "Proposals review ke liye ready hain. Draft unchanged hai.", canceled: "Extraction canceled. Draft unchanged hai.", stale: "Notes badal gaye. Current revision se dobara extract karein.",
    empty: "Is authored example mein naye proposals nahi mile. Neeche extraction example lein ya apne notes waise hi rakhein.", added: "Selected proposals draft mein jud gaye. Review aur confirmation alag se karein.",
    failed: "Extraction complete nahi hua. Draft unchanged hai; analysis reload karein ya phir try karein.", waiting: "Extraction abhi pending hai. Progress ke liye reload karein; draft unchanged hai.", reload: "Analysis reload karein", start: "Pehle message save karein ya fictional example jodein.",
    acknowledge: "Maine quoted sources review kiye hain aur selected proposals draft mein add karna chahta/chahti hoon.", accept: "Selected proposals draft mein jodein", accepted: "Draft mein jud gaye", add: "Jodein", source: "Quoted source", original: "Original message padhein",
    all: "Saare proposals select karein", skipped: "Existing details preserve kiye", reference: "Saathi · authored example · aapke accepted proposals",
  };
  return english;
}

export function agentCopy(language: Language, provider: "fixture" | "openai" | null = "fixture") {
  const copy = fixtureCopy(language);
  if (provider === "fixture") return copy;
  if (language === "hi") return { ...copy, fixture: provider ? "OpenAI के प्रस्ताव" : "स्रोत जाँचें",
    note: "प्रस्ताव सुझाव हैं। हर उद्धरण को मूल संदेश से मिलाएँ और केवल सही विवरण जोड़ें।",
    empty: "जोड़ने के लिए कोई नया प्रस्ताव नहीं मिला। अपने सेव किए गए नोट्स जाँचें।",
    reference: "साथी · OpenAI · आपके स्वीकार किए हुए प्रस्ताव" };
  if (language === "hinglish") return { ...copy, fixture: provider ? "OpenAI proposals" : "Sources check karein",
    note: "Proposals suggestions hain. Har quote original message se check karein aur sirf sahi details add karein.",
    empty: "Naye proposals nahi mile. Apne saved notes check karein.", reference: "Saathi · OpenAI · aapke accepted proposals" };
  return { ...copy, fixture: provider ? "OpenAI proposals" : "Review sources",
    note: "Proposals are suggestions. Check each quote against the original message and add only the details you agree with.",
    empty: "No new proposals were found. Review your saved notes.", reference: "Saathi · OpenAI · accepted by you" };
}
