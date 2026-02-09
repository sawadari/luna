/**
 * Kernel ID Generator - Issue #45
 *
 * Generates unique Kernel IDs using timestamp + random to avoid collisions.
 *
 * Format: KRN-{timestamp}-{random}
 * Example: KRN-1738944000123-456789
 *
 * Collision probability:
 * - Before (4-digit random): 50% at ~118 kernels
 * - After (timestamp + 6-digit random): Near zero (requires 1000000+ kernels in same millisecond)
 */

/**
 * Generate a unique Kernel ID
 *
 * @returns Kernel ID in format "KRN-{timestamp}-{random}"
 *
 * @example
 * const id = generateKernelId();
 * // => "KRN-1738944000123-456789"
 */
export function generateKernelId(): string {
  const timestamp = Date.now(); // Unix timestamp in milliseconds
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `KRN-${timestamp}-${random}`;
}
