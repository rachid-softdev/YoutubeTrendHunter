import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"

export default async function NichesPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  const allNiches = await prisma.niche.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      userNiches: {
        where: { userId: session.user.id },
      },
      _count: {
        select: { trends: true },
      },
    },
  })

  const userNiches = await prisma.userNiche.findMany({
    where: { userId: session.user.id },
    include: { niche: true },
  })

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Niches</h1>
          <p className="text-gray-500 mt-1">Suivez les niches qui vous intéressent</p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-medium text-gray-500 mb-4">
          Vos niches ({userNiches.length})
        </h2>
        <div className="space-y-3">
          {userNiches.map(({ niche }) => (
            <div
              key={niche.id}
              className="flex items-center justify-between p-4 bg-white rounded-xl border"
            >
              <div>
                <h3 className="font-medium">{niche.name}</h3>
                <p className="text-sm text-gray-500">{niche.keywords?.join(", ")}</p>
              </div>
            </div>
          ))}

          {userNiches.length === 0 && (
            <p className="text-gray-500 text-center py-8">
              Vous ne suivez aucune niche pour le moment
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-gray-500 mb-4">
          Niches disponibles ({allNiches.length})
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {allNiches.map((niche) => {
            const isFollowed = niche.userNiches.length > 0
            return (
              <div
                key={niche.id}
                className="flex items-center justify-between p-4 bg-white rounded-xl border"
              >
                <div>
                  <h3 className="font-medium">{niche.name}</h3>
                  <p className="text-sm text-gray-500">
                    {niche._count.trends} tendances
                  </p>
                </div>
                {isFollowed ? (
                  <span className="text-sm text-green-600">Suivi</span>
                ) : (
                  <Button variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    Suivre
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}