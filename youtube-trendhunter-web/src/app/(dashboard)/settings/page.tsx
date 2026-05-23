import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsContent } from "@/components/dashboard/settings-content";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="text-dark-ink-secondary mt-1">Gérez votre compte et vos données</p>
      </div>

      <SettingsContent user={session.user} />
    </div>
  );
}
