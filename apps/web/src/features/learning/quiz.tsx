import {
  answerQuizItemResponse,
  type AnswerQuizItemResponse,
  type QuizItem,
  type QuizViewResponse,
} from "@portal/contracts";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { AnsweredOption, AnswerOptions } from "@/components/ui/answer-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Markdown } from "@/components/ui/markdown";
import { Textarea } from "@/components/ui/textarea";
import { apiSend, errorMessage } from "@/lib/api";
import { AiFeedback } from "./player/ai-feedback";
import type * as React from "react";

const TYPE_LABEL: Record<QuizItem["type"], string> = {
  mcq: "Multiple choice",
  scenario: "Client scenario",
  written: "Short written answer",
};

/** The first unanswered question, or the last one when all are answered. */
export function firstOpenIndex(items: QuizItem[]): number {
  const index = items.findIndex((item) => item.result === null);
  return index === -1 ? Math.max(0, items.length - 1) : index;
}

type AnswerBody = { choice: number } | { text: string };

/** The parts of one question screen, for callers that place the action in their own footer. */
export interface QuizParts {
  index: number;
  total: number;
  question: React.ReactNode;
  /** "Answers are final." or the error. */
  message: React.ReactNode;
  /** The submit / next / finish button (null while the last answer is saving). */
  action: React.ReactNode;
}

export interface QuizLabels {
  title: string;
  /** Submit, by question kind. */
  check: string;
  submit: string;
  next: string;
  finish: string;
  /** Shown inside each button after the text (e.g. an arrow). */
  icon?: React.ReactNode;
}

const DAILY_LABELS: QuizLabels = {
  title: "Daily quiz",
  check: "Check answer",
  submit: "Submit answer",
  next: "Next question",
  finish: "Finish quiz",
};

function defaultLayout({ question, message, action }: QuizParts) {
  return (
    <>
      {question}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="min-w-0 text-sm text-muted">{message}</div>
        {action}
      </div>
    </>
  );
}

/**
 * One question at a time (daily quiz and weekly assessment). Each answer is final and shows its
 * explanation at once. `onAnswered` puts the result in the caller's cache; `onFinished` runs when the
 * engineer leaves the last answer's feedback.
 */
export function QuizRunner({
  quiz,
  onAnswered,
  onFinished,
  labels = DAILY_LABELS,
  layout = defaultLayout,
}: {
  quiz: { attemptId: string; items: QuizItem[] };
  onAnswered: (position: number, result: AnswerQuizItemResponse["result"]) => void | Promise<void>;
  onFinished: (dayCompleted: boolean) => void;
  labels?: QuizLabels;
  layout?: (parts: QuizParts) => React.ReactNode;
}) {
  const formId = useId();
  const [index, setIndex] = useState(() => firstOpenIndex(quiz.items));
  /** Set when the last answer completed the quiz: whether it also completed the day. */
  const [completedDay, setCompletedDay] = useState<boolean | null>(null);
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
  const [textError, setTextError] = useState("");
  const cached = quiz.items[index];

  const answer = useMutation({
    mutationFn: async (body: AnswerBody): Promise<AnswerQuizItemResponse> => {
      const response = await apiSend(
        "POST",
        `/me/quiz/${quiz.attemptId}/items/${cached?.position ?? 0}`,
        body,
        answerQuizItemResponse,
      );
      if (!response) throw new Error("Empty answer response");
      return response;
    },
    onSuccess: (response) => {
      if (cached) void onAnswered(cached.position, response.result);
      // Show the last answer's feedback first; "Finish quiz" then moves on.
      if (response.quizCompleted) setCompletedDay(response.dayCompleted);
    },
  });

  // Until the caller's cache has this answer, show the one just returned.
  const item =
    cached && cached.result === null && answer.data ? { ...cached, result: answer.data.result } : cached;
  if (!item) return <p className="text-sm text-muted">This quiz has no questions.</p>;
  const isLast = index === quiz.items.length - 1;
  const answered = item.result !== null;
  const written = item.type === "written";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (written) {
      if (text.trim() === "") {
        setTextError("Write your answer.");
        return;
      }
      setTextError("");
      answer.mutate({ text: text.trim() });
    } else if (choice !== "") {
      answer.mutate({ choice: Number(choice) });
    }
  };

  const next = () => {
    answer.reset();
    setChoice("");
    setText("");
    setIndex(index + 1);
  };

  const question = (
    <Card aria-labelledby={`${formId}-title`}>
      <CardHeader
        title={<span id={`${formId}-title`}>{labels.title}</span>}
        aside={
          <span className="tabular-nums">
            {index + 1} of {quiz.items.length} · {TYPE_LABEL[item.type]}
          </span>
        }
      />
      <CardBody>
        {item.clientLine ? (
          <div className="border-l-2 border-accent py-1 pl-3.5 text-md">
            <Markdown>{item.clientLine}</Markdown>
          </div>
        ) : null}
        <Markdown className="text-md font-semibold">{item.stem}</Markdown>
        {answered ? (
          written ? (
            <WrittenResult item={item} />
          ) : (
            <ChoiceResult item={item} />
          )
        ) : (
          <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-3">
            {written ? (
              <Field id={`${formId}-text`} label="Your answer" error={textError || undefined}>
                <Textarea
                  id={`${formId}-text`}
                  className="min-h-32"
                  value={text}
                  maxLength={5000}
                  aria-invalid={textError ? true : undefined}
                  disabled={answer.isPending}
                  onChange={(event) => {
                    setText(event.target.value);
                  }}
                />
              </Field>
            ) : (
              <AnswerOptions
                label="Answer options"
                value={choice}
                onValueChange={setChoice}
                disabled={answer.isPending}
                options={(item.options ?? []).map((option) => (
                  <Markdown key={option} inline>
                    {option}
                  </Markdown>
                ))}
              />
            )}
          </form>
        )}
      </CardBody>
    </Card>
  );

  const message = answer.isError ? (
    <FormMessage ok={false} message={errorMessage(answer.error)} className="text-sm" />
  ) : answered ? null : (
    "Answers are final."
  );

  const action = !answered ? (
    <Button
      type="submit"
      form={formId}
      variant="primary"
      size="lg"
      disabled={answer.isPending || (!written && choice === "")}
    >
      {answer.isPending ? (written ? "Saving…" : "Checking…") : written ? labels.submit : labels.check}
      {answer.isPending ? null : labels.icon}
    </Button>
  ) : !isLast ? (
    <Button variant="primary" size="lg" onClick={next}>
      {labels.next}
      {labels.icon}
    </Button>
  ) : completedDay !== null ? (
    <Button
      variant="primary"
      size="lg"
      onClick={() => {
        onFinished(completedDay);
      }}
    >
      {labels.finish}
      {labels.icon}
    </Button>
  ) : null;

  return layout({ index, total: quiz.items.length, question, message, action });
}

