import { zodResolver } from "@hookform/resolvers/zod";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  adminPasswordStatus,
  type SetAdminPasswordRequest,
  setAdminPasswordRequest,
} from "@portal/contracts";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { apiGet, apiSend, errorMessage } from "@/lib/api";

const statusQuery = queryOptions({
  queryKey: ["auth", "admin-password"],
  queryFn: () => apiGet("/auth/admin-password", adminPasswordStatus),
});

const formSchema = setAdminPasswordRequest
  .extend({ confirm: z.string() })
  .refine((values) => values.newPassword === values.confirm, {
    path: ["confirm"],
    message: "The passwords don't match.",
  });
type FormValues = z.infer<typeof formSchema>;

/** The signed-in admin sets or changes their own email-and-password sign-in. */
export function AdminPasswordCard() {
  const queryClient = useQueryClient();
  const status = useQuery(statusQuery);
  const [saved, setSaved] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const save = useMutation({
    mutationFn: ({ currentPassword, newPassword }: FormValues) => {
      const body: SetAdminPasswordRequest = { newPassword, currentPassword: currentPassword || undefined };
      return apiSend("POST", "/auth/admin-password", body);
    },
    onSuccess: async () => {
      form.reset();
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: statusQuery.queryKey });
    },
  });
  const hasPassword = status.data?.hasPassword === true;
  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader
        title="Your password"
        aside={status.data ? <Badge tone="neutral">{hasPassword ? "Set" : "Not set"}</Badge> : undefined}
      />
      <CardBody>
        <p className="text-sm text-fg-2">
          Lets you sign in at the admin page with your email and a password, as well as with Google.
        </p>
        <form
          noValidate
          className="flex flex-col gap-4 md:max-w-sm"
          onSubmit={(event) => {
            setSaved(false);
            void form.handleSubmit((values) => {
              save.mutate(values);
            })(event);
          }}
        >
          {hasPassword ? (
            <Field id="current-password" label="Current password" error={errors.currentPassword?.message}>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                {...form.register("currentPassword")}
              />
            </Field>
          ) : null}
          <Field
            id="new-password"
            label="New password"
            hint={`At least ${String(ADMIN_PASSWORD_MIN_LENGTH)} characters.`}
            error={errors.newPassword?.message}
          >
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.newPassword ? true : undefined}
              {...form.register("newPassword")}
            />
          </Field>
          <Field id="confirm-password" label="Repeat new password" error={errors.confirm?.message}>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.confirm ? true : undefined}
              {...form.register("confirm")}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={save.isPending || status.isPending}>
              {save.isPending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
            </Button>
            {saved ? <FormMessage ok message="Password saved." /> : null}
            {save.isError ? <FormMessage ok={false} message={errorMessage(save.error)} /> : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
