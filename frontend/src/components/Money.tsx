import { formatSigned } from "../lib/money";
import type { Tone } from "../lib/tone";

/**
 * Valor monetário em mono. Três ausências distintas, conforme o design:
 * zero vira "—", dado inexistente vira "n/d" itálico, e o resto é valor.
 */
export default function Money({
  cents,
  tone,
  alwaysSign = false,
  zeroDash = false,
  nd = false,
  className,
}: {
  cents: number;
  tone?: Tone;
  alwaysSign?: boolean;
  zeroDash?: boolean;
  nd?: boolean;
  className?: string;
}) {
  const classes = ["money"];
  if (className) classes.push(className);
  if (nd) return <span className={[...classes, "is-nd"].join(" ")}>n/d</span>;
  if (zeroDash && cents === 0)
    return <span className={[...classes, "is-zero"].join(" ")}>—</span>;
  if (tone) classes.push(`tone-${tone}`);
  return <span className={classes.join(" ")}>{formatSigned(cents, alwaysSign)}</span>;
}
