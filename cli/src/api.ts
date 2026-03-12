import { getApiBase, getToken } from "./config.js";

export async function api(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const base = getApiBase();
  const token = getToken();
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (res.status === 401) {
    console.error(JSON.stringify({ error: "Unauthorized — run: frozen login -u <user> -p <pass>" }));
    process.exit(1);
  }

  return { status: res.status, data };
}

export function output(data: unknown, opts?: { table?: boolean; quiet?: boolean }) {
  if (opts?.quiet) {
    if (Array.isArray(data)) {
      for (const item of data) console.log((item as any).id ?? "");
    } else {
      console.log((data as any).id ?? "");
    }
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}
