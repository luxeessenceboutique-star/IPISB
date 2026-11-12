/**
 * Diagnostic des erreurs de micro / caméra, partagé par le Copilote (appel,
 * message vocal) et la Salle de conférence : un message qui dit QUOI faire
 * plutôt qu'un « micro inaccessible » générique.
 */

/** Le navigateur n'expose le micro qu'en HTTPS ou sur localhost. */
export function mediaAvailable(): { ok: true } | { ok: false; reason: string } {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return { ok: false, reason: "Le micro et la caméra ne fonctionnent qu'en HTTPS (ou sur localhost). Ouvrez la plateforme avec une adresse https://." };
  }
  // Bloqué par l'en-tête Permissions-Policy du site : aucune autorisation
  // utilisateur n'y peut rien, il faut corriger la configuration.
  const fp = (document as unknown as { featurePolicy?: { allowsFeature: (f: string) => boolean } }).featurePolicy;
  if (fp && !fp.allowsFeature("microphone")) {
    return { ok: false, reason: "Le micro est bloqué par la configuration du site (en-tête Permissions-Policy). Redéployez le frontend avec le dernier vercel.json, puis rechargez avec Ctrl+F5." };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "Ce navigateur ne permet pas d'utiliser le micro. Utilisez Chrome, Edge ou Firefox à jour." };
  }
  return { ok: true };
}

export function describeMediaError(err: unknown, what: "micro" | "caméra et micro" = "micro"): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : String(err ?? "");
  const msg = err instanceof Error ? err.message : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    const pre = mediaAvailable(); // refus dû à la configuration du site ?
    if (!pre.ok) return pre.reason;
  }
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return /policy|permissions policy/i.test(msg)
        ? `Le ${what} est bloqué par la configuration du site (Permissions-Policy). Redéployez le frontend avec le dernier vercel.json.`
        : `Accès au ${what} refusé. Cliquez sur l'icône 🔒 à gauche de l'adresse, autorisez « ${what === "micro" ? "Micro" : "Caméra et Micro"} », puis rechargez la page.`;
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return `Aucun ${what} détecté. Branchez un ${what === "micro" ? "micro ou un casque" : "périphérique"} puis réessayez.`;
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return `Le ${what} est déjà utilisé par une autre application (Teams, Zoom, une autre réunion…). Fermez-la puis réessayez.`;
    default: {
      const pre = mediaAvailable();
      if (!pre.ok) return pre.reason;
      return `Impossible d'accéder au ${what}${name ? ` (${name})` : ""}.`;
    }
  }
}
