/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true, module: 'commonjs', types: ['jest', '@testing-library/jest-dom'] }, diagnostics: { ignoreCodes: [1343] } }] },
  moduleNameMapper: {
    '\\.(css)$': 'identity-obj-proxy',
    '^.*/appConfig$': '<rootDir>/tests/mocks/appConfig.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
