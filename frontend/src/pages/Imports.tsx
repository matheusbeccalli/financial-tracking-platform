import { useAccounts } from "../api/hooks";
import ClassifyCard from "../components/imports/ClassifyCard";
import HistoryCard from "../components/imports/HistoryCard";
import UploadCard from "../components/imports/UploadCard";
import PageHeader from "../components/PageHeader";

export default function Imports() {
  const { data: accounts } = useAccounts();

  return (
    <div className="imports-page">
      <PageHeader eyebrow="Importar" title="Extratos" />
      <section className="imp-grid">
        <UploadCard accounts={accounts ?? []} />
        <ClassifyCard />
      </section>
      <HistoryCard />
    </div>
  );
}
