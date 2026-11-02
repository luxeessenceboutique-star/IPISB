import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { useI18n } from "@/lib/i18n";
import { routeMeta, idToPath } from "@/lib/routeMeta";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  // Global Ctrl/Cmd-K shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  function go(to: string) {
    navigate({ to: to as never } as never);
    onOpenChange(false);
    setQuery("");
  }

  const pageResults = Object.entries(routeMeta)
    .filter(([, meta]) => !meta.hideFromPalette)
    .map(([id, meta]) => ({ id, path: idToPath(id).replace(/\/$/, "") || "/dashboard", label: t(meta.labelKey) }))
    .filter((p) => !p.path.includes("$"))
    .filter((p) => query.trim().length === 0 || p.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("dash.search")}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{t("dash.noResults")}</CommandEmpty>
        {pageResults.length > 0 && (
          <CommandGroup heading={t("dash.pages")}>
            {pageResults.slice(0, 10).map((p) => (
              <CommandItem key={p.id} value={`page-${p.id}`} onSelect={() => go(p.path)}>
                <Compass />
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
