import { describe, expect, test } from 'vitest';
import cases from './fixtures/normalization-cases.json' assert { type: 'json' };
import { normalizeVietnameseName } from '../src/normalize.js';

describe('normalizeVietnameseName', () => {
  test.each(cases)('$name', ({ input, expected }) => {
    expect(normalizeVietnameseName(input)).toBe(expected);
  });

  test('handles nullish values', () => {
    expect(normalizeVietnameseName(null)).toBe('');
    expect(normalizeVietnameseName(undefined)).toBe('');
  });
});
