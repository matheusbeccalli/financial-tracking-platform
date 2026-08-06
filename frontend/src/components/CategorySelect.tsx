import { useCategories } from "../api/hooks";

export default function CategorySelect({
  value,
  onChange,
  kind,
  allowEmpty,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  kind?: "entrada" | "saida";
  allowEmpty?: boolean;
}) {
  const { data: categories } = useCategories();
  const options = (categories ?? []).filter(
    (c) => !c.archived && (!kind || c.kind === kind)
  );
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      {(allowEmpty || value === null) && <option value="">— sem categoria —</option>}
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
