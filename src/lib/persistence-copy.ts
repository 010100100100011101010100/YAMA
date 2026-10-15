import { getCopy, type Copy } from "./copy";
import type { Language } from "./demo-state";
import { evidenceCopy } from "./evidence-copy";

export function getSavedCopy(language: Language): Copy {
  const copy = getCopy(language);
  const english = { ...copy,
    previewTag: "Microphone call",
    demoNote: "Fictional details only. Your notes are saved in Yama on this laptop.",
    noteReply: "Your words are saved. Check your notes when you’re ready. AI replies aren’t connected yet.",
    saathiBridge: "Drishti will compare the details you confirmed with fictional examples. Disha can help with next steps while that runs.",
    drishtiBridge: "I’m Drishti. The comparison is ready. Let’s look at the shared details and the limits.",
    taskRunning: "Drishti is checking your confirmed notes", checking: "Checking confirmed notes",
    taskDetail: "Confirmed details and fictional examples", comparisonLabel: "Synthetic case catalogue",
    patternValue: "Confirmed shared details", linkageValue: "Not assessed",
    supportsText: "The comparison uses the details you included and confirmed.",
    unknownText: "A shared sequence does not connect anyone’s identity or establish what happened.",
    evidenceNote: evidenceCopy(language).note,
  };
  if (language === "hi") return { ...english,
    previewTag: "माइक्रोफ़ोन कॉल",
    demoNote: "केवल काल्पनिक जानकारी दें। आपके नोट्स इस लैपटॉप पर Yama में सेव होते हैं।",
    noteReply: "आपकी बात सेव हो गई। तैयार होने पर नोट्स जाँचें। AI के जवाब अभी जुड़े नहीं हैं।",
    saathiBridge: "दृष्टि आपकी पुष्टि की गई जानकारी की काल्पनिक उदाहरणों से तुलना करेगी। इस बीच दिशा अगले कदमों में मदद कर सकती है।",
    drishtiBridge: "मैं दृष्टि हूँ। तुलना तैयार है। समान जानकारी और उसकी सीमाएँ देखें।",
    taskRunning: "दृष्टि पुष्टि किए गए नोट्स देख रही है", checking: "पुष्टि किए गए नोट्स देख रही है",
    taskDetail: "पुष्टि की गई जानकारी और काल्पनिक उदाहरण", comparisonLabel: "काल्पनिक उदाहरणों का संग्रह",
    patternValue: "पुष्टि की गई समान जानकारी", linkageValue: "पहचान की जाँच नहीं हुई",
    supportsText: "तुलना आपकी शामिल और पुष्टि की गई जानकारी पर आधारित है।",
    unknownText: "समान घटनाक्रम से किसी की पहचान या घटना का सत्यापन नहीं होता।",
    evidenceNote: evidenceCopy(language).note,
  };
  if (language === "hinglish") return { ...english,
    previewTag: "Mic call",
    demoNote: "Sirf fictional details dein. Notes is laptop par Yama mein save hote hain.",
    noteReply: "Aapki baat save ho gayi. Jab ready hon, notes check karein. AI replies abhi connected nahi hain.",
    saathiBridge: "Drishti confirmed details ko fictional examples se compare karegi. Tab tak Disha next steps mein help kar sakti hai.",
    drishtiBridge: "Main Drishti hoon. Comparison ready hai. Shared details aur limits dekhein.",
    taskRunning: "Drishti confirmed notes check kar rahi hai", checking: "Confirmed notes check ho rahe hain",
    taskDetail: "Confirmed details aur fictional examples", comparisonLabel: "Fictional case catalogue",
    patternValue: "Confirmed shared details", linkageValue: "Identity check nahi hui",
    unknownText: "Similar sequence se kisi ki identity ya incident verify nahi hota.",
  };
  return english;
}
const patterns: Record<Language, Record<string, string>> = {
  en: { paid: "Payment made", promised_delivery: "Delivery promised", not_delivered: "Delivery not received", no_reply: "Replies stopped" },
  hi: { paid: "भुगतान किया", promised_delivery: "डिलीवरी का वादा", not_delivered: "डिलीवरी नहीं हुई", no_reply: "जवाब आने बंद हुए" },
  hinglish: { paid: "Payment kiya", promised_delivery: "Delivery promise hui", not_delivered: "Delivery nahi hui", no_reply: "Replies band ho gaye" },
};
export const patternOptions = ["paid", "promised_delivery", "not_delivered", "no_reply"];
export const patternLabel = (value: string, language: Language) => patterns[language][value] ?? value;
export function persistenceText(language: Language) {
  if (language === "hi") return { loading: "सेव किए गए नोट्स खुल रहे हैं…", saving: "आपके नोट्स सेव हो रहे हैं…", ready: "स्थानीय डेटाबेस जुड़ा है", saved: "इस लैपटॉप पर सेव", revision: "संस्करण", retry: "सेव किए गए नोट्स फिर खोलें", reload: "फिर जुड़ने के लिए पेज खोलें",
    failed: "बदलाव सेव नहीं हो सका। नोट्स जाँचकर फिर कोशिश करें।", loadFailed: "सेव किए गए नोट्स नहीं खुल सके। स्थानीय डेटाबेस और सर्वर जाँचकर फिर कोशिश करें।", conflict: "दूसरे टैब में नोट्स बदले हैं। नवीनतम जानकारी देखकर अपना बदलाव फिर सेव करें।", sessionLost: "सत्र समाप्त हो गया। दोबारा जुड़ने पर पुराने नोट्स उपलब्ध न भी हों।", pending: "तुलना अभी तैयार नहीं है। थोड़ी देर बाद फिर कोशिश करें।",
    support: "इस जानकारी का आधार", affirmed: "यह जानकारी समर्थित है", contradicted: "इसके विरुद्ध जानकारी है", uncertain: "अनिश्चित", noMatches: "कोई समान काल्पनिक उदाहरण नहीं मिला। इससे आपकी बात गलत साबित नहीं होती।", noPatterns: "तुलना के लिए कोई पुष्टि की गई पैटर्न जानकारी नहीं है। आपकी बात सेव है; जानकारी निकालने की सुविधा अगले चरण में जुड़ेगी।", other: "उदाहरण में अन्य दर्ज जानकारी", none: "और कोई अंतर दर्ज नहीं है।", source: "काल्पनिक स्रोत", shared: "समान जानकारी", title: "मिले हुए काल्पनिक उदाहरण" };
  if (language === "hinglish") return { loading: "Saved notes khul rahe hain…", saving: "Notes save ho rahe hain…", ready: "Local database connected", saved: "Is laptop par saved", revision: "Revision", retry: "Saved notes phir load karein", reload: "Reconnect karne ke liye page reload karein",
    failed: "Change save nahi hua. Notes check karke phir try karein.", loadFailed: "Saved notes nahi khule. Local database aur server check karke phir try karein.", conflict: "Doosre tab mein notes badle hain. Latest details dekhkar apna edit phir save karein.", sessionLost: "Session khatam ho gaya. Reconnect par purane notes unavailable ho sakte hain.", pending: "Comparison abhi ready nahi hai. Thodi der baad phir try karein.",
    support: "Is detail ka support", affirmed: "Detail supported hai", contradicted: "Iske against information hai", uncertain: "Unsure", noMatches: "Koi similar fictional example nahi mila. Isse aapki baat galat prove nahi hoti.", noPatterns: "Comparison ke liye confirmed pattern details nahi hain. Aapki baat saved hai; extraction agle stage mein aayegi.", other: "Example mein other recorded details", none: "Aur koi difference recorded nahi hai.", source: "Fictional source", shared: "Shared details", title: "Matching fictional examples" };
  return { loading: "Opening saved notes…", saving: "Saving your notes…", ready: "Local database connected", saved: "Saved on this laptop", revision: "Revision", retry: "Reload saved notes", reload: "Reload page to reconnect",
    failed: "The change couldn’t be saved. Check your notes and try again.", loadFailed: "Saved notes couldn’t be opened. Check the local database and server, then try again.", conflict: "Another tab changed these notes. Review the latest details before saving your edit again.", sessionLost: "Your session ended. After reconnecting, earlier notes may be unavailable.", pending: "The comparison isn’t ready yet. Try again in a moment.",
    support: "Support for this detail", affirmed: "Supports this detail", contradicted: "Contradicts this detail", uncertain: "Unsure", noMatches: "No shared fictional examples were found. This does not establish that your account is wrong.", noPatterns: "There are no confirmed pattern details to compare. Your words are saved; extraction comes in the next stage.", other: "Other recorded details in the example", none: "No additional differences are recorded.", source: "Synthetic source", shared: "Shared details", title: "Matching fictional examples" };
}
