import "server-only";
import { createHash } from "node:crypto";
import type { CatalogueCase } from "./catalogue-policy";
import type { Report } from "./domain";
import type { HarmCategory } from "@/lib/case-identifiers";

export const demoDatasetVersion = "synthetic-incidents-v3" as const;
export function demoUuid(value: string, version: string = demoDatasetVersion) {
  const hex = createHash("sha256").update(`${version}:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
type Row = {
  slug: string; name: string; occupation: string; title: string; family: string; contact: number; item: string; amount: number; city: string;
  story: string; chat: string[]; status: "resolved" | "unresolved" | "partially_resolved"; outcome: string;
  actions: [string, string][]; actionOffsets?: number[]; patterns?: CatalogueCase["patterns"]; negative?: boolean; harms?: HarmCategory[];
};
// Invented personas and businesses. These accounts are authored fixtures, never real complaints.
const rows: Row[] = [
  {
    slug: "gadget-laptop", name: "Emily Mosaic", occupation: "freelance illustrator", city: "Pune", title: "Two shipping labels, no laptop",
    family: "gadget", contact: 1, item: "laptop", amount: 18400,
    story: "My old laptop died three days before a book-cover deadline. Copper Finch Electronics had a refurbished model for INR18400 and sent a video with my name on a sticky note beside it. I paid after the seller promised dispatch that evening. The next morning he sent two shipping labels: one addressed to Pune and another to Jaipur, both using the same tracking number. He said a warehouse mix-up had triggered an INR2400 insurance hold. I called the courier myself; they could see a label, but no parcel had been handed over. When I asked for the laptop serial number, the seller deleted the video and stopped replying. I borrowed my sister's computer to finish the job and kept the original invoice, payment receipt and both labels.",
    chat: ["10:14 · Seller: Your machine is packed. Insurance is refundable once you receive it.", "10:19 · Emily: Why does the second label have someone else's address?", "10:23 · Seller: Warehouse issue, madam. Send 2400 before the dispatch closes."],
    status: "resolved", outcome: "I called my bank that afternoon and submitted the payment receipt, both labels and a cyber-complaint acknowledgement. The bank later told me the receiving account had been restricted while it reviewed the transfer. INR18400 came back in one credit eleven days later. I closed my money-loss complaint after checking the statement; I still do not know who was behind the shop account.",
    actions: [["cyber_complaint", "Emily submitted the invoice, conflicting labels and payment receipt with her complaint."], ["account_blocked", "Emily says her bank reported a restriction on the receiving account."], ["refund", "Emily recorded a full INR18400 credit eleven days after reporting the transfer."]], actionOffsets: [0, 1, 11],
  },
  {
    slug: "gadget-camera", name: "Tony Stank", occupation: "wedding videographer", city: "Jaipur", title: "A camera deposit before the wedding season",
    family: "gadget", contact: 1, item: "camera", amount: 7200,
    story: "I needed a second camera body for two weddings booked on the same weekend. A Copper Finch listing offered a used camera with a low shutter count, and the seller asked for an INR7200 deposit to hold it. His invoice looked professional, but the shop logo was cut off along the top. After I paid, he demanded INR1800 for a refundable courier release. I asked for a short video showing that day's newspaper beside the camera. Instead, he resent the original clip with its audio removed. The tracking page stayed at 'label created' for four days, and his last voice note said the parcel was stuck in a hub that the courier said did not exist. I ended up renting equipment and losing most of the profit on the booking. The shop has not answered any message since that voice note.",
    chat: ["18:06 · Seller: Camera reserved in your name. Balance after delivery.", "18:31 · Tony: Send a fresh video with the shutter count screen, please.", "18:34 · Seller: First clear courier release. Video team has left for the day."],
    status: "unresolved", outcome: "My bank has the transaction reference and the complaint acknowledgement. I also sent the marketplace the invoice and the two versions of the video. The listing disappeared, but I have not received the INR7200 or any written confirmation that the recipient account was frozen. The camera-rental expense was separate from the amount I reported as transferred.",
    actions: [["cyber_complaint", "Tony filed a complaint with the deposit receipt and saved voice note."], ["bank_notified", "Tony opened a bank dispute; no recovery has appeared on his statement."]],
  },
  {
    slug: "gadget-tablet", name: "Bruce Willi", occupation: "architecture student", city: "Indore", title: "The drawing tablet and a second clearance fee",
    family: "gadget", contact: 1, item: "tablet", amount: 9600,
    story: "I was buying a drawing tablet for my final-year portfolio and used money from a small freelance floor-plan job. Copper Finch offered a boxed tablet for INR9600 if I paid before its festival sale ended. The invoice footer called it a laptop even though the model line said tablet. The seller blamed the billing software and promised delivery in two days. On the third day he sent a photograph of a carton on a bus seat and asked for another INR2200 to clear an inter-state warehouse check. There was no shipment number on the carton. When I refused to pay again, my messages were read but unanswered. I saved the unedited invoice rather than cropping out the wrong item description.",
    chat: ["11:42 · Bruce: The invoice says laptop. Can you correct it before shipping?", "11:45 · Seller: Template error only. Your tablet is already moving.", "16:07 · Seller: Clearance pending 2200. Pay now and receive tomorrow."],
    status: "partially_resolved", outcome: "After I disputed the transfer, my bank credited INR3000 and said the rest was still under review. The messaging platform later told me the sales account had been removed. I have INR6600 outstanding and kept the complaint open. Account removal did not tell me whether the seller used a new account or who actually operated it.",
    actions: [["cyber_complaint", "Bruce supplied the original invoice, carton photograph and transaction receipt."], ["platform_removed", "Bruce received a platform message saying the sales account was removed."], ["partial_refund", "Bruce recorded INR3000 recovered and INR6600 still outstanding."]],
  },
  {
    slug: "gadget-console", name: "Peter Parikh", occupation: "school music teacher", city: "Kochi", title: "The birthday console with a recycled unboxing video",
    family: "gadget", contact: 2, item: "game console", amount: 12200,
    story: "I ordered a used game console as a joint birthday gift for my nephews. The Blue Kestrel seller sent a very convincing unboxing video and offered INR2000 off for paying outside the marketplace. I transferred INR12200. Two days later, my nephew found the exact video on an older review channel, down to a scratch on the table. The seller said his marketing agency reused footage and sent a tracking code, but the courier could not find it. His invoice resembled one a friend had shown me, although the shop name and all the contacts were different. I kept those differences in my report rather than assuming the shops had the same owner. The Blue Kestrel account went silent after I requested a refund.",
    chat: ["20:11 · Peter: Is this the actual unit? The video is on another channel.", "20:18 · Seller: Agency content. Your serial number is in the shipment.", "09:06 · Peter: Courier says this tracking code has never been issued."],
    status: "unresolved", outcome: "The marketplace removed the profile after I uploaded the video comparison. My bank accepted the transfer dispute, but there has been no refund or confirmed account restriction. The birthday went ahead with a borrowed console. I cannot connect this seller to Copper Finch just because the invoice layout looks familiar.",
    actions: [["platform_report", "Peter reported the reused video and the marketplace removed the profile."], ["bank_notified", "Peter's transfer dispute remains open with no recovery confirmed."]],
  },
  {
    slug: "job-training", name: "Nadia Vane", occupation: "commerce graduate", city: "Lucknow", title: "A job offer signed by somebody who had left the company",
    family: "jobs", contact: 10, item: "recruitment training", amount: 4500,
    story: "I applied for remote operations work while helping at my parents' stationery shop. A North Lantern recruiter called me selected after a six-minute chat and sent an offer letter with a company seal. I paid INR4500 for training before noticing that the signatory's public profile said she had left the company two years earlier. The recruiter then asked for INR8900 to activate a laptop dispatch. I contacted the company's published HR address rather than replying to the offer email. HR said the letter was not theirs and asked me to forward the original message headers. The recruiter stopped answering as soon as I asked which payroll company would issue my salary.",
    chat: ["12:08 · Recruiter: Training seat confirmed. Laptop activation is the last step.", "12:16 · Nadia: Can your HR team confirm this from the company domain?", "12:20 · Recruiter: External hiring desk only. Do not delay joining by checking elsewhere."],
    status: "resolved", outcome: "I gave my bank the genuine HR reply, offer letter and training payment receipt. After its review, the wallet provider returned INR4500 and said the recipient wallet had been restricted. I kept the refund reference and stopped corresponding with the recruiter. I never received a job, but the money I had actually sent was returned.",
    actions: [["impersonation_report", "Nadia obtained a written denial of the offer from the genuine company's HR team."], ["cyber_complaint", "Nadia attached the offer letter and HR reply to her complaint."], ["refund", "Nadia recorded the full INR4500 training payment returned."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "job-security", name: "Mira Storm", occupation: "customer-support associate", city: "Bhopal", title: "A login portal that demanded a second deposit",
    family: "jobs", contact: 10, item: "remote job", amount: 6800,
    story: "I was looking for evening work after my regular support shift. A North Lantern recruiter said my typing sample was enough and sent a login page with my name already filled in. I paid INR6800 as an equipment security deposit. The page then displayed a tax-verification error and asked for INR3400 more. The recruiter sent screenshots of other people's supposed joining bonuses, but would not arrange a call with a team lead. I noticed that the phone, email and messaging handle on the offer letter were identical to the ones used in the chat. I downloaded the PDF and saved the page before it went blank the next morning. Since then, my questions about the deposit have gone unanswered.",
    chat: ["21:04 · Recruiter: Your employee login is active after security payment.", "21:19 · Mira: It says I need another deposit. Where is that in the offer?", "21:22 · Recruiter: System tax hold. Everyone clears it before the first salary."],
    status: "unresolved", outcome: "I have a bank dispute number and a complaint acknowledgement. The messaging platform has not sent a decision on the account report. Nobody has confirmed a freeze or refund. I changed the password I had reused on that login page, but that did not recover the transferred money.",
    actions: [["cyber_complaint", "Mira filed a complaint with the offer PDF and login-page screenshots."], ["platform_report", "Mira reported the recruiter profile; a decision is still pending."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "job-equipment", name: "Wade Wilton", occupation: "video editor", city: "Nagpur", title: "The equipment van that kept circling the same street",
    family: "jobs", contact: 10, item: "job equipment", amount: 11500,
    story: "A recruiter offered a remote editing contract and said the employer would send a workstation. I paid INR11500 for a refundable equipment bond after receiving an appointment letter. On delivery day, a tracking page showed a van moving around the same square of streets for two hours. Its location animation restarted at exactly the same point whenever I refreshed. The recruiter asked for a certificate fee to let the driver complete the handover. I asked for the courier company and vehicle registration instead. Neither arrived, and the chat went silent. I recorded the screen loop and kept the email attachment with its original filename.",
    chat: ["08:46 · Recruiter: Driver is near your area. Clear certification to release the box.", "09:03 · Wade: The van repeats the same route. What is the courier's name?", "09:07 · Recruiter: Internal fleet. Accounts will refund all fees with salary."],
    status: "partially_resolved", outcome: "My bank recovered INR4000 after I submitted the transfer receipt and screen recording. The platform suspended the hiring account after my report. INR7500 is still missing, and I have not received equipment or a real employment contract. I have kept both the bank dispute and complaint open.",
    actions: [["bank_notified", "Wade supplied the equipment-bond receipt and recording of the repeating van animation."], ["partial_refund", "Wade recorded INR4000 recovered, leaving INR7500 outstanding."], ["platform_removed", "Wade received a notice that the hiring account was suspended."]], patterns: ["paid", "promised_delivery", "not_delivered"],
  },
  {
    slug: "job-interview", name: "Matt Murdin", occupation: "junior accountant", city: "Patna", title: "An interview invitation that changed after payment",
    family: "jobs", contact: 11, item: "interview slot", amount: 2500,
    story: "I paid INR2500 to reserve what a recruiter called a priority interview slot. The calendar invitation initially named a finance manager and a recognizable office address. After payment, the organizer changed it to an unnamed online room, then canceled it ten minutes before the interview. I had already taken leave and paid for a quieter coworking desk. The recruiter said rescheduling would cost another INR1500. I asked for a refund and received an automated out-of-office reply with a different company name. The offer resembled stories I later read, but its phone number and email were different, so I cannot say those reports concern this recruiter. No person has replied since the cancellation.",
    chat: ["14:12 · Recruiter: Payment secures your panel slot. Offer follows the interview.", "09:51 · Matt: The meeting was canceled. Please return the booking payment.", "10:03 · Recruiter: Panel emergency. New slot requires a fresh scheduling payment."],
    status: "unresolved", outcome: "The bank acknowledged my dispute, and I sent the job platform the original and amended invitations. There has been no further reply from either service. I have not received the INR2500 and do not have evidence connecting this recruiter to North Lantern's contacts.",
    actions: [["bank_notified", "Matt opened a dispute for the INR2500 interview-slot payment."], ["platform_report", "Matt submitted both versions of the calendar invitation to the job platform."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "investment-task", name: "Wanda Voss", occupation: "home baker", city: "Delhi", title: "Three tiny payouts before the withdrawal trap",
    family: "tasks", contact: 20, item: "online task scheme", amount: 24000,
    story: "A Minute Mint group offered small payments for reviewing product photos. The first three tasks paid INR80 each, which made the group feel more convincing than an ordinary advertisement. An administrator then moved me into a prepaid batch and I deposited INR24000 from my baking supplies budget. My dashboard showed INR38640, but every withdrawal attempt triggered a new verification charge. Other group members posted celebrations within seconds of one another, sometimes using identical screenshots with different names. When I asked one of them a specific question, the administrator removed my message. I saved the three genuine small credits separately from the large transfer so the loss and the advertised balance would not be mixed up. The administrator removed me from the group and stopped answering direct messages.",
    chat: ["15:20 · Admin: Batch complete. Your profit is ready after verification.", "15:26 · Wanda: Deduct the fee from the balance instead of asking me to send more.", "15:28 · Admin: Withdrawal system cannot adjust balances. Final top-up only."],
    status: "unresolved", outcome: "My bank has the large transfer receipt, and my complaint includes the group export and withdrawal screen. I have no confirmed freeze or refund. The dashboard's INR38640 was only a displayed claim; I never received that amount. The small initial task payouts did not make the later deposit safe.",
    actions: [["cyber_complaint", "Wanda submitted the group export, withdrawal demands and payment timeline."], ["bank_notified", "Wanda opened a dispute on the INR24000 transfer; recovery is unconfirmed."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "investment-rating", name: "Victor Vail", occupation: "textile merchandiser", city: "Surat", title: "A negative balance after a supposedly completed task",
    family: "tasks", contact: 20, item: "rating task", amount: 13700,
    story: "I joined Minute Mint after a message promised evening rating work. The administrator put me in a four-person task room and said one member's mistake could lock the whole batch. I transferred INR13700 for a product order. The dashboard immediately showed minus INR27000, and three other members told me I would lose their money unless I repaired the balance. One sent a voice note crying about school fees. I asked for an order invoice and got a screenshot with the same number as an earlier task. I stopped paying and saved the pressure messages before the administrator deleted the room. My later requests for a payment explanation received no reply.",
    chat: ["19:11 · Admin: Your wrong rating created a negative batch. Repair it urgently.", "19:14 · Victor: Send the order invoice and explain how the balance was calculated.", "19:16 · Member: Please pay now. My withdrawal is blocked because of you."],
    status: "partially_resolved", outcome: "My bank told me it had restricted the beneficiary account after my report, but it has not confirmed any return of funds. I record that as a containment action, not a recovered loss. The INR13700 remains outstanding and the complaint is still open.",
    actions: [["cyber_complaint", "Victor attached the duplicate order number and coordinated pressure messages."], ["account_blocked", "Victor says the bank reported a beneficiary-account restriction; no refund has been confirmed."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "investment-crypto", name: "Reed Raman", occupation: "lab technician", city: "Chandigarh", title: "The withdrawal fee that rose during a support call",
    family: "tasks", contact: 20, item: "investment subscription", amount: 8400,
    story: "A Minute Mint administrator offered a subscription with fixed daily returns and showed me payout screenshots. I sent INR8400 to the payment account they supplied; I never transferred cryptocurrency. When I tried to withdraw, support asked for INR1200 in tax, then changed the amount to INR3100 while I was still on the call. The agent could not explain which payment the tax related to. I asked for the written contract and was told it would appear after withdrawal. I saved the screen before closing it and wrote down that I had paid a joining amount, not purchased verified investments. The support account stopped replying after I refused the new fee.",
    chat: ["17:41 · Support: Your withdrawal is approved. Clear the 1200 tax hold.", "17:45 · Reed: You just changed it to 3100. Which invoice is this for?", "17:47 · Support: Rate updated by the system. Pay before the account is reviewed."],
    status: "resolved", outcome: "The payment provider reversed INR8400 after I disputed the joining transfer and supplied the contradictory fee requests. I confirmed the credit on my statement before closing the loss complaint. I do not know whether the platform recovered money from anyone else or what happened to its operators.",
    actions: [["cyber_complaint", "Reed reported the joining transfer and conflicting withdrawal-fee demands."], ["refund", "Reed recorded a full INR8400 payment reversal on his statement."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "investment-independent", name: "Selina Vale", occupation: "salon owner", city: "Ahmedabad", title: "A trading room that moved its support desk overnight",
    family: "tasks", contact: 21, item: "trading group", amount: 17200,
    story: "I joined an Ember Ledger trading room after a customer forwarded a referral. I sent INR17200, and the website showed a rising balance for a week even on a day when support said trading was paused. When I requested a withdrawal, the group moved to a new room and told everyone to contact a replacement support desk. The old administrator denied knowing me. The replacement asked for a migration fee and a fresh identity upload. I refused, exported both chats and saved the earlier payment instructions. The story sounds like a prepaid-task trap, but I have different contact details and no evidence linking it to Minute Mint. My refund requests to the original contact remain unanswered.",
    chat: ["13:05 · Support: Your balance moves to the new server after migration payment.", "13:12 · Selina: I want the original deposit returned, not a new account.", "13:17 · Support: Old support cannot process withdrawals. Contact the new desk."],
    status: "unresolved", outcome: "My bank dispute and platform report are both pending. No money has returned and nobody has confirmed an account block or investigation outcome. I am keeping the displayed profit separate from the amount I transferred, and the new support account separate from the original sender until there is evidence connecting them.",
    actions: [["platform_report", "Selina reported both chat rooms and preserved the original payment instructions."], ["bank_notified", "Selina's bank dispute remains pending with no confirmed recovery."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "courier-clearance", name: "Diana Prakash", occupation: "ceramic artist", city: "Hyderabad", title: "A clearance fee for a parcel already on her shelf",
    family: "courier", contact: 30, item: "courier clearance", amount: 3900,
    story: "A Parcel Nest caller said my imported glaze samples were held for clearance. I was expecting art supplies, and he knew the last four characters of an old order reference. I paid INR3900 after he sent a notice with a stamp and a Telegram support handle. Then he asked for another charge because the package supposedly contained restricted powder. I checked the old order and realized those samples had arrived two weeks earlier; the parcel was still on my studio shelf. The real courier confirmed the new tracking reference was not theirs. I kept the notice and the photograph of the delivered package showing its actual label. The caller stopped responding after I sent the real courier's reply.",
    chat: ["10:32 · Desk: Clearance pending for ceramic material. Pay to prevent return.", "10:54 · Diana: This old parcel is already here. What is your new tracking reference?", "11:01 · Desk: Separate international shipment. Another inspection charge applies."],
    status: "resolved", outcome: "I sent the bank the genuine courier's written reply and both labels. The INR3900 payment was later reversed. I closed the payment-loss complaint after confirming the credit. The courier could explain the invalid reference, but it could not tell me who had used the old order details.",
    actions: [["impersonation_report", "Diana obtained confirmation that the clearance reference did not belong to the genuine courier."], ["refund", "Diana recorded the full INR3900 clearance payment reversed."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "courier-address", name: "Barry Alwin", occupation: "bike mechanic", city: "Bengaluru", title: "A customs notice that changed its destination city",
    family: "courier", contact: 30, item: "customs release", amount: 5600,
    story: "I was waiting for a replacement torque wrench when a caller demanded INR5600 in import duty. The Parcel Nest notice had my first name and an amount close to the tool's price. I paid, then noticed that its second page named Hyderabad rather than Bengaluru. When I asked about the mismatch, the caller sent a corrected PDF and demanded a storage charge for the delay. The real seller confirmed its parcel had not yet left the warehouse. I retained both PDFs, including their different file dates, instead of replacing the first with the corrected version. The caller did not answer my written refund requests.",
    chat: ["16:18 · Barry: The destination on page two is wrong. My tool has not shipped.", "16:25 · Desk: Old hub template. Corrected notice attached.", "16:28 · Desk: Storage is now chargeable. Clear today to avoid a return."],
    status: "unresolved", outcome: "I notified my bank and submitted a complaint with both notice versions. I have acknowledgement numbers but no refund or confirmation of a restriction on the receiving account. The actual tool order is still separate and valid; this report concerns the INR5600 sent to the caller.",
    actions: [["cyber_complaint", "Barry submitted both notice versions and the seller's shipment confirmation."], ["bank_notified", "Barry's duty-payment dispute is acknowledged; recovery is unconfirmed."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "courier-import", name: "Arthur Mehra", occupation: "aquarium shop owner", city: "Chennai", title: "Inspection charges on an imaginary replacement pump",
    family: "courier", contact: 30, item: "parcel inspection", amount: 4800,
    story: "My shop was expecting a replacement filtration pump when a Parcel Nest support message claimed it needed a special inspection. I sent INR4800 because the attached photo looked like the pump model I had ordered. The next message asked for an INR900 refundable seal charge. I enlarged the photo and saw a reflection from a showroom display rather than a shipping counter. My supplier then confirmed that the replacement was coming by a different carrier and needed no extra payment. I saved the original image, payment receipt and supplier reply. Neither support contact answered my refund request, so I blocked the caller.",
    chat: ["09:21 · Desk: Inspection complete. Seal charge pending before release.", "09:28 · Arthur: My supplier says this is not their carrier. Return the inspection payment.", "09:34 · Desk: Supplier cannot see customs records. Complete the final seal payment."],
    status: "partially_resolved", outcome: "My bank recovered INR1200 after the dispute, leaving INR3600 outstanding. The genuine replacement pump arrived through my supplier's carrier. I recorded the delivery and disputed payment as separate events; getting the real pump did not resolve the money sent to the impersonating desk.",
    actions: [["bank_notified", "Arthur disputed the inspection transfer using the supplier's written reply."], ["partial_refund", "Arthur recorded INR1200 recovered and INR3600 still outstanding."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "courier-separate", name: "Shuri Shah", occupation: "electronics repair apprentice", city: "Coimbatore", title: "A parcel-release link sent from a different courier desk",
    family: "courier", contact: 31, item: "parcel fee", amount: 2100,
    story: "A Harbor Kite courier message said my soldering station was out for delivery but needed an INR2100 route-release payment. I was waiting for a tool, so I paid before checking the order. The page then showed a driver arriving in eight minutes for nearly an hour. The shop where I bought the station said its own courier would collect no extra fee and gave me a completely different tracking number. I photographed the order page and saved the release link as text. The pressure and fake tracking resemble other courier reports, but the contacts are different and I have not established who ran the page. After I asked for the payment back, the desk stopped replying.",
    chat: ["12:02 · Desk: Driver cannot enter your delivery zone without route release.", "12:48 · Shuri: The countdown has restarted six times. Which courier are you?", "12:53 · Desk: Driver on another stop. Additional priority charge will release this one."],
    status: "unresolved", outcome: "My bank dispute is pending and the messaging platform has not returned a decision. No funds have been recovered. The legitimate shop arranged its actual delivery separately. I have not treated the similar Parcel Nest wording as proof that the same person controlled this desk.",
    actions: [["bank_notified", "Shuri submitted the route-release receipt and the genuine order's tracking details."], ["platform_report", "Shuri reported the courier account; review remains pending."]],
  },
  {
    slug: "rental-deposit", name: "Lois Lennox", occupation: "newsroom copy editor", city: "Gurugram", title: "The flat viewing that required a second gate pass",
    family: "rental", contact: 40, item: "rental viewing", amount: 6000,
    story: "I was relocating for a night-shift job and found a Doorhaven Living listing close to the office. The broker sent a sunny flat video, a building name and a photograph of an identity card. He said INR6000 would reserve the viewing and be adjusted against rent. After I paid, the visit was canceled because a society gate pass supposedly cost another INR1800. I called the society office using the number on its own website. They said viewings did not require payment and the flat number in the video belonged to a different tower. I kept the identity image private because I could not establish whether it belonged to the sender. The broker ignored my messages after I sent the society office's reply.",
    chat: ["08:12 · Broker: Deposit received. Meet the caretaker at six.", "15:26 · Broker: Society rule changed. Gate pass payment required before address pin.", "15:33 · Lois: The society says visits are free. Please return my deposit."],
    status: "resolved", outcome: "The marketplace removed the listing after receiving the society's reply. My payment provider returned INR6000 after reviewing the dispute. I checked the credit before closing the loss complaint. I did not publish the identity-card image or claim it proved who controlled the broker account.",
    actions: [["platform_removed", "Lois reported the listing with the society office's response; it was removed."], ["refund", "Lois recorded a full INR6000 deposit refund."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "rental-gatepass", name: "Clark Kale", occupation: "civil engineer", city: "Noida", title: "A building manager who had never heard of the viewing",
    family: "rental", contact: 40, item: "rental gate pass", amount: 4200,
    story: "I paid INR4200 for a refundable Doorhaven viewing pass after the broker sent a lift video showing the floor number. I reached the building during my lunch break, but security had no appointment and did not recognize the broker's name. The broker called while I was at the gate and demanded another payment to register my vehicle. I do not own a car and had arrived by metro. When I pointed that out, he changed the charge to a visitor-insurance fee. The building manager wrote that no viewing had been scheduled. I saved that message and my travel receipts along with the payment screenshot. The broker has not replied since I asked for the gate-pass payment back.",
    chat: ["13:09 · Clark: I am at security. There is no appointment under my name.", "13:12 · Broker: Vehicle registration payment is pending.", "13:13 · Clark: I came by metro. Please explain what I already paid for."],
    status: "unresolved", outcome: "I filed a complaint and my bank acknowledged the dispute. The INR4200 has not returned, and I have no confirmation that the receiving account was restricted. I kept the flat's actual residents out of my report because they were not the people messaging me.",
    actions: [["cyber_complaint", "Clark attached the listing, gate-pass receipt and manager's denial of an appointment."], ["bank_notified", "Clark's bank dispute is acknowledged; the transferred amount remains outstanding."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "rental-moving", name: "Harlow Quinn", occupation: "theatre costume designer", city: "Thane", title: "A moving truck registration that belonged to a scooter",
    family: "rental", contact: 40, item: "moving service", amount: 7800,
    story: "After I contacted a Doorhaven broker, the same desk offered to arrange movers for my costume racks and sewing machines. I paid INR7800 in advance and received a driver name and truck registration. On moving morning no vehicle arrived. The driver said a city permit needed another INR2500, while the desk claimed he was already outside my building. The vehicle details they sent described a two-wheeler rather than a goods carrier. I hired local movers at the last minute and photographed the packed racks still standing in the lobby. The broker desk and moving desk used the same contacts, but that alone does not identify the people behind them. Neither desk answered after I sent the conflicting vehicle details.",
    chat: ["07:36 · Driver: Truck at city border. Permit payment pending.", "07:41 · Harlow: The desk says you are downstairs. Send your live location.", "07:47 · Desk: Driver is handling paperwork. Pay permit before loading starts."],
    status: "partially_resolved", outcome: "I received INR2800 after raising a dispute and sending the conflicting messages. The marketplace removed the moving profile after review. INR5000 remains unpaid; the extra cost of the real movers is recorded separately. I have not marked the loss resolved just because the profile disappeared.",
    actions: [["partial_refund", "Harlow recorded INR2800 returned and INR5000 still outstanding."], ["platform_removed", "Harlow received confirmation that the moving-service profile was removed."]],
  },
  {
    slug: "rental-independent", name: "Scott Lennox", occupation: "hospital laboratory assistant", city: "Mysuru", title: "The room reservation canceled an hour before the visit",
    family: "rental", contact: 41, item: "room reservation", amount: 3500,
    story: "I needed a room near the hospital before my rotation began. A small listing under Willow Rooms asked for INR3500 to hold a furnished room until an evening visit. The owner sent a corridor video with a brass nameplate and said a previous applicant was waiting. An hour before the visit, he canceled because his cousin supposedly needed the room. He promised a refund after the weekend, then stopped responding. When I visited the street, the building existed but its caretaker did not recognize the video. These contacts are different from the Doorhaven desk, so I have kept the two stories separate.",
    chat: ["16:04 · Owner: Family emergency. Viewing canceled, refund on Monday.", "10:22 · Scott: It is Wednesday. Please send the refund reference.", "18:09 · Scott: The caretaker says the corridor in your video is not this building."],
    status: "unresolved", outcome: "I reported the listing and asked my bank to review the INR3500 transfer. Both requests remain pending. I have no refund or confirmed restriction on the payment account. My report identifies the account that messaged me; it does not accuse the unrelated building's caretaker or residents.",
    actions: [["platform_report", "Scott submitted the corridor video and cancellation messages for review."], ["bank_notified", "Scott's INR3500 payment dispute remains pending."]], patterns: ["paid", "no_reply"],
  },
  {
    slug: "control-delivered", name: "Jiya Gray", occupation: "animation tutor", city: "Nashik", title: "A late laptop, a working tracking number and a delivery",
    family: "gadget", contact: 60, item: "laptop", amount: 14200,
    story: "I paid INR14200 for a refurbished laptop from a local seller and worried when it missed the promised delivery day. The shop kept answering and sent the courier's acceptance receipt rather than only a label. A rain-related hub delay appeared in the tracking history and the delivery address was correct. I opened a marketplace support request because I needed the machine for a weekend workshop, then updated it when the parcel started moving. It arrived five days later with the serial number shown in the original listing. There was no request for insurance, clearance or another payment. The delay frightened me, but the later evidence changed my understanding.",
    chat: ["11:16 · Jiya: The workshop starts Saturday. Has the courier actually collected it?", "11:29 · Seller: Yes. Acceptance receipt attached; the hub has a weather delay.", "15:02 · Jiya: Delivered today. Serial number matches and the laptop works."],
    status: "resolved", outcome: "I tested the laptop and closed the delivery support request. I did not file a cyber complaint or report a fraudulent payment account. The seller's continued replies, courier acceptance and completed delivery mattered more than the initial resemblance to a non-delivery story.",
    actions: [["delivery_completed", "Jiya recorded delivery, matching serial number and a working laptop."], ["support_closed", "Jiya closed the marketplace delivery request after checking the item."]], patterns: ["paid", "promised_delivery"],
  },
  {
    slug: "control-no-payment", name: "Kamila Khanna", occupation: "final-year nursing student", city: "Ranchi", title: "A training deposit she refused to send",
    family: "jobs", contact: 61, item: "recruitment fee", amount: 0,
    story: "A recruiter offered me remote medical-record work without asking about my availability or qualifications. The letter promised a flexible shift and asked for a training deposit before any interview. I nearly paid because I was looking for work around my placements, but my classmate suggested checking the employer's own careers page. The vacancy was not listed, and the recruiter would not give me an email address on the company's domain. I sent no money and uploaded no identity document. I kept the offer and fee request because I wanted help deciding whether to block the contact, not because I had already suffered a financial loss.",
    chat: ["17:12 · Recruiter: Training deposit locks your seat. Interview after payment.", "17:19 · Kamila: Please have HR confirm the vacancy from the company email.", "17:22 · Recruiter: External recruitment cannot share internal HR contacts."],
    status: "resolved", outcome: "I reported the profile to the platform, blocked the sender and closed my request for guidance. I lost no money. The platform acknowledged my report but did not tell me whether it investigated the account, so I have not recorded an official enforcement action.",
    actions: [["sender_blocked", "Kamila blocked the contact without paying or uploading identity documents."], ["platform_report", "Kamila received a platform acknowledgement, with no enforcement outcome confirmed."]], patterns: [],
  },
  {
    slug: "control-corrected", name: "Benny Baran", occupation: "sound technician", city: "Vadodara", title: "The wrong phone number in a forwarded screenshot",
    family: "gadget", contact: 62, item: "headphones", amount: 2600,
    story: "I ordered headphones for editing stage recordings and worried after a short dispatch delay. My colleague forwarded a warning screenshot, and I initially copied its phone number into my notes as if it were the seller's. When I reopened the actual order conversation, the contacts did not match. I corrected my record before sharing it and retained the original screenshot to show how the mistake happened. The real seller answered, sent tracking and delivered the headphones. I tested both channels on my audio interface and confirmed they worked. The corrected contact details belong to my order conversation; the number in the forwarded warning is not evidence against this seller.",
    chat: ["09:14 · Benny: I may have confused your number with a forwarded warning. Can you confirm the order?", "09:26 · Seller: Your order is packed. Here is the collection receipt.", "18:04 · Benny: Received and tested. I have corrected the earlier contact note."],
    status: "resolved", outcome: "Delivery completed and I corrected the attribution in my notes. There was no cyber complaint, account restriction or refund. I kept the correction visible because removing the context would make my first, mistaken suspicion appear more reliable than it was.",
    actions: [["source_corrected", "Benny corrected the contact attribution using the original seller conversation."], ["delivery_completed", "Benny recorded delivery and a successful headphones test."]], patterns: ["paid", "promised_delivery"],
  },
  {
    slug: "control-uncertain", name: "Miles Morrow", occupation: "postgraduate researcher", city: "Amritsar", title: "A group screenshot with an unconfirmed administrator",
    family: "tasks", contact: 63, item: "investment query", amount: 0,
    story: "My cousin sent me a screenshot of an investment group and asked whether its promised returns looked plausible. I saved it for guidance but never joined the group or paid. The image shows a phone, an email and a Telegram handle, yet the top of the screenshot is cropped and I cannot tell whether the person posting them was an administrator or another member. The screenshot had already been forwarded several times before it reached me. I do not want those contacts treated as confirmed actors just because they are legible. I asked for the original conversation and have not received it. My report is an unanswered verification question, not a confirmed account of a loss.",
    chat: ["20:06 · Cousin: Someone sent this group screenshot. Is it worth checking?", "20:11 · Miles: Do you have the original chat? I cannot see who posted the contact details.", "20:17 · Cousin: No, it was forwarded to me as well."],
    status: "unresolved", outcome: "I asked the platform to review the group, and there is no decision yet. I have no financial loss and no confirmed attribution of the displayed contacts. I am keeping the guidance request open while waiting for the original source; these uncertain details should not create a positive identity connection.",
    actions: [["platform_report", "Miles requested group review while explicitly leaving contact attribution uncertain."]], patterns: [],
  },
  {
    slug: "control-negative", name: "Naina Roman", occupation: "dance instructor", city: "Panaji", title: "A delivered speaker and contacts that were never involved",
    family: "gadget", contact: 1, item: "speaker", amount: 0,
    story: "I bought a portable speaker for my dance classes and initially asked friends whether a dispatch delay was normal. Someone sent me a Copper Finch warning, which I attached to my notes without making the distinction clear. I did not contact the accounts in that warning and they were not involved in my order. My actual seller kept replying and the speaker arrived before the next class. I uploaded the conversation showing that delivery and explicitly excluded the forwarded contacts. I want the warning preserved only to explain the correction. It must not turn my completed order into another allegation against accounts I never dealt with.",
    chat: ["08:45 · Friend: This warning is circulating. Is it the shop you used?", "08:52 · Naina: No. My seller is different; I have never contacted those accounts.", "16:38 · Naina: Speaker delivered and working. Please keep the correction with my note."],
    status: "resolved", outcome: "The speaker arrived and I closed the support request after correcting the contact attribution. I needed no refund, filed no complaint and have no disputed loss. A forwarded warning was not a transaction with the contacts shown in it, so those identifiers are expressly excluded from my case.",
    actions: [["source_corrected", "Naina excluded the unrelated forwarded contacts from her account."], ["delivery_completed", "Naina recorded the speaker delivered and working."]], patterns: ["promised_delivery"], negative: true,
  },

  {
    slug: "cyber-account-takeover", name: "Rhea Danvers", occupation: "independent animator", city: "Pune", title: "The repair desk and a compromised portfolio account",
    family: "gadget", contact: 1, item: "portfolio account", amount: 0, harms: ["cybercrime"], patterns: [],
    story: "I'm 29 and use my portfolio account for client bookings. After I asked Copper Finch about a laptop repair, a support agent calling himself Lex Voss offered to check a login problem. Later, my recovery email changed and clients received messages asking for deposits I had not requested. The recovery notification and my repair conversation show the same support contacts, but Lex Voss may be an alias. I preserved the notifications and original account history. I did not include passwords or recovery codes in this report. One client sent me the unauthorized request before paying, which helped establish the sequence without assuming who controlled every account.",
    chat: ["19:08 · Client: Did you change the deposit details?", "19:12 · Rhea: No. Please do not use those payment instructions.", "19:20 · Support: Your account is under review. Continue through this desk."],
    status: "unresolved", outcome: "The platform acknowledged my recovery request, but access has not been restored. One client confirmed they had not paid the new account. The notification establishes a recovery change, not the legal identity of whoever made it. I kept the incident open.",
    actions: [["account_recovery", "Rhea requested recovery using original account records."], ["client_warning", "Rhea warned existing clients about the unauthorized requests."]],
  },
  {
    slug: "bullying-rating-group", name: "Gwen Starr", occupation: "evening-course student", city: "Surat", title: "A task-group complaint followed by coordinated harassment",
    family: "tasks", contact: 20, item: "coordinated harassment", amount: 0, harms: ["bullying", "cybercrime"], patterns: [],
    story: "I'm 24 and posted a warning after a friend could not withdraw money from Minute Mint. An administrator calling himself Victor Morne added me to a group where accounts mocked me and tagged classmates with false claims that I had taken members' money. I had never handled their funds. The administrator's saved contact card matches the original task desk. I preserved the full sequence, including my own warning, instead of only the most upsetting replies. A classmate retained the original invitation because forwarded screenshots were losing sender information. The matching card is relevant, but I cannot say every participant was controlled by one person.",
    chat: ["20:04 · Gwen: I never handled anyone's money.", "20:09 · Admin: Everyone should see who is causing the problem.", "20:14 · Classmate: I saved the invitation and original administrator details."],
    status: "partially_resolved", outcome: "The platform removed one thread and my course coordinator helped stop tagging in the class group. Unwanted contact continued elsewhere. I recorded the specific removal while keeping the broader harassment report open; there is no completed identity finding.",
    actions: [["platform_removed", "Gwen received confirmation that one harassment thread was removed."], ["support_arranged", "The course coordinator restricted disruptive tagging."]],
  },
  {
    slug: "hate-housing-group", name: "Kara Venn", occupation: "community librarian", city: "Noida", title: "A housing moderator targeted migrant families",
    family: "rental", contact: 40, item: "targeted hate posts", amount: 0, harms: ["hate_speech", "bullying"], patterns: [],
    story: "I'm 33 and help new residents find local services. A housing moderator calling himself Oswald Crowe posted hostile claims about migrant families and encouraged members to exclude them from rentals. This account records the targeting without reproducing abusive language. The moderator used the contact card I had saved from Doorhaven Living's viewing desk. Several posts reused photographs from our library events. Families asked me not to circulate their names or addresses, so I retained originals privately and removed those details from the shared account. I have not treated group membership or a display name as proof of participation or identity.",
    chat: ["18:02 · Kara: Remove the event photographs and stop targeting these families.", "18:11 · Moderator: The group will decide who belongs here.", "18:17 · Resident: Preserve the original, but please keep our addresses private."],
    status: "unresolved", outcome: "The platform acknowledged the reports, but the original posts remain visible. The library paused participant photographs while reviewing consent. Those privacy changes helped but did not resolve the targeting, and no enforcement outcome has been confirmed.",
    actions: [["platform_report", "Kara reported the original targeted posts."], ["privacy_action", "The library paused publication of participant photographs."]],
  },
  {
    slug: "terror-event-threat", name: "Oliver Quill", occupation: "community-events coordinator", city: "Bengaluru", title: "A threatening account contacted a public-event team",
    family: "threat", contact: 82, item: "suspected extremist threat", amount: 0, harms: ["terrorism", "cybercrime"], patterns: [],
    story: "I'm 36 and coordinate public arts events. An account using the name Silas Rook claimed an extremist affiliation and threatened an upcoming gathering. I am not quoting the threat here; the original is retained privately. I retained the original message and sender information, informed venue security and used an official reporting channel. Another volunteer then received a coercive message from the same contact card. We preserved the overlap while keeping our accounts separate. I cannot establish whether the affiliation was genuine or the sender could act on the threat. The event team changed arrangements without publicly circulating the message.",
    chat: ["08:12 · Oliver: Preserve this privately while security reviews it.", "08:18 · Venue lead: We have the original reference and are handling arrangements.", "09:03 · Volunteer: The same contact sent me a separate coercive message."],
    status: "unresolved", outcome: "The reporting channel acknowledged receipt and venue security changed arrangements. There is no conclusion about credibility, identity or affiliation. I have not described the acknowledgement as an arrest, a completed offence or a confirmed terrorist connection.",
    actions: [["threat_report", "Oliver submitted the original message without public circulation."], ["safety_arrangements", "Venue security changed event arrangements during assessment."]],
  },
  {
    slug: "laundering-recruitment", name: "Damon Stryke", occupation: "job applicant", city: "Lucknow", title: "A payroll job involving strangers' payments",
    family: "jobs", contact: 10, item: "suspected misuse of bank account", amount: 0, harms: ["money_laundering", "fraud"], patterns: [],
    story: "I'm 27 and answered a remote payroll-assistant vacancy. The recruiter used North Lantern's contact card and introduced himself as Wilson Sable. Instead of a contract, he said my personal account would handle client payments. Unfamiliar payment notifications arrived, followed by pressure to move money before anyone explained who the clients were. I did not follow those requests. I contacted my bank and disclosed the messages. I retained the offer and correspondence but kept my account number out of the shared account. My concern is possible account misuse; I cannot independently identify the recruiter or determine that the payments were criminal proceeds.",
    chat: ["11:05 · Recruiter: Your first payroll assignment is ready.", "11:13 · Damon: Why would company payroll use my personal account? I need a contract.", "11:21 · Damon: I have asked my bank to review this activity and will not move these payments."],
    status: "unresolved", outcome: "The bank acknowledged the report and reviewed the activity. I kept the money untouched and the correspondence intact. There is no concluded finding of laundering or of the recruiter's legal identity. The account review is still affecting me, so the request remains open.",
    actions: [["bank_review", "Damon disclosed unfamiliar payments and the recruiter messages."], ["activity_paused", "Damon declined the requested transfers during review."]],
  },
  {
    slug: "sexual-workplace-report", name: "Raven Hart", occupation: "theatre technician", city: "Mumbai", title: "A workplace report of unwanted sexual contact",
    family: "venue", contact: 83, item: "workplace sexual molestation report", amount: 0, harms: ["sexual_molestation"], patterns: [],
    story: "I'm 28. After a rehearsal, a contractor introduced as Adrian Crane touched me sexually without my consent while I was leaving a work area. I told him to stop and went to a colleague. I do not want to describe more detail here. My colleague helped me write down the time and the name on the contractor schedule. I saved my work messages and asked the venue to preserve relevant access records without circulating them among the cast. The schedule and contact card identify the person I am reporting; a similar name is not sufficient identification. I chose what to share and kept my home address out of the report.",
    chat: ["21:18 · Raven: I need a colleague with me. I do not want to be alone with that contractor.", "21:24 · Colleague: I am here. We can record what you want to share.", "10:02 · Venue: We acknowledge the report and preservation request."],
    status: "unresolved", outcome: "The venue acknowledged the complaint and arranged a different work contact. There is no investigation outcome yet, and I have not decided every further action. Support and changed work arrangements do not mean the incident is resolved or a formal finding has been made.",
    actions: [["complaint_acknowledged", "Raven received acknowledgement of the complaint and preservation request."], ["support_arranged", "The venue arranged a different work contact at Raven's request."]],
  },
  {
    slug: "cyber-doxing-hate", name: "Felix Dane", occupation: "accessibility advocate", city: "Delhi", title: "A warning post followed by doxing and targeted abuse",
    family: "tasks", contact: 20, item: "doxing and targeted harassment", amount: 0, harms: ["cybercrime", "bullying", "hate_speech"], patterns: [],
    story: "I'm 31 and warned a community group about Minute Mint payment demands. An administrator using Victor Morne's name reposted an old event flyer and encouraged hostile messages about my disability. I am describing the targeting without reproducing slurs or private contact details. The administrator's contact card matches the saved task-desk card. Other abusive messages came from different accounts, which I have kept separate rather than assigning them all to Victor. I retained the original post and asked the event organizer to remove the outdated flyer from its archive. That reduced one source of exposure, but did not explain who controlled every sender account.",
    chat: ["14:04 · Felix: Remove the old flyer and stop directing people at me.", "14:12 · Organizer: We removed our public copy and retained the record privately.", "14:28 · Moderator: Your report about the repost and targeted messages was received."],
    status: "partially_resolved", outcome: "The organizer removed its copy and the platform removed the repost. Unwanted contact continued elsewhere. I recorded these removals as specific actions, not as proof that every sender was identified or that the harassment had fully ended.",
    actions: [["content_removed", "Felix recorded removal of the outdated flyer and targeted repost."], ["platform_report", "Felix kept separate sender records for contact that continued."]],
  },
  {
    slug: "hate-rental-pressure", name: "Zara Bishop", occupation: "language tutor", city: "Gurugram", title: "A broker's group used religious targeting against tenants",
    family: "rental", contact: 40, item: "religiously targeted hate posts", amount: 0, harms: ["hate_speech", "bullying"], patterns: [],
    story: "I'm 30 and help adult learners find rental accommodation. An account calling itself Oswald Crowe singled out tenants by religion and encouraged others to refuse them housing. Its contact card matched Doorhaven Living's viewing desk. I saved that card and the original sequence, with abusive wording and tenants' names redacted in this account. A forwarded image misleadingly attributed the posts to a different tenant, so the original group view matters. Affected tenants asked me not to circulate their details while they considered their options. I have not treated everybody in the group as responsible for the moderator's posts.",
    chat: ["09:16 · Zara: The forwarded image names the wrong person. Keep the original group record.", "09:22 · Tenant: Please do not share my name or address more widely.", "10:05 · Moderator: The original message references and report have been received."],
    status: "unresolved", outcome: "The platform acknowledged the report but has not sent a decision. I corrected the misleading forwarded attribution and kept tenants' details private. No formal finding or housing outcome is recorded. The identity behind the moderator account remains unverified.",
    actions: [["platform_report", "Zara reported the original targeted posts."], ["source_corrected", "Zara corrected the forwarded image's misleading attribution."]],
  },
  {
    slug: "terror-coercion-report", name: "Samir Rogers", occupation: "event volunteer", city: "Mysuru", title: "Coercion from the same threatening contact card",
    family: "threat", contact: 82, item: "suspected extremist coercion", amount: 0, harms: ["terrorism", "cybercrime"], patterns: [],
    story: "I'm 26 and volunteered at an arts event. A sender calling himself Silas Rook used intimidation to pressure me to assist a claimed extremist cause. I did not agree, pass on material or provide access. I have kept the original privately and am not repeating the coercive content here. I saved the original messages and told the coordinator, who recognized the contact card from a separate threat report. We kept the two accounts distinct and preserved the exact overlap. I used a reporting channel instead of posting the message publicly. I cannot independently establish the claimed affiliation or who controlled every message.",
    chat: ["17:09 · Samir: I did not agree to help. Keep this message private.", "17:15 · Coordinator: The contact card matches the separate event report. Preserve the original.", "18:03 · Reporting desk: Your submission has been received for assessment."],
    status: "unresolved", outcome: "The submission was acknowledged and my volunteer contact arrangements changed. There is no concluded identity, affiliation or credibility finding. The shared contact is a documented lead; an acknowledgement is not confirmation of a terrorist group or a completed offence.",
    actions: [["threat_report", "Samir submitted the coercive messages without public circulation."], ["support_arranged", "The team changed Samir's volunteer contact arrangements."]],
  },
  {
    slug: "laundering-invoice-review", name: "Luke Carter", occupation: "print-shop owner", city: "Nagpur", title: "Invoices that did not match his shop's real work",
    family: "jobs", contact: 10, item: "suspected laundering through invoices", amount: 0, harms: ["money_laundering", "fraud"], patterns: [],
    story: "I'm 38 and run a print shop. A customer calling himself Wilson Sable placed a small stationery order, then sent requests about payments and invoices unrelated to the goods supplied. His contact card matched a recruitment desk named North Lantern, although he described himself as a consultant. I refused to create records for work I had not done and asked my bank to review unfamiliar activity. I kept the genuine order, accurate invoice and original correspondence. My concern is possible misuse of my business, not an independently established finding about criminal proceeds. I have not published other customers' records as part of this account.",
    chat: ["12:08 · Luke: I will only invoice work I actually supplied.", "12:21 · Customer: The accounts team urgently needs the additional records.", "12:30 · Luke: I paused the order and asked my bank to review the activity."],
    status: "partially_resolved", outcome: "I ended the relationship and the bank acknowledged a review request. My shop's records were checked internally, but no concluded bank finding was supplied. I recorded the immediate exposure as contained and left the wider concern open.",
    actions: [["business_activity_stopped", "Luke refused inaccurate invoicing and ended the customer relationship."], ["bank_review", "Luke supplied the genuine order and correspondence for review."]],
  },
  {
    slug: "sexual-venue-report", name: "Tara Blake", occupation: "lighting designer", city: "Thane", title: "A second report involving the same contractor contact",
    family: "venue", contact: 83, item: "sexual molestation report", amount: 0, harms: ["sexual_molestation"], patterns: [],
    story: "I'm 32. During a venue setup, a contractor listed as Adrian Crane touched me sexually without my consent. I went to a colleague and asked not to be scheduled alone with him. I do not want to describe more detail here. The work schedule and contractor card are my sources for the name, not a guess from a social profile. Later I learned another report involved the same contact, but I do not know that reporter and did not copy their story. I retained my own messages and requested private preservation of relevant records. I chose a colleague to help me communicate with the venue while deciding what I wanted to do next.",
    chat: ["16:18 · Tara: Please use the coordinator. I do not consent to further direct contact.", "16:25 · Colleague: I will stay with you and help record what you want shared.", "09:12 · Coordinator: We received the report and work-arrangement request."],
    status: "unresolved", outcome: "The venue changed work arrangements and acknowledged the complaint. No formal outcome has been supplied. The matching contractor contact is relevant, but another report does not independently verify every detail of my account or decide my further choices.",
    actions: [["complaint_acknowledged", "Tara received acknowledgement and a preservation reference."], ["work_arrangement_changed", "Tara's work contact arrangements changed at her request."]],
  },
  {
    slug: "bullying-witness-pressure", name: "Daisy Marlow", occupation: "production assistant", city: "Navi Mumbai", title: "Pressure to withdraw support for a colleague's complaint",
    family: "venue", contact: 83, item: "workplace intimidation", amount: 0, harms: ["bullying"], patterns: [],
    story: "I'm 25 and helped a colleague write down a workplace complaint. The contractor contact listed as Adrian Crane later warned that I would lose future work if I continued supporting her. I am reporting pressure directed at me, not retelling or deciding my colleague's account. These messages came through the same contractor card used for routine schedules. I saved the whole thread so its source and earlier context would remain visible. A supervisor arranged a separate work contact when I asked for help. I have not treated everyone involved in the production as part of the intimidation, or assumed that ending direct messages resolves its possible consequences.",
    chat: ["11:04 · Contractor: Think about future bookings before involving yourself.", "11:12 · Daisy: Keep work messages professional. I will use the coordinator.", "11:30 · Supervisor: Preserve the thread and we can change the reporting contact."],
    status: "partially_resolved", outcome: "The supervisor changed my reporting contact and direct messages stopped. I do not know what will happen to future bookings and no workplace finding has been completed. I recorded the practical change while leaving the intimidation complaint open.",
    actions: [["work_arrangement_changed", "Daisy received a separate work-reporting contact."], ["complaint_acknowledged", "Daisy's intimidation complaint remained open after messages stopped."]],
  },
  {
    slug: "bullying-copied-alias", name: "Eva Stone", occupation: "sports coach", city: "Jaipur", title: "The same display name on an unrelated harassment account",
    family: "community", contact: 85, item: "harassment with uncertain attribution", amount: 0, harms: ["bullying", "cybercrime"], patterns: [],
    story: "I'm 34 and received hostile messages after canceling an adult training session. The sender displayed Victor Morne's name, which I recognized from a forwarded task-group warning. The actual phone, email and messaging handle were different. I saved both records and explicitly noted that I could not connect them. A class member said some accounts copied the name as a joke, but I have not verified that explanation either. I want the harassment reviewed on its own source evidence, rather than attached to somebody else's case because the name looks familiar. The forwarded warning provides context and does not identify whoever contacted me.",
    chat: ["19:14 · Eva: I am reporting this conversation, not assuming the warning identifies its sender.", "19:21 · Class member: The name may be copied. Keep the actual account details.", "10:05 · Platform: Your harassment report was received."],
    status: "unresolved", outcome: "The platform acknowledged the report without a decision. The name resemblance is unverified, and I have no evidence linking the sender to Minute Mint. This case must not join a known-actor cluster solely because Victor Morne is displayed on an account.",
    actions: [["platform_report", "Eva reported the original harassment conversation."], ["attribution_limited", "Eva recorded that the matching name did not establish a shared actor."]],
  },
  {
    slug: "laundering-concern-cleared", name: "Arjun West", occupation: "cooperative treasurer", city: "Nashik", title: "An unfamiliar payment explained by the original invoice",
    family: "accounts", contact: 86, item: "payment-origin concern", amount: 0, harms: ["money_laundering"], patterns: [],
    story: "I'm 41 and review a cooperative's accounts. An unfamiliar payment description and a forwarded message made me worry our account had been misused. I paused reconciliation and requested the original invoice and payer details. The records established an authorized customer payment under a different trading name, with a bank reference matching the genuine order. No one had asked us to move a stranger's money. I retained both the concern and the explanation so an isolated screenshot would not become an accusation. I found no source connecting the payer to North Lantern or Wilson Sable and did not identify either as an actor in this report.",
    chat: ["09:08 · Arjun: Please send the original invoice for this description.", "09:31 · Accountant: Invoice and authorization attached. The trading name differs.", "11:04 · Arjun: The references match our order. I recorded the explanation."],
    status: "resolved", outcome: "The original records completed the reconciliation and I closed my guidance request. No laundering finding, accusation against the payer or account restriction was recorded. The checked invoice and authorization explained the initially concerning description.",
    actions: [["records_reconciled", "Arjun matched the invoice, payer authorization and bank reference."], ["source_corrected", "Arjun retained the cleared concern with its explanation."]],
  },
  {
    slug: "sexual-attribution-corrected", name: "Maya Reeve", occupation: "exhibition assistant", city: "Pune", title: "An incident report with a corrected contractor identity",
    family: "venue", contact: 83, item: "sexual molestation report with corrected attribution", amount: 0, harms: ["sexual_molestation"], patterns: [], negative: true,
    story: "I'm 27 and reported unwanted sexual contact during an exhibition setup. I do not want to describe more detail here. In my first notes I wrote Adrian Crane after a coworker guessed which contractor was present. I checked the schedule and corrected that attribution: the Adrian Crane contact card was not involved. My underlying report remains open; correcting a name does not mean the unwanted contact did not happen. I retained my account, the coworker's correction and schedule privately. I have not confidently identified the person responsible, and I do not want a known name from another report used to fill that gap or create a false connection.",
    chat: ["18:12 · Maya: Correct the name in my notes. That contact card was not involved.", "18:21 · Coworker: I guessed from a different shift. Preserve my correction.", "09:18 · Coordinator: The identity correction is recorded and the incident report remains open."],
    status: "unresolved", outcome: "The venue acknowledged both the incident and attribution correction. I have a support contact but no concluded finding or reliably identified actor. Excluded contacts must not connect this case to another report merely because their harm categories resemble each other.",
    actions: [["source_corrected", "Maya explicitly excluded the wrongly attributed contractor card."], ["complaint_acknowledged", "The underlying incident report remains open with a support contact."]],
  },
];

const actors: Record<number, { id: string; name: string }> = {
  1: { id: "lex-voss", name: "Lex Voss" },
  10: { id: "wilson-sable", name: "Wilson Sable" },
  20: { id: "victor-morne", name: "Victor Morne" },
  30: { id: "calder-black", name: "Calder Black" },
  40: { id: "oswald-crowe", name: "Oswald Crowe" },
  82: { id: "silas-rook", name: "Silas Rook" },
  83: { id: "adrian-crane", name: "Adrian Crane" },
};

export const demoCatalogue: CatalogueCase[] = rows.map((row, index) => {
  const id = `synthetic-demo-${String(index + 1).padStart(2, "0")}-${row.slug}`;
  // Reserved contacts stay stable across editions so existing demo chats still retrieve the same cases.
  const phone = `+120255501${String(row.contact).padStart(2, "0")}`;
  const email = `${row.family}${row.contact}@yama-demo.invalid`;
  const telegram = `@yama_demo_${row.family}_${String(row.contact).padStart(2, "0")}`;
  const polarity = row.negative ? "contradicted" : row.slug === "control-uncertain" ? "uncertain" : "affirmed";
  const contactLine = polarity === "contradicted" ? `Excluded contacts, not involved: ${phone}, ${email}, ${telegram}.`
    : polarity === "uncertain" ? `Uncertain contacts, attribution unconfirmed: ${phone}, ${email}, ${telegram}.`
      : `Contact details saved from the conversation: phone ${phone}, email ${email}, Telegram ${telegram}.`;
  const article = /^[aeiou]/i.test(row.occupation) ? "an" : "a";
  const story = `I'm ${row.name}, ${article} ${row.occupation} in ${row.city}.\n\n${row.story}\n\nChat excerpt\n${row.chat.join("\n")}\n\n${contactLine}${row.amount ? `\nAmount disputed: INR${row.amount}.` : ""}`;
  const messageId = demoUuid(`${id}:narrative`);
  const outcomeId = demoUuid(`${id}:outcome`);
  const actor = polarity === "affirmed" ? actors[row.contact] : undefined;
  return { _id: id, synthetic: true, published: true, dataset: demoDatasetVersion, title: `${row.name} · ${row.title}`,
    ...(row.slug === "cyber-account-takeover" ? { media: [{ kind: "image" as const, src: "/media/aliases/lex-voss.png", caption: "Reported alias: Lex Voss · illustration, identity unverified", provenance: "illustration" as const }] } : {}),
    ...(row.slug === "gadget-camera" ? { media: [{ kind: "video" as const, asset: "tracking-reconstruction" as const, sha256: "ddf60a0e602310736307143bfad071c210a87f1caf58df693006f1e6dfed9433", caption: "A visual reconstruction of the tracking screen described in this report.", provenance: "reconstruction" as const }] } : {}),
    harmCategories: row.harms ?? (index < 20 ? ["fraud", "cybercrime"] : []),
    ...(actor ? { fictionalActor: { ...actor, basis: "authored_fixture_truth" as const } } : {}),
    reporter: { name: row.name, city: row.city, occupation: row.occupation }, summary: `${row.name}, ${row.occupation}, ${row.city}. ${row.story}\n\nLatest update: ${row.outcome}`, story,
    sourceReportId: demoUuid(`${id}:report`), item: row.item, patterns: row.patterns ?? ["paid", "promised_delivery", "not_delivered", "no_reply"],
    identifiers: ([['phone', phone], ['email', email], ['telegram', telegram]] as const).map(([kind, value]) => {
      const start = story.indexOf(value); return { kind, value, polarity, source: { messageId, start, end: start + value.length, quote: value } };
    }),
    resolution: { status: row.status, summary: row.outcome, verification: "synthetic_user_report", actions: row.actions.map(([kind, description], action) => ({ kind, description,
      date: new Date(Date.UTC(2026, 8, index + 6 + (row.actionOffsets?.[action] ?? action))).toISOString().slice(0, 10), sourceMessageId: outcomeId })) },
  };
});

