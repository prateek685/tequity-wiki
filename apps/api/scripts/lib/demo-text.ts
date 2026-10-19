/**
 * What the demo engineers write in their lessons (scripts/seed-demo.ts): short, plausible answers in the
 * CareBook story (Dana Brooks at Brightpath Health, Lakeside Health, the April 27 pilot, Epic access).
 * Practice material only: never patient data. Keys are `day/lesson/field`; reflect-lesson fields
 * (went-well, fix-next, log) come from `reflectText`.
 */

export const LESSON_TEXT: Readonly<Record<string, string>> = {
  // Day 1 · Baseline call
  "1/starting-point/goal-1": "Answer Dana's questions with the answer first, not the background.",
  "1/starting-point/goal-2": "Raise risks like the Epic access delay before the client finds them.",
  "1/starting-point/goal-3": "Close every call with owners and dates, and send the recap the same day.",

  // Day 2 · Answer first
  "2/dana-in-a-hurry/q1": "Are we on track for the April 27 pilot?",
  "2/dana-in-a-hurry/a1":
    "Yes for booking and reminders; Epic sync is the one risk, and I'll know by Friday.",
  "2/dana-in-a-hurry/q2": "What is the integration thing that might be late?",
  "2/dana-in-a-hurry/a2": "Epic sandbox access from Lakeside: we've asked, and it's not here yet.",
  "2/dana-in-a-hurry/q3": "What do you need from me?",
  "2/dana-in-a-hurry/a3": "A name at Lakeside IT who can approve the Epic access request this week.",
  "2/rewrite-messages/msg-1":
    "Hi Dana, SMS reminders will be in staging on Thursday. The Twilio setup took longer than planned; it's fixed now.",
  "2/rewrite-messages/msg-2":
    "Hi Sam, could you send the Epic sandbox credentials by Wednesday? We need them to start the integration on Thursday.",
  "2/rewrite-messages/msg-3":
    "Hi Dana, the build will reach QA tomorrow by 3 pm. Yesterday's broken build blocked testing; it's fixed.",

  // Day 3 · Explain a decision
  "3/kevin-wants-reasoning/point": "React Native is still the right choice for the patient app.",
  "3/kevin-wants-reasoning/reason":
    "One codebase gets iOS and Android to the April 27 pilot with the team we have.",
  "3/kevin-wants-reasoning/example":
    "Booking, reschedule and cancel shipped on both platforms in the same sprint.",
  "3/kevin-wants-reasoning/point-again":
    "So we keep React Native, and I'll share the crash-free rate after the pilot.",
  "3/prep-paragraph/paragraph":
    "We recommend staying on React Native. It lets one team ship iOS and Android together, which is why booking and reminders are ready for the April 27 pilot. App quality is measured, not assumed: I'll send you the crash-free rate every Friday.",

  // Day 4 · Your call opener
  "4/call-opener/intro-draft":
    "Hi Dana, I'm the engineer leading CareBook's booking and reminders. I make sure what we build works for Lakeside's clinics.",
  "4/call-opener/opener-draft":
    "Thanks for the time. Today: the reminder wording, the Epic access, and next week's demo. Anything to add?",
  "4/make-it-yours/final-intro":
    "Hi Dana, I lead the booking and reminders work on CareBook, and I'm your go-to for anything technical before the pilot.",
  "4/make-it-yours/small-talk-1": "How was the leadership meeting on Friday?",
  "4/make-it-yours/small-talk-2": "Is the weather in Ohio warming up yet?",
  "4/make-it-yours/small-talk-3": "Did the clinic managers like the reminder wording?",
  "4/make-it-yours/small-talk-4": "Any big plans for the weekend?",
  "4/make-it-yours/small-talk-5": "How are the Lakeside visits going this month?",

  // Day 5 · First weekly sync
  "5/friday-sync-prep/goal": "Agree who signs Lakeside's security form so Epic access can move.",
  "5/friday-sync-prep/opener":
    "Thanks, Dana. Three things today: the week's progress, Epic access, and next week's demo.",
  "5/friday-sync-prep/points":
    "1. Reminder wording is with compliance. 2. Epic access waits on the security form. 3. Demo is next Friday.",
  "5/friday-sync-prep/questions":
    "Who at Brightpath can sign the form? Who should see the demo? Any change in priorities for the pilot?",
  "5/friday-sync-prep/risk": "If the form isn't signed by Wednesday, the Epic sync slips past Sprint 4.",
  "5/friday-sync-prep/closing": "I'll send the recap within the hour, with owners and dates.",
  "5/send-recap/subject": "CareBook weekly sync, March 6: decisions and next steps",
  "5/send-recap/summary":
    "Booking and reminders are on track for the demo. Epic access is blocked on Lakeside's security form.",
  "5/send-recap/decisions": "Dana will find who signs the security form. Demo stays on Friday, March 13.",
  "5/send-recap/actions":
    "Dana: name the form signer, Tue Mar 10. Me: reminder test to Dana's phone, Thu Mar 12.",
  "5/send-recap/open-questions": "Does the CEO want to join the demo?",
  "5/send-recap/next-meeting": "Friday, March 13, 11:00 ET.",

  // Day 6 · Quick change
  "6/just-a-button/reader": "Dana Brooks, Brightpath's product owner.",
  "6/just-a-button/purpose": "Confirm Add to calendar is in Sprint 4, not this sprint, and why.",
  "6/just-a-button/by-when": "Today, so she can tell her CEO before the demo.",
  "6/confirm-change/subject": "Add to calendar: planned for Sprint 4",
  "6/confirm-change/bottom-line":
    "Add to calendar will ship in Sprint 4 (by March 27). The Friday demo stays as planned.",
  "6/confirm-change/details":
    "- Works with Apple and Google calendars\n- About two days of work\n- No change to the pilot date",
  "6/confirm-change/next-step": "Please reply by Wednesday if you'd rather swap it with the schedule view.",

  // Day 7 · Why so long?
  "7/reminders-are-late/done": "Security form signed this morning and sent to Sam Porter.",
  "7/reminders-are-late/next": "SMS number verification, then reminders live in staging on Thursday.",
  "7/reminders-are-late/blocked": "Twilio number verification is waiting on the carrier.",
  "7/status-update/done": "Reschedule and cancel finished; security form signed.",
  "7/status-update/next": "SMS reminders live in staging by Thursday noon.",
  "7/status-update/blocked": "Nothing blocked today.",
  "7/status-update/risk": "If the carrier check takes over a day, reminders move to Friday morning.",
  "7/status-update/need": "Nothing from you today; I'll update you Thursday at 10 am.",

  // Day 8 · Pyramid
  "8/messy-explanation/one-thing":
    "Two patients can't end up with the same slot in the pilot: the fix is in testing now.",
  "8/bug-pyramid/main-message":
    "The double-booking bug will be fixed before the pilot; QA retests it Friday.",
  "8/bug-pyramid/point-1": "It only happens when two people book the same slot at the same second.",
  "8/bug-pyramid/point-2": "The fix locks the slot while the first booking finishes.",
  "8/bug-pyramid/point-3": "No real patients were affected: it was found in staging.",

  // Day 9 · Plain English
  "9/five-messages/spot-1": 'No date, and "basically" hides what\'s actually late.',
  "9/five-messages/spot-2": '"Do the needful" is unclear to a US reader; no deadline.',
  "9/five-messages/spot-3": "Jargon: race condition, optimistic locking, Redis.",
  "9/five-messages/spot-4": '"I have a doubt" reads as distrust; "today itself" sounds pushy.',
  "9/five-messages/spot-5": 'Too many sorries, and "hopefully" means no commitment.',
  "9/plain-rewrites/rewrite-1":
    "Hi Dana, reminders are live in staging today. I've sent a test to your phone.",
  "9/plain-rewrites/rewrite-2": "Hi Sam, could you send the Epic sandbox credentials by Friday?",
  "9/plain-rewrites/rewrite-3":
    "Sometimes two people can book the same slot. We're fixing it now, and QA retests it tomorrow.",
  "9/plain-rewrites/rewrite-4":
    "Quick question on the intake form: should we go back to the old validation? I need an answer by 4 pm to keep the demo on track.",
  "9/plain-rewrites/rewrite-5": "The build reaches QA tomorrow by noon. Yesterday's broken build is fixed.",

  // Day 10 · Demo day sync
  "10/after-the-demo/goal": "Get a decision on Epic access: who escalates at Lakeside, and by when.",
  "10/after-the-demo/opener":
    "Thanks for joining the demo. Three things: feedback, Epic access, Sprint 4 plan.",
  "10/after-the-demo/points":
    "1. Booking and reminders worked end to end. 2. Double-booking fix passed QA. 3. Epic access is now the main risk.",
  "10/after-the-demo/questions":
    "What did your CEO think? Who can escalate with Lakeside IT? Is Add to calendar still a must for the pilot?",
  "10/after-the-demo/risk": "Without Epic access by March 30, Sprint 5's Epic sync starts late.",
  "10/after-the-demo/closing": "I'll send the recap within two hours with owners and dates.",
  "10/weekly-recap/subject": "Sprint 3 demo and weekly sync, March 13",
  "10/weekly-recap/summary": "The demo went well. Epic access is the one risk to the April 27 pilot.",
  "10/weekly-recap/decisions": "Add to calendar moves into Sprint 4. Dana escalates Epic access on Monday.",
  "10/weekly-recap/actions":
    "Dana: escalate with Lakeside IT, Mon Mar 16. Me: Sprint 4 plan to Dana, Mon Mar 16.",
  "10/weekly-recap/open-questions": "Does Lakeside need a separate security review for the sandbox?",
  "10/weekly-recap/next-meeting": "Friday, March 20, 11:00 ET.",

  // Day 11 · Open questions
  "11/a-dashboard/q1": "What decision will Alan make with the dashboard?",
  "11/a-dashboard/q2": "Who will look at it, and how often?",
  "11/a-dashboard/q3": "How does Alan get this information today?",
  "11/a-dashboard/q4": "What would make the dashboard a success in the first month?",
  "11/a-dashboard/q5": "What has to be on it for the pilot, and what can wait?",
  "11/known-and-unknown/learned":
    "Alan wants to see no-shows per clinic each week, to decide where to add reminder calls.",
  "11/known-and-unknown/unknown": "Whether it's needed for the April 27 pilot or after it.",

  // Day 12 · Find the real goal
  "12/more-reminders/why-1": "Help me understand what you'd like more reminders to change?",
  "12/more-reminders/why-2": "What are clinics seeing today with two reminders per visit?",
  "12/more-reminders/why-3": "If we got this right, what number would move?",
  "12/problem-statement/user": "Clinic front-desk staff at Lakeside.",
  "12/problem-statement/problem": "Patients still miss appointments booked more than two weeks ahead.",
  "12/problem-statement/goal": "Cut no-shows for long-lead appointments before the pilot review.",
  "12/problem-statement/metric": "No-show rate for visits booked 14+ days ahead.",
  "12/problem-statement/statement":
    "Front-desk staff need patients with long-lead bookings to confirm a week before, so the no-show rate for those visits drops.",

  // Day 13 · Play it back
  "13/maria-explains/starter-1": "So what I'm hearing is…",
  "13/maria-explains/starter-2": "Let me check I've got this right…",
  "13/maria-explains/starter-3": "If I play that back in plain words…",
  "13/requirement-summary/when":
    "We check eligibility when the appointment is booked and again 2 days before.",
  "13/requirement-summary/result":
    "If coverage fails, the clinic sees a flag and calls the patient; the booking stays.",
  "13/requirement-summary/out-of-scope": "Cost estimates and copay amounts.",
  "13/requirement-summary/open-questions":
    "Which Suncoast plans are in the pilot? What's the API rate limit?",

  // Day 14 · Your question bank
  "14/three-headlines/users": "Who uses it day to day, and who signs off?",
  "14/three-headlines/current-process": "How does the clinic do this today?",
  "14/three-headlines/goal": "What should be different after the pilot?",
  "14/three-headlines/scope": "What must be in for April 27, and what can wait?",
  "14/three-headlines/data": "What data does it need, and where does it live now?",
  "14/three-headlines/integrations": "Does it touch Epic or any other system?",
  "14/three-headlines/compliance": "Does Lakeside's compliance team need to review it?",
  "14/three-headlines/timeline": "When does leadership need an answer?",
  "14/three-headlines/success": "How will we know it worked?",
  "14/final-bank/bank":
    "1. What decision will this help you make?\n2. Who uses it day to day?\n3. How is it done today?\n4. What does success look like in a month?\n5. What must be in for the pilot?\n6. What can wait?\n7. Which data does it need?\n8. Does it touch Epic?\n9. Who signs off?\n10. Any compliance review?",

  // Day 15 · Discovery call
  "15/new-patient-form/goal": "Understand what a new-patient intake must collect for the pilot.",
  "15/new-patient-form/opener":
    "Thanks, Dana. I'd like to understand the new-patient flow before we size it.",
  "15/new-patient-form/questions":
    "Who fills it in? What do clinics ask today? What's required on day one? Where does it go after? What can wait?",
  "15/new-patient-form/hidden-scope": "Insurance cards, consent forms and translations.",
  "15/new-patient-form/hard-question":
    "Can it be ready by April 27? Only a short version; I'll confirm Monday.",
  "15/new-patient-form/closing": "I'll send what we heard and the open questions today.",
  "15/week-feedback/pattern": "I jump to a solution before the second question.",
  "15/discovery-summary/subject": "New-patient intake: what we heard, March 20",
  "15/discovery-summary/heard":
    "New patients fill in contact details, insurance and reason for visit before arrival.",
  "15/discovery-summary/assumptions": "Consent forms stay on paper for the pilot.",
  "15/discovery-summary/open-questions": "Do we need Spanish for the pilot clinics?",
  "15/discovery-summary/next-step": "Me: two intake options with sizes, Wed Mar 25.",

  // Day 16 · Owner language
  "16/waiting-phrases/p1": "We're waiting for Epic access.",
  "16/waiting-phrases/p2": "QA hasn't tested it yet.",
  "16/waiting-phrases/p3": "It depends on the other team.",
  "16/waiting-phrases/p4": "I'll try to finish it.",
  "16/waiting-phrases/p5": "Hopefully by Friday.",
  "16/waiting-phrases/p6": "That's not my area.",
  "16/waiting-phrases/p7": "We're still looking into it.",
  "16/waiting-phrases/p8": "Someone should ask Lakeside.",
  "16/waiting-phrases/p9": "It should be fine.",
  "16/waiting-phrases/p10": "I was told to do it this way.",
  "16/owner-rewrites/r1": "I'm chasing Epic access with Lakeside IT today and will update you by 3 pm.",
  "16/owner-rewrites/r2": "I've booked QA for tomorrow morning; you'll have results by noon.",
  "16/owner-rewrites/r3": "I'll talk to the other team today and confirm a date by tomorrow.",
  "16/owner-rewrites/r4": "I'll finish it by Thursday 5 pm.",
  "16/owner-rewrites/r5": "It will be ready Friday at noon.",
  "16/owner-rewrites/r6": "I'll find the right person and connect you today.",
  "16/owner-rewrites/r7": "Here's what we know so far; the full answer comes tomorrow at 10.",
  "16/owner-rewrites/r8": "I'll ask Lakeside today and copy you.",
  "16/owner-rewrites/r9": "I've tested it on both phones, and it works.",
  "16/owner-rewrites/r10": "We chose this because it's faster to ship; happy to walk you through it.",

  // Day 17 · AI before the call
  "17/ai-prep/goal": "Get a date for the clinic dashboard decision and agree the Epic escalation.",
  "17/ai-prep/agenda": "1. Sprint 4 status. 2. Epic access escalation. 3. Dashboard timing.",
  "17/ai-prep/likely-questions":
    "Will the pilot slip? Why is Epic still blocked? Can we have the dashboard for April 27? Who owns Laura's questionnaire? What's in the UAT release?",
  "17/ai-prep/hard-answer":
    "Will the pilot slip? Not yet: if Epic access is here by April 3, we hold April 27.",
  "17/ai-prep/risks": "Epic access is four weeks late and now blocks the Epic connection work.",
  "17/ai-prep/opener": "Thanks for moving the sync, Dana. Three things today, and one decision I need.",
  "17/ai-prep/closing": "I'll send the recap before you fly, with owners and dates.",
  "17/improve-card/came-up": "Pilot date and Epic access both came up first.",
  "17/improve-card/missed": "Dana asked who pays for the extra SMS messages.",
  "17/improve-card/better-card": "Add a costs line: SMS volume and who pays, with numbers ready.",

  // Day 18 · AI after the call
  "18/close-the-loops/goal": "Close the three open loops before Dana flies.",
  "18/close-the-loops/opener": "Quick one, Dana: three loops to close, ten minutes.",
  "18/close-the-loops/points":
    "1. Kevin has the release checklist. 2. Intake options are in your inbox. 3. Recap of yesterday's sync.",
  "18/close-the-loops/questions":
    "Which intake option do you prefer? Anything missing from the recap? Who covers while you travel?",
  "18/close-the-loops/risk": "If no intake decision by Monday, it won't make the pilot.",
  "18/close-the-loops/closing": "I'll confirm everything in writing within the hour.",
  "18/timed-recap/recap":
    "Decisions: Option B for intake; dashboard after the pilot. Actions: me, intake estimate Mon Mar 30; Dana, Epic escalation Fri Mar 27.",
  "18/timed-recap/changed": "Cut the AI's long intro and put the decisions first.",
  "18/timed-recap/minutes": "12",

  // Day 19 · I don't know, I'll check
  "19/laura-calls/acknowledge": "That's an important question, Laura, and I want to get it right.",
  "19/laura-calls/honest": "I don't have the exact answer with me.",
  "19/laura-calls/what-i-know": "Our data is hosted in the US, and backups are encrypted.",
  "19/laura-calls/commit": "I'll confirm the details with our security lead by Friday noon.",
  "19/laura-calls/follow-up": "I'll send the answers in writing so your team has them on record.",
  "19/unknowns-follow-up/subject": "Follow-up: five security questions from today's call",
  "19/unknowns-follow-up/certification":
    "SOC 2 Type II report is available under NDA; HITRUST is not in place yet.",
  "19/unknowns-follow-up/sla": "99.9% monthly uptime, as in the master agreement.",
  "19/unknowns-follow-up/data-backups": "AWS us-east-1; encrypted backups in us-west-2, kept 35 days.",
  "19/unknowns-follow-up/pen-test": "January 2026 by an outside firm; summary available on request.",
  "19/unknowns-follow-up/breach": "We notify within 72 hours of confirming a breach, per our BAA.",
  "19/unknowns-follow-up/close": "Happy to set up a call with our security lead if useful.",

  // Day 20 · Gate 1 dress rehearsal
  "20/sprint-4-wrap/goal": "Confirm the UAT release and agree plan B for Epic.",
  "20/sprint-4-wrap/opener": "Thanks, Dana. Sprint 4 wrap: the demo, the UAT release, and Epic plan B.",
  "20/sprint-4-wrap/points":
    "1. Intake v1 and Add to calendar are done. 2. Schedule view needs two more days. 3. UAT release at 2 pm today.",
  "20/sprint-4-wrap/questions":
    "Who tests in UAT next week? Can we use Epic's public sandbox for now? Any pilot clinics changing?",
  "20/sprint-4-wrap/risk": "Epic access has been pending 31 days; plan B covers testing, not go-live.",
  "20/sprint-4-wrap/closing": "Recap within two hours; I own the UAT release today.",
  "20/sync-recap/subject": "Sprint 4 wrap and UAT release, March 27",
  "20/sync-recap/summary":
    "UAT release goes out today at 2 pm. Epic plan B starts Monday on the public sandbox.",
  "20/sync-recap/decisions": "Schedule view finishes Tuesday. Plan B approved for testing only.",
  "20/sync-recap/actions": "Me: UAT release, Fri Mar 27 2 pm. Dana: UAT testers list, Mon Mar 30.",
  "20/sync-recap/open-questions": "When will Lakeside IT confirm the real sandbox?",
  "20/sync-recap/next-meeting": "Friday, April 3, 11:00 ET.",
  "20/day-one-vs-today/reflection":
    "I now lead with the answer and close calls with owners and dates. I still want to push back sooner when a date isn't realistic.",
};

