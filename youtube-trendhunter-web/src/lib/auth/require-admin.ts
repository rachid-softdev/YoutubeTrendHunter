import { auth } from "@/lib/auth";

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

  if ((session.user as any).role !== "ADMIN") {
    throw new AuthError("Accès non autorisé - rôle administrateur requis", 403);
  }

  return {
    id: session.user.id,
    email: session.user.email ?? "",
  };
}
