import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { apiSend } from "@/lib/api";

/** Ends the session on the server, forgets all cached data, and goes to the sign-in page. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => apiSend("POST", "/auth/logout"),
    onSettled: async () => {
      queryClient.clear();
      await navigate({ to: "/sign-in", replace: true });
    },
  });
}