const REFLECT: Readonly<Record<number, readonly [wentWell: string, fixNext: string, log: string]>> = {
  1: [
    "I kept calm when Dana asked about the pilot date.",
    "Lead with the answer.",
    "Mostly the background, then the answer.",
  ],
  2: ["Every answer was one line.", 'Give a date, not "soon".', "The answer, most of the time."],
  3: [
    "Kevin heard one clear recommendation.",
    "Use one real fact, not three.",
    "The answer, then one reason.",
  ],
  4: ["The opener set the agenda in 20 seconds.", "Slow down in the first sentence.", "The answer."],
  5: ["Raised the Epic risk before Dana asked.", "End with owners and dates.", "The answer, then the risk."],
  6: [
    "The bottom line was in the first two lines.",
    "Say the date in the subject.",
    "Yes, apart from the date.",
  ],
  7: ["Done / next / blocked kept it short.", "Name the risk with a time.", "Yes."],
  8: [
    "Main message first, then three points.",
    "Drop the Redis detail for Dr. Mercer.",
    "Yes, once I cut the jargon.",
  ],
  9: ["No jargon in the rewrite.", "Shorter sentences.", "Yes."],
  10: ["Dana agreed to escalate Epic access.", "Ask for the decision earlier.", "Yes."],
  11: ["Asked four open questions first.", "Wait before proposing a dashboard.", "Four questions."],
  12: [
    "Found the real goal: long-lead no-shows.",
    "Ask why without sounding like a test.",
    "Three questions.",
  ],
  13: [
    "Played back Maria's rules in plain words.",
    "Play back at key moments, not only at the end.",
    "Five questions.",
  ],
  14: ["Covered scope and compliance quickly.", "Keep the bank to the best ten.", "Six questions."],
  15: ["Uncovered the consent-form scope.", "Confirm the success metric out loud.", "Five questions."],
  16: ["Owned the Epic chase with a time.", 'Drop "hopefully".', "Yes, both loops closed."],
  17: ["Predicted four of five questions.", "Have numbers ready for costs.", "One still open."],
  18: ["Recap sent in 12 minutes.", "Decisions first, every time.", "Yes."],
  19: ['Said "I don\'t know" calmly and gave a time.', "Share what I do know first.", "Yes, follow-up sent."],
  20: ["The dress rehearsal ran on time.", "Push back on the plan B date.", "Yes."],
};

/** The reflect-lesson fields every mock log has. */
export function reflectText(day: number, field: string): string | undefined {
  const lines = REFLECT[day];
  if (!lines) return undefined;
  return { "went-well": lines[0], "fix-next": lines[1], log: lines[2] }[field];
}

/** Repeat-the-call rounds (Day 4): the AI's one fix per round. */
export const ROUND_FIXES = [
  "Say your role in one sentence.",
  "State the agenda before small talk runs long.",
  "Ask Dana if she wants to add anything.",
];

/** Friday scorecard proof lines, by pillar. */
export const PROOF: Readonly<Record<string, string>> = {
  understand: "Played back Maria's eligibility rules and Dana confirmed them.",
  communicate: "My recap reached Dana within the hour, answer first.",
  own: "Chased Epic access with Lakeside IT and gave Dana a time.",
  stand_firm: "Said I'd check the SOC 2 detail instead of guessing.",
};
