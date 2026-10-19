import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AdminUserRow,
  type TeamOption,
  type UpdateUserAccessRequest,
  updateUserAccessRequest,
} from "@portal/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { type z } from "zod";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiSend, errorMessage } from "@/lib/api";
import { adminKeys } from "./queries";

const NO_TEAM = "none";

type FormInput = z.input<typeof updateUserAccessRequest>;

/** One user's access settings. Team and start date apply to engineers only. */
export function UserAccessForm({ user, teams }: { user: AdminUserRow; teams: TeamOption[] }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState({ ok: true, message: "" });
  const form = useForm<FormInput, unknown, UpdateUserAccessRequest>({
    resolver: zodResolver(updateUserAccessRequest),
    defaultValues: {
      role: user.role ?? "engineer",
      status: user.status === "disabled" ? "disabled" : "active",
      teamId: user.teamId ?? "",
      startDate: user.startDate ?? "",
    },
  });
  const role = useWatch({ control: form.control, name: "role" });
  const isEngineer = role === "engineer";

  const save = useMutation({
    mutationFn: (values: UpdateUserAccessRequest) => apiSend("PATCH", `/admin/users/${user.id}`, values),
    onSuccess: async () => {
      setResult({ ok: true, message: "Saved." });
      await queryClient.invalidateQueries({ queryKey: adminKeys.users });
    },
    onError: (error) => {
      setResult({ ok: false, message: errorMessage(error) });
    },
  });

  const id = (field: string) => `${field}-${user.id}`;
  const fieldClass = "flex flex-col gap-1";
  const labelClass = "text-xs font-normal text-muted";
  const firstError = Object.values(form.formState.errors)[0]?.message;

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          save.mutate(isEngineer ? values : { ...values, teamId: null, startDate: null });
        })(event);
      }}
    >
      <div className={fieldClass}>
        <Label htmlFor={id("role")} className={labelClass}>
          Role
        </Label>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
              }}
            >
              <SelectTrigger id={id("role")} className="w-32 py-1.5 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="engineer">Engineer</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className={fieldClass}>
        <Label htmlFor={id("status")} className={labelClass}>
          Access
        </Label>
        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={id("status")} className="w-28 py-1.5 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className={fieldClass}>
        <Label htmlFor={id("team")} className={labelClass}>
          Team
        </Label>
        <Controller
          control={form.control}
          name="teamId"
          render={({ field }) => (
            <Select
              value={typeof field.value === "string" && field.value !== "" ? field.value : NO_TEAM}
              onValueChange={(value) => {
                field.onChange(value === NO_TEAM ? "" : value);
              }}
              disabled={!isEngineer}
            >
              <SelectTrigger id={id("team")} className="w-36 py-1.5 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>No team</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className={fieldClass}>
        <Label htmlFor={id("start")} className={labelClass}>
          Start date
        </Label>
        <Input
          id={id("start")}
          type="date"
          disabled={!isEngineer}
          className="w-auto py-1.5 text-sm"
          {...form.register("startDate")}
        />
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={save.isPending}>
        {save.isPending ? "Saving…" : user.status === "pending" ? "Approve" : "Save"}
      </Button>
      <FormMessage
        ok={firstError === undefined && result.ok}
        message={firstError ?? result.message}
        className="basis-full"
      />
    </form>
  );
}
