import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { artifactInputExpression } from '../src/runtime/artifact-input.js';

describe('Runtime Artifact Input serialization', () => {
  it('preserves JSON keys that have special meaning in JavaScript object literals', () => {
    const input = JSON.parse('{"__proto__":{"marker":"preserved"}}') as unknown;
    const renderedInput = runInNewContext(artifactInputExpression(input)) as object;

    expect(Object.hasOwn(renderedInput, '__proto__')).toBe(true);
    expect(renderedInput).toEqual(input);
  });
});
