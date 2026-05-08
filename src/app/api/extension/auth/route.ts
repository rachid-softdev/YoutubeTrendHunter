import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { randomUUID } from "crypto"

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 })
  }

  await prisma.apiToken.deleteMany({
    where: { userId: session.user.id },
  })

  const token = await prisma.apiToken.create({
    data: {
      userId: session.user.id,
      token: randomUUID(),
      name: "Extension Chrome",
    },
  })

  return NextResponse.json({ token: token.token })
}