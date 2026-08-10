/**
 * Password hashing.
 *
 * Kept in its own module because both `auth.ts` and `storage.ts` need it, and
 * they already import each other: storage needed hashPassword from auth, while
 * auth needed storage for user lookups. ESM hoisting happened to make that cycle
 * work, but it was one reordering away from one of the two seeing a
 * half-initialised module. Neither this file imports anything of ours.
 */
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

/** Hashes a plain password into the `<hash>.<salt>` form used everywhere. */
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/**
 * Compares the supplied password against a stored hash in the form `<hex hash>.<hex salt>`.
 *
 * Passwords in any other (older) format are treated as invalid – such a user
 * must go through the password reset flow. No other login path exists.
 */
export async function comparePasswords(supplied: string, stored: string) {
  if (!stored || !stored.includes('.')) {
    return false;
  }

  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) {
    return false;
  }

  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;

  // timingSafeEqual throws when the buffers have different lengths
  if (hashedBuf.length !== suppliedBuf.length) {
    return false;
  }

  return timingSafeEqual(hashedBuf, suppliedBuf);
}
