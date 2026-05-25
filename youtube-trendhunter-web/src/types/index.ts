import type { SubscriptionPlan } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: SubscriptionPlan;
    } & DefaultSession["user"];
  }
}
