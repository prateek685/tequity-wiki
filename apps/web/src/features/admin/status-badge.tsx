import { type AdminUserRow } from "@portal/contracts";
import { Badge } from "@/components/ui/badge";

/** Account status in the admin user list. */
export function StatusBadge({ status }: { status: AdminUserRow["status"] }) {
  if (status === "pending")
    return (
      <Badge tone="warning" dot>
        Waiting for access
      </Badge>
    );
  if (status === "disabled")
    return (
      <Badge tone="danger" dot>
        Disabled
      </Badge>
    );
  return (
    <Badge tone="neutral" dot>
      Active
    </Badge>
  );
}
