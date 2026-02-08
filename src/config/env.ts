/**
 * Environment Configuration
 *
 * Initializes dotenv to load environment variables from .env file.
 * This ensures that Claude Code's ANTHROPIC_API_KEY doesn't conflict
 * with Luna's project-specific API key.
 */

import { config } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Initialize dotenv to load .env file from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

config({ path: path.join(projectRoot, '.env') });

/**
 * Get environment variable with optional fallback
 */
export function getEnv(key: string, fallback?: string): string | undefined {
  return process.env[key] || fallback;
}

/**
 * Get required environment variable (throws if not set)
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set. Please check your .env file.`);
  }
  return value;
}

/**
 * Environment configuration object
 */
export const env = {
  // GitHub Configuration
  githubToken: getEnv('GITHUB_TOKEN'),
  githubRepository: getEnv('REPOSITORY') || getEnv('GITHUB_REPOSITORY'),

  // Anthropic API Configuration
  anthropicApiKey: getEnv('ANTHROPIC_API_KEY'),

  // Kernel Registry Configuration
  // Default path matches rules-config.yaml (single source of truth)
  kernelRegistryPath: getEnv('KERNEL_REGISTRY_PATH') || 'data/ssot/kernels-luna-base.yaml',

  // DEST Configuration (default: enabled for safety, opt-out with =false)
  enableDestJudgment: getEnv('ENABLE_DEST_JUDGMENT') !== 'false', // Default: true
  enableCrepsGates: getEnv('ENABLE_CREPS_GATES') !== 'false', // Default: true
  enablePlanningLayer: getEnv('ENABLE_PLANNING_LAYER') !== 'false', // Default: true
  enableSsotLayer: getEnv('ENABLE_SSOT_LAYER') !== 'false', // Default: true

  // Agent Configuration
  dryRun: getEnv('DRY_RUN') === 'true',
  verbose: getEnv('VERBOSE') !== 'false', // Default to true
};
