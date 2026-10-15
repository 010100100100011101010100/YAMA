import "server-only";
import { assistanceSchema, type Assistance } from "@/lib/assistance";

// Manually checked against the primary sources below. No report content or model
// output chooses a destination. A future review must update both dates/version.
const words = {
  en: [
    ["Immediate danger", "India's emergency response number is 112.", "For an emergency needing police, health or fire assistance in India. Yama does not dispatch help."],
    ["Cybercrime reporting", "For suspected cyber financial fraud, contact 1930. The national portal accepts cybercrime reports.", "For cybercrime in India. You choose whether to contact the official service; Yama has not filed anything or assessed criminal liability."],
    ["Consumer grievance", "The National Consumer Helpline accepts grievances about goods and services via its portal or 1915.", "A pre-litigation route for consumer issues in India. Check the official service's requirements; a remedy is not guaranteed."],
  ],
  hi: [
    ["तुरंत खतरा", "भारत में आपातकालीन सहायता का नंबर 112 है।", "भारत में पुलिस, स्वास्थ्य या अग्निशमन की आपातकालीन सहायता के लिए। यामा सहायता दल नहीं भेजता।"],
    ["साइबर अपराध की शिकायत", "संदिग्ध साइबर वित्तीय धोखाधड़ी के लिए 1930 से संपर्क करें। राष्ट्रीय पोर्टल पर साइबर अपराध की शिकायत की जा सकती है।", "भारत में साइबर अपराध के लिए। आधिकारिक सेवा से संपर्क करना आपका निर्णय है; यामा ने शिकायत दर्ज नहीं की है या आपराधिक जिम्मेदारी तय नहीं की है।"],
    ["उपभोक्ता शिकायत", "राष्ट्रीय उपभोक्ता हेल्पलाइन वस्तुओं और सेवाओं से जुड़ी शिकायतें पोर्टल या 1915 पर लेती है।", "भारत में उपभोक्ता मामलों का मुकदमे से पहले का विकल्प। आधिकारिक सेवा की शर्तें देखें; समाधान की गारंटी नहीं है।"],
  ],
  hinglish: [
    ["Turant khatra", "India mein emergency help ka number 112 hai.", "India mein police, health ya fire emergency ke liye. Yama help team dispatch nahi karta."],
    ["Cybercrime report", "Suspected cyber financial fraud ke liye 1930 contact karein. National portal cybercrime reports leta hai.", "India mein cybercrime ke liye. Official service ko contact karna aapki choice hai; Yama ne complaint file ya criminal liability assess nahi ki."],
    ["Consumer complaint", "National Consumer Helpline goods aur services ki complaints portal ya 1915 par leti hai.", "India mein consumer issues ke liye pre-litigation option. Official requirements check karein; remedy guaranteed nahi hai."],
  ],
} as const;

export function assistanceCatalogue(language: Assistance["language"], now = new Date()): Assistance {
  const current = now >= new Date("2026-10-11T00:00:00Z") && now < new Date("2027-01-09T00:00:00Z");
  const sources = [
    ["emergency", "112", "https://112.gov.in/", "https://www.mha.gov.in/en/commoncontent/emergency-response-support-system-erss"],
    ["cybercrime", "1930", "https://cybercrime.gov.in/", "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2298336&lang=1&reg=3"],
    ["consumer", "1915", "https://consumerhelpline.gov.in/", "https://consumerhelpline.gov.in/public/about"],
  ] as const;
  return assistanceSchema.parse({ version: "india-assistance-2026-10-11", jurisdiction: "IN", free: true, language,
    options: sources.map(([id, contact, routeUrl, sourceUrl], index) => ({ id, contact: current ? contact : null, routeUrl, sourceUrl,
      title: words[language][index][0], body: current ? words[language][index][1] : language === "hi" ? "वर्तमान विवरण के लिए आधिकारिक स्रोत देखें।" : language === "hinglish" ? "Current details official source par check karein." : "Check the official source for current details.", applicability: words[language][index][2],
      checkedAt: "2026-10-11", reviewBy: "2027-01-09", status: current ? "current" : "needs_review" })),
  });
}
