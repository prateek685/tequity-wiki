import { createFileRoute } from "@tanstack/react-router";
import { Check, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { pageTitle } from "@/lib/title";

/**
 * The plan at a glance: what it is, what you'll be able to do, how a day and the phases work, and what
 * you need before Day 1. Key facts from the PDF (sections 1–4), rewritten for the portal.
 */

const OUTCOMES = [
  "Open a call with a clear agenda, and lead it",
  "Ask questions that uncover the real need, and play back what you heard",
  "Give a status update in under 60 seconds, answer first",
  "Explain trade-offs in business terms and recommend one",
  "Say “I don't know, I'll check” calmly, and raise risks early",
  "Close with next steps and send a written recap within 2 hours",
];

const PILLARS = [
  { name: "Understand", text: "Find the real need and link your work to business outcomes." },
  { name: "Communicate", text: "Speak and write clearly. Answer first." },
  { name: "Own", text: "Raise risks early, share bad news with a plan, follow up." },
  { name: "Stand firm", text: "Handle unknowns calmly and disagree professionally." },
];

const PHASES = [
  {
    phase: "Phase 1",
    name: "Foundation",
    days: "Days 1–20",
    focus: "Clear speaking and writing, better questions, ownership, using AI before and after calls.",
    end: "Gate 1: a live AI mock call your manager observes.",
  },
  {
    phase: "Phase 2",
    name: "Client craft",
    days: "Days 21–40",
    focus:
      "Discovery, stakeholders and trade-offs, disagreement and bad news, escalation, and US healthcare basics (HIPAA, EHR, billing).",
    end: "Gate 2: a live healthcare mock call.",
  },
  {
    phase: "Phase 3",
    name: "Live reps",
    days: "Days 41–65",
    focus: "Technical storytelling and demos, then real client calls: shadow, co-lead, lead.",
    end: "Final review: a real client call you lead.",
  },
];

const DAY_STEPS = [
  { step: "Prep", time: "5 min", text: "Get ready for today's call." },
  { step: "Learn", time: "10 min", text: "One short concept, with an example." },
  { step: "Mock call", time: "10–15 min", text: "A voice call with an AI client. You open, lead and close." },
  { step: "Write", time: "10 min", text: "A recap or a short writing task." },
  { step: "Daily quiz", time: "5 questions", text: "Last. It completes the day." },
];

const CHECKPOINTS = [
  { when: "Every 5 days", what: "A short assessment (60% to continue) and a quick self-scorecard" },
  { when: "After Days 10, 30, 50, 60", what: "A check-in with your manager" },
  { when: "After Day 20 and Day 40", what: "A gate before the next phase" },
  { when: "Day 65", what: "Final review" },
];

const BEFORE_YOU_START = [
  "An AI app with voice mode: Claude, ChatGPT or Gemini. Free plans are enough.",
  "About 45 minutes a day, ideally at the same time.",
  "A quiet place where you can speak out loud.",
];

export const Route = createFileRoute("/app/overview")({
  head: () => pageTitle("Overview"),
  component: function OverviewPage() {
    return (
      <>
        <PageHeader
          eyebrow="About the plan"
          title="Client-Ready Engineer"
          description="65 short lessons to help you run client calls on your own, with US healthcare clients and no PM in the room."
        />

        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader title="By the end, you can" />
            <CardBody>
              <ul className="flex flex-col gap-2.5">
                {OUTCOMES.map((outcome) => (
                  <li key={outcome} className="flex gap-2.5 text-sm">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                    {outcome}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader title="Four pillars" />
            <CardBody>
              <dl className="flex flex-col gap-3 text-sm">
                {PILLARS.map((pillar) => (
                  <div key={pillar.name}>
                    <dt className="font-medium">{pillar.name}</dt>
                    <dd className="text-muted">{pillar.text}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card className="lg:col-span-12">
            <CardHeader title="Three phases" aside="65 lesson days, finished within 90 days" />
            <ol className="grid md:grid-cols-3">
              {PHASES.map((phase) => (
                <li
                  key={phase.phase}
                  className="flex flex-col gap-2 border-b border-line p-4 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium tracking-wider text-muted uppercase">
                      {phase.phase}
                    </span>
                    <Badge className="tabular-nums">{phase.days}</Badge>
                  </div>
                  <h3 className="text-md font-semibold">{phase.name}</h3>
                  <p className="text-sm text-fg-2">{phase.focus}</p>
                  <p className="mt-auto pt-1 text-sm text-muted">{phase.end}</p>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader title="Your day" aside="About 45 minutes" />
            <ul>
              {DAY_STEPS.map((item) => (
                <li
                  key={item.step}
                  className="grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-line px-4 py-3 text-sm last:border-b-0 sm:grid-cols-4"
                >
                  <span className="font-medium">{item.step}</span>
                  <span className="text-fg-2 sm:col-span-2">{item.text}</span>
                  <span className="text-muted tabular-nums sm:text-right">{item.time}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-3 text-sm text-muted">
              Do Prep, Learn, Mock and Write in any order. Any day of the week works.
            </p>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader title="Checkpoints" />
            <CardBody>
              <dl className="flex flex-col gap-3 text-sm">
                {CHECKPOINTS.map((checkpoint) => (
                  <div key={checkpoint.when}>
                    <dt className="font-medium tabular-nums">{checkpoint.when}</dt>
                    <dd className="text-muted">{checkpoint.what}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader title="Before you start" />
            <CardBody>
              <ul className="flex flex-col gap-2.5 text-sm">
                {BEFORE_YOU_START.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted">
                You practise on CareBook, a made-up project for a US telehealth client, so you don&apos;t need
                a real client to start. Calls get harder as you go: friendly, then busy and vague, then
                sceptical.
              </p>
            </CardBody>
          </Card>

          <Card className="lg:col-span-5">
            <CardHeader title="Data safety" />
            <CardBody>
              <p className="flex gap-2.5 text-sm">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  Never put patient details, client passwords or confidential documents into any AI tool. When
                  in doubt, leave it out.
                </span>
              </p>
              <p className="text-sm text-muted">
                Your notes and answers are private. Your manager sees your progress and scores.
              </p>
            </CardBody>
          </Card>
        </div>
      </>
    );
  },
});
