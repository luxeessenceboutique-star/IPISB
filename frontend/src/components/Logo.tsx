import emblem from "@/assets/ipisb-emblem.png";
import emblemWhite from "@/assets/ipisb-emblem-white.png";

interface LogoProps {
  size?: number;
  mono?: boolean;
  onDark?: boolean;
  className?: string;
}

// Emblème officiel de l'IPISB (mains, caducée, livre) — extrait du logo de
// l'institut. `mono` + `onDark` → version blanche pour les fonds sombres.
// Le ratio de l'emblème est ~1.24:1 : `size` fixe la hauteur.
export function Logo({ size = 120, mono = false, onDark = false, className = "" }: LogoProps) {
  const src = mono && onDark ? emblemWhite : emblem;
  return (
    <img
      src={src}
      alt="IPISB"
      className={className}
      style={{ height: size, width: "auto", display: "block", flexShrink: 0 }}
      draggable={false}
    />
  );
}
