/** @type {import('jest').Config} */
const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
};

module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/tests/unit/**/*.test.ts'] },
    // Integration tests need a real PostgreSQL database (DATABASE_URL).
    { ...base, displayName: 'integration', testMatch: ['<rootDir>/tests/integration/**/*.test.ts'] },
  ],
};
