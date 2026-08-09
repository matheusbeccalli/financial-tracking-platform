import type { ReactNode } from "react";

import type { Tone } from "../lib/tone";

/** Rótulo de estado (aporte, resgate, previsto). Tracejado = previsto, não realizado. */
export default function Pill({
  children,
  tone,
  dashed = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dashed?: boolean;
}) {
  const classes = ["pill"];
  if (dashed) classes.push("dashed");
  if (tone) classes.push(`tone-${tone}`);
  return <span className={classes.join(" ")}>{children}</span>;
}
