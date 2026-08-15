import PageHeader from "../components/PageHeader";
import AccountsRail from "../components/settings/AccountsRail";
import CategoriesCard from "../components/settings/CategoriesCard";
import LlmCard from "../components/settings/LlmCard";
import RulesCard from "../components/settings/RulesCard";

export default function Settings() {
  return (
    <div className="settings-page">
      <PageHeader eyebrow="Configurações" title="Como o app classifica" />
      <LlmCard />
      <section className="set-grid">
        <CategoriesCard />
        <AccountsRail />
      </section>
      <RulesCard />
    </div>
  );
}
