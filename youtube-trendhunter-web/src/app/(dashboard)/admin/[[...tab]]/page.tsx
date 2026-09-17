import { UsersTab } from "@/components/admin/users-tab";
import { RevenueTab } from "@/components/admin/revenue-tab";
import { LogsTab } from "@/components/admin/logs-tab";
import { NichesTab } from "@/components/admin/niches-tab";
import { OverviewTab } from "@/components/admin/overview-tab";
import MonitoringTab from "@/components/admin/monitoring-tab";
import { PlansTab } from "@/components/admin/plans-tab";
import { FeaturesTab } from "@/components/admin/features-tab";
import { OverridesTab } from "@/components/admin/overrides-tab";
import { OrgsTab } from "@/components/admin/orgs-tab";

interface TabProps {
  params: Promise<{ tab?: string[] }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function AdminPage({ params, searchParams }: TabProps) {
  const { tab } = await params;
  const sp = await searchParams;
  const queryTab = typeof sp.tab === "string" ? sp.tab : undefined;
  const currentTab = tab?.[0] || queryTab || "overview";

  return (
    <div>
      {currentTab === "overview" && <OverviewTab />}
      {currentTab === "users" && <UsersTab />}
      {currentTab === "revenue" && <RevenueTab />}
      {currentTab === "logs" && <LogsTab />}
      {currentTab === "niches" && <NichesTab />}
      {currentTab === "plans" && <PlansTab />}
      {currentTab === "features" && <FeaturesTab />}
      {currentTab === "overrides" && <OverridesTab />}
      {currentTab === "orgs" && <OrgsTab />}
      {currentTab === "monitoring" && <MonitoringTab />}
    </div>
  );
}
