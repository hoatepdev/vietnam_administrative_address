import { describe, expect, test } from 'vitest';
import cases from './fixtures/golden-address-text.json' assert { type: 'json' };
import { convertAddressText, parseAddressText, parseNewAddressText } from '../src/index.js';

function getConversionWardCode(result) {
  return result.conversion.result?.new_ward?.code || null;
}

function getConversionProvinceCode(result) {
  return result.conversion.result?.new_province?.code || null;
}

function getCandidateWardCodes(result) {
  return result.conversion.candidates.map(candidate => candidate.new_ward?.code).filter(Boolean).sort();
}

describe('convertAddressText golden fixtures', () => {
  test.each(cases)('$name', ({ text, options, expected }) => {
    const result = convertAddressText(text, options);

    expect(result.input_type).toBe(expected.input_type);
    expect(result.remaining_text).toBe(expected.remaining_text);
    expect(result.match_level).toBe(expected.match_level);

    if (expected.status) {
      expect(result.conversion.status).toBe(expected.status);
    }

    if (expected.new_province_code) {
      expect(getConversionProvinceCode(result)).toBe(expected.new_province_code);
    }

    if (expected.new_ward_code) {
      expect(getConversionWardCode(result)).toBe(expected.new_ward_code);
    }

    if (expected.candidate_count !== undefined) {
      expect(result.conversion.candidates).toHaveLength(expected.candidate_count);
    }

    if (expected.candidate_new_ward_codes) {
      expect(getCandidateWardCodes(result)).toEqual([...expected.candidate_new_ward_codes].sort());
    }
  });

  test('parseAddressText reports empty input', () => {
    const result = parseAddressText('');

    expect(result.parsed).toEqual({});
    expect(result.warnings).toContain('Provide a non-empty address text.');
  });

  test('parseNewAddressText reports empty input', () => {
    const result = parseNewAddressText('');

    expect(result.parsed).toEqual({});
    expect(result.warnings).toContain('Provide a non-empty address text.');
  });
});
