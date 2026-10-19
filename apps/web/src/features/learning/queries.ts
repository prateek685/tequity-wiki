import {
  assessmentViewResponse,
  checkinPrepResponse,
  courseOutlineResponse,
  dayViewResponse,
  homeResponse,
  type LessonEntry,
  lessonState,
  myPlanResponse,
  promptCopyResponse,
  quizViewResponse,
  type SaveCheckinPrepRequest,
} from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { assessmentPending, dayPending, homePending, itemsPending, pollWhile } from "./ai-score";

export const learningKeys = {
  plan: ["me", "plan"] as const,
  course: ["me", "course"] as const,
  day: (day: number) => ["me", "day", day] as const,
  quiz: (day: number) => ["me", "day", day, "quiz"] as const,
  assessment: (day: number) => ["me", "assessment", day] as const,
  home: ["me", "home"] as const,
  checkinPrep: (day: number) => ["me", "checkin", day] as const,
};

export const myPlanQuery = queryOptions({
  queryKey: learningKeys.plan,
  queryFn: () => apiGet("/me/plan", myPlanResponse),
});

/** The course outline for the player: phases → weeks → days → lessons. */
export const courseQuery = queryOptions({
  queryKey: learningKeys.course,
  queryFn: () => apiGet("/me/course", courseOutlineResponse),
});

export const dayQuery = (day: number) =>
  queryOptions({
    queryKey: learningKeys.day(day),
    queryFn: () => apiGet(`/me/days/${day}`, dayViewResponse),
    // A saved write lesson's AI score arrives in the background.
    refetchInterval: (query) => pollWhile(dayPending(query.state.data)),
  });

/** Save a lesson's entry and mark it done (re-saving a done lesson replaces the entry). */
export async function saveLesson(day: number, lesson: string, entry: LessonEntry) {
  const state = await apiSend("PUT", `/me/days/${day}/lessons/${lesson}`, entry, lessonState);
  if (!state) throw new Error("Empty lesson response");
  return state;
}

/** The mock card's AI prompt, for the clipboard only (the copy is audited; the prompt is never shown). */
export async function fetchCardPrompt(day: number, lesson: string): Promise<string> {
  const response = await apiSend(
    "POST",
    `/me/days/${day}/lessons/${lesson}/prompt-copy`,
    undefined,
    promptCopyResponse,
  );
  if (!response) throw new Error("Empty prompt response");
  return response.prompt;
}

/**
 * Starts the daily quiz or resumes the open attempt (POST, so it's read in the page component, never
 * in a loader: hovering a link must not start a quiz). Answers update this cache in place.
 */
export const quizQuery = (day: number) =>
  queryOptions({
    queryKey: learningKeys.quiz(day),
    queryFn: async () => {
      const quiz = await apiSend("POST", `/me/days/${day}/quiz`, undefined, quizViewResponse);
      if (!quiz) throw new Error("Empty quiz response");
      return quiz;
    },
    staleTime: Infinity,
    retry: false,
    // Written answers' AI scores arrive in the background (resuming returns the same attempt).
    refetchInterval: (query) => pollWhile(itemsPending(query.state.data?.items)),
  });

/** The weekly assessment after `day` (5, 10 … 60): rules, the latest attempt, earlier results. */
export const assessmentQuery = (day: number) =>
  queryOptions({
    queryKey: learningKeys.assessment(day),
    queryFn: () => apiGet(`/me/assessments/${day}`, assessmentViewResponse),
    refetchInterval: (query) => pollWhile(assessmentPending(query.state.data)),
  });

/** Start the assessment, resume the open attempt, or start a retake. */
export async function startAssessment(day: number) {
  const view = await apiSend("POST", `/me/assessments/${day}/start`, undefined, assessmentViewResponse);
  if (!view) throw new Error("Empty assessment response");
  return view;
}

/** The Home cards not covered by /me/plan and /me/days/:day: the Day-1 baseline and the latest feedback. */
export const homeQuery = queryOptions({
  queryKey: learningKeys.home,
  queryFn: () => apiGet("/me/home", homeResponse),
  refetchInterval: (query) => pollWhile(homePending(query.state.data)),
});

/** The engineer's own notes for a check-in: spot-check, where they are stuck, support needed. */
export const checkinPrepQuery = (day: number) =>
  queryOptions({
    queryKey: learningKeys.checkinPrep(day),
    queryFn: () => apiGet(`/me/checkins/${day}`, checkinPrepResponse),
  });

export async function saveCheckinPrep(day: number, request: SaveCheckinPrepRequest) {
  const state = await apiSend("PUT", `/me/checkins/${day}`, request, checkinPrepResponse);
  if (!state) throw new Error("Empty check-in response");
  return state;
}
