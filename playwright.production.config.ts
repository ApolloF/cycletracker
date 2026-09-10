import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testMatch: 'workflow.spec.ts',
  projects: base.projects!.map(project => ({ ...project, name: `production-${project.name}` })),
  webServer: [
    { command: 'pnpm dev:api', url: 'http://127.0.0.1:3100/api/health', reuseExistingServer: false, timeout: 60000 },
    { command: 'pnpm exec vite preview --config apps/web/vite.config.ts', url: 'http://localhost:5173', reuseExistingServer: false, timeout: 60000 },
  ],
});
