import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Sends email via SMTP, or logs it when SMTP is not configured (local dev/tests). */
export async function sendMail(msg: MailMessage): Promise<void> {
  if (!transport) {
    logger.info({ to: msg.to, subject: msg.subject, body: msg.text }, '[mail:console] email not sent (no SMTP_HOST)');
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...msg });
}

export const verificationEmail = (to: string, link: string): MailMessage => ({
  to,
  subject: 'Confirm your Reef Lighting account',
  text: `Welcome to Reef Lighting!\n\nConfirm your email address: ${link}\n\nThis link expires in 24 hours.`,
  html: `<p>Welcome to Reef Lighting!</p><p><a href="${link}">Confirm your email address</a></p><p>This link expires in 24 hours.</p>`,
});

export const resetEmail = (to: string, link: string): MailMessage => ({
  to,
  subject: 'Reset your Reef Lighting password',
  text: `Reset your password: ${link}\n\nThis link expires in 1 hour. If you did not request it, ignore this email.`,
  html: `<p><a href="${link}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request it, ignore this email.</p>`,
});
