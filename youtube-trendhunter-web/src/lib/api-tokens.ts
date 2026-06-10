import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { log } from "@/lib/logger";
import type { ApiToken } from "@prisma/client";

const TOKEN_PREFIX = "th_";
const TOKEN_LENGTH = 32;
const HASH_LENGTH = 8;

export interface SecureToken {
  raw: string;
  hash: string;
  formatted: string;
}

export function generateSecureToken(): SecureToken {
  const raw = randomBytes(TOKEN_LENGTH).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  const formatted = `${TOKEN_PREFIX}${raw}.${hash.slice(0, HASH_LENGTH)}`;

  return { raw, hash, formatted };
}

export function parseToken(token: string): { raw: string; hashPrefix: string } | null {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  const withoutPrefix = token.slice(TOKEN_PREFIX.length);
  const parts = withoutPrefix.split(".");

  if (parts.length !== 2) {
    return null;
  }

  return { raw: parts[0], hashPrefix: parts[1] };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function verifyToken(token: string, storedHash: string): boolean {
  const parsed = parseToken(token);
  if (!parsed) return false;

  const computedHash = hashToken(parsed.raw);
  const prefixMatch = computedHash.slice(0, HASH_LENGTH) === parsed.hashPrefix;
  const hashMatch = computedHash === storedHash;

  return prefixMatch && hashMatch;
}

/**
 * Crée un token API, stocke le hash en base, et retourne le token en clair UNE SEULE fois.
 * Le token en clair n'est affiché qu'à la création — il ne pourra plus être récupéré ensuite.
 */
export async function createApiToken(
  userId: string,
  name: string,
  expiresAt?: Date,
): Promise<{ plainText: string; token: ApiToken }> {
  const secureToken = generateSecureToken();

  const apiToken = await prisma.apiToken.create({
    data: {
      userId,
      token: secureToken.hash,
      name,
      expiresAt,
    },
  });

  log("info", "API token created", { userId, tokenName: name });

  // Le token en clair n'est affiché qu'à la création
  return {
    plainText: secureToken.formatted,
    token: apiToken,
  };
}

export async function verifyApiToken(token: string) {
  const parsed = parseToken(token);

  if (parsed) {
    // NEW FORMAT: th_<raw>.<hashPrefix>
    const tokenHash = hashToken(parsed.raw);

    const apiToken = await prisma.apiToken.findFirst({
      where: {
        token: tokenHash,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!apiToken) {
      log("warn", "API token verification failed - not found or expired", {
        tokenPrefix: parsed.hashPrefix,
      });
      return null;
    }

    await prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      tokenId: apiToken.id,
      userId: apiToken.user.id,
      user: apiToken.user,
    };
  }

  // LEGACY FALLBACK: plaintext UUID tokens
  // Check if this is a UUID format (old tokens)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    return null;
  }

  const legacyToken = await prisma.apiToken.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  if (!legacyToken) {
    log("warn", "Legacy API token verification failed - not found", {
      tokenPrefix: token.slice(0, 8),
    });
    return null;
  }

  // Transparently upgrade: hash the token in-place and update lastUsedAt atomically
  const newHash = hashToken(token);
  await prisma.apiToken.update({
    where: { id: legacyToken.id },
    data: { token: newHash, lastUsedAt: new Date() },
  });

  log("info", "API token migrated from plaintext to hash", {
    tokenId: legacyToken.id,
  });

  return {
    tokenId: legacyToken.id,
    userId: legacyToken.user.id,
    user: legacyToken.user,
  };
}

export async function revokeApiToken(tokenId: string, userId: string) {
  const deleted = await prisma.apiToken.deleteMany({
    where: {
      id: tokenId,
      userId,
    },
  });

  if (deleted.count > 0) {
    log("info", "API token revoked", { tokenId, userId });
  }

  return deleted.count > 0;
}

export async function listApiTokens(userId: string) {
  return prisma.apiToken.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.apiToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  if (result.count > 0) {
    log("info", "Expired API tokens cleaned up", { count: result.count });
  }

  return result.count;
}
