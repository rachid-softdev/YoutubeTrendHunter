import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { SubscriptionPlan } from "@prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        const [dbUser, subscription, userRoles] = await Promise.all([
          prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          }),
          prisma.subscription.findUnique({
            where: { userId: user.id },
          }),
          prisma.userRole.findMany({
            where: { userId: user.id },
            select: { role: true },
          }),
        ]);
        session.user.role = dbUser?.role ?? "USER";
        session.user.plan = subscription?.plan ?? "FREE";
        session.user.userRoles = userRoles.map((ur) => ur.role);
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
