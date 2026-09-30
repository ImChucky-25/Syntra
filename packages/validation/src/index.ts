/**
 * AI Zone request validation schemas — shared by API (request validation)
 * and web (form validation). Single source of truth per the spec (§5, §9).
 */
import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128, 'Password must be at most 128 characters'),
  displayName: z.string().trim().min(2, 'Display name is too short').max(60, 'Display name is too long'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createConversationSchema = z.object({
  title: z.string().trim().max(120).optional(),
  agentId: z.string().uuid().optional(),
  modelPreference: z.string().max(120).optional(),
});

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  modelPreference: z.string().trim().max(120).nullable().optional(),
});

export const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(100_000),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1, 'Message is empty').max(32_000, 'Message is too long'),
  /** optional explicit model key; omit to use auto routing */
  modelKey: z.string().max(120).optional(),
  /** optional conversation title for a brand-new conversation */
  title: z.string().trim().max(120).optional(),
});

export const startAgentRunSchema = z.object({
  input: z.string().trim().min(1, 'Agent input is empty').max(32_000, 'Agent input is too long'),
  /** optional explicit model key; omit to use auto routing */
  modelKey: z.string().max(120).optional(),
});

export const toolDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export type StartAgentRunInput = z.infer<typeof startAgentRunSchema>;
export type ToolDecisionInput = z.infer<typeof toolDecisionSchema>;
