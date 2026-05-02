module.exports = {
  env: {
    node: true,
    es2021: true,
    commonjs: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:node/recommended',
    'prettier', // Must be last to override other configs
  ],
  parserOptions: {
    ecmaVersion: 2021,
  },
  rules: {
    // Preserve existing code style - only enforce critical rules
    'no-console': 'off', // Allow console.log for logging
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'node/no-unpublished-require': 'off',
    'node/no-missing-require': 'error',
    'node/no-unsupported-features/es-syntax': 'off',
    
    // Code quality (warnings only to not break existing code)
    'no-var': 'warn',
    'prefer-const': 'warn',
    'prefer-arrow-callback': 'off', // Allow function expressions
    'no-async-promise-executor': 'warn',
    
    // Keep existing patterns
    'node/exports-style': 'off',
    'node/file-extension-in-import': 'off',
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/console': 'off',
    'node/prefer-global/process': 'off',
    'node/prefer-global/url-search-params': 'off',
    'node/prefer-global/url': 'off',
    'node/prefer-promises/dns': 'off',
    'node/prefer-promises/fs': 'off',
  },
};
