import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPlan, PLAN_LIMITS } from "@/lib/services/subscription.service";
import { auditLog } from "@/lib/audit-log";
import { z } from "@/lib/schemas";
import { getCached, setCached } from "@/lib/redis";
import { withRateLimit } from "@/lib/rate-limit";
import {
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  InternalError,
} from "@/lib/api-error";
import {
  getUserNichesPaginated,
  getAllFollowedNicheIds,
  getAllActiveNiches,
  countUserNiches,
  isFollowingNiche,
  getNicheById,
  followNiche,
} from "@/lib/services/niche.service";

const nicheFollowSchema = z.object({
  nicheId: z.string().min(1, "ID de niche requis"),
});

export async function GET(req: NextRequest) {
  const rateLimitResponse = await withRateLimit(req, "general");
  if (rateLimitResponse) return rateLimitResponse;

  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  try {
    // Parse pagination params
    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(1, parseInt(limitParam || "20", 10) || 20), 100);

    // Get user's followed niches with trend counts (paginated)
    const { userNiches: paginatedNiches, nextCursor } = await getUserNichesPaginated(
      session.user.id,
      { limit, cursor },
    );

    // Get all followed IDs (complete list, not paginated)
    const allFollowed = await getAllFollowedNicheIds(session.user.id);

    // Get all available niches (public/static — cache for 10 min)
    const cacheKey = "niches:public";
    let availableNiches = await getCached<{ id: string; name: string; slug: string }[]>(cacheKey);
    if (!availableNiches) {
      availableNiches = await getAllActiveNiches();
      await setCached(cacheKey, availableNiches, 600);
    }

    return NextResponse.json({
      niches: paginatedNiches,
      followed: allFollowed,
      available: availableNiches,
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching niches:", error);
    return InternalError();
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return UnauthorizedError();
  }

  try {
    // Validate body
    const body = await req.json();
    const parsed = nicheFollowSchema.safeParse(body);
    if (!parsed.success) {
      return ValidationError(parsed.error.issues[0].message);
    }

    const { nicheId } = parsed.data;

    // Check plan limits
    const plan = await getUserPlan(session.user.id);
    const limits = PLAN_LIMITS[plan];

    const currentCount = await countUserNiches(session.user.id);

    // FREE plan: max 1 niche
    if (plan === "FREE" && currentCount >= 1) {
      return ForbiddenError(
        "Limite du plan FREE atteinte (1 niche). Passez à Pro pour suivre des niches illimitées.",
      );
    }

    // Check if already following
    const alreadyFollowing = await isFollowingNiche(session.user.id, nicheId);
    if (alreadyFollowing) {
      return ValidationError("Vous suive déjà cette niche");
    }

    // Verify niche exists
    const niche = await getNicheById(nicheId);

    if (!niche) {
      return NotFoundError("Niche");
    }

    // Create UserNiche
    const userNiche = await followNiche(session.user.id, nicheId);

    // Audit log
    await auditLog("niche_select", session.user.id, {
      niche: niche.slug,
      nicheName: niche.name,
      plan,
    });

    return NextResponse.json({ userNiche }, { status: 201 });
  } catch (error) {
    console.error("Error following niche:", error);
    return InternalError();
  }
}
