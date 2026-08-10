import { useEffect, useState } from "react";

import { parseBRL } from "../lib/money";

export default function BudgetInput({
  cents,
  onSave,
  width = 110,
  ariaLabel,
  className,
}: {
  cents: number;
  onSave: (c: number) => void;
  width?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const toText = (c: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
  const [text, setText] = useState(toText(cents));
  useEffect(() => setText(toText(cents)), [cents]);
  const commit = () => {
    const parsed = text.trim() === "" ? 0 : parseBRL(text);
    if (parsed !== null && parsed >= 0 && parsed !== cents) onSave(parsed);
  };
  return (
    <input
      className={className}
      aria-label={ariaLabel}
      style={{ width, textAlign: "right" }}
      value={text}
      placeholder="0,00"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
