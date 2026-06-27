import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new AuthError("Non authentifié", 401);
  }

  // Dual role check: direct User.role field OR UserRole model
  const userRecord = session.user as {
    role?: string;
    userRoles?: Array<{ role: string }> | string[];
  };
  const isAdmin =
    userRecord.role === "ADMIN" ||
    (Array.isArray(userRecord.userRoles) &&
      userRecord.userRoles.some((r: string | { role: string }) => {
        if (typeof r === "string") return r === "ADMIN";
        return r.role === "ADMIN";
      }));

  if (!isAdmin) {
    // Fallback: query database directly (in case session hasn't been refreshed)
    const dbRole = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    const dbUserRoles = await prisma.userRole.findMany({
      where: { userId: session.user.id, role: "ADMIN" },
    });

    if (dbRole?.role !== "ADMIN" && dbUserRoles.length === 0) {
      throw new AuthError("Accès non autorisé - rôle administrateur requis", 403);
    }
  }

  return {
    id: session.user.id,
    email: session.user.email ?? "",
  };
}
