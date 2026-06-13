import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  const token = await prisma.apiToken.create({
    data: {
      userId: session.user.id,
      token: randomUUID(),
      name: "Extension Chrome",
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
  })

  return NextResponse.json({ token: token.token })
}