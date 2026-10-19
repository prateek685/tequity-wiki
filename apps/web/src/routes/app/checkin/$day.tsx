import { checkinPrepParam, type CheckinPrepResponse } from "@portal/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { ActionBar } from "@/components/ui/action-bar";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Textarea } from "@/components/ui/textarea";
import { checkinPrepQuery, learningKeys, saveCheckinPrep } from "@/features/learning/queries";
import { errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/** Your notes for a check-in with your manager (all optional); locked once the manager records it. */
export const Route = createFileRoute("/app/checkin/$day")({
  params: {
    parse: (params: { day: string }) => checkinPrepParam.parse(params),
    stringify: (params: { day: number }) => ({ day: String(params.day) }),
  },
  head: ({ params }) => pageTitle(`Check-in notes after Day ${params.day}`),
  component: function CheckinPrepPage() {
    const { day } = Route.useParams();
    const prep = useQuery(checkinPrepQuery(day));
    if (prep.isPending)
      return (
        <p role="status" className="text-sm text-muted">
          Loading…
        </p>
      );
    if (prep.isError)
      return (
        <>
          <PageHeader title={`Check-in after Day ${day}`} />
          <Notice tone="warning">{errorMessage(prep.error)}</Notice>
        </>
      );
    return <PrepForm key={day} data={prep.data} />;
  },
});

const NOTES = [
  {
    key: "spotCheck",
    label: "Live spot-check: how did it go?",
    hint: "e.g. “Give me your status update now”, or a surprise client question.",
  },
  { key: "stuck", label: "Where am I stuck?", hint: undefined },
  {
    key: "support",
    label: "What support do I need?",
    hint: "Shadowing, a lighter week, pairing, a resource…",
  },
] as const;

function PrepForm({ data }: { data: CheckinPrepResponse }) {
  const formId = useId();
  const [values, setValues] = useState({
    spotCheck: data.prep?.spotCheck ?? "",
    stuck: data.prep?.stuck ?? "",
    support: data.prep?.support ?? "",
  });
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => saveCheckinPrep(data.afterDay, values),
    onSuccess: (state) => {
      setSaved(true);
      queryClient.setQueryData(learningKeys.checkinPrep(data.afterDay), state);
    },
  });
  const editable = data.reached && !data.locked;
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (editable) save.mutate();
      }}
    >
      <PageHeader
        eyebrow="Check-in with your manager"
        title={`Notes for your check-in after Day ${data.afterDay}`}
        description="Optional. Your manager reads these before you meet, so the time goes on the conversation."
        actions={
          <Link to="/app/plan" className={buttonVariants()}>
            Back to my plan
          </Link>
        }
      />
      {!data.reached ? (
        <Notice tone="warning">
          This opens once you have finished Day {data.afterDay}. You can read it now, but it can&apos;t be
          saved yet.
        </Notice>
      ) : data.locked ? (
        <Notice tone="info">Your manager has recorded this check-in, so your notes are locked.</Notice>
      ) : null}
      <Card>
        <CardBody>
          {NOTES.map(({ key, label, hint }) => (
            <Field key={key} id={`${formId}-${key}`} label={label} hint={hint}>
              <Textarea
                id={`${formId}-${key}`}
                value={values[key]}
                maxLength={2000}
                disabled={!editable}
                onChange={(event) => {
                  setSaved(false);
                  setValues((current) => ({ ...current, [key]: event.target.value }));
                }}
              />
            </Field>
          ))}
        </CardBody>
      </Card>
      {save.isError ? <Notice tone="danger">{errorMessage(save.error)}</Notice> : null}
      {editable ? (
        <ActionBar status={saved ? <span role="status">Saved. Your manager can read it.</span> : null}>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save notes"}
          </Button>
        </ActionBar>
      ) : null}
    </form>
  );
}
