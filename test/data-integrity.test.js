import { describe, expect, test } from 'vitest';
import {
  mapping,
  newProvinces,
  newWards,
  oldDistricts,
  oldProvinces,
  oldWards
} from '../src/index.js';

function expectRequiredString(value, label) {
  expect(value, label).toEqual(expect.any(String));
  expect(value.trim(), label).not.toBe('');
}

describe('mapping data integrity', () => {
  test('all rows reference existing new administrative records', () => {
    for (const [index, row] of mapping.rows.entries()) {
      expect(newProvinces[row.new.province_code], `row ${index} new province`).toBeTruthy();
      expect(newWards[row.new.ward_code], `row ${index} new ward`).toBeTruthy();
    }
  });

  test('old-side source coverage stays within known gaps', () => {
    const missingOldProvinces = [];
    const missingOldDistricts = [];
    const missingOldWards = [];
    const districtLevelRows = [];

    for (const [index, row] of mapping.rows.entries()) {
      if (!oldProvinces[row.old.province_code]) {
        missingOldProvinces.push(index);
      }
      if (!oldDistricts[row.old.district_code]) {
        missingOldDistricts.push(index);
      }
      if (!row.old.ward_code) {
        districtLevelRows.push(index);
      } else if (!oldWards[row.old.ward_code]) {
        missingOldWards.push(index);
      }
    }

    expect(missingOldProvinces).toEqual([]);
    expect(missingOldDistricts).toHaveLength(10);
    expect(districtLevelRows).toHaveLength(5);
    expect(missingOldWards).toHaveLength(50);
  });

  test('all row parent relationships are valid', () => {
    for (const [index, row] of mapping.rows.entries()) {
      const oldProvince = oldProvinces[row.old.province_code];
      const oldDistrict = oldDistricts[row.old.district_code];
      const oldWard = oldWards[row.old.ward_code];
      const newProvince = newProvinces[row.new.province_code];
      const newWard = newWards[row.new.ward_code];

      if (oldProvince && oldDistrict) {
        expect(oldDistrict.parent_code, `row ${index} old district parent`).toBe(oldProvince.code);
      }
      if (oldDistrict && oldWard) {
        expect(oldWard.parent_code, `row ${index} old ward parent`).toBe(oldDistrict.code);
      }
      expect(newWard.parent_code, `row ${index} new ward parent`).toBe(newProvince.code);
    }
  });

  test('all rows contain required denormalized names and keys', () => {
    for (const [index, row] of mapping.rows.entries()) {
      expectRequiredString(row.old.province_code, `row ${index} old province code`);
      expectRequiredString(row.old.province_name, `row ${index} old province name`);
      expectRequiredString(row.old.district_code, `row ${index} old district code`);
      expectRequiredString(row.old.district_name, `row ${index} old district name`);
      if (row.old.ward_code || row.old.ward_name) {
        expectRequiredString(row.old.ward_code, `row ${index} old ward code`);
        expectRequiredString(row.old.ward_name, `row ${index} old ward name`);
      }
      expectRequiredString(row.new.province_code, `row ${index} new province code`);
      expectRequiredString(row.new.province_name, `row ${index} new province name`);
      expectRequiredString(row.new.ward_code, `row ${index} new ward code`);
      expectRequiredString(row.new.ward_name, `row ${index} new ward name`);
      expectRequiredString(row.keys.old_name_path, `row ${index} old name path key`);
      expectRequiredString(row.keys.old_province_district, `row ${index} old province district key`);
    }
  });

  test('mapping indexes point to existing rows', () => {
    for (const [indexName, index] of Object.entries(mapping.indexes)) {
      expect(index && typeof index, indexName).toBe('object');

      for (const [key, rowIndexes] of Object.entries(index)) {
        expect(Array.isArray(rowIndexes), `${indexName}.${key}`).toBe(true);

        for (const rowIndex of rowIndexes) {
          expect(Number.isInteger(rowIndex), `${indexName}.${key}`).toBe(true);
          expect(rowIndex, `${indexName}.${key}`).toBeGreaterThanOrEqual(0);
          expect(rowIndex, `${indexName}.${key}`).toBeLessThan(mapping.rows.length);
        }
      }
    }
  });
});
