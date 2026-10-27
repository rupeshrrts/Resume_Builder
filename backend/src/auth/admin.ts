import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** The site owner's address, unless ADMIN_EMAILS (comma-separated) says otherwise. */
const DEFAULT_ADMINS = "rupeshsinghsuntech@gmail.com";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? DEFAULT_ADMINS)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Admin = signed in with an ADMIN_EMAILS account (email + password, no code). Emails are unique, so
 * once the owner has signed up nobody else can register that address; the owner must keep that
 * account (deleting it would free the address). The setup code is only for a forgotten password.
 */
export function isAdmin(email: string, _emailVerified?: boolean): boolean {
  return adminEmails().includes(email.toLowerCase());
}

// Letters only (no 0/O, 1/I): easy to read and type, and never mistaken for a phone number in logs.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/** A random code like "KQXM-TRWB-HNPD", in groups of four. */
export function randomCode(groups: number): string {
  return Array.from({ length: groups }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")).join("-");
}

/** Codes are compared ignoring case, spaces and dashes. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z]/g, "");
}

export function hashCode(input: string): string {
  return createHash("sha256").update(normalizeCode(input)).digest("hex");
}

/**
 * One-time admin setup without any email service: the server writes this code to its own log
 * (visible only to whoever runs it: the terminal, or Render → Logs). ADMIN_SETUP_CODE fixes it.
 */
const setupCode = process.env.ADMIN_SETUP_CODE?.trim() || randomCode(3);

export function adminSetupCode(): string {
  return setupCode;
}

export function checkSetupCode(input: string): boolean {
  const a = Buffer.from(hashCode(input));
  const b = Buffer.from(hashCode(setupCode));
  return normalizeCode(input).length >= 8 && a.length === b.length && timingSafeEqual(a, b);
}
