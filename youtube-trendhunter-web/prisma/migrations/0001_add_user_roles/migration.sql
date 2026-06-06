-- Create UserRole table for multi-role support
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- Backfill: create UserRole records from existing User.role values
INSERT INTO "UserRole" ("id", "userId", "role")
SELECT gen_random_uuid()::text, "id", "role"
FROM "User";

-- Create unique constraint: one role per user
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- Create index on userId for fast lookups
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- Add foreign key constraint
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
