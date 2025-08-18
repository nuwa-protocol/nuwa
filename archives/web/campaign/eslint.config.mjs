import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    files: ["**/*.{js,jsx,ts,tsx,css}"],
    rules: {
      // 全局规则配置
    }
  },
  {
    files: ["**/*.css"],
    rules: {
      // 禁用 CSS 文件的特定规则
      "no-unused-vars": "off",
      "no-undef": "off"
    }
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
