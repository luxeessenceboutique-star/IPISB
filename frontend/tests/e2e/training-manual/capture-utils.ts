import fs from "node:fs";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const OUT_ROOT = path.resolve(__dirname, "output/raw");

export type Target = { label: string; locator: Locator };
type Annotation = { number: number; label: string; box: { x: number; y: number; width: number; height: number } };
type TabAnnotations = Record<string, Annotation[]>;

const stepCounters: Record<string, number> = {};

function tabDir(tabKey: string): string {
  const dir = path.join(OUT_ROOT, tabKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readSidecar(dir: string): TabAnnotations {
  const file = path.join(dir, "annotations.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeSidecar(dir: string, data: TabAnnotations): void {
  fs.writeFileSync(path.join(dir, "annotations.json"), JSON.stringify(data, null, 2), "utf-8");
}

/** Prend un screenshot pleine page pour l'onglet/état donné, et enregistre les
 * boundingBox() des cibles "cliquez ici" dans le annotations.json du dossier —
 * capturé maintenant car il devient invalide dès que la page bouge. */
export async function captureStep(
  page: Page,
  tabKey: string,
  stateLabel: string,
  targets: Target[] = [],
): Promise<string> {
  const dir = tabDir(tabKey);
  const n = (stepCounters[tabKey] = (stepCounters[tabKey] ?? 0) + 1);
  const filename = `${String(n).padStart(2, "0")}-${stateLabel}.png`;

  // Les modals ont leur propre défilement interne (maxHeight + overflowY) —
  // une cible plus bas dans un long formulaire peut être hors champ tant
  // qu'on ne l'y a pas explicitement amenée. On cadre sur la DERNIÈRE cible
  // (généralement le bouton d'action, le plus important à voir).
  if (targets.length > 0) {
    await targets[targets.length - 1].locator.scrollIntoViewIfNeeded();
  }
  await page.screenshot({ path: path.join(dir, filename) });

  const annotations: Annotation[] = [];
  for (let i = 0; i < targets.length; i++) {
    const box = await targets[i].locator.boundingBox();
    if (box) annotations.push({ number: i + 1, label: targets[i].label, box });
  }
  const sidecar = readSidecar(dir);
  sidecar[filename] = annotations;
  writeSidecar(dir, sidecar);
  return filename;
}

/** Le panneau de modal ouvert le plus récemment — pattern générique commun
 * aux 19 pages (overlay .anim-fade, panneau .anim-pop), confirmé par grep. */
export function modalPanel(page: Page): Locator {
  return page.locator(".anim-pop").last();
}

export async function waitForModal(page: Page): Promise<Locator> {
  const panel = modalPanel(page);
  await panel.waitFor({ state: "visible" });
  return panel;
}

/** Convention constante dans ce module : un <label> suivi immédiatement, comme
 * simple sibling DOM (pas de for/id), de son <input>/<select>/<textarea>.
 * Aucun data-testid n'existe dans ces composants — c'est le seul repérage
 * fiable, et il reste lisible car il reflète ce qu'un utilisateur voit. */
export function fieldByLabel(scope: Locator, labelText: string): Locator {
  return scope.locator("label", { hasText: labelText }).first().locator("xpath=following-sibling::*[1]");
}
