import type { Language } from "./demo-state";
export function chatText(language: Language) {
  if (language === "hi")
    return {
      chats: "बातचीत",
      recent: "हाल की बातचीत",
      newChat: "नई बातचीत",
      unresolved: "अनसुलझी",
      resolved: "सुलझी",
      resolve: "सुलझी चिह्नित करें",
      reopen: "बातचीत फिर खोलें",
      loading: "बातचीत लोड हो रही हैं…",
      empty: "आपकी बातचीत यहाँ दिखेगी।",
      failed: "बातचीत लोड नहीं हुईं।",
      retry: "फिर कोशिश करें",
      statusFailed: "स्थिति सेव नहीं हुई। फिर कोशिश करें।",
      team: "आप, Saathi, Drishti और Disha",
      everyone: "सभी से",
      about: "के बारे में",
      close: "एजेंट की जानकारी बंद करें",
      typing: "उत्तर लिख रहे हैं",
      waiting: "के उत्तर का इंतज़ार है",
      next_actions: "अगले कदम",
      similar_cases: "समान मामलों की तुलना",
      clarification: "अधिक जानकारी",
      user_goal: "आपका उद्देश्य",
    };
  if (language === "hinglish")
    return {
      chats: "Chats",
      recent: "Recent chats",
      newChat: "Nayi chat",
      unresolved: "Unresolved",
      resolved: "Resolved",
      resolve: "Resolved mark karein",
      reopen: "Chat phir kholein",
      loading: "Chats load ho rahi hain…",
      empty: "Aapki chats yahan dikheingi.",
      failed: "Chats load nahi hui.",
      retry: "Phir try karein",
      statusFailed: "Status save nahi hua. Phir try karein.",
      team: "Aap, Saathi, Drishti aur Disha",
      everyone: "Sab ke liye",
      about: "Ke baare mein",
      close: "Agent info band karein",
      typing: "reply likh rahe hain",
      waiting: "ke reply ka intezaar hai",
      next_actions: "Agle steps",
      similar_cases: "Similar cases",
      clarification: "Aur context",
      user_goal: "Aapka goal",
    };
  return {
    chats: "Chats",
    recent: "Recent chats",
    newChat: "New chat",
    unresolved: "Unresolved",
    resolved: "Resolved",
    resolve: "Mark resolved",
    reopen: "Reopen chat",
    loading: "Loading chats…",
    empty: "Your chats will appear here.",
    failed: "Chats couldn’t be loaded.",
    retry: "Try again",
    statusFailed: "The status wasn’t saved. Try again.",
    team: "You, Saathi, Drishti and Disha",
    everyone: "To everyone",
    about: "About",
    close: "Close agent info",
    typing: "is typing",
    waiting: "Waiting for",
    next_actions: "Next steps",
    similar_cases: "Similar cases",
    clarification: "More context",
    user_goal: "Your goal",
  };
}
export const agentNature = {
  en: {
    saathi: {
      nature: "Patient listener",
      description:
        "Helps you put your experience into words, asks for context, and organizes notes for you to review.",
    },
    drishti: {
      nature: "Pattern analyst",
      description:
        "Compares confirmed details with permitted cases. Explains sources, differences and uncertainty; a similar pattern does not prove a shared person.",
    },
    disha: {
      nature: "Practical guide",
      description:
        "Helps you consider resolutions and next steps. Explains your options; you decide what to do.",
    },
  },
  hi: {
    saathi: {
      nature: "धैर्य से सुनने वाला साथी",
      description:
        "आपकी बात समझने, ज़रूरी संदर्भ पूछने और समीक्षा के लिए नोट्स व्यवस्थित करने में मदद करता है।",
    },
    drishti: {
      nature: "समानताएँ समझने वाला विश्लेषक",
      description:
        "पुष्टि की गई जानकारी की उपलब्ध मामलों से तुलना करता है। स्रोत, अंतर और अनिश्चितता बताता है; समानता से एक ही व्यक्ति होना साबित नहीं होता।",
    },
    disha: {
      nature: "व्यावहारिक मार्गदर्शक",
      description:
        "संभावित समाधान और अगले कदम समझने में मदद करता है। विकल्प बताता है; निर्णय आपका है।",
    },
  },
  hinglish: {
    saathi: {
      nature: "Patient listener",
      description:
        "Aapki baat sunta hai, zaroori context poochta hai aur review ke liye notes organize karta hai.",
    },
    drishti: {
      nature: "Pattern analyst",
      description:
        "Confirmed details ko available cases se compare karta hai. Sources, differences aur uncertainty batata hai; similar pattern se same person prove nahi hota.",
    },
    disha: {
      nature: "Practical guide",
      description:
        "Resolutions aur next steps samajhne mein madad karta hai. Options batata hai; decision aapka hai.",
    },
  },
};
