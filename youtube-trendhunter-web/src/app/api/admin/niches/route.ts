import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  try {
    await requireAdmin();

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
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Admin/Niches] GET Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

// Validation schema for niche creation
const nicheCreateSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100),
  slug: z
    .string()
    .min(1, "Le slug est requis")
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug invalide"),
  description: z.string().max(500).optional(),
  keywords: z.array(z.string()).optional(),
  language: z.string().length(2).optional(),
  isActive: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const body = await req.json();

    // Validate input
    const parsed = nicheCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { name, slug, description, keywords, language, isActive } = parsed.data;

    // Check for duplicate slug
    const existing = await prisma.niche.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: "Ce slug existe déjà" }, { status: 409 });
    }

    const niche = await prisma.niche.create({
      data: {
        name,
        slug,
        description,
        keywords: keywords || [],
        language: language || "fr",
        isActive: isActive ?? true,
      },
    });

    return NextResponse.json({ niche }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Admin/Niches] POST Error:", error);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
