import { describe, expect, test } from 'vitest';
import { convertAddressText, convertOldToNew } from '../src/index.js';

function expectMeta(meta) {
  expect(meta).toEqual(expect.objectContaining({
    parser_version: expect.any(String),
    mapping_version: expect.any(String),
    elapsed_ms: expect.any(Number),
    warnings: expect.any(Array)
  }));
}

describe('production response schema', () => {
  test('exact match exposes clean address schema', () => {
    const result = convertAddressText(
      '123 Lê Lợi, Phường Điện Biên, Quận Ba Đình, Thành Phố Hà Nội',
      { multiple: 'first' }
    );

    expect(result.input_type).toBe('old');
    expect(result.street_address).toBe('123 Lê Lợi');
    expect(result.converted_text).toBe('123 Lê Lợi, Phường Ba Đình, Thành phố Hà Nội');
    expect(result.converted.ward.code).toBe('14091');
    expect(result.conversion.status).toBe('matched');
    expect(result.conversion.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.conversion.match_strategy).toBe('code_or_name_with_code_filter');
    expect(result.conversion.normalized_text).toBe('ha noi|ba dinh|dien bien');
    expectMeta(result.meta);
  });

  test('fuzzy normalized match adds confidence and normalized text', () => {
    const result = convertAddressText(
      '123 Le Loi, phuong dien bien, quan ba dinh, ha noi',
      { multiple: 'first' }
    );

    expect(result.input_type).toBe('old');
    expect(result.street_address).toBe('123 Le Loi');
    expect(result.conversion.status).toBe('matched');
    expect(result.conversion.result.new_ward.code).toBe('14091');
    expect(result.conversion.confidence).toBeGreaterThan(0);
    expect(result.meta.warnings).toEqual([]);
  });

  test('ambiguous candidate warning is deterministic with actual candidates', () => {
    const result = convertOldToNew(
      {
        province_name: 'Thành Phố Hà Nội',
        district_name: 'Quận Ba Đình',
        ward_name: 'Phường Đội Cấn'
      },
      { multiple: 'first' }
    );

    expect(result.status).toBe('matched');
    expect(result.meta.warnings.some(warning => warning.includes('Multiple candidates found'))).toBe(true);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map(candidate => candidate.new_ward.code).sort()).toEqual(['14091', '14603']);
  });

  test('old and new address conversion expose structured converted components', () => {
    const oldResult = convertAddressText(
      '123 Lê Lợi, Phường Điện Biên, Quận Ba Đình, Thành Phố Hà Nội',
      { multiple: 'first' }
    );
    const newResult = convertAddressText(
      '123 Lê Lợi, Phường Ba Đình, Thành phố Hà Nội',
      { multiple: 'all' }
    );

    expect(oldResult.input_type).toBe('old');
    expect(oldResult.converted.ward.code).toBe('14091');
    expect(newResult.input_type).toBe('new');
    expect(newResult.converted.ward.code).toBe('14091');
    expect(newResult.converted_text).toBe('123 Lê Lợi, Phường Ba Đình, Thành phố Hà Nội');
  });

  test('legacy fields remain accessible but are omitted from JSON payloads', () => {
    const result = convertAddressText(
      '123 Lê Lợi, Phường Điện Biên, Quận Ba Đình, Thành Phố Hà Nội',
      { multiple: 'first' }
    );
    const json = JSON.parse(JSON.stringify(result));

    expect(result.remaining_text).toBe(result.street_address);
    expect(result.warnings).toEqual(result.meta.warnings);
    expect(result.conversion.input).toEqual(result.parsed);
    expect(result.conversion.result.old).toEqual(result.conversion.old);
    expect(json.remaining_text).toBeUndefined();
    expect(json.warnings).toBeUndefined();
    expect(json.conversion.input).toBeUndefined();
    expect(json.conversion.result.old).toBeUndefined();
    expect(json.conversion.warnings).toBeUndefined();
  });
});
