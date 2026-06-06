import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getUserPlan } from "@/lib/plan-check"
import { ManageSubscriptionButton } from "@/components/dashboard/manage-subscription-button"
import { GenerateTokenButton } from "@/components/dashboard/generate-token-button"

export default async function BillingPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const plan = await getUserPlan(session.user.id)

  const apiToken = await prisma.apiToken.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Facturation</h1>

      <div className="p-6 border rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Plan actuel</p>
            <p className="text-xl font-semibold capitalize">{plan.toLowerCase()}</p>
          </div>
          {plan !== "FREE" && <ManageSubscriptionButton />}
          {plan === "FREE" && (
            <a href="/pricing" className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium">
              Passer Pro
            </a>
          )}
        </div>
      </div>

      <div className="p-6 border rounded-2xl">
        <h2 className="font-semibold mb-1">Token API — Extension Chrome</h2>
        <p className="text-sm text-gray-500 mb-4">
          Utilisez ce token pour connecter l&apos;extension TrendHunter à votre compte.
        </p>
        {apiToken && (
          <div className="mb-3 flex items-center gap-2">
            <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono text-gray-800 truncate">
              {apiToken.token}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(apiToken.token)}
              className="px-3 py-2 border rounded text-sm"
            >
              Copier
            </button>
          </div>
        )}
        <GenerateTokenButton />
      </div>
    </div>
  )
}