import { NextRequest, NextResponse } from "next/server";
import { processAllNiches, collectAndScoreTrends } from "@/lib/trend-pipeline";
import { prisma } from "@/lib/prisma";
import { trendsRefreshSchema } from "@/lib/schemas";

export async function POST(req: NextRequest) {
  // Auth via Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = trendsRefreshSchema.safeParse(body);

    if (parsed.success && parsed.data.nicheSlug) {
      const niche = await prisma.niche.findUnique({ where: { slug: parsed.data.nicheSlug } });
      if (!niche) return NextResponse.json({ error: "Niche introuvable" }, { status: 404 });
      const created = await collectAndScoreTrends(niche);
      return NextResponse.json({ niche: niche.slug, trendsCreated: created });
    }

    const results = await processAllNiches();
    const total = Object.values(results).reduce((a, b) => a + b, 0);
    return NextResponse.json({ results, totalTrendsCreated: total });
  } catch (err) {
    console.error("Refresh failed:", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
