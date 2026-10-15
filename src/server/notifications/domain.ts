import "server-only";
import { notificationContentSchema } from "@/lib/notification";
import { ServiceError } from "@/server/errors";
const copy = {
  en: {
    subject: "Your Yama workspace",
    intro: "You asked for a link to your Yama workspace.",
    action: "Return to the browser where you started to continue.",
    notice:
      "This is a synthetic localhost test. This message contains no report details and does not mean a complaint was filed.",
  },
  hi: {
    subject: "आपका Yama कार्यक्षेत्र",
    intro: "आपने अपने Yama कार्यक्षेत्र का लिंक माँगा था।",
    action: "आगे बढ़ने के लिए उसी ब्राउज़र में लौटें जहाँ आपने शुरुआत की थी।",
    notice:
      "यह localhost पर काल्पनिक जानकारी वाला परीक्षण है। इस संदेश में रिपोर्ट का विवरण नहीं है और इसका मतलब शिकायत दर्ज होना नहीं है।",
  },
  hinglish: {
    subject: "Aapka Yama workspace",
    intro: "Aapne apne Yama workspace ka link manga tha.",
    action:
      "Aage badhne ke liye usi browser par lautein jahan aapne shuru kiya tha.",
    notice:
      "Yeh fictional details wala localhost test hai. Is message mein report details nahi hain aur iska matlab complaint file hona nahi hai.",
  },
};
export function buildNotificationContent(
  language: keyof typeof copy,
  origin: string,
) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ServiceError(503, "mail_origin_rejected");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    Array.from(origin).some((character) => character.charCodeAt(0) < 32)
  )
    throw new ServiceError(503, "mail_origin_rejected");
  const wording = copy[language],
    link = url.href;
  return notificationContentSchema.parse({
    subject: wording.subject,
    text: `${wording.intro}\n\n${wording.action}\n${link}\n\n${wording.notice}`,
    html: `<!doctype html><html lang="${language === "hi" ? "hi" : "en"}"><body><p>${wording.intro}</p><p>${wording.action}</p><p><a href="${link}">Yama</a></p><p>${wording.notice}</p></body></html>`,
  });
}
