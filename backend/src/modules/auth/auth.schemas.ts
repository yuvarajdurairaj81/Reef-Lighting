import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

const email = z.string().trim().toLowerCase().email('Enter a valid email address');

export const registerSchema = z
  .object({
    email,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(80),
    accountType: z.enum(['HOME', 'ENTERPRISE']).default('HOME'),
    organizationName: z.string().trim().min(2).max(120).optional(),
  })
  .refine((v) => v.accountType === 'HOME' || !!v.organizationName, {
    message: 'Organization name is required for enterprise accounts',
    path: ['organizationName'],
  });

export const loginSchema = z.object({ email, password: z.string().min(1), remember: z.boolean().default(false) });
export const emailOnlySchema = z.object({ email });
export const tokenSchema = z.object({ token: z.string().min(10) });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password: passwordSchema });
export const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export const mfaVerifySchema = z.object({ mfaToken: z.string().min(10), code: z.string().regex(/^\d{6}$/) });
export const mfaDisableSchema = z.object({ code: z.string().regex(/^\d{6}$/), password: z.string().min(1) });
