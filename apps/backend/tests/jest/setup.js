/**
 * Test Setup and Configuration
 * Jest/Vitest configuration for backend tests
 * 
 * @module tests/jest/setup
 */

// Set test environment
process.env.NODE_ENV = "test";

// Mock environment variables for testing
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://test:test@localhost:5432/test_db";
process.env.SESSION_SECRET = "test-secret-key-for-testing-only";
process.env.FRONTEND_ORIGINS = "http://localhost:5173";

// Increase timeout for database operations
jest.setTimeout(30000);

// Global test utilities
global.testHelpers = {
  // Add test helpers here
};
