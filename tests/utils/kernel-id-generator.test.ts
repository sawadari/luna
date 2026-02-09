/**
 * Issue #45: Kernel ID Generator Tests
 *
 * Tests for the new timestamp-based Kernel ID generation
 * to prevent collisions.
 */

import { describe, it, expect } from 'vitest';
import { generateKernelId } from '../../src/utils/kernel-id-generator';

describe('Issue #45: Kernel ID Generator', () => {
  describe('Format validation', () => {
    it('should match format KRN-{timestamp}-{random}', () => {
      const id = generateKernelId();
      expect(id).toMatch(/^KRN-\d{13}-\d{6}$/);
    });

    it('should start with KRN- prefix', () => {
      const id = generateKernelId();
      expect(id).toMatch(/^KRN-/);
    });

    it('should have 13-digit timestamp', () => {
      const id = generateKernelId();
      const parts = id.split('-');
      expect(parts[1]).toHaveLength(13);
      expect(Number.isInteger(Number(parts[1]))).toBe(true);
    });

    it('should have 6-digit random number', () => {
      const id = generateKernelId();
      const parts = id.split('-');
      expect(parts[2]).toHaveLength(6);
      expect(Number.isInteger(Number(parts[2]))).toBe(true);
    });
  });

  describe('Uniqueness', () => {
    it('should generate unique IDs for 1000 calls', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 1000; i++) {
        const id = generateKernelId();
        expect(ids.has(id)).toBe(false); // No collision
        ids.add(id);
      }

      expect(ids.size).toBe(1000);
    });

    it('should generate different IDs in consecutive calls', () => {
      const id1 = generateKernelId();
      const id2 = generateKernelId();
      const id3 = generateKernelId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe('Sortability', () => {
    it('should be sortable by creation time', async () => {
      const id1 = generateKernelId();

      // Wait 10ms to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      const id2 = generateKernelId();

      // Lexicographic comparison works because timestamp is fixed-width
      expect(id2 > id1).toBe(true);
    });

    it('should maintain chronological order for multiple IDs', async () => {
      const ids: string[] = [];

      for (let i = 0; i < 5; i++) {
        ids.push(generateKernelId());
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      const sortedIds = [...ids].sort();
      expect(sortedIds).toEqual(ids);
    });
  });

  describe('Timestamp validation', () => {
    it('should use current timestamp', () => {
      const beforeTimestamp = Date.now();
      const id = generateKernelId();
      const afterTimestamp = Date.now();

      const parts = id.split('-');
      const idTimestamp = Number(parts[1]);

      expect(idTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(idTimestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should have timestamp in milliseconds', () => {
      const id = generateKernelId();
      const parts = id.split('-');
      const timestamp = Number(parts[1]);

      // Timestamp should be close to current time (within 1 second)
      const now = Date.now();
      expect(Math.abs(timestamp - now)).toBeLessThan(1000);
    });
  });

  describe('Random component', () => {
    it('should have random values in range 000000-999999', () => {
      const randoms = new Set<string>();

      // Generate 100 IDs and collect random parts
      for (let i = 0; i < 100; i++) {
        const id = generateKernelId();
        const parts = id.split('-');
        const random = parts[2];

        expect(Number(random)).toBeGreaterThanOrEqual(0);
        expect(Number(random)).toBeLessThan(1000000);
        randoms.add(random);
      }

      // Should have some variety (at least 80 different values in 100 tries)
      expect(randoms.size).toBeGreaterThan(80);
    });
  });

  describe('Collision probability', () => {
    it('should have near-zero collision probability', () => {
      // Birthday paradox calculation:
      // Old: 4-digit (10000 possibilities) → 50% at ~118 IDs
      // New: timestamp + 6-digit (1M possibilities per ms) → near-zero

      // Test with 500 IDs (way more than old 50% threshold)
      const ids = new Set<string>();

      for (let i = 0; i < 500; i++) {
        const id = generateKernelId();
        ids.add(id);
      }

      // All IDs should be unique (no collisions)
      expect(ids.size).toBe(500);
    });
  });
});
