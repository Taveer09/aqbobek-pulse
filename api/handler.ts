import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp } from "../server/app.ts";
import {
  cloudBackend,
  type PostgresSnapshots,
} from "../server/cloud/postgres.ts";
import { flushNotifications } from "../server/notifications/index.ts";
export type FunctionRequest = IncomingMessage & { body?: unknown };
async function bodyOf(req: FunctionRequest): Promise<string | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return;
  if (req.body !== undefined) {
    const body =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(body) > 200000) throw new Error("Request too large");
    return body;
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const data = Buffer.from(chunk);
    length += data.length;
    if (length > 200000) throw new Error("Request too large");
    chunks.push(data);
  }
  return chunks.length ? Buffer.concat(chunks).toString() : undefined;
}
export function requestRoute(url: string) {
  const parsed = new URL(url, "https://function.local");
  const routed = parsed.searchParams.get("route");
  if (routed) {
    parsed.searchParams.delete("route");
    const query = parsed.searchParams.toString();
    return routed + (query ? "?" + query : "");
  }
  return parsed.pathname + parsed.search;
}
export async function handleCloudRequest(
  req: FunctionRequest,
  res: ServerResponse,
  backend: PostgresSnapshots,
) {
  const route = requestRoute(req.url || "/");
  if (!/^\/(api|mock)\//.test(route)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  try {
    const payload = await bodyOf(req);
    const write = !["GET", "HEAD", "OPTIONS"].includes(req.method || "GET");
    const result = await backend.run(write, async (store) => {
      const app = await buildApp({
        store,
        serveClient: false,
        logger: false,
        backgroundNotifications: false,
      });
      try {
        const headers = { ...req.headers };
        delete headers["content-length"];
        const response = await app.inject({
          method: (req.method || "GET") as "GET" | "POST",
          url: route,
          headers,
          payload,
        });
        if (write) await flushNotifications(store, 15000);
        return {
          status: response.statusCode,
          headers: response.headers,
          body: response.rawPayload,
        };
      } finally {
        await app.close();
      }
    });
    res.statusCode = result.status;
    res.setHeader("Cache-Control", "no-store");
    for (const [name, value] of Object.entries(result.headers))
      if (
        value !== undefined &&
        !["connection", "content-length", "transfer-encoding"].includes(
          name.toLowerCase(),
        )
      )
        res.setHeader(name, value);
    res.end(result.body);
  } catch (error) {
    console.error("Cloud request failed", {
      name: error instanceof Error ? error.name : "Error",
      message:
        error instanceof Error
          ? error.message.replace(
              /(?:postgres(?:ql)?|https?):\/\/[^\s]+/g,
              "[redacted URL]",
            )
          : "unknown",
    });
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Сервис временно недоступен. Повторите запрос.",
        },
      }),
    );
  }
}
export default async function handler(
  req: FunctionRequest,
  res: ServerResponse,
) {
  try {
    await handleCloudRequest(req, res, cloudBackend());
  } catch {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: {
          code: "DATABASE_NOT_CONFIGURED",
          message: "Сервис временно недоступен.",
        },
      }),
    );
  }
}
