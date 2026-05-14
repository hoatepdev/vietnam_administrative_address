import assert from 'node:assert/strict';
import {
  convertAddressText,
  convertOldToNew,
  mapping,
  newProvinces,
  newWards,
  oldProvinces,
  oldDistricts,
  oldWards
} from '../src/index.js';

const errors = [];
const warnings = [];
const multiByOldWard = new Map();

for (const [index, row] of mapping.rows.entries()) {
  const oldProvince = oldProvinces[row.old.province_code];
  const oldDistrict = oldDistricts[row.old.district_code];
  const oldWard = oldWards[row.old.ward_code];
  const newProvince = newProvinces[row.new.province_code];
  const newWard = newWards[row.new.ward_code];

  if (!oldProvince) warnings.push(`Row ${index}: missing old province ${row.old.province_code}`);
  if (!oldDistrict) warnings.push(`Row ${index}: missing old district ${row.old.district_code}`);
  if (!oldWard) warnings.push(`Row ${index}: missing old ward ${row.old.ward_code || '(empty)'}`);
  if (!newProvince) errors.push(`Row ${index}: missing new province ${row.new.province_code}`);
  if (!newWard) errors.push(`Row ${index}: missing new ward ${row.new.ward_code}`);

  if (oldProvince && oldDistrict && oldDistrict.parent_code !== oldProvince.code) {
    warnings.push(`Row ${index}: district ${oldDistrict.code} parent ${oldDistrict.parent_code} != province ${oldProvince.code}`);
  }

  if (oldDistrict && oldWard && oldWard.parent_code !== oldDistrict.code) {
    warnings.push(`Row ${index}: ward ${oldWard.code} parent ${oldWard.parent_code} != district ${oldDistrict.code}`);
  }

  if (newProvince && newWard && newWard.parent_code !== newProvince.code) {
    errors.push(`Row ${index}: new ward ${newWard.code} parent ${newWard.parent_code} != province ${newProvince.code}`);
  }

  const oldWardRows = multiByOldWard.get(row.old.ward_code) || new Set();
  oldWardRows.add(row.new.ward_code);
  multiByOldWard.set(row.old.ward_code, oldWardRows);
}

if (errors.length > 0) {
  console.error(errors.slice(0, 20).join('\n'));
  throw new Error(`Mapping integrity failed with ${errors.length} error(s).`);
}

const firstRow = mapping.rows[0];
const exactNameResult = convertOldToNew({
  province_name: firstRow.old.province_name,
  district_name: firstRow.old.district_name,
  ward_name: firstRow.old.ward_name
});

assert.notEqual(exactNameResult.status, 'not_found');
assert.ok(exactNameResult.candidates.length > 0 || exactNameResult.result);

const noAccentResult = convertOldToNew({
  province_name: firstRow.keys.old_province_name,
  district_name: firstRow.keys.old_district_name,
  ward_name: firstRow.keys.old_ward_name
});

assert.notEqual(noAccentResult.status, 'not_found');

const prefixedNameResult = convertOldToNew({
  province_name: `Tỉnh ${firstRow.old.province_name}`,
  district_name: `Huyện ${firstRow.old.district_name}`,
  ward_name: `Xã ${firstRow.old.ward_name}`
});

assert.notEqual(prefixedNameResult.status, 'not_found');

const scopedResult = convertOldToNew({
  province_name: firstRow.old.province_name,
  district_name: firstRow.old.district_name,
  ward_name: firstRow.old.ward_name,
  ward_code: firstRow.old.ward_code
});

assert.notEqual(scopedResult.status, 'not_found');

const ambiguousWardCode = [...multiByOldWard.entries()].find(([, newWardCodes]) => newWardCodes.size > 1)?.[0];

if (ambiguousWardCode) {
  const ambiguousRow = mapping.rows.find(row => row.old.ward_code === ambiguousWardCode);
  const allResult = convertOldToNew({
    province_name: ambiguousRow.old.province_name,
    district_name: ambiguousRow.old.district_name,
    ward_name: ambiguousRow.old.ward_name
  }, { multiple: 'all' });

  assert.equal(allResult.status, 'ambiguous');
  assert.ok(allResult.candidates.length > 1);

  const firstResult = convertOldToNew({
    province_name: ambiguousRow.old.province_name,
    district_name: ambiguousRow.old.district_name,
    ward_name: ambiguousRow.old.ward_name
  }, { multiple: 'first' });

  assert.equal(firstResult.status, 'matched');
  assert.ok(firstResult.result);

  const ambiguousTextResult = convertAddressText(
    `123 Lê Lợi, ${ambiguousRow.old.ward_name}, ${ambiguousRow.old.district_name}, ${ambiguousRow.old.province_name}`,
    { multiple: 'all' }
  );

  assert.equal(ambiguousTextResult.conversion.status, 'ambiguous');
}

const broadResult = convertOldToNew({ ward_name: firstRow.old.ward_name });
assert.equal(broadResult.status, 'not_found');

const broadAllowedResult = convertOldToNew({ ward_name: firstRow.old.ward_name }, { allowBroadMatch: true });
assert.notEqual(broadAllowedResult.status, 'invalid_input');

const textResult = convertAddressText(
  `123 Lê Lợi, ${firstRow.old.ward_name}, ${firstRow.old.district_name}, ${firstRow.old.province_name}`,
  { multiple: 'first' }
);

assert.equal(textResult.input_type, 'old');
assert.equal(textResult.remaining_text, '123 Lê Lợi');
assert.match(textResult.converted_text, /^123 Lê Lợi, /);
assert.equal(textResult.parsed.ward_code, firstRow.old.ward_code);
assert.notEqual(textResult.conversion.status, 'not_found');
assert.ok(textResult.conversion.result);

const newTextResult = convertAddressText(
  `123 Lê Lợi, ${textResult.conversion.result.new_ward.name_with_type}, ${textResult.conversion.result.new_province.name_with_type}`,
  { multiple: 'first' }
);

assert.equal(newTextResult.input_type, 'new');
assert.equal(newTextResult.remaining_text, '123 Lê Lợi');
assert.equal(newTextResult.converted_text, `123 Lê Lợi, ${textResult.conversion.result.new_ward.name_with_type}, ${textResult.conversion.result.new_province.name_with_type}`);
assert.equal(newTextResult.parsed.ward_code, textResult.conversion.result.new_ward.code);
assert.equal(newTextResult.conversion.status, 'matched');
assert.equal(newTextResult.conversion.result.new_ward.code, textResult.conversion.result.new_ward.code);

const noAccentTextResult = convertAddressText(
  `123 le loi, ${firstRow.keys.old_ward_name}, ${firstRow.keys.old_district_name}, ${firstRow.keys.old_province_name}`
);

assert.equal(noAccentTextResult.parsed.ward_code, firstRow.old.ward_code);
assert.notEqual(noAccentTextResult.conversion.status, 'not_found');

const invalidTextResult = convertAddressText('123 Lê Lợi');
assert.equal(invalidTextResult.conversion.status, 'invalid_input');
assert.ok(invalidTextResult.warnings.length > 0);

const multiOldWardCount = [...multiByOldWard.values()].filter(newWardCodes => newWardCodes.size > 1).length;

console.log('Mapping integrity passed.');
console.log(`Rows: ${mapping.rows.length}`);
console.log(`Old wards with multiple new wards: ${multiOldWardCount}`);
if (warnings.length > 0) {
  console.warn(`Mapping source warnings: ${warnings.length}`);
  console.warn(warnings.slice(0, 10).join('\n'));
}
console.log('Converter smoke tests passed.');
