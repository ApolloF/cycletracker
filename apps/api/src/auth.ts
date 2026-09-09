import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Database } from './db.js';
import * as schema from './schema.js';
export function createAuth(db: Database) {
  const production = process.env.NODE_ENV === 'production';
  if (production && (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || !process.env.SMTP_HOST)) throw new Error('Production requires a random auth secret and SMTP configuration');
  const send = async (to: string, subject: string, url: string) => {
    if (process.env.SMTP_HOST) await nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 1025), secure: process.env.SMTP_SECURE === 'true', ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } } : {}) }).sendMail({ from: process.env.SMTP_FROM, to, subject, text: `${subject}\n\n${url}` });
    else { await mkdir('.local/mail', { recursive: true }); await writeFile(`.local/mail/${Date.now()}-${crypto.randomUUID()}.json`, JSON.stringify({ to, subject, url })); }
  };
  return betterAuth({
    appName: 'CycleTracker', baseURL: process.env.APP_URL ?? 'http://localhost:5173', basePath: '/api/auth',
    secret: process.env.BETTER_AUTH_SECRET ?? 'local-development-secret-do-not-use-in-production',
    database: drizzleAdapter(db.orm, { provider: 'pg', schema }),
    trustedOrigins: [process.env.APP_URL ?? 'http://localhost:5173'],
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 12, revokeSessionsOnPasswordReset: true, sendResetPassword: async ({ user, url }) => send(user.email, 'Reset your CycleTracker password', url) },
    emailVerification: { sendOnSignUp: true, autoSignInAfterVerification: true, sendVerificationEmail: async ({ user, url }) => send(user.email, 'Verify your CycleTracker email', url) },
    socialProviders: {
      ...(process.env.GOOGLE_CLIENT_ID ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } } : {}),
      ...(process.env.APPLE_CLIENT_ID ? { apple: { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET! } } : {}),
    },
    account: { accountLinking: { enabled: false } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: production, defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: production } },
  });
}
