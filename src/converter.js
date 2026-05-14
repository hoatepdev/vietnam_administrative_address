import { defaultData } from './data.js';
import { normalizeVietnameseName } from './normalize.js';
import { createAddressTextConverter } from './text.js';

const DEFAULT_OPTIONS = {
  multiple: 'all',
  strict: false,
  allowBroadMatch: false
};

function toCode(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function unique(values) {
  return Array.from(new Set(values));
}

function intersectIndexes(groups) {
  const nonEmptyGroups = groups.filter(group => group && group.length > 0);
  if (nonEmptyGroups.length === 0) {
    return [];
  }

  nonEmptyGroups.sort((a, b) => a.length - b.length);
  let intersection = new Set(nonEmptyGroups[0]);

  for (const group of nonEmptyGroups.slice(1)) {
    const next = new Set(group);
    intersection = new Set([...intersection].filter(value => next.has(value)));
  }

  return [...intersection].sort((a, b) => a - b);
}

function hasNameInput(input) {
  return Boolean(
    normalizeVietnameseName(input.province_name) ||
    normalizeVietnameseName(input.district_name) ||
    normalizeVietnameseName(input.ward_name)
  );
}

function buildIndexes(records) {
  const byCode = records;
  const byName = {};

  for (const [code, record] of Object.entries(records)) {
    for (const value of [record.name, record.name_with_type, record.slug]) {
      const key = normalizeVietnameseName(value);
      if (!key) {
        continue;
      }
      byName[key] ||= [];
      byName[key].push(code);
    }
  }

  return { byCode, byName };
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];

  for (const candidate of candidates) {
    const key = `${candidate.new_ward?.code || candidate.mapping.new_ward_code}|${candidate.new_province?.code || candidate.mapping.new_province_code}`;
    if (seen.has(key)) {
      const existing = deduped.find(item => `${item.new_ward?.code || item.mapping.new_ward_code}|${item.new_province?.code || item.mapping.new_province_code}` === key);
      existing.mapping.row_indexes.push(...candidate.mapping.row_indexes);
      continue;
    }

    seen.add(key);
    deduped.push(candidate);
  }

  return deduped.map(candidate => ({
    ...candidate,
    mapping: {
      ...candidate.mapping,
      row_indexes: unique(candidate.mapping.row_indexes).sort((a, b) => a - b)
    }
  }));
}

function validateRelationships(row, data) {
  const warnings = [];
  const oldProvince = data.oldProvinces[row.old.province_code];
  const oldDistrict = data.oldDistricts[row.old.district_code];
  const oldWard = data.oldWards[row.old.ward_code];
  const newProvince = data.newProvinces[row.new.province_code];
  const newWard = data.newWards[row.new.ward_code];

  if (!oldProvince) {
    warnings.push(`Old province code ${row.old.province_code} was not found.`);
  }
  if (!oldDistrict) {
    warnings.push(`Old district code ${row.old.district_code} was not found.`);
  }
  if (!oldWard) {
    warnings.push(`Old ward code ${row.old.ward_code} was not found.`);
  }
  if (oldWard && oldDistrict && oldWard.parent_code !== oldDistrict.code) {
    warnings.push(`Old ward ${oldWard.code} does not belong to old district ${oldDistrict.code}.`);
  }
  if (oldDistrict && oldProvince && oldDistrict.parent_code !== oldProvince.code) {
    warnings.push(`Old district ${oldDistrict.code} does not belong to old province ${oldProvince.code}.`);
  }
  if (!newProvince) {
    warnings.push(`New province code ${row.new.province_code} was not found.`);
  }
  if (!newWard) {
    warnings.push(`New ward code ${row.new.ward_code} was not found.`);
  }
  if (newWard && newProvince && newWard.parent_code !== newProvince.code) {
    warnings.push(`New ward ${newWard.code} does not belong to new province ${newProvince.code}.`);
  }

  return warnings;
}

function createCandidate(row, rowIndex, data) {
  const relationshipWarnings = validateRelationships(row, data);

  return {
    old: {
      province: data.oldProvinces[row.old.province_code] || null,
      district: data.oldDistricts[row.old.district_code] || null,
      ward: data.oldWards[row.old.ward_code] || null
    },
    new_province: data.newProvinces[row.new.province_code] || null,
    new_ward: data.newWards[row.new.ward_code] || null,
    mapping: {
      old_province_code: row.old.province_code,
      old_district_code: row.old.district_code,
      old_ward_code: row.old.ward_code,
      new_province_code: row.new.province_code,
      new_ward_code: row.new.ward_code,
      row_indexes: [rowIndex]
    },
    warnings: relationshipWarnings
  };
}

function getIndexesByInput(input, mapping) {
  const provinceName = normalizeVietnameseName(input.province_name);
  const districtName = normalizeVietnameseName(input.district_name);
  const wardName = normalizeVietnameseName(input.ward_name);
  const provinceCode = toCode(input.province_code);
  const districtCode = toCode(input.district_code);
  const wardCode = toCode(input.ward_code);
  const indexGroups = [];
  let matchLevel = null;
  let broadMatch = false;

  if (provinceName && districtName && wardName) {
    const key = `${provinceName}|${districtName}|${wardName}`;
    indexGroups.push(mapping.indexes.by_old_name_path[key] || []);
    matchLevel = 'province_district_ward_name';
  } else {
    if (provinceName && districtName) {
      const key = `${provinceName}|${districtName}`;
      indexGroups.push(mapping.indexes.by_old_province_district[key] || []);
      matchLevel = 'province_district_name';
    } else if (provinceName) {
      indexGroups.push(mapping.indexes.by_old_province_name[provinceName] || []);
      matchLevel = 'province_name';
      broadMatch = true;
    }

    if (districtName) {
      indexGroups.push(mapping.indexes.by_old_district_name[districtName] || []);
      matchLevel ||= 'district_name';
      broadMatch ||= !provinceName;
    }

    if (wardName) {
      indexGroups.push(mapping.indexes.by_old_ward_name[wardName] || []);
      matchLevel = provinceName || districtName ? 'district_ward_name' : 'ward_name_broad';
      broadMatch ||= !provinceName && !districtName;
    }
  }

  if (provinceCode) {
    indexGroups.push(mapping.indexes.by_old_province_code[provinceCode] || []);
    matchLevel ||= 'province_code';
  }

  if (districtCode) {
    indexGroups.push(mapping.indexes.by_old_district_code[districtCode] || []);
    matchLevel ||= 'district_code';
  }

  if (wardCode) {
    indexGroups.push(mapping.indexes.by_old_ward_code[wardCode] || []);
    matchLevel = hasNameInput(input) ? matchLevel : 'ward_code';
  }

  return {
    indexes: intersectIndexes(indexGroups),
    matchLevel,
    broadMatch
  };
}

function assertInputConsistency(input, data, warnings) {
  const provinceCode = toCode(input.province_code);
  const districtCode = toCode(input.district_code);
  const wardCode = toCode(input.ward_code);

  if (provinceCode && !data.oldProvinces[provinceCode]) {
    warnings.push(`Old province code ${provinceCode} was not found.`);
  }

  if (districtCode && !data.oldDistricts[districtCode]) {
    warnings.push(`Old district code ${districtCode} was not found.`);
  }

  if (wardCode && !data.oldWards[wardCode]) {
    warnings.push(`Old ward code ${wardCode} was not found.`);
  }

  if (provinceCode && districtCode && data.oldDistricts[districtCode]?.parent_code !== provinceCode) {
    warnings.push(`Old district ${districtCode} does not belong to old province ${provinceCode}.`);
  }

  if (districtCode && wardCode && data.oldWards[wardCode]?.parent_code !== districtCode) {
    warnings.push(`Old ward ${wardCode} does not belong to old district ${districtCode}.`);
  }

  return warnings;
}

function buildResult(input, options, indexes, matchLevel, data, warnings) {
  const rows = indexes.map(rowIndex => [rowIndex, data.mapping.rows[rowIndex]]);
  const candidates = dedupeCandidates(rows.map(([rowIndex, row]) => createCandidate(row, rowIndex, data)));
  const candidateWarnings = unique(candidates.flatMap(candidate => candidate.warnings));
  const allWarnings = unique([...warnings, ...candidateWarnings]);

  if (options.strict && allWarnings.length > 0) {
    return {
      status: 'invalid_input',
      match_level: matchLevel,
      input,
      old: null,
      result: null,
      candidates: [],
      warnings: allWarnings
    };
  }

  if (candidates.length === 0) {
    return {
      status: 'not_found',
      match_level: matchLevel,
      input,
      old: null,
      result: null,
      candidates: [],
      warnings: allWarnings
    };
  }

  if (options.multiple === 'first') {
    const first = candidates[0];
    if (candidates.length > 1) {
      allWarnings.push(`Multiple candidates found; returning the first of ${candidates.length}.`);
    }

    return {
      status: 'matched',
      match_level: matchLevel,
      input,
      old: first.old,
      result: first,
      candidates: [],
      warnings: unique(allWarnings)
    };
  }

  return {
    status: candidates.length === 1 ? 'matched' : 'ambiguous',
    match_level: matchLevel,
    input,
    old: candidates[0]?.old || null,
    result: candidates.length === 1 ? candidates[0] : null,
    candidates,
    warnings: allWarnings
  };
}

export function createConverter(customData = defaultData) {
  const data = {
    mapping: customData.mapping,
    newProvinces: customData.newProvinces,
    newWards: customData.newWards,
    oldProvinces: customData.oldProvinces,
    oldDistricts: customData.oldDistricts,
    oldWards: customData.oldWards
  };

  const indexes = {
    oldProvinces: buildIndexes(data.oldProvinces),
    oldDistricts: buildIndexes(data.oldDistricts),
    oldWards: buildIndexes(data.oldWards),
    newProvinces: buildIndexes(data.newProvinces),
    newWards: buildIndexes(data.newWards)
  };

  const converter = {
    data,
    indexes,
    convertOldToNew(input = {}, options = {}) {
      const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
      const warnings = [];
      const { indexes: rowIndexes, matchLevel, broadMatch } = getIndexesByInput(input, data.mapping);

      assertInputConsistency(input, data, warnings);

      if (!matchLevel) {
        return {
          status: 'invalid_input',
          match_level: null,
          input,
          old: null,
          result: null,
          candidates: [],
          warnings: ['Provide at least one name or code field.']
        };
      }

      if (broadMatch && !resolvedOptions.allowBroadMatch) {
        return {
          status: 'not_found',
          match_level: matchLevel,
          input,
          old: null,
          result: null,
          candidates: [],
          warnings: ['Input is too broad. Provide province and district context, or set allowBroadMatch: true.']
        };
      }

      return buildResult(input, resolvedOptions, rowIndexes, matchLevel, data, warnings);
    }
  };

  converter.convertAddressText = createAddressTextConverter(data, converter.convertOldToNew);

  return converter;
}

const defaultConverter = createConverter();

export function convertOldToNew(input = {}, options = {}) {
  return defaultConverter.convertOldToNew(input, options);
}

export function convertAddressText(text = '', options = {}) {
  return defaultConverter.convertAddressText(text, options);
}
