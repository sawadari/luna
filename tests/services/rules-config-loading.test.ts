/**
 * Issue #44: Rules Config Loading Enforcement Tests
 *
 * Tests that ChangeControlAgent and KernelRuntime throw errors
 * if rules config is not loaded before instantiation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChangeControlAgent } from '../../src/agents/change-control-agent';
import { KernelRuntime } from '../../src/ssot/kernel-runtime';
import { getRulesConfig, ensureRulesConfigLoaded } from '../../src/services/rules-config-service';
import type { AgentConfig } from '../../src/types';

describe('Issue #44: Rules Config Loading Enforcement', () => {
  let originalConfig: any;

  beforeEach(() => {
    // Save original config
    const rulesConfig = getRulesConfig();
    originalConfig = (rulesConfig as any).config;
  });

  afterEach(async () => {
    // Restore original config
    const rulesConfig = getRulesConfig();
    (rulesConfig as any).config = originalConfig;

    // Ensure config is loaded for other tests
    if (!originalConfig) {
      await ensureRulesConfigLoaded();
    }
  });

  describe('ChangeControlAgent', () => {
    it('should throw error if rules not loaded', () => {
      // Reset rules config to simulate unloaded state
      const rulesConfig = getRulesConfig();
      (rulesConfig as any).config = null;

      const mockConfig: AgentConfig = {
        githubToken: 'test-token',
        repository: 'owner/repo',
        dryRun: true,
        verbose: false,
      };

      expect(() => {
        new ChangeControlAgent(mockConfig);
      }).toThrow('[ChangeControlAgent] Rules config not loaded!');
    });

    it('should work correctly after ensureRulesConfigLoaded()', async () => {
      await ensureRulesConfigLoaded();

      const mockConfig: AgentConfig = {
        githubToken: 'test-token',
        repository: 'owner/repo',
        dryRun: true,
        verbose: false,
      };

      const agent = new ChangeControlAgent(mockConfig);
      expect(agent).toBeDefined();
    });
  });

  describe('KernelRuntime', () => {
    it('should throw error if rules not loaded', () => {
      // Reset rules config to simulate unloaded state
      const rulesConfig = getRulesConfig();
      (rulesConfig as any).config = null;

      expect(() => {
        new KernelRuntime({
          enableLedger: true,
          soloMode: true,
        });
      }).toThrow('[KernelRuntime] Rules config not loaded!');
    });

    it('should work correctly after ensureRulesConfigLoaded()', async () => {
      await ensureRulesConfigLoaded();

      const runtime = new KernelRuntime({
        enableLedger: true,
        soloMode: true,
      });
      expect(runtime).toBeDefined();
    });
  });
});
