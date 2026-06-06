import type { SubscriptionPlan, Role } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      plan: SubscriptionPlan;
      userRoles: Role[];
    } & DefaultSession["user"];
  }
}
