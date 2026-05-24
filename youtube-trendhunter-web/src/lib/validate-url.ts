import { isIP } from "net";
import dns from "dns/promises";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Check if a string is a private IPv4 address
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  const first = parts[0];

  // 127.0.0.0/8 (loopback)
  if (first === 127) return true;
  // 10.0.0.0/8 (private)
  if (first === 10) return true;
  // 172.16.0.0/12 (private)
  if (first === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16 (private)
  if (first === 192 && parts[1] === 168) return true;
  // 169.254.0.0/16 (link-local)
  if (first === 169 && parts[1] === 254) return true;

  return false;
}

/**
 * Check if a string is a private or loopback IPv6 address
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::1 (IPv6 loopback)
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;

  // fc00::/7 (unique local address, ULA)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

  // fe80::/10 (link-local)
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;

  // ::ffff:0:0/96 (IPv4-mapped IPv6) — check the embedded IPv4
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) {
    return isPrivateIPv4(v4mapped[1]);
  }

  // 2001:db8::/32 (documentation)
  if (lower.startsWith("2001:db8")) return true;

  return false;
}

export async function validateWebhookUrl(urlString: string): Promise<ValidationResult> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: "URL invalide" };
  }

  // 1. HTTPS obligatoire
  if (url.protocol !== "https:") {
    return { valid: false, error: "HTTPS est requis" };
  }

  // 2. Pas de credentials dans l'URL
  if (url.username || url.password) {
    return { valid: false, error: "Credentials non autorisés dans l'URL" };
  }

  // 3. Blocage des hostnames réservés
  const hostname = url.hostname.toLowerCase();
  const blockedHosts = [
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "metadata.google.internal",
    "metadata.google.internal.",
    "169.254.169.254",
  ];
  if (blockedHosts.includes(hostname)) {
    return { valid: false, error: "Hostname non autorisé" };
  }

  // 4. Blocage des IPs privées (IPv4 et IPv6)
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    if (isPrivateIPv4(hostname)) {
      return { valid: false, error: "Adresse IP privée ou loopback non autorisée" };
    }
  } else if (ipVersion === 6) {
    if (isPrivateIPv6(hostname)) {
      return { valid: false, error: "Adresse IPv6 privée ou loopback non autorisée" };
    }
  } else {
    // 5. Résolution DNS pour hostnames
    try {
      // Try both A and AAAA records
      const addresses = await dns.resolve(hostname);
      for (const addr of addresses) {
        if (isPrivateIPv4(addr) || isPrivateIPv6(addr)) {
          return { valid: false, error: "Le domaine résout vers une adresse privée" };
        }
      }
    } catch {
      return { valid: false, error: "Impossible de résoudre le domaine" };
    }
  }

  return { valid: true };
}
