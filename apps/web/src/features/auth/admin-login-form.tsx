import { zodResolver } from "@hookform/resolvers/zod";
import { type AdminLoginRequest, adminLoginRequest, signInResponse } from "@portal/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { apiSend, errorMessage } from "@/lib/api";

/** Email and password for admins. Everyone else signs in with Google. */
export function AdminLoginForm({ next }: { next: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const form = useForm<AdminLoginRequest>({
    resolver: zodResolver(adminLoginRequest),
    defaultValues: { email: "", password: "" },
  });
  const signIn = useMutation({
    mutationFn: (values: AdminLoginRequest) => apiSend("POST", "/auth/admin-login", values, signInResponse),
    onSuccess: async (result) => {
      queryClient.clear();
      const home = result?.next ?? "/";
      await router.navigate({ href: next !== "/" && home !== "/pending" ? next : home, replace: true });
    },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          signIn.mutate(values);
        })(event);
      }}
    >
      <Field id="admin-email" label="Email" error={errors.email?.message}>
        <Input
          id="admin-email"
          type="email"
          autoComplete="username"
          aria-invalid={errors.email ? true : undefined}
          {...form.register("email")}
        />
      </Field>
      <Field id="admin-password" label="Password" error={errors.password?.message}>
        <Input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          {...form.register("password")}
        />
      </Field>
      <Button type="submit" variant="primary" block className="h-12 text-read" disabled={signIn.isPending}>
        Sign in
      </Button>
      {signIn.isError ? <FormMessage ok={false} message={errorMessage(signIn.error)} /> : null}
    </form>
  );
}