export function demoStarterNarrative() {
  return "I paid INR7200 to Copper Finch for a used camera before a wedding booking. They promised next-day dispatch, then asked for another INR1800 to release the courier parcel. The tracking page still says label created and they stopped replying when I asked for a fresh video. The seller's phone is +1 202 555 0101, email gadget1@yama-demo.invalid and Telegram @yama_demo_gadget_01. I have the invoice and payment screenshot. Can Drishti check whether anyone else dealt with these contacts, and can Disha explain what happened in those cases?";
}
export function demoReporterOwner(entry: CatalogueCase) { return `synthetic-reporter:${entry._id}`; }
export function demoSourceReport(entry: CatalogueCase): Report {
  const createdAt = new Date(`${entry.resolution!.actions[0].date}T09:00:00Z`);
  const outcomeAt = new Date(`${entry.resolution!.actions.at(-1)!.date}T18:00:00Z`);
  const message = { id: entry.identifiers![0].source.messageId, text: entry.story!, createdAt };
  const outcome = { id: entry.resolution!.actions[0].sourceMessageId, text: entry.resolution!.summary, createdAt: outcomeAt };
  const source = { messageId: message.id, start: 0, end: message.text.length };
  const input = { synthetic: true, language: "en", narrative: entry.story };
  return { _id: entry.sourceReportId!, ownerId: demoReporterOwner(entry), reporter: entry.reporter, schemaVersion: 1, synthetic: true, language: "en", creationKey: demoUuid(`${entry._id}:create`),
    creationHash: createHash("sha256").update(JSON.stringify(input)).digest("hex"), revision: 1, createdAt, updatedAt: outcomeAt,
    messages: [message, outcome], assertions: [
      { id: demoUuid(`${entry._id}:narrative-assertion`), field: "narrative", value: message.text, originalValue: message.text, included: true, polarity: "affirmed", source, origin: "narration", verification: "not_verified" },
      ...entry.patterns.map(pattern => ({ id: demoUuid(`${entry._id}:${pattern}`), field: "pattern" as const, value: pattern, originalValue: pattern, included: true, polarity: "affirmed" as const, source, origin: "client_proposal" as const, verification: "not_verified" as const })),
    ], confirmation: { revision: 1, confirmedAt: outcomeAt, kind: "user_confirmed" } };
}
