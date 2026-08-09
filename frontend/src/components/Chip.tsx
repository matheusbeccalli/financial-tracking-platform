import type { ReactNode } from "react";

import type { Tone } from "../lib/tone";

/**
 * Chip clicável (filtro, categoria). Sem `onClick` vira um rótulo estático —
 * a borda só aparece no hover quando há ação.
 */
export default function Chip({
  children,
  tone,
  active = false,
  onClick,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const classes = ["chip"];
  if (active) classes.push("is-active");
  if (tone) classes.push(`tone-${tone}`);
  const className = classes.join(" ");
  if (!onClick)
    return (
      <span className={className} title={title}>
        {children}
      </span>
    );
  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      {children}
    </button>
  );
}
