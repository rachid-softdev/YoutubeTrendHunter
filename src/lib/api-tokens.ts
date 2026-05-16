import { randomBytes, createHash } from "crypto"
import { prisma } from "@/lib/prisma"
import { log } from "@/lib/logger"

const TOKEN_PREFIX = "th_"
const TOKEN_LENGTH = 32
const HASH_LENGTH = 8

export interface SecureToken {
  raw: string
  hash: string
  formatted: string
}

export function generateSecureToken(): SecureToken {
  const raw = randomBytes(TOKEN_LENGTH).toString("hex")
  const hash = createHash("sha256").update(raw).digest("hex")
  const formatted = `${TOKEN_PREFIX}${raw}.${hash.slice(0, HASH_LENGTH)}`

  return { raw, hash, formatted }
}

export function parseToken(token: string): { raw: string; hashPrefix: string } | null {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return null
  }

  const withoutPrefix = token.slice(TOKEN_PREFIX.length)
  const parts = withoutPrefix.split(".")

  if (parts.length !== 2) {
    return null
  }

  return { raw: parts[0], hashPrefix: parts[1] }
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export function verifyToken(token: string, storedHash: string): boolean {
  const parsed = parseToken(token)
  if (!parsed) return false

  const computedHash = hashToken(parsed.raw)
  const prefixMatch = computedHash.slice(0, HASH_LENGTH) === parsed.hashPrefix
  const hashMatch = computedHash === storedHash

  return prefixMatch && hashMatch
}

export async function createApiToken(
  userId: string,
  name: string,
  expiresAt?: Date
) {
  const token = generateSecureToken()

  const apiToken = await prisma.apiToken.create({
    data: {
      userId,
      token: token.hash,
      name,
      expiresAt,
    },
  })

  log("info", "API token created", { userId, tokenName: name })

  return {
    id: apiToken.id,
    token: token.formatted,
    name: apiToken.name,
    expiresAt: apiToken.expiresAt,
  }
}

export async function verifyApiToken(token: string) {
  const parsed = parseToken(token)
  if (!parsed) return null

  const tokenHash = hashToken(parsed.raw)

  const apiToken = await prisma.apiToken.findFirst({
    where: {
      token: tokenHash,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
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
  })

  if (!apiToken) {
    log("warn", "API token verification failed - not found or expired", { tokenPrefix: parsed.hashPrefix })
    return null
  }

  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  })

  return {
    tokenId: apiToken.id,
    userId: apiToken.user.id,
    user: apiToken.user,
  }
}

export async function revokeApiToken(tokenId: string, userId: string) {
  const deleted = await prisma.apiToken.deleteMany({
    where: {
      id: tokenId,
      userId,
    },
  })

  if (deleted.count > 0) {
    log("info", "API token revoked", { tokenId, userId })
  }

  return deleted.count > 0
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
  })
}

export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.apiToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })

  if (result.count > 0) {
    log("info", "Expired API tokens cleaned up", { count: result.count })
  }

  return result.count
}