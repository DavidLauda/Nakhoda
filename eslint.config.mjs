import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
const config = [{ ignores: ['.next/**','node_modules/**','.tmp/**','pipeline/out/**','pipeline/test-tmp/**','next-env.d.ts'] }, ...compat.extends('next/core-web-vitals', 'next/typescript'), { rules: { '@next/next/no-html-link-for-pages': 'off', '@typescript-eslint/no-explicit-any': 'off' } }];
export default config;
