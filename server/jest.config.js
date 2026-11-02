module.exports = {
  // Arquivo de teste não entra no denominador; index.js é bootstrap puro
  // (listen + sinais) e não é alcançável por requisição.
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js', '!src/index.js'],
  // Piso do gate de QA-01, medido no commit que introduz esta suíte. O número
  // só sobe: baixar o gate para um PR passar é critério de bloqueio do QA.
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 85, lines: 80 },
    './src/controllers/': { statements: 90 },
    './src/routes/': { statements: 100 },
  },
  projects: [
    { displayName: 'unit', testEnvironment: 'node', testMatch: ['<rootDir>/src/**/*.test.js'] },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFiles: ['<rootDir>/tests/setupEnv.js'],
      globalSetup: '<rootDir>/tests/globalSetup.js',
      globalTeardown: '<rootDir>/tests/globalTeardown.js',
    },
  ],
};
