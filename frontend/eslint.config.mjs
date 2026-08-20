import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".next", "node_modules", "next-env.d.ts", "**/*.js"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);