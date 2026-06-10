import type { Role, SubscriptionPlan, UserRole } from "@prisma/client";

declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
      plan: SubscriptionPlan;
      userRoles: UserRole[];
    };
  }
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
      plan: SubscriptionPlan;
      userRoles: UserRole[];
    };
  }
}
