/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testMatch: ["**/*.test.tsx", "**/*.test.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  moduleNameMapper: {
    // Handle CSS imports (Tailwind etc.)
    "^.+\\.css$": "<rootDir>/__mocks__/styleMock.js",
    // Path aliases
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@slurp/types$": "<rootDir>/../../packages/types/src/index.ts",
  },
};
