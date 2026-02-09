/**
 * KernelRegistry - Central Kernel storage with NRVV traceability
 */

import * as fs from 'fs/promises';
import * as yaml from 'yaml';
import * as path from 'path';
import {
  KernelRegistry,
  KernelWithNRVV,
  MaturityLevel,
  KernelCategory,
  NRVVValidationResult,
  TraceabilityMatrix,
} from '../types/nrvv';
import { KernelEnhancementService } from '../services/kernel-enhancement-service';
import { env } from '../config/env';

export class KernelRegistryService {
  private registryPath: string;
  private registry: KernelRegistry | null = null;
  private enhancementService?: KernelEnhancementService;

  constructor(registryPath?: string, anthropicApiKey?: string) {
    // Priority: explicit parameter > env variable > default (kernels-luna-base.yaml for Luna development)
    this.registryPath = registryPath || path.join(process.cwd(), env.kernelRegistryPath);

    // Initialize enhancement service if API key provided
    if (anthropicApiKey) {
      this.enhancementService = new KernelEnhancementService(anthropicApiKey);
    }
  }

  /**
   * Load Kernel Registry from file
   */
  async load(): Promise<KernelRegistry> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      this.registry = yaml.parse(content) as KernelRegistry;
      return this.registry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, create empty registry
        this.registry = this.createEmptyRegistry();
        await this.save();
        return this.registry;
      }
      throw error;
    }
  }

  /**
   * Save Kernel Registry to file
   */
  async save(): Promise<void> {
    if (!this.registry) {
      throw new Error('Registry not loaded');
    }

    // Update metadata
    this.registry.meta.last_updated = new Date().toISOString();
    this.registry.meta.last_updated_by = 'KernelRegistryService';

    // Recompute indices and statistics
    this.recomputeIndices();
    this.recomputeStatistics();

    const content = yaml.stringify(this.registry);
    await fs.writeFile(this.registryPath, content, 'utf-8');
  }

  /**
   * Get a Kernel by ID
   */
  async getKernel(id: string): Promise<KernelWithNRVV | null> {
    if (!this.registry) {
      await this.load();
    }
    return this.registry!.kernels[id] || null;
  }

  /**
   * Get all Kernels
   */
  async getAllKernels(): Promise<KernelWithNRVV[]> {
    if (!this.registry) {
      await this.load();
    }
    return Object.values(this.registry!.kernels);
  }

  /**
   * Add or update a Kernel
   *
   * ⚠️ DEPRECATED: Direct calls to saveKernel() bypass the Ledger (Issue #43).
   * Use KernelRuntime.apply() with u.create_kernel or u.set_state operations instead.
   * This method should only be called internally by KernelRuntime.
   */
  async saveKernel(kernel: KernelWithNRVV): Promise<void> {
    // Issue #43: Runtime warning for direct saveKernel() calls
    const stack = new Error().stack || '';
    const isCalledFromRuntime = stack.includes('kernel-runtime.ts') || stack.includes('kernel-runtime.js');

    if (!isCalledFromRuntime) {
      console.warn(
        `⚠️  [KernelRegistry] DEPRECATED: Direct saveKernel() call detected for Kernel ${kernel.id}.\n` +
        `   This bypasses the Ledger (Issue #43). Use KernelRuntime.apply() instead.\n` +
        `   Call stack: ${stack.split('\n').slice(1, 4).join('\n')}`
      );
    }

    if (!this.registry) {
      await this.load();
    }

    const existingKernel = this.registry!.kernels[kernel.id];

    if (existingKernel) {
      // Update existing
      kernel.lastUpdatedAt = new Date().toISOString();
      kernel.history = [
        ...existingKernel.history,
        {
          timestamp: new Date().toISOString(),
          action: 'updated',
          by: 'KernelRegistryService',
          maturity: kernel.maturity,
        },
      ];
    } else {
      // Create new
      kernel.createdAt = kernel.createdAt || new Date().toISOString();
      kernel.lastUpdatedAt = new Date().toISOString();
      kernel.history = kernel.history || [
        {
          timestamp: kernel.createdAt,
          action: 'created',
          by: kernel.owner,
          maturity: kernel.maturity,
        },
      ];
    }

    this.registry!.kernels[kernel.id] = kernel;
    await this.save();
  }

  /**
   * Delete a Kernel
   */
  async deleteKernel(id: string): Promise<boolean> {
    if (!this.registry) {
      await this.load();
    }

    if (this.registry!.kernels[id]) {
      delete this.registry!.kernels[id];
      await this.save();
      return true;
    }

    return false;
  }

  /**
   * Search Kernels by criteria
   */
  async searchKernels(criteria: {
    maturity?: MaturityLevel | MaturityLevel[];
    category?: KernelCategory | KernelCategory[];
    owner?: string | string[];
    tag?: string | string[];
  }): Promise<KernelWithNRVV[]> {
    if (!this.registry) {
      await this.load();
    }

    let kernels = Object.values(this.registry!.kernels);

    // Filter by maturity
    if (criteria.maturity) {
      const maturities = Array.isArray(criteria.maturity)
        ? criteria.maturity
        : [criteria.maturity];
      kernels = kernels.filter((k) => maturities.includes(k.maturity));
    }

    // Filter by category
    if (criteria.category) {
      const categories = Array.isArray(criteria.category)
        ? criteria.category
        : [criteria.category];
      kernels = kernels.filter((k) => categories.includes(k.category));
    }

    // Filter by owner
    if (criteria.owner) {
      const owners = Array.isArray(criteria.owner) ? criteria.owner : [criteria.owner];
      kernels = kernels.filter((k) => owners.includes(k.owner));
    }

    // Filter by tag
    if (criteria.tag) {
      const tags = Array.isArray(criteria.tag) ? criteria.tag : [criteria.tag];
      kernels = kernels.filter((k) =>
        k.tags?.some((t) => tags.includes(t))
      );
    }

    return kernels;
  }

  /**
   * Validate NRVV traceability for a Kernel
   */
  async validateNRVV(kernelId: string): Promise<NRVVValidationResult> {
    const kernel = await this.getKernel(kernelId);

    if (!kernel) {
      return {
        isValid: false,
        errors: [`Kernel ${kernelId} not found`],
        warnings: [],
        traceabilityComplete: false,
        missingLinks: [],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const missingLinks: NRVVValidationResult['missingLinks'] = [];

    // Check: Needs exist
    if (!kernel.needs || kernel.needs.length === 0) {
      errors.push('No Needs defined');
    }

    // Check: Requirements exist
    if (!kernel.requirements || kernel.requirements.length === 0) {
      errors.push('No Requirements defined');
    }

    // Check: Verification exists (for agreed/frozen Kernels)
    if (
      (kernel.maturity === 'agreed' || kernel.maturity === 'frozen') &&
      (!kernel.verification || kernel.verification.length === 0)
    ) {
      warnings.push('No Verification defined for agreed/frozen Kernel');
    }

    // Check: Validation exists (for frozen Kernels)
    if (
      kernel.maturity === 'frozen' &&
      (!kernel.validation || kernel.validation.length === 0)
    ) {
      warnings.push('No Validation defined for frozen Kernel');
    }

    // Check: Need -> Requirement traceability
    for (const need of kernel.needs) {
      const linkedReqs = need.traceability?.downstream || [];
      if (linkedReqs.length === 0) {
        missingLinks.push({
          from: need.id,
          to: '(none)',
          type: 'need-to-requirement',
        });
      }

      // Verify linked requirements exist
      for (const reqId of linkedReqs) {
        if (!kernel.requirements.find((r) => r.id === reqId)) {
          errors.push(`Need ${need.id} references non-existent Requirement ${reqId}`);
        }
      }
    }

    // Check: Requirement -> Verification traceability
    for (const req of kernel.requirements) {
      const downstream = req.traceability?.downstream || [];
      const linkedVerifications = downstream.filter((id) =>
        id.startsWith('VER-')
      );
      if (linkedVerifications.length === 0 && kernel.maturity !== 'draft') {
        missingLinks.push({
          from: req.id,
          to: '(none)',
          type: 'requirement-to-verification',
        });
      }
    }

    // Check: Requirement -> Validation traceability
    for (const req of kernel.requirements) {
      const downstream = req.traceability?.downstream || [];
      const linkedValidations = downstream.filter((id) =>
        id.startsWith('VAL-')
      );
      if (
        linkedValidations.length === 0 &&
        kernel.maturity === 'frozen'
      ) {
        missingLinks.push({
          from: req.id,
          to: '(none)',
          type: 'requirement-to-validation',
        });
      }
    }

    const isValid = errors.length === 0;
    const traceabilityComplete = missingLinks.length === 0;

    return {
      isValid,
      errors,
      warnings,
      traceabilityComplete,
      missingLinks,
    };
  }

  /**
   * Generate Traceability Matrix for a Kernel
   */
  async generateTraceabilityMatrix(
    kernelId: string
  ): Promise<TraceabilityMatrix> {
    const kernel = await this.getKernel(kernelId);

    if (!kernel) {
      return [];
    }

    const matrix: TraceabilityMatrix = [];

    for (const need of kernel.needs) {
      const requirementIds = need.traceability?.downstream || [];
      const verificationIds: string[] = [];
      const validationIds: string[] = [];

      // Collect verifications and validations
      for (const reqId of requirementIds) {
        const req = kernel.requirements.find((r) => r.id === reqId);
        if (req) {
          const reqDownstream = req.traceability?.downstream || [];
          verificationIds.push(
            ...reqDownstream.filter((id) => id.startsWith('VER-'))
          );
          validationIds.push(
            ...reqDownstream.filter((id) => id.startsWith('VAL-'))
          );
        }
      }

      const complete =
        requirementIds.length > 0 &&
        verificationIds.length > 0 &&
        validationIds.length > 0;

      matrix.push({
        needId: need.id,
        requirementIds,
        verificationIds,
        validationIds,
        complete,
      });
    }

    return matrix;
  }

  /**
   * Get Kernels by Maturity
   */
  async getKernelsByMaturity(
    maturity: MaturityLevel
  ): Promise<KernelWithNRVV[]> {
    return this.searchKernels({ maturity });
  }

  /**
   * Get convergence rate (% of agreed/frozen Kernels that are fully converged)
   */
  async getConvergenceRate(): Promise<number> {
    const relevantKernels = await this.searchKernels({
      maturity: ['agreed', 'frozen'],
    });

    if (relevantKernels.length === 0) {
      return 100; // No kernels = 100% converged by default
    }

    let convergedCount = 0;
    for (const kernel of relevantKernels) {
      const validation = await this.validateNRVV(kernel.id);
      if (validation.isValid && validation.traceabilityComplete) {
        convergedCount++;
      }
    }

    return (convergedCount / relevantKernels.length) * 100;
  }

  /**
   * Add Verification to a Kernel
   */
  async addVerificationToKernel(
    kernelId: string,
    verification: any
  ): Promise<void> {
    const kernel = await this.getKernel(kernelId);

    if (!kernel) {
      throw new Error(`Kernel ${kernelId} not found`);
    }

    // Add verification
    if (!kernel.verification) {
      kernel.verification = [];
    }
    kernel.verification.push(verification);

    // Update traceability: link verification to requirements
    for (const reqId of verification.traceability?.upstream || []) {
      const req = kernel.requirements.find((r) => r.id === reqId);
      if (req) {
        if (!req.traceability.downstream) {
          req.traceability.downstream = [];
        }
        if (!req.traceability.downstream.includes(verification.id)) {
          req.traceability.downstream.push(verification.id);
        }
      }
    }

    // Save kernel
    await this.saveKernel(kernel);
  }

  /**
   * Add Validation to a Kernel
   */
  async addValidationToKernel(
    kernelId: string,
    validation: any
  ): Promise<void> {
    const kernel = await this.getKernel(kernelId);

    if (!kernel) {
      throw new Error(`Kernel ${kernelId} not found`);
    }

    // Add validation
    if (!kernel.validation) {
      kernel.validation = [];
    }
    kernel.validation.push(validation);

    // Update traceability: link validation to requirements and needs
    for (const upstreamId of validation.traceability?.upstream || []) {
      // Link to requirement
      const req = kernel.requirements.find((r) => r.id === upstreamId);
      if (req) {
        if (!req.traceability.downstream) {
          req.traceability.downstream = [];
        }
        if (!req.traceability.downstream.includes(validation.id)) {
          req.traceability.downstream.push(validation.id);
        }
      }

      // Link to need
      const need = kernel.needs.find((n) => n.id === upstreamId);
      if (need) {
        if (!need.traceability.downstream) {
          need.traceability.downstream = [];
        }
        if (!need.traceability.downstream.includes(validation.id)) {
          need.traceability.downstream.push(validation.id);
        }
      }
    }

    // Save kernel
    await this.saveKernel(kernel);
  }

  // ========================================================================
  // Private helpers
  // ========================================================================

  private createEmptyRegistry(): KernelRegistry {
    return {
      meta: {
        registry_version: '1.0',
        last_updated: new Date().toISOString(),
        last_updated_by: 'KernelRegistryService',
        schema_version: 'nrvv-1.0',
        description: 'Central Kernel Registry with NRVV Traceability',
      },
      kernels: {},
      indices: {
        by_maturity: {
          draft: [],
          under_review: [],
          agreed: [],
          frozen: [],
          deprecated: [],
        },
        by_category: {
          architecture: [],
          requirement: [],
          constraint: [],
          interface: [],
          quality: [],
          security: [],
        },
        by_owner: {},
        by_tag: {},
      },
      statistics: {
        total_kernels: 0,
        by_maturity: {
          draft: 0,
          under_review: 0,
          agreed: 0,
          frozen: 0,
          deprecated: 0,
        },
        convergence_rate: 100,
        last_computed: new Date().toISOString(),
      },
    };
  }

  private recomputeIndices(): void {
    if (!this.registry) return;

    // Reset indices
    this.registry.indices = {
      by_maturity: {
        draft: [],
        under_review: [],
        agreed: [],
        frozen: [],
        deprecated: [],
      },
      by_category: {
        architecture: [],
        requirement: [],
        constraint: [],
        interface: [],
        quality: [],
        security: [],
      },
      by_owner: {},
      by_tag: {},
    };

    // Rebuild indices
    for (const kernel of Object.values(this.registry.kernels)) {
      // By maturity
      this.registry.indices.by_maturity[kernel.maturity].push(kernel.id);

      // By category
      this.registry.indices.by_category[kernel.category].push(kernel.id);

      // By owner
      if (!this.registry.indices.by_owner[kernel.owner]) {
        this.registry.indices.by_owner[kernel.owner] = [];
      }
      this.registry.indices.by_owner[kernel.owner].push(kernel.id);

      // By tag
      for (const tag of kernel.tags || []) {
        if (!this.registry.indices.by_tag[tag]) {
          this.registry.indices.by_tag[tag] = [];
        }
        this.registry.indices.by_tag[tag].push(kernel.id);
      }
    }
  }

  private recomputeStatistics(): void {
    if (!this.registry) return;

    const kernels = Object.values(this.registry.kernels);

    this.registry.statistics = {
      total_kernels: kernels.length,
      by_maturity: {
        draft: kernels.filter((k) => k.maturity === 'draft').length,
        under_review: kernels.filter((k) => k.maturity === 'under_review').length,
        agreed: kernels.filter((k) => k.maturity === 'agreed').length,
        frozen: kernels.filter((k) => k.maturity === 'frozen').length,
        deprecated: kernels.filter((k) => k.maturity === 'deprecated').length,
      },
      convergence_rate: 0, // Will be computed asynchronously
      last_computed: new Date().toISOString(),
    };
  }

  // ========================================================================
  // NRVV Enhancement (Issue #35)
  // ========================================================================

  /**
   * Suggest Verification and Validation for incomplete Kernels
   */
  async suggestVerificationValidation(
    kernelId: string
  ): Promise<{
    verification: any[];
    validation: any[];
  }> {
    if (!this.enhancementService) {
      throw new Error('Enhancement service not initialized (Anthropic API key not provided)');
    }

    const kernel = await this.getKernel(kernelId);
    if (!kernel) {
      throw new Error(`Kernel ${kernelId} not found`);
    }

    // Get suggestions from AI
    const suggestions = await this.enhancementService.suggestVerificationValidation(kernel);

    return suggestions;
  }

  /**
   * Auto-complete NRVV for incomplete Kernel
   */
  async autoCompleteNRVV(kernelId: string): Promise<void> {
    if (!this.enhancementService) {
      throw new Error('Enhancement service not initialized (Anthropic API key not provided)');
    }

    const kernel = await this.getKernel(kernelId);
    if (!kernel) {
      throw new Error(`Kernel ${kernelId} not found`);
    }

    // Check if incomplete
    if (!this.enhancementService.isKernelIncomplete(kernel)) {
      return; // Already complete
    }

    // Get suggestions
    const suggestions = await this.enhancementService.suggestVerificationValidation(kernel);

    // Add verification
    if (suggestions.verification.length > 0) {
      for (const ver of suggestions.verification) {
        await this.addVerificationToKernel(kernelId, ver);
      }
    }

    // Add validation
    if (suggestions.validation.length > 0) {
      for (const val of suggestions.validation) {
        await this.addValidationToKernel(kernelId, val);
      }
    }

    // Add history entry
    kernel.history.push({
      timestamp: new Date().toISOString(),
      action: 'updated',
      by: 'KernelEnhancementService',
      maturity: kernel.maturity,
      notes: `Auto-completed NRVV: ${suggestions.verification.length} verification, ${suggestions.validation.length} validation`,
    });

    await this.saveKernel(kernel);
  }

  /**
   * Get incomplete Kernels (missing V or V)
   */
  async getIncompleteKernels(): Promise<KernelWithNRVV[]> {
    if (!this.enhancementService) {
      return [];
    }

    const allKernels = await this.getAllKernels();
    return allKernels.filter((k) =>
      this.enhancementService!.isKernelIncomplete(k)
    );
  }
}
