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

// Le backend renvoie 401 « Invalid or expired token » quand l'access token
// Supabase a expiré (onglet resté ouvert longtemps → le refresh auto n'a pas
// tourné). On force alors un refresh puis on rejoue la requête une fois. Si le
// refresh token est lui-même mort, la session est finie → retour à /auth.
async function refreshSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    await supabase.auth.signOut();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
      window.location.href = "/auth";
    }
    return false;
  }
  return true;
}

async function request(method: string, path: string, body?: unknown) {
  const doFetch = async () =>
    fetch(`${BASE}${path}`, {
      method,
      headers: await getHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) {
    res = await doFetch();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : null;
}

// Télécharge un fichier binaire (PDF/CSV) depuis un endpoint protégé.
// window.open() ne transmet pas le header Authorization → il faut fetch()
// avec le token puis déclencher le download via un blob.
async function download(path: string, filename: string) {
  const doFetch = async () => fetch(`${BASE}${path}`, { headers: await getHeaders() });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) {
    res = await doFetch();
  }
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

async function uploadFile(path: string, formData: FormData) {
  const headers = await getHeaders();
  delete headers["Content-Type"];
  const doFetch = async () => fetch(`${BASE}${path}`, { method: "POST", headers, body: formData });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) {
    res = await doFetch();
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  return ct.includes("application/json") ? res.json() : null;
}

export const api = {
  get: (path: string) => request("GET", path),
  post: (path: string, body: unknown) => request("POST", path, body),
  put: (path: string, body?: unknown) => request("PUT", path, body),
  patch: (path: string, body?: unknown) => request("PATCH", path, body),
  delete: (path: string) => request("DELETE", path),
  download,
  uploadFile,
};
