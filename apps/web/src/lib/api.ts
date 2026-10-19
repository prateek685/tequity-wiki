import { apiErrorBody, type ApiErrorBody, CSRF_HEADER, ERROR_MESSAGES } from "@portal/contracts";
import { type z } from "zod";

/** A failed API call, carrying the API's error code and user-facing message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
    this.name = "ApiError";
  }

  get code(): ApiErrorBody["code"] {
    return this.body.code;
  }
}

async function errorFrom(response: Response): Promise<ApiError> {
  const parsed = apiErrorBody.safeParse(await response.json().catch(() => null));
  return new ApiError(
    response.status,
    parsed.success ? parsed.data : { code: "INTERNAL", message: ERROR_MESSAGES.INTERNAL },
  );
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        // Required by the API on every state-changing request (CSRF defence).
        [CSRF_HEADER]: "1",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { code: "INTERNAL", message: "Can't reach the server. Check your connection." });
  }
  if (!response.ok) throw await errorFrom(response);
  return response;
}

/**
 * GET from the API and validate the response against its contract schema. A response that doesn't
 * match the contract fails here, loudly, instead of breaking a screen later.
 */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> {
  const response = await send("GET", path);
  return schema.parse(await response.json());
}

/** POST / PUT / PATCH / DELETE. Returns the parsed body when a schema is given, otherwise nothing (204). */
export async function apiSend<S extends z.ZodType>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  schema?: S,
): Promise<z.output<S> | undefined> {
  const response = await send(method, path, body);
  return schema ? schema.parse(await response.json()) : undefined;
}

/** The message to show for any error thrown by these functions. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : ERROR_MESSAGES.INTERNAL;
}