/** A finished quiz, read-only: every question with the engineer's answer and the explanations. */
export function QuizReview({ quiz }: { quiz: Pick<QuizViewResponse, "items"> }) {
  return (
    <div className="flex flex-col gap-4">
      {quiz.items.map((item, index) => (
        <Card key={item.position} aria-labelledby={`review-${item.position}`}>
          <CardHeader
            title={<span id={`review-${item.position}`}>Question {index + 1}</span>}
            aside={TYPE_LABEL[item.type]}
          />
          <CardBody>
            {item.clientLine ? (
              <div className="border-l-2 border-accent py-1 pl-3.5 text-md">
                <Markdown>{item.clientLine}</Markdown>
              </div>
            ) : null}
            <Markdown className="text-md font-semibold">{item.stem}</Markdown>
            {item.type === "written" ? <WrittenResult item={item} /> : <ChoiceResult item={item} />}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function ChoiceResult({ item }: { item: QuizItem }) {
  const result = item.result;
  if (!result) return null;
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="font-semibold">
        {result.correct ? "Correct." : "Not quite."}
      </p>
      <ol className="flex flex-col gap-2" aria-label="Answers and explanations">
        {(item.options ?? []).map((option, optionIndex) => {
          const isCorrect = optionIndex === result.correctIndex;
          const isChoice = optionIndex === result.choice;
          const explanation = result.explanations[optionIndex];
          return (
            <AnsweredOption
              key={option}
              index={optionIndex}
              tone={isCorrect ? "right" : isChoice ? "wrong" : "plain"}
              note={explanation ? <Markdown>{explanation}</Markdown> : null}
              aside={
                isCorrect || isChoice ? (
                  <span className="flex gap-1.5">
                    {isCorrect ? <Badge tone="success">Correct answer</Badge> : null}
                    {isChoice ? <Badge tone={isCorrect ? "success" : "danger"}>Your answer</Badge> : null}
                  </span>
                ) : null
              }
            >
              <Markdown inline>{option}</Markdown>
            </AnsweredOption>
          );
        })}
      </ol>
    </div>
  );
}

function WrittenResult({ item }: { item: QuizItem }) {
  const result = item.result;
  if (!result) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="font-semibold">{result.aiScore ? "Saved. Your AI feedback appears below." : "Saved."}</p>
      {result.text ? (
        <Answer label="Your answer">
          <p className="whitespace-pre-wrap">{result.text}</p>
        </Answer>
      ) : null}
      {result.modelAnswer ? (
        <Answer label="Model answer">
          <Markdown>{result.modelAnswer}</Markdown>
        </Answer>
      ) : null}
      {result.aiScore ? <AiFeedback score={result.aiScore} /> : null}
    </div>
  );
}

function Answer({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-ctl border border-line bg-subtle p-3.5 text-base">
      <span className="text-xs font-medium tracking-wider text-muted uppercase">{label}</span>
      {children}
    </div>
  );
}
