import { describe, expect, test } from 'vitest';
import cases from './fixtures/golden-convert-old-to-new.json' assert { type: 'json' };
import { convertOldToNew } from '../src/index.js';

function getResultWardCode(result) {
  return result.result?.new_ward?.code || null;
}

function getResultProvinceCode(result) {
  return result.result?.new_province?.code || null;
}

function getCandidateWardCodes(result) {
  return result.candidates.map(candidate => candidate.new_ward?.code).filter(Boolean).sort();
}

describe('convertOldToNew golden fixtures', () => {
  test.each(cases)('$name', ({ input, options, expected }) => {
    const result = convertOldToNew(input, options);

    expect(result.status).toBe(expected.status);
    expect(result.match_level).toBe(expected.match_level);

    if (expected.new_province_code) {
      expect(getResultProvinceCode(result)).toBe(expected.new_province_code);
    }

    if (expected.new_ward_code) {
      expect(getResultWardCode(result)).toBe(expected.new_ward_code);
    }

    if (expected.candidate_count !== undefined) {
      expect(result.candidates).toHaveLength(expected.candidate_count);
    }

    if (expected.candidate_new_ward_codes) {
      expect(getCandidateWardCodes(result)).toEqual([...expected.candidate_new_ward_codes].sort());
    }

    if (expected.warning_includes) {
      expect(result.warnings.some(warning => warning.includes(expected.warning_includes))).toBe(true);
    }
  });

  test('rejects empty input', () => {
    const result = convertOldToNew();

    expect(result.status).toBe('invalid_input');
    expect(result.warnings).toContain('Provide at least one name or code field.');
  });
});
