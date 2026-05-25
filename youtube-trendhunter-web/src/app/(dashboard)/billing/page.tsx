import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPlan } from "@/lib/plan-check";
import { ManageSubscriptionButton } from "@/components/dashboard/manage-subscription-button";
import { GenerateTokenButton } from "@/components/dashboard/generate-token-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const plan = await getUserPlan(session.user.id);

  const apiToken = await prisma.apiToken.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Facturation</h1>

      <Card className="rounded-none">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-dark-ink-secondary">Plan actuel</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xl font-bold capitalize">{plan.toLowerCase()}</p>
                <Badge variant={plan === "FREE" ? "plan-free" : "plan-pro"}>{plan}</Badge>
              </div>
            </div>
            {plan !== "FREE" && <ManageSubscriptionButton />}
            {plan === "FREE" && (
              <Button variant="subscribe" asChild>
                <a href="/pricing">Passer Pro</a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-none">
        <CardHeader>
          <CardTitle>Token API — Extension Chrome</CardTitle>
          <CardDescription>
            Utilisez ce token pour connecter l'extension TrendHunter à votre compte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {apiToken && (
            <div className="mb-4">
              <p className="text-sm text-dark-ink-secondary mb-2">
                Dernier token créé le{" "}
                {apiToken.createdAt.toLocaleDateString("fr-FR")}.
                Le token complet est affiché uniquement lors de la création.
              </p>
            </div>
          )}
          <GenerateTokenButton />
        </CardContent>
      </Card>
    </div>
  );
}
