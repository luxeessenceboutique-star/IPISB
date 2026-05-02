import { useI18n } from "@/lib/i18n";

export function LangSwitcher() {
  const { lang, setLang } = useI18n();

  return (
    <div className="flex items-center rounded-full border border-border bg-muted/50 p-0.5 text-xs font-medium">
      <button
        onClick={() => setLang("fr")}
        className={`rounded-full px-2.5 py-1 transition-all ${
          lang === "fr"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        FR
      </button>
      <button
        onClick={() => setLang("en")}
        className={`rounded-full px-2.5 py-1 transition-all ${
          lang === "en"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
    </div>
  );
}
