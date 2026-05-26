import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const niches = await prisma.niche.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          trends: {
            where: { expiresAt: { gt: new Date() } },
          },
        },
      },
    },
  });

  return NextResponse.json({ niches });
}

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, slug, description, keywords, language, isActive } = body;

  const niche = await prisma.niche.create({
    data: {
      name,
      slug,
      description,
      keywords,
      language: language || "fr",
      isActive: isActive ?? true,
    },
  });

  return NextResponse.json({ niche });
}
