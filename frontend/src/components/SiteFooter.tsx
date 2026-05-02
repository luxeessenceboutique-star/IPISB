import { Logo } from "@/components/Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Logo size={24} />
          <span>IPISBE Connect</span>
        </div>
        <p>Institut Privé d'Innovation en Santé et Bien-être</p>
        <p>© {new Date().getFullYear()} IPISBE. Tous droits réservés.</p>
      </div>
    </footer>
  );
}
