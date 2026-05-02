/**
 * Jest Configuration for Backend Tests
 * 
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/jest"],
  testMatch: ["**/*.test.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/**/*.test.js",
    "!src/**/index.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  setupFilesAfterEnv: ["<rootDir>/tests/jest/setup.js"],
  testTimeout: 30000,
  verbose: true,
};
