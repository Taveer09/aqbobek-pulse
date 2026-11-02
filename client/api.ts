export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload: { data?: T; error?: { message?: string; details?: unknown } };
  try {
    payload = await response.json();
  } catch {
    throw new APIError(
      "Сервер вернул непонятный ответ. Попробуйте ещё раз.",
      response.status,
    );
  }
  if (!response.ok)
    throw new APIError(
      payload.error?.message ||
        `Не удалось выполнить запрос (${response.status})`,
      response.status,
      payload.error?.details,
    );
  return payload.data as T;
}
export function messageOf(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить действие";
}
