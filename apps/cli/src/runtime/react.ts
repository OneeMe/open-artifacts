import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import type { Alias } from 'vite';

const require = createRequire(import.meta.url);
const reactModulePaths = new Map([
  ['react/jsx-dev-runtime', require.resolve('react/jsx-dev-runtime')],
  ['react/jsx-runtime', require.resolve('react/jsx-runtime')],
  ['react-dom/client', require.resolve('react-dom/client')],
  ['react-dom', require.resolve('react-dom')],
  ['react', require.resolve('react')],
]);

export function reactAliases(): Alias[] {
  return [...reactModulePaths].map(([find, replacement]) => ({ find, replacement }));
}

export function reactRuntimeDirectory() {
  return dirname(require.resolve('react'));
}

export function reactResolutionRoot() {
  return dirname(dirname(reactRuntimeDirectory()));
}
