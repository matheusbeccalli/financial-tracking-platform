import { useEffect, useRef, useState } from "react";

/**
 * Texto editável inline: parece texto parado, mas é um input — hover revela,
 * foco abre a edição, blur/Enter gravam. Vazio volta ao valor original.
 */
export default function InlineText({
  value,
  onSave,
  ariaLabel,
}: {
  value: string;
  onSave: (v: string) => void;
  ariaLabel: string;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Refetch no meio da edição não pode apagar o que está sendo digitado.
    if (document.activeElement !== ref.current) setText(value);
  }, [value]);
  return (
    <input
      ref={ref}
      className="inline-text"
      value={text}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim();
        if (t && t !== value) onSave(t);
        else setText(value);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
