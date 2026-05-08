import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Target } from "lucide-react"

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Niches</h1>
        <p className="text-dark-ink-secondary mt-1">Suivez les niches qui vous intéressent</p>
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-medium text-dark-ink-secondary mb-4">
          Vos niches ({userNiches.length})
        </h2>
        <div className="space-y-3">
          {userNiches.map(({ niche }) => (
            <Card key={niche.id} className="rounded-none">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <h3 className="font-medium text-dark-ink">{niche.name}</h3>
                  <p className="text-sm text-dark-ink-secondary">{niche.keywords?.join(", ")}</p>
                </div>
                <Badge variant="members">SUIVI</Badge>
              </CardContent>
            </Card>
          ))}

          {userNiches.length === 0 && (
            <Card className="rounded-none">
              <CardContent className="py-8 text-center text-dark-ink-secondary">
                <Target className="w-8 h-8 mx-auto mb-2 text-dark-ink-tertiary" />
                <p>Vous ne suivez aucune niche pour le moment</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-dark-ink-secondary mb-4">
          Niches disponibles ({allNiches.length})
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {allNiches.map((niche) => {
            const isFollowed = niche.userNiches.length > 0
            return (
              <Card key={niche.id} className="rounded-none">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <h3 className="font-medium text-dark-ink">{niche.name}</h3>
                    <p className="text-sm text-dark-ink-secondary">
                      {niche._count.trends} tendances
                    </p>
                  </div>
                  {isFollowed ? (
                    <Badge variant="members">SUIVI</Badge>
                  ) : (
                    <Button variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      Suivre
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}