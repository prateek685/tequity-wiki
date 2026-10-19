import { dayParam } from "@portal/contracts";

/** `$day` route param: a whole number 1–65 (invalid values show the route's error screen). */
export const dayRouteParams = {
  parse: (params: { day: string }) => ({ day: dayParam.parse(params).day }),
  stringify: (params: { day: number }) => ({ day: String(params.day) }),
};
