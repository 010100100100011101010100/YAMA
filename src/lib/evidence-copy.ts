import type { Language } from "./demo-state";

export function evidenceCopy(language: Language) {
  const english = {
    note: "PDF, PNG or JPEG up to 5 MB; UTF-8 .txt up to 64 KB. PDFs: up to 3 pages. Images: up to 8 megapixels. Text: up to 6,000 characters. Stored privately on this laptop.",
    queued: "Waiting to read…", processing: "Reading document…", canceled: "Reading canceled", cancel: "Cancel reading", canceling: "Canceling reading…",
    ocr: "OCR can misread names, numbers and words. Compare this text with your original file before adding it, then correct your draft if needed.", textHash: "Text SHA-256", pages: "Pages",
    waiting: "Reading is still pending. Reload files to check progress; your notes are unchanged.", retryLimit: "This file has reached its three-attempt limit. Choose another file.",
    malformed: "This document could not be read. Export a fresh PDF or image and try again.", encrypted: "Password-protected PDFs cannot be read. Upload an unlocked copy.", pageLimit: "Choose a PDF with no more than 3 pages.", imageLimit: "Choose a still image up to 8 megapixels and 8,000 pixels on either side.",
    removal: "Removing a file hides it from this list. Original files and text already added to notes remain in report history.",
    start: "Save a message before adding files.", empty: "No files added yet.", loading: "Opening saved files…", uploading: "Uploading your file…", extracting: "Reading the text…", opening: "Opening the source…", removing: "Removing from the list…", reviewing: "Adding to your draft…",
    stored: "Stored · text not read yet", ready: "Text ready · review before adding", reviewed: "Added to draft notes", read: "Read text", retryRead: "Retry reading", retryUpload: "Retry upload", retryList: "Reload files", remove: "Remove from list",
    title: "Extracted text", acknowledge: "I’ve read this text and want it in my draft.", add: "Add as draft note", close: "Close text", record: "File record", added: "Added to your draft. Check and confirm your notes before comparing.",
    error: "The file action couldn’t finish. Your notes are unchanged; try again.", unsupported: "Choose a PDF, PNG, JPEG or UTF-8 .txt file.", size: "Choose a non-empty PDF/image up to 5 MB, or a .txt file up to 64 KB.",
    invalid: "The file isn’t valid UTF-8 text. Save it as UTF-8 and upload it again.", long: "This file exceeds 6,000 characters. Upload a shorter file; no content has been truncated.", blank: "There is no readable text. Choose another file.", integrity: "The stored file no longer matches its upload. It cannot be used as a source.",
    limit: "This report has reached its 20-file limit, including removed files.", expired: "Your session ended. Reload the page to reconnect; earlier notes may be unavailable.",
  };
  if (language === "hi") return { ...english,
    note: "PDF, PNG या JPEG अधिकतम 5 MB; UTF-8 .txt अधिकतम 64 KB। PDF: अधिकतम 3 पेज। चित्र: अधिकतम 8 मेगापिक्सेल। टेक्स्ट: अधिकतम 6,000 अक्षर। फ़ाइलें इस लैपटॉप पर निजी रहती हैं।",
    queued: "पढ़ने की बारी का इंतज़ार…", processing: "दस्तावेज़ पढ़ा जा रहा है…", canceled: "पढ़ना रद्द हुआ", cancel: "पढ़ना रद्द करें", canceling: "पढ़ना रद्द हो रहा है…",
    ocr: "OCR में नाम, संख्या और शब्द गलत पढ़े जा सकते हैं। जोड़ने से पहले मूल फ़ाइल से टेक्स्ट मिलाएँ और ज़रूरत हो तो ड्राफ़्ट सुधारें।", textHash: "टेक्स्ट SHA-256", pages: "पेज",
    waiting: "पढ़ना अभी बाकी है। प्रगति देखने के लिए फ़ाइलें फिर खोलें; नोट्स नहीं बदले हैं।", retryLimit: "इस फ़ाइल को पढ़ने की तीन कोशिशें पूरी हो गई हैं। दूसरी फ़ाइल चुनें।",
    malformed: "दस्तावेज़ पढ़ा नहीं जा सका। नई PDF या चित्र सेव करके कोशिश करें।", encrypted: "पासवर्ड वाली PDF नहीं पढ़ सकते। बिना पासवर्ड वाली कॉपी चुनें।", pageLimit: "अधिकतम 3 पेज वाली PDF चुनें।", imageLimit: "अधिकतम 8 मेगापिक्सेल और हर तरफ़ 8,000 पिक्सेल वाला स्थिर चित्र चुनें।",
    removal: "हटाने पर फ़ाइल इस सूची से हटती है। मूल फ़ाइल और नोट्स में जोड़ा गया टेक्स्ट रिपोर्ट के इतिहास में रहता है।",
    start: "फ़ाइल जोड़ने से पहले एक संदेश सेव करें।", empty: "अभी कोई फ़ाइल नहीं जोड़ी गई।", loading: "सेव की गई फ़ाइलें खुल रही हैं…", uploading: "फ़ाइल अपलोड हो रही है…", extracting: "टेक्स्ट पढ़ा जा रहा है…", opening: "स्रोत खुल रहा है…", removing: "सूची से हट रही है…", reviewing: "ड्राफ़्ट में जुड़ रहा है…",
    stored: "सेव हुई · टेक्स्ट अभी नहीं पढ़ा", ready: "टेक्स्ट तैयार · जोड़ने से पहले पढ़ें", reviewed: "ड्राफ़्ट नोट्स में जोड़ा गया", read: "टेक्स्ट पढ़ें", retryRead: "फिर पढ़ें", retryUpload: "फिर अपलोड करें", retryList: "फ़ाइलें फिर खोलें", remove: "सूची से हटाएँ",
    title: "फ़ाइल से पढ़ा गया टेक्स्ट", acknowledge: "मैंने यह टेक्स्ट पढ़ लिया है और इसे अपने ड्राफ़्ट में जोड़ना चाहता/चाहती हूँ।", add: "ड्राफ़्ट नोट में जोड़ें", close: "टेक्स्ट बंद करें", record: "फ़ाइल का विवरण", added: "ड्राफ़्ट में जुड़ गया। तुलना से पहले नोट्स जाँचकर पुष्टि करें।",
    error: "फ़ाइल का काम पूरा नहीं हुआ। आपके नोट्स नहीं बदले; फिर कोशिश करें।", unsupported: "PDF, PNG, JPEG या UTF-8 .txt फ़ाइल चुनें।", size: "खाली न हो: PDF/चित्र अधिकतम 5 MB, .txt अधिकतम 64 KB।", invalid: "यह फ़ाइल सही UTF-8 टेक्स्ट नहीं है। UTF-8 में सेव करके फिर अपलोड करें।", long: "फ़ाइल में 6,000 से अधिक अक्षर हैं। छोटी फ़ाइल अपलोड करें; टेक्स्ट काटा नहीं गया है।", blank: "पढ़ने योग्य टेक्स्ट नहीं है। दूसरी फ़ाइल चुनें।", integrity: "सेव की गई फ़ाइल अपलोड से मेल नहीं खाती। इसे स्रोत की तरह इस्तेमाल नहीं किया जा सकता।", limit: "इस रिपोर्ट में 20 फ़ाइलों की सीमा पूरी हो गई है; हटाई गई फ़ाइलें भी इसमें शामिल हैं।", expired: "सत्र समाप्त हो गया। फिर जुड़ने के लिए पेज खोलें; पुराने नोट्स उपलब्ध न भी हों।",
  };
  if (language === "hinglish") return { ...english,
    note: "PDF, PNG ya JPEG 5 MB tak; UTF-8 .txt 64 KB tak. PDF: 3 pages tak. Images: 8 megapixels tak. Text: 6,000 characters tak. Is laptop par private storage.", removal: "Remove karne par file list se hat ti hai. Original file aur notes mein added text report history mein rehte hain.",
    queued: "Read karne ki baari ka wait…", processing: "Document read ho raha hai…", canceled: "Reading canceled", cancel: "Reading cancel karein", canceling: "Reading cancel ho rahi hai…",
    ocr: "OCR names, numbers aur words galat read kar sakta hai. Add karne se pehle original file se text match karein aur zaroorat ho toh draft correct karein.", textHash: "Text SHA-256", pages: "Pages",
    waiting: "Reading abhi pending hai. Progress ke liye files reload karein; notes unchanged hain.", retryLimit: "Is file ki teen attempts complete ho gayi hain. Another file choose karein.",
    malformed: "Document read nahi hua. Fresh PDF ya image export karke try karein.", encrypted: "Password wali PDF read nahi kar sakte. Unlocked copy choose karein.", pageLimit: "3 pages tak ki PDF choose karein.", imageLimit: "8 megapixels aur har side 8,000 pixels tak ki still image choose karein.",
    start: "File add karne se pehle ek message save karein.", empty: "Abhi koi file add nahi hui.", loading: "Saved files khul rahi hain…", uploading: "File upload ho rahi hai…", extracting: "Text read ho raha hai…", opening: "Source khul raha hai…", removing: "List se hat rahi hai…", reviewing: "Draft mein add ho raha hai…",
    stored: "Stored · text abhi read nahi hua", ready: "Text ready · add karne se pehle padhein", reviewed: "Draft notes mein added", read: "Text padhein", retryRead: "Phir read karein", retryUpload: "Upload retry karein", retryList: "Files reload karein", remove: "List se hatayein", title: "File ka text", acknowledge: "Maine yeh text padh liya hai aur draft mein add karna hai.", add: "Draft note mein add karein", close: "Text band karein", record: "File details", added: "Draft mein added. Compare karne se pehle notes check aur confirm karein.",
    error: "File action finish nahi hua. Notes unchanged hain; phir try karein.", unsupported: "PDF, PNG, JPEG ya UTF-8 .txt file choose karein.", size: "Non-empty file: PDF/image 5 MB tak, .txt 64 KB tak.", invalid: "File valid UTF-8 text nahi hai. UTF-8 mein save karke phir upload karein.", long: "File 6,000 characters se badi hai. Shorter file upload karein; text truncate nahi kiya gaya.", blank: "Readable text nahi hai. Another file choose karein.", integrity: "Stored file upload se match nahi karti. Isse source nahi bana sakte.", limit: "Report ka 20-file limit poora hai, removed files mila kar.", expired: "Session end ho gaya. Reconnect ke liye page reload karein; earlier notes unavailable ho sakte hain.",
  };
  return english;
}
export function evidenceError(code: string, language: Language) {
  const text = evidenceCopy(language);
  if (["invalid_file_name", "unsupported_file_type", "binary_content"].includes(code)) return text.unsupported;
  if (["file_too_large", "empty_upload"].includes(code)) return text.size;
  if (code === "invalid_utf8") return text.invalid;
  if (code === "text_limit") return text.long;
  if (code === "empty_text") return text.blank;
  if (["integrity_failed", "source_changed"].includes(code)) return text.integrity;
  if (code === "evidence_limit") return text.limit;
  if (code === "authentication_required") return text.expired;
  if (code === "processing_waiting") return text.waiting;
  if (code === "retry_limit") return text.retryLimit;
  if (code === "document_malformed") return text.malformed;
  if (code === "encrypted_pdf") return text.encrypted;
  if (code === "page_limit") return text.pageLimit;
  if (["image_limit", "animated_image"].includes(code)) return text.imageLimit;
  return text.error;
}
