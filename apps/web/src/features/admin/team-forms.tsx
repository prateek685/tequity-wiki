import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateTeamRequest, createTeamRequest, type PersonRef } from "@portal/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiSend, errorMessage } from "@/lib/api";
import { adminKeys } from "./queries";

/** Mutation + inline result message, refreshing the team list on success. */
function useTeamMutation<T>(send: (input: T) => Promise<unknown>, success: (input: T) => string) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState({ ok: true, message: "" });
  const mutation = useMutation({
    mutationFn: send,
    onSuccess: async (_data, input) => {
      setResult({ ok: true, message: success(input) });
      await queryClient.invalidateQueries({ queryKey: adminKeys.teams });
      await queryClient.invalidateQueries({ queryKey: adminKeys.users });
    },
    onError: (error) => {
      setResult({ ok: false, message: errorMessage(error) });
    },
  });
  return { mutation, result };
}

export function CreateTeamForm() {
  const form = useForm<CreateTeamRequest>({
    resolver: zodResolver(createTeamRequest),
    defaultValues: { name: "" },
  });
  const { mutation, result } = useTeamMutation(
    (values: CreateTeamRequest) => apiSend("POST", "/admin/teams", values),
    (values) => `Team "${values.name}" created.`,
  );
  const error = form.formState.errors.name?.message;

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          mutation.mutate(values, {
            onSuccess: () => {
              form.reset();
            },
          });
        })(event);
      }}
    >
      <Field id="team-name" label="New team name" error={error} className="min-w-0 flex-1">
        <Input
          id="team-name"
          placeholder="e.g. Platform"
          aria-invalid={error ? true : undefined}
          {...form.register("name")}
        />
      </Field>
      <Button type="submit" variant="primary" disabled={mutation.isPending}>
        {mutation.isPending ? "Creating…" : "Create team"}
      </Button>
      <FormMessage ok={result.ok} message={result.message} className="basis-full" />
    </form>
  );
}

export function AddManagerForm({ teamId, options }: { teamId: string; options: PersonRef[] }) {
  const [userId, setUserId] = useState("");
  const { mutation, result } = useTeamMutation(
    (id: string) => apiSend("POST", `/admin/teams/${teamId}/managers`, { userId: id }),
    () => "Manager added.",
  );
  if (options.length === 0) return <p className="text-xs text-muted">No other active managers to add.</p>;

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (userId)
          mutation.mutate(userId, {
            onSuccess: () => {
              setUserId("");
            },
          });
      }}
    >
      <Select value={userId} onValueChange={setUserId}>
        <SelectTrigger aria-label="Manager to add" className="w-44 py-1.5 text-sm">
          <SelectValue placeholder="Add a manager…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((manager) => (
            <SelectItem key={manager.id} value={manager.id}>
              {manager.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={mutation.isPending || userId === ""}>
        Add
      </Button>
      <FormMessage ok={result.ok} message={result.message} />
    </form>
  );
}

export function RemoveManagerButton({ teamId, manager }: { teamId: string; manager: PersonRef }) {
  const { mutation, result } = useTeamMutation(
    () => apiSend("DELETE", `/admin/teams/${teamId}/managers/${manager.id}`),
    () => "Manager removed.",
  );
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={mutation.isPending}
        aria-label={`Remove ${manager.name} as manager`}
        onClick={() => {
          mutation.mutate(undefined);
        }}
      >
        Remove
      </Button>
      {result.ok ? null : <FormMessage ok={false} message={result.message} />}
    </span>
  );
}
