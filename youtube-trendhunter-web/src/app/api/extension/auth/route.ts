import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { extensionAuthSchema } from "@/lib/schemas";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = extensionAuthSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const token = await prisma.apiToken.create({
    data: {
      userId: session.user.id,
      token: randomUUID(),
      name: parsed.data.name ?? "Extension Chrome",
    },
  });

  return NextResponse.json({ token: token.token, id: token.id, name: token.name });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const tokens = await prisma.apiToken.findMany({
    where: { userId: session.user.id },
    select: { id: true, name: true, lastUsedAt: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tokens });
}
