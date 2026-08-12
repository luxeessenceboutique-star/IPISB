import { supabase } from "@/integrations/supabase/client";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

async function getHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: await getHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    // FastAPI's HTTPException always returns a JSON body ({"detail": "..."}),
    // so `text` is virtually never empty — callers that used to check
    // e.message.includes("403") never actually matched. Carry the real
    // status code instead so 403/404/etc. can be detected reliably.
    const text = await res.text();
    throw new ApiError(text || `HTTP ${res.status}`, res.status);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : null;
}

// Télécharge un fichier binaire (PDF/CSV) depuis un endpoint protégé.
// window.open() ne transmet pas le header Authorization → il faut fetch()
// avec le token puis déclencher le download via un blob.
async function download(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`, { headers: await getHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, body: unknown) => request("POST", path, body),
  put: (path: string, body?: unknown) => request("PUT", path, body),
  patch: (path: string, body?: unknown) => request("PATCH", path, body),
  delete: (path: string) => request("DELETE", path),
  download,
};
