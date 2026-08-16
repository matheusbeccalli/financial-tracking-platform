import { useAccounts } from "../api/hooks";
import ClassifyCard from "../components/imports/ClassifyCard";
import HistoryCard from "../components/imports/HistoryCard";
import SyncCard from "../components/imports/SyncCard";
import UploadCard from "../components/imports/UploadCard";
import PageHeader from "../components/PageHeader";

export default function Imports() {
  const { data: accounts } = useAccounts();

  return (
    <div className="imports-page">
      <PageHeader eyebrow="Importar" title="Extratos" />
      <SyncCard />
      <section className="imp-grid">
        <UploadCard accounts={accounts ?? []} />
        <ClassifyCard />
      </section>
      <HistoryCard />
    </div>
  );
}
