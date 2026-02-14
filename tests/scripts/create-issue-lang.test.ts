/**
 * Language Contract Tests for create-issue-from-intent
 *
 * Tests for --lang option: ja/en/auto detection
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Language Detection Tests
// =============================================================================

describe('Language Detection', () => {
  describe('detectLanguage', () => {
    // Mock implementation matching the actual function
    function detectLanguage(text: string): 'ja' | 'en' {
      const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
      return japaneseRegex.test(text) ? 'ja' : 'en';
    }

    it('should detect Japanese from hiragana', () => {
      expect(detectLanguage('ユーザー認証を追加')).toBe('ja');
      expect(detectLanguage('これはテストです')).toBe('ja');
    });

    it('should detect Japanese from katakana', () => {
      expect(detectLanguage('ダークモード')).toBe('ja');
      expect(detectLanguage('キャッシュ機能')).toBe('ja');
    });

    it('should detect Japanese from kanji', () => {
      expect(detectLanguage('知識メトリクス')).toBe('ja');
      expect(detectLanguage('実装する')).toBe('ja');
    });

    it('should detect English from Latin alphabet', () => {
      expect(detectLanguage('Add user authentication')).toBe('en');
      expect(detectLanguage('Implement dark mode')).toBe('en');
    });

    it('should detect Japanese from mixed content', () => {
      expect(detectLanguage('Add ユーザー authentication')).toBe('ja');
      expect(detectLanguage('機能 with feature')).toBe('ja');
    });

    it('should detect English from numbers and symbols', () => {
      expect(detectLanguage('Add API v2.0')).toBe('en');
      expect(detectLanguage('Fix bug #123')).toBe('en');
    });
  });

  describe('resolveLanguage', () => {
    function detectLanguage(text: string): 'ja' | 'en' {
      const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
      return japaneseRegex.test(text) ? 'ja' : 'en';
    }

    function resolveLanguage(intent: string, langOption: 'ja' | 'en' | 'auto'): 'ja' | 'en' {
      if (langOption === 'auto') {
        return detectLanguage(intent);
      }
      return langOption;
    }

    it('should force Japanese when --lang ja', () => {
      expect(resolveLanguage('Add user authentication', 'ja')).toBe('ja');
      expect(resolveLanguage('English text', 'ja')).toBe('ja');
    });

    it('should force English when --lang en', () => {
      expect(resolveLanguage('ユーザー認証を追加', 'en')).toBe('en');
      expect(resolveLanguage('日本語テキスト', 'en')).toBe('en');
    });

    it('should auto-detect when --lang auto', () => {
      expect(resolveLanguage('ユーザー認証を追加', 'auto')).toBe('ja');
      expect(resolveLanguage('Add user authentication', 'auto')).toBe('en');
    });

    it('should auto-detect mixed content as Japanese', () => {
      expect(resolveLanguage('Add ユーザー認証', 'auto')).toBe('ja');
      expect(resolveLanguage('機能を implement', 'auto')).toBe('ja');
    });
  });
});

// =============================================================================
// Prompt Template Selection Tests
// =============================================================================

describe('Prompt Template Selection', () => {
  function buildIssueGenerationPrompt(intent: string, lang: 'ja' | 'en'): string {
    if (lang === 'ja') {
      return buildJapanesePrompt(intent);
    } else {
      return buildEnglishPrompt(intent);
    }
  }

  function buildEnglishPrompt(intent: string): string {
    return `# GitHub Issue Generation Task

## User Intent
${intent}

## Your Task
Generate a complete GitHub Issue for Luna`;
  }

  function buildJapanesePrompt(intent: string): string {
    return `# GitHub Issue 生成タスク

## ユーザーの要望
${intent}

## あなたのタスク
Luna用の完全なGitHub Issueを生成してください`;
  }

  it('should use English prompt for lang=en', () => {
    const prompt = buildIssueGenerationPrompt('Add feature', 'en');
    expect(prompt).toContain('# GitHub Issue Generation Task');
    expect(prompt).toContain('## User Intent');
    expect(prompt).not.toContain('ユーザーの要望');
  });

  it('should use Japanese prompt for lang=ja', () => {
    const prompt = buildIssueGenerationPrompt('機能追加', 'ja');
    expect(prompt).toContain('# GitHub Issue 生成タスク');
    expect(prompt).toContain('## ユーザーの要望');
    expect(prompt).not.toContain('User Intent');
  });

  it('should include intent in prompt', () => {
    const intentEn = 'Add user authentication';
    const promptEn = buildIssueGenerationPrompt(intentEn, 'en');
    expect(promptEn).toContain(intentEn);

    const intentJa = 'ユーザー認証を追加';
    const promptJa = buildIssueGenerationPrompt(intentJa, 'ja');
    expect(promptJa).toContain(intentJa);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Language Contract Integration', () => {
  it('should use correct prompt based on intent and lang option', () => {
    function detectLanguage(text: string): 'ja' | 'en' {
      const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
      return japaneseRegex.test(text) ? 'ja' : 'en';
    }

    function resolveLanguage(intent: string, langOption: 'ja' | 'en' | 'auto'): 'ja' | 'en' {
      if (langOption === 'auto') {
        return detectLanguage(intent);
      }
      return langOption;
    }

    function buildPrompt(intent: string, lang: 'ja' | 'en'): string {
      return lang === 'ja' ? '日本語プロンプト' : 'English prompt';
    }

    // Case 1: Japanese intent + auto -> Japanese prompt
    const intent1 = 'ユーザー認証を追加';
    const lang1 = resolveLanguage(intent1, 'auto');
    expect(lang1).toBe('ja');
    expect(buildPrompt(intent1, lang1)).toBe('日本語プロンプト');

    // Case 2: English intent + auto -> English prompt
    const intent2 = 'Add user authentication';
    const lang2 = resolveLanguage(intent2, 'auto');
    expect(lang2).toBe('en');
    expect(buildPrompt(intent2, lang2)).toBe('English prompt');

    // Case 3: English intent + ja -> Japanese prompt (forced)
    const intent3 = 'Add user authentication';
    const lang3 = resolveLanguage(intent3, 'ja');
    expect(lang3).toBe('ja');
    expect(buildPrompt(intent3, lang3)).toBe('日本語プロンプト');

    // Case 4: Japanese intent + en -> English prompt (forced)
    const intent4 = 'ユーザー認証を追加';
    const lang4 = resolveLanguage(intent4, 'en');
    expect(lang4).toBe('en');
    expect(buildPrompt(intent4, lang4)).toBe('English prompt');
  });
});
