import { type UnlockOption } from "@portal/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { reasonOk } from "./manager";
import { managerKeys, unlockEngineer } from "./queries";

/**
 * Unlock with a reason (mockup `team()` inline panel): the reason is saved to the engineer's unlock
 * history and audited. Refetches every manager view on success.
 */
export function UnlockPanel({
  engineer,
  option,
  onClose,
  onDone,
}: {
  engineer: { id: string; name: string };
  option: UnlockOption;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // The panel opens from an Unlock button: move focus into it.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const queryClient = useQueryClient();
  const unlock = useMutation({
    mutationFn: () =>
      unlockEngineer(engineer.id, { kind: option.kind, day: option.day, reason: reason.trim() }),
    onSuccess: async () => {
      onDone(`${option.label}: done for ${engineer.name}.`);
      await queryClient.invalidateQueries({ queryKey: managerKeys.all });
    },
  });
  return (
    <form
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 border-t border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (reasonOk(reason)) unlock.mutate();
      }}
    >
      <h3 id={`${id}-title`} className="text-md">
        {option.label} for {engineer.name}
      </h3>
      <Field
        id={`${id}-reason`}
        label="Reason (saved to history)"
        error={unlock.isError ? errorMessage(unlock.error) : undefined}
        hint="At least 5 characters."
      >
        <Input
          id={`${id}-reason`}
          value={reason}
          maxLength={500}
          ref={inputRef}
          placeholder="e.g. Retake approved after our 1:1"
          aria-invalid={unlock.isError || undefined}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!reasonOk(reason) || unlock.isPending}>
          {unlock.isPending ? "Unlocking…" : "Unlock"}
        </Button>
      </div>
    </form>
  );
}
