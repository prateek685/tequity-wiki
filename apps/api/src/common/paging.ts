import { PAGE_SIZE } from "@portal/contracts";

export function pageWindow(page: number): { skip: number; take: number } {
  return { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };
}
