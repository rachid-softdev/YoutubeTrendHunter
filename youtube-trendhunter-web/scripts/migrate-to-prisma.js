#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("🚀 Starting migration from Supabase to Prisma...\n");

const filesToUpdate = [
  "src/app/api/generate-plan/route.ts",
  "src/app/api/email-change/route.ts",
  "src/app/api/email-change/confirm/route.ts",
  "src/app/api/email-change/cancel/route.ts",
  "src/app/api/stripe/checkout/route.ts",
  "src/app/api/stripe/webhook/route.ts",
  "src/components/dashboard/DashboardView.tsx",
  "src/components/feedback/FeedbackForm.tsx",
  "src/components/historique/HistoriqueView.tsx",
  "src/components/layout/Sidebar.tsx",
  "src/components/onboarding/OnboardingForm.tsx",
  "src/components/plan/PlanDisplay.tsx",
  "src/components/settings/SettingsView.tsx",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/page.tsx",
  "src/app/admin/analytics/page.tsx",
  "src/app/admin/feedback/page.tsx",
  "src/app/admin/layout.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/subscriptions/page.tsx",
  "src/app/admin/users/page.tsx",
  "src/app/page.tsx",
];

const replacements = [
  {
    from: /import.*createServerClient.*from\s+['"]@supabase\/ssr['"]/g,
    to: "import { getServerSession } from 'next-auth'\nimport { authOptions } from '@/lib/auth/config'",
  },
  {
    from: /import.*createClient.*from\s+['"]@\/lib\/supabase\/client['"]/g,
    to: "import { useSession } from 'next-auth/react'",
  },
  {
    from: /import.*supabase.*from\s+['"]@\/lib\/supabase\/[^'"]*['"]/g,
    to: "// Supabase imports removed",
  },
  {
    from: /const\s+cookieStore\s*=\s*await\s+cookies\(\)\s*\n\s*const\s+supabase\s*=\s*createServerClient\([^)]+\)\s*\n\s*const\s*{\s*data:\s*{\s*user\s*},\s*error\s*}\s*=\s*await\s+supabase\.auth\.getUser\(\)/g,
    to: "const session = await getServerSession(authOptions)\nconst userId = session?.user?.id",
  },
  {
    from: /const\s+{\s*data:\s*{\s*session\s*},\s*error\s*}\s*=\s*await\s+supabase\.auth\.getSession\(\)/g,
    to: "const session = await getServerSession(authOptions)",
  },
  {
    from: /const\s+supabase\s*=\s*createClient\(\)/g,
    to: "const { data: session } = useSession()",
  },
  {
    from: /session\.user\.id/g,
    to: "session?.user?.id",
  },
  {
    from: /user\.id/g,
    to: "userId",
  },
  {
    from: /if\s*\(\s*error\s*\|\|\s*!user\s*\)/g,
    to: "if (!session?.user?.id)",
  },
  {
    from: /if\s*\(\s*!session\s*\)/g,
    to: "if (!session)",
  },
  {
    from: /await\s+supabase\.from\(['"]([^'"]+)['"]\)\.select\([^)]*\)\.eq\(['"]([^'"]+)['"],\s*([^)]+)\)\.single\(\)/g,
    to: "await db.$1.findUnique({ where: { $2: $3 } })",
  },
  {
    from: /await\s+supabase\.from\(['"]([^'"]+)['"]\)\.select\([^)]*\)\.eq\(['"]([^'"]+)['"],\s*([^)]+)\)/g,
    to: "await db.$1.findMany({ where: { $2: $3 } })",
  },
  {
    from: /await\s+supabase\.from\(['"]([^'"]+)['"]\)\.insert\([^)]+\)\.select\([^)]*\)\.single\(\)/g,
    to: "await db.$1.create({ data: $1, include: { /* include fields */ } })",
  },
  {
    from: /await\s+supabase\.from\(['"]([^'"]+)['"]\)\.update\([^)]+\)\.eq\(['"]([^'"]+)['"],\s*([^)]+)\)/g,
    to: "await db.$1.update({ where: { $2: $3 }, data: $1 })",
  },
];

function replaceInFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, "utf8");
    let modified = false;

    replacements.forEach(({ from, to }) => {
      const originalContent = content;
      content = content.replace(from, to);
      if (content !== originalContent) {
        modified = true;
        console.log(`  Updated: ${filePath}`);
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content, "utf8");
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

filesToUpdate.forEach((filePath) => {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    replaceInFile(fullPath);
  } else {
    console.log(`  File not found: ${filePath}`);
  }
});

console.log("\n✅ Migration completed!");
console.log("\nNext steps:");
console.log("1. Review and fix any remaining Supabase references");
console.log("2. Update database queries to use Prisma syntax");
console.log("3. Test the application");
console.log("4. Run: npm install to install new dependencies");
