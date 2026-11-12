import { supabase } from "@/integrations/supabase/client";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:9000";

export type CopilotLang = "fr" | "ar" | "en" | "darija";

export const SPEECH_LANG: Record<CopilotLang, string> = { darija: "ar-MA", fr: "fr-FR", en: "en-US", ar: "ar-SA" };

export async function copilotHeaders(json = true): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

/** Envoie un message au Copilote et appelle `onEvent` pour chaque événement
 *  SSE (conversation, agent, step, text, done…). Renvoie le texte complet. */
export async function streamCopilot(
  body: Record<string, unknown>,
  onEvent: (ev: Record<string, any>) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${API}/api/copilot/stream`, {
    method: "POST", headers: await copilotHeaders(), body: JSON.stringify(body), signal,
  });
  if (!res.ok || !res.body) {
    let detail = "";
    try { const j = await res.json(); detail = typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail ?? j); } catch { /* corps non JSON */ }
    throw new Error(`HTTP ${res.status}${detail ? ` — ${detail}` : ""}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") { await reader.cancel().catch(() => {}); return full; }
      let ev: Record<string, any>;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.reset) full = "";
      if (typeof ev.text === "string") full += ev.text;
      onEvent(ev);
    }
  }
  return full;
}

export async function transcribeAudio(blob: Blob, lang: CopilotLang): Promise<string> {
  const fd = new FormData();
  fd.append("audio", blob, `voice.${blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm"}`);
  fd.append("language", lang);
  const res = await fetch(`${API}/api/copilot/transcribe`, { method: "POST", headers: await copilotHeaders(false), body: fd });
  if (!res.ok) throw new Error(`transcription ${res.status}`);
  return ((await res.json()).text ?? "").trim();
}

export async function synthesizeSpeech(text: string, lang: CopilotLang): Promise<Blob> {
  const res = await fetch(`${API}/api/copilot/speech`, {
    method: "POST", headers: await copilotHeaders(), body: JSON.stringify({ text, language: lang }),
  });
  if (!res.ok) throw new Error(`speech ${res.status}`);
  return res.blob();
}
