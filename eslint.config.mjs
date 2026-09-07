import { FlatCompat } from '@eslint/eslintrc';
import { globalIgnores } from 'eslint/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'firebase-debug.log',
    'firestore-debug.log',
  ]),
  ...compat.extends('next/core-web-vitals'),
];

export default eslintConfig;
