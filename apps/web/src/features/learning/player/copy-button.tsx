import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";

type CopyStatus =
  { state: "idle" } | { state: "pending" } | { state: "copied" } | { state: "failed"; message: string };

/**
 * Copies text to the clipboard. The ClipboardItem takes a promise, so Safari keeps the click's
 * permission while the text is fetched (the mock prompt comes from the API); browsers without
 * ClipboardItem fall back to writeText. Shows "Copied ✓" for a moment, or why it failed.
 */
export function CopyButton({
  label,
  getText,
  primary = false,
}: {
  label: string;
  getText: () => Promise<string>;
  primary?: boolean;
}) {
  const [status, setStatus] = useState<CopyStatus>({ state: "idle" });

  useEffect(() => {
    if (status.state !== "copied") return;
    const timer = window.setTimeout(() => {
      setStatus({ state: "idle" });
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [status.state]);

  const copy = async () => {
    setStatus({ state: "pending" });
    try {
      if (typeof ClipboardItem === "undefined") {
        await navigator.clipboard.writeText(await getText());
      } else {
        const blob = getText().then((text) => new Blob([text], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      }
      setStatus({ state: "copied" });
    } catch (error) {
      setStatus({
        state: "failed",
        message:
          error instanceof DOMException
            ? "Your browser blocked copying. Allow clipboard access and try again."
            : errorMessage(error),
      });
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <Button
        variant={primary ? "primary" : "secondary"}
        size="lg"
        disabled={status.state === "pending"}
        onClick={() => {
          void copy();
        }}
      >
        {status.state === "pending" ? "Copying…" : status.state === "copied" ? "Copied ✓" : label}
      </Button>
      <span role="status" className="text-sm text-danger empty:hidden">
        {status.state === "failed" ? status.message : ""}
      </span>
    </span>
  );
}
