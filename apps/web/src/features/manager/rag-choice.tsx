import { RAG, type Rag } from "@portal/contracts";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import { RAG_MEANING, RAG_PILL } from "./manager";

const ragDot = { green: "bg-success", amber: "bg-warning", red: "bg-danger" } as const;

/** Green / Amber / Red as radio cards with the PDF's meanings (Radix RadioGroup: arrow keys). */
export function RagChoice({
  labelId,
  label = "Rating",
  value,
  onChange,
}: {
  labelId: string;
  label?: string;
  value: Rag;
  onChange: (rag: Rag) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-sm font-medium text-fg-2">
        {label}
      </span>
      <RadioGroupPrimitive.Root
        aria-labelledby={labelId}
        value={value}
        onValueChange={(next) => {
          onChange(next as Rag);
        }}
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {RAG.map((rag) => (
          <RadioGroupPrimitive.Item
            key={rag}
            value={rag}
            className="flex items-start gap-2.5 rounded-card border border-line-strong bg-surface p-3 text-left hover:bg-subtle state-checked:border-accent state-checked:bg-accent-50"
          >
            <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", ragDot[rag])} />
            <span className="min-w-0">
              <b className="block text-sm font-semibold">{RAG_PILL[rag].short}</b>
              <span className="block text-xs text-fg-2">{RAG_MEANING[rag]}</span>
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
