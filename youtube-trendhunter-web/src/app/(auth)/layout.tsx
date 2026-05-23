import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-dark-canvas text-dark-ink">
      <div className="relative z-10 flex flex-col min-h-screen">{children}</div>
    </div>
  );
}
