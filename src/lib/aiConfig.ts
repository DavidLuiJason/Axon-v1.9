import { AIAccount, AIModelOption } from '../types';
import { usageQuotaEngine } from './usageQuotaEngine';

export const AVAILABLE_AI_MODELS: AIModelOption[] = [
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'gemini',
    providerName: 'Google',
    badge: 'Recommended',
    description: 'High-speed multimodal reasoning and responsive chat assistance.',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'gemini',
    providerName: 'Google',
    badge: 'Next Gen',
    description: 'Ultra-fast multimodal reasoning and responsive assistance.',
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'claude',
    providerName: 'Anthropic',
    badge: 'Coding Specialist',
    description: 'Advanced systems architecture, nuanced reasoning, and deep code generation.',
  },
  {
    id: 'gpt-4o',
    name: 'ChatGPT 4o',
    provider: 'chatgpt',
    providerName: 'OpenAI',
    badge: 'Omni Multimodal',
    description: 'Versatile multimodal intelligence with advanced vision and structured responses.',
  },
  {
    id: 'axon-offline-core',
    name: 'AXON Local Core',
    provider: 'axon',
    providerName: 'AXON Engine',
    badge: 'Offline Safe',
    description: 'On-device local assistant capable of offline queries, calculations, and local scripts.',
  },
];

/**
 * Supported external AI tools available for search-and-add.
 * AXON itself is never one of the selectable entries.
 */
export const EXTERNAL_AI_CATALOG: AIModelOption[] = AVAILABLE_AI_MODELS.filter(
  (m) => m.provider !== 'axon' && m.id !== 'axon-offline-core'
);

/**
 * AI Accounts list MUST start completely empty.
 * No Gemini, Claude, ChatGPT, or any other tool is pre-added.
 * The user adds every tool themselves via the search-and-add flow.
 */
export const DEFAULT_AI_ACCOUNTS: AIAccount[] = [];

/**
 * Checks whether an account is in cooldown via the UsageQuotaEngine.
 * AXON local core is strictly excluded from usage limits and cooldown tracking.
 */
export function isAccountInCooldown(account?: AIAccount): boolean {
  return usageQuotaEngine.isAccountInCooldown(account);
}

/**
 * Formats the remaining cooldown time for an account or timestamp string.
 */
export function getRemainingCooldownString(accountOrCooldownUntil?: AIAccount | number): string {
  return usageQuotaEngine.getRemainingCooldownString(accountOrCooldownUntil);
}

export function findAccountByLabel(
  accounts: AIAccount[],
  label: string,
  preferredProvider?: string
): AIAccount | undefined {
  const norm = label.trim().toLowerCase();
  if (preferredProvider) {
    const matched = accounts.find(
      (a) =>
        a.provider === preferredProvider &&
        (a.label.toLowerCase() === norm || a.id.toLowerCase() === norm)
    );
    if (matched) return matched;
  }
  return accounts.find(
    (a) => a.label.toLowerCase() === norm || a.id.toLowerCase() === norm
  );
}

