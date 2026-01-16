/**
 * Kernel Enhancement Service
 *
 * AI-powered NRVV auto-completion for incomplete Kernels (Issue #35)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { KernelWithNRVV } from '../types/nrvv';

export interface VerificationSuggestion {
  id: string;
  statement: string;
  method: 'test' | 'inspection' | 'analysis' | 'demonstration';
  testCase?: string;
  criteria: string[];
  traceability: {
    upstream: string[];
    downstream: string[];
  };
}

export interface ValidationSuggestion {
  id: string;
  statement: string;
  method: 'user_test' | 'field_test' | 'peer_review' | 'expert_review';
  criteria: string[];
  status?: 'pending' | 'passed' | 'failed';
  validatedBy?: string;
  traceability: {
    upstream: string[];
    downstream: string[];
  };
}

export interface NRVVSuggestions {
  verification: VerificationSuggestion[];
  validation: ValidationSuggestion[];
}

export class KernelEnhancementService {
  private anthropic?: Anthropic;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.anthropic = new Anthropic({ apiKey });
    }
  }

  /**
   * Suggest Verification and Validation for a Kernel
   */
  async suggestVerificationValidation(
    kernel: KernelWithNRVV
  ): Promise<NRVVSuggestions> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

    // Check if Kernel has requirements
    if (!kernel.requirements || kernel.requirements.length === 0) {
      return {
        verification: [],
        validation: [],
      };
    }

    // Build prompt
    const prompt = this.buildSuggestVVPrompt(kernel);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const suggestions = this.parseSuggestionsResponse(content.text, kernel);
        if (suggestions) {
          return suggestions;
        }
      }

      // Fallback to empty suggestions
      return {
        verification: [],
        validation: [],
      };
    } catch (error) {
      console.error('Failed to suggest V&V:', error);
      throw error;
    }
  }

  /**
   * Build prompt for V&V suggestion
   */
  private buildSuggestVVPrompt(kernel: KernelWithNRVV): string {
    const requirementsText = kernel.requirements
      .map(
        (req, idx) =>
          `${idx + 1}. ${req.id}: ${req.statement}\n   - Type: ${req.type}\n   - Priority: ${req.priority}\n   - Rationale: ${req.rationale || 'N/A'}`
      )
      .join('\n');

    return `# NRVV Auto-Completion Task

## Kernel Information
**ID**: ${kernel.id}
**Statement**: ${kernel.statement}
**Category**: ${kernel.category}
**Owner**: ${kernel.owner}

## Requirements
${requirementsText}

## Task
Based on the Requirements above, suggest **Verification** and **Validation** strategies.

### Verification
- **Purpose**: Ensure the system is built correctly (technical correctness)
- **Methods**: test, inspection, analysis, demonstration
- **Focus**: Does it meet the requirements?

### Validation
- **Purpose**: Ensure the right system is built (user needs satisfaction)
- **Methods**: user_test, field_test, peer_review, expert_review
- **Focus**: Does it satisfy the user needs?

## Output Format (JSON)
\`\`\`json
{
  "verification": [
    {
      "statement": "Test JWT token expiration",
      "method": "test",
      "testCase": "tests/auth/jwt-expiration.test.ts",
      "criteria": ["Tokens expire after 1 hour", "Expired tokens are rejected"]
    }
  ],
  "validation": [
    {
      "statement": "User validates secure login experience",
      "method": "user_test",
      "criteria": ["User can log in securely", "User session is maintained", "User feels secure"]
    }
  ]
}
\`\`\`

**Important**:
- Suggest 1-3 Verification items per Requirement
- Suggest 1-2 Validation items for the overall Kernel
- Be specific and actionable
- Include concrete test cases and criteria

Generate the JSON now:`;
  }

  /**
   * Parse AI response into V&V suggestions
   */
  private parseSuggestionsResponse(
    response: string,
    kernel: KernelWithNRVV
  ): NRVVSuggestions | null {
    try {
      // Extract JSON from markdown code block
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || [
        null,
        response,
      ];
      const parsed = JSON.parse(jsonMatch[1] || response);

      if (!parsed.verification || !parsed.validation) {
        throw new Error('Invalid V&V structure');
      }

      // Generate IDs and traceability
      const verification: VerificationSuggestion[] = parsed.verification.map(
        (v: any, idx: number) => ({
          id: `VER-${kernel.id}-${idx + 1}`,
          statement: v.statement,
          method: v.method || 'test',
          testCase: v.testCase,
          criteria: v.criteria || [],
          traceability: {
            upstream: kernel.requirements.map((r) => r.id),
            downstream: [],
          },
        })
      );

      const validation: ValidationSuggestion[] = parsed.validation.map(
        (v: any, idx: number) => ({
          id: `VAL-${kernel.id}-${idx + 1}`,
          statement: v.statement,
          method: v.method || 'user_test',
          criteria: v.criteria || [],
          status: v.status || 'pending',
          validatedBy: v.validatedBy,
          traceability: {
            upstream: verification.map((ver) => ver.id),
            downstream: [],
          },
        })
      );

      // Update verification downstream to point to validation
      verification.forEach((ver) => {
        ver.traceability.downstream = validation.map((val) => val.id);
      });

      return {
        verification,
        validation,
      };
    } catch (error) {
      console.error('Failed to parse V&V response:', error);
      return null;
    }
  }

  /**
   * Check if a Kernel is incomplete (missing V or V)
   */
  isKernelIncomplete(kernel: KernelWithNRVV): boolean {
    const hasRequirements = kernel.requirements && kernel.requirements.length > 0;
    const hasVerification = kernel.verification && kernel.verification.length > 0;
    const hasValidation = kernel.validation && kernel.validation.length > 0;

    return hasRequirements && (!hasVerification || !hasValidation);
  }

  /**
   * Get missing items for a Kernel
   */
  getMissingItems(kernel: KernelWithNRVV): string[] {
    const missing: string[] = [];

    if (!kernel.verification || kernel.verification.length === 0) {
      missing.push('Verification');
    }

    if (!kernel.validation || kernel.validation.length === 0) {
      missing.push('Validation');
    }

    return missing;
  }
}
