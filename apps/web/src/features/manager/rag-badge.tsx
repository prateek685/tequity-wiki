import { type Rag } from "@portal/contracts";
import { Badge } from "@/components/ui/badge";
import { RAG_PILL } from "./manager";

/** A check-in's Green / Amber / Red as a status pill ("On track", or "Green" with `short`); "—" when none. */
export function RagBadge({ rag, short = false }: { rag: Rag | null; short?: boolean }) {
  if (!rag) return <span className="text-muted">—</span>;
  const pill = RAG_PILL[rag];
  return (
    <Badge tone={pill.tone} dot>
      {short ? pill.short : pill.label}
    </Badge>
  );
}
