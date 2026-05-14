import { defaultData } from './data.js';
import { getComparableNames, normalizeVietnameseName } from './normalize.js';

const PARSER_VERSION = '1.0.0';

const ADMIN_PREFIXES = [
  'thanh pho',
  'thi tran',
  'thi xa',
  'dac khu',
  'tinh',
  'quan',
  'huyen',
  'phuong',
  'xa',
  'tp'
];

function normalizeAddressText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  let normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  for (const prefix of ADMIN_PREFIXES) {
    normalized = normalized.replace(new RegExp(`(^|\\s)${prefix}(?=\\s|$)`, 'g'), ' ');
  }

  return normalized.trim().replace(/\s+/g, ' ');
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function now() {
  return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
}

function getElapsedMs(startedAt) {
  return Math.max(0, Math.round((now() - startedAt) * 1000) / 1000);
}

function getMappingVersion(data) {
  return data.mapping?.meta?.version || null;
}

function defineDeprecatedValue(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
    writable: false
  });

  return target;
}

function createMeta(data, startedAt, warnings = []) {
  return {
    parser_version: PARSER_VERSION,
    mapping_version: getMappingVersion(data),
    elapsed_ms: getElapsedMs(startedAt),
    warnings: unique(warnings)
  };
}

function withParseAliases(result) {
  defineDeprecatedValue(result, 'remaining_text', result.street_address);
  defineDeprecatedValue(result, 'warnings', result.meta.warnings);
  return result;
}

function createAliases(record, fallback) {
  return new Set(unique([
    ...getComparableNames(record),
    normalizeVietnameseName(fallback),
    normalizeAddressText(record?.name),
    normalizeAddressText(record?.name_with_type),
    normalizeAddressText(fallback)
  ]));
}

function getRowInput(row) {
  return {
    province_name: row.old.province_name,
    district_name: row.old.district_name,
    ward_name: row.old.ward_name,
    province_code: row.old.province_code,
    district_code: row.old.district_code,
    ward_code: row.old.ward_code
  };
}

function buildTextCandidates(data) {
  const seen = new Set();
  const candidates = [];

  for (const row of data.mapping.rows) {
    const key = `${row.old.province_code}|${row.old.district_code}|${row.old.ward_code}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const province = data.oldProvinces[row.old.province_code];
    const district = data.oldDistricts[row.old.district_code];
    const ward = data.oldWards[row.old.ward_code];
    const input = getRowInput(row);
    const path = [input.ward_name, input.district_name, input.province_name].filter(Boolean).join(' ');

    candidates.push({
      input,
      provinceAliases: createAliases(province, input.province_name),
      districtAliases: createAliases(district, input.district_name),
      wardAliases: createAliases(ward, input.ward_name),
      normalizedPath: normalizeAddressText(path)
    });
  }

  return candidates;
}

function getNewInput(ward, province) {
  return {
    province_name: province?.name_with_type || province?.name || '',
    ward_name: ward?.name_with_type || ward?.name || '',
    province_code: province?.code || '',
    ward_code: ward?.code || ''
  };
}

function buildNewTextCandidates(data) {
  const candidates = [];

  for (const ward of Object.values(data.newWards)) {
    const province = data.newProvinces[ward.parent_code];
    if (!province) {
      continue;
    }

    const input = getNewInput(ward, province);
    const path = [input.ward_name, input.province_name].filter(Boolean).join(' ');

    candidates.push({
      input,
      newProvince: province,
      newWard: ward,
      provinceAliases: createAliases(province, input.province_name),
      wardAliases: createAliases(ward, input.ward_name),
      normalizedPath: normalizeAddressText(path)
    });
  }

  return candidates;
}

function splitAddressTokens(text) {
  return String(text)
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => ({
      raw: token,
      key: normalizeVietnameseName(token),
      looseKey: normalizeAddressText(token)
    }));
}

function aliasMatches(aliases, token) {
  return aliases.has(token.key) || aliases.has(token.looseKey);
}

function createMatch(candidate, level, score, tokenStart, tokenCount, tokens, source) {
  return {
    candidate,
    input: candidate.input,
    level,
    score,
    tokenStart,
    tokenCount,
    source,
    remainingText: tokenStart === null ? null : tokens.slice(0, tokenStart).map(token => token.raw).join(', ')
  };
}

function getParseConfidence(match) {
  if (!match) {
    return 0;
  }

  if (match.source === 'comma') {
    return match.level === 'province_name' ? 0.65 : 0.98;
  }

  return match.level === 'province_name' ? 0.55 : 0.9;
}

function getMatchStrategy(match) {
  if (!match) {
    return null;
  }

  return match.source === 'comma' ? 'comma_token_alias' : 'normalized_substring';
}

function getConvertedComponents(ward, province) {
  if (!ward || !province) {
    return null;
  }

  return {
    province,
    ward
  };
}

function getNormalizedText(text) {
  return normalizeAddressText(text);
}

function matchCommaSeparatedText(text, candidates) {
  const tokens = splitAddressTokens(text);
  if (tokens.length === 0) {
    return null;
  }

  const matches = [];

  for (const candidate of candidates) {
    for (let index = 0; index < tokens.length; index += 1) {
      const remaining = tokens.length - index;

      if (
        candidate.districtAliases &&
        remaining >= 3 &&
        aliasMatches(candidate.wardAliases, tokens[index]) &&
        aliasMatches(candidate.districtAliases, tokens[index + 1]) &&
        aliasMatches(candidate.provinceAliases, tokens[index + 2])
      ) {
        matches.push(createMatch(candidate, 'province_district_ward_name', 3000 + index, index, 3, tokens, 'comma'));
      }

      if (
        candidate.districtAliases &&
        remaining >= 2 &&
        aliasMatches(candidate.districtAliases, tokens[index]) &&
        aliasMatches(candidate.provinceAliases, tokens[index + 1])
      ) {
        matches.push(createMatch(candidate, 'province_district_name', 2000 + index, index, 2, tokens, 'comma'));
      }

      if (
        !candidate.districtAliases &&
        remaining >= 2 &&
        aliasMatches(candidate.wardAliases, tokens[index]) &&
        aliasMatches(candidate.provinceAliases, tokens[index + 1])
      ) {
        matches.push(createMatch(candidate, 'province_ward_name', 2500 + index, index, 2, tokens, 'comma'));
      }

      if (aliasMatches(candidate.provinceAliases, tokens[index])) {
        matches.push(createMatch(candidate, 'province_name', 1000 + index, index, 1, tokens, 'comma'));
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score)[0] || null;
}

function findAdminStartIndex(text) {
  const match = String(text).match(/(?:^|[\s,])(phường|phuong|xã|xa|thị trấn|thi tran|quận|quan|huyện|huyen|thị xã|thi xa|tỉnh|tinh|thành phố|thanh pho|tp)\s+/iu);
  return match ? match.index + (match[0].startsWith(' ') || match[0].startsWith(',') ? 1 : 0) : null;
}

function matchSubstringText(text, candidates) {
  const normalizedText = normalizeAddressText(text);
  if (!normalizedText) {
    return null;
  }

  const searchableText = ` ${normalizedText} `;
  const matches = [];

  for (const candidate of candidates) {
    if (!candidate.normalizedPath) {
      continue;
    }

    const needle = ` ${candidate.normalizedPath} `;
    const index = searchableText.indexOf(needle);

    if (index !== -1) {
      matches.push({
        candidate,
        input: candidate.input,
        level: candidate.districtAliases ? 'province_district_ward_name' : 'province_ward_name',
        score: 3000 + index,
        tokenStart: null,
        tokenCount: null,
        source: 'substring',
        remainingText: null
      });
    }
  }

  const best = matches.sort((a, b) => b.score - a.score)[0] || null;
  if (!best) {
    return null;
  }

  const adminStartIndex = findAdminStartIndex(text);
  return {
    ...best,
    remainingText: adminStartIndex === null ? null : String(text).slice(0, adminStartIndex).trim().replace(/[\s,]+$/g, '')
  };
}

function pickParsedInput(match) {
  if (!match) {
    return {};
  }

  if (match.level === 'province_name') {
    return {
      province_name: match.input.province_name,
      province_code: match.input.province_code
    };
  }

  if (match.level === 'province_district_name') {
    return {
      province_name: match.input.province_name,
      district_name: match.input.district_name,
      province_code: match.input.province_code,
      district_code: match.input.district_code
    };
  }

  return match.input;
}

function formatNewAddressText(remainingText, ward, province) {
  if (!ward || !province) {
    return null;
  }

  return [
    remainingText,
    ward.name_with_type || ward.name,
    province.name_with_type || province.name
  ].filter(Boolean).join(', ');
}

function buildNewAddressResult(match, parsedResult) {
  return {
    status: match ? 'matched' : 'not_found',
    match_level: match?.level || null,
    input: match?.input || parsedResult?.parsed || {},
    old: null,
    result: match ? {
      new_province: match.candidate.newProvince,
      new_ward: match.candidate.newWard,
      mapping: {
        new_province_code: match.candidate.newProvince.code,
        new_ward_code: match.candidate.newWard.code,
        row_indexes: []
      },
      warnings: []
    } : null,
    candidates: [],
    warnings: match ? [] : ['Could not parse new administrative address from text.'],
    confidence: getParseConfidence(match),
    match_strategy: getMatchStrategy(match),
    normalized_text: parsedResult?.normalized_text || ''
  };
}

function parseNewAddressTextWithCandidates(text, candidates, data = defaultData) {
  const startedAt = now();
  if (typeof text !== 'string' || text.trim() === '') {
    return withParseAliases({
      text,
      parsed: {},
      street_address: '',
      match_level: null,
      source: null,
      new_province: null,
      new_ward: null,
      converted_text: null,
      components: null,
      confidence: 0,
      match_strategy: null,
      normalized_text: '',
      meta: createMeta(data, startedAt, ['Provide a non-empty address text.'])
    });
  }

  const match = matchCommaSeparatedText(text, candidates) || matchSubstringText(text, candidates);

  if (!match) {
    return withParseAliases({
      text,
      parsed: {},
      street_address: text,
      match_level: null,
      source: null,
      new_province: null,
      new_ward: null,
      converted_text: null,
      components: null,
      confidence: 0,
      match_strategy: null,
      normalized_text: getNormalizedText(text),
      meta: createMeta(data, startedAt, ['Could not parse new administrative address from text.'])
    });
  }

  const streetAddress = match.remainingText || '';
  const convertedText = formatNewAddressText(streetAddress, match.candidate.newWard, match.candidate.newProvince);

  return withParseAliases({
    text,
    parsed: match.input,
    street_address: streetAddress,
    converted_text: convertedText,
    components: getConvertedComponents(match.candidate.newWard, match.candidate.newProvince),
    match_level: match.level,
    source: match.source,
    new_province: match.candidate.newProvince,
    new_ward: match.candidate.newWard,
    confidence: getParseConfidence(match),
    match_strategy: getMatchStrategy(match),
    normalized_text: getNormalizedText(text),
    meta: createMeta(data, startedAt)
  });
}

function parseAddressTextWithCandidates(text, candidates, data = defaultData) {
  const startedAt = now();
  if (typeof text !== 'string' || text.trim() === '') {
    return withParseAliases({
      text,
      parsed: {},
      street_address: '',
      match_level: null,
      source: null,
      confidence: 0,
      match_strategy: null,
      normalized_text: '',
      meta: createMeta(data, startedAt, ['Provide a non-empty address text.'])
    });
  }

  const match = matchCommaSeparatedText(text, candidates) || matchSubstringText(text, candidates);

  if (!match) {
    return withParseAliases({
      text,
      parsed: {},
      street_address: text,
      match_level: null,
      source: null,
      confidence: 0,
      match_strategy: null,
      normalized_text: getNormalizedText(text),
      meta: createMeta(data, startedAt, ['Could not parse old administrative address from text.'])
    });
  }

  return withParseAliases({
    text,
    parsed: pickParsedInput(match),
    street_address: match.remainingText || '',
    match_level: match.level,
    source: match.source,
    confidence: getParseConfidence(match),
    match_strategy: getMatchStrategy(match),
    normalized_text: getNormalizedText(text),
    meta: createMeta(data, startedAt)
  });
}

function formatConvertedText(streetAddress, conversion) {
  if (!conversion.result) {
    return null;
  }

  return [
    streetAddress,
    conversion.result.new_ward?.name_with_type || conversion.result.new_ward?.name,
    conversion.result.new_province?.name_with_type || conversion.result.new_province?.name
  ].filter(Boolean).join(', ');
}

function getConversionComponents(conversion) {
  if (!conversion.result) {
    return null;
  }

  return {
    province: conversion.result.new_province || null,
    ward: conversion.result.new_ward || null
  };
}

function isSameJson(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function toAddressConversion(conversion, parsed) {
  const { input, old, warnings, meta, ...rest } = conversion;
  const addressConversion = {
    ...rest,
    normalized_text: conversion.normalized_text || getNormalizedText(parsed)
  };

  defineDeprecatedValue(addressConversion, 'old', old);

  if (!isSameJson(input, parsed)) {
    addressConversion.input = input;
  } else {
    defineDeprecatedValue(addressConversion, 'input', input);
  }

  defineDeprecatedValue(addressConversion, 'warnings', warnings || []);
  if (meta) {
    defineDeprecatedValue(addressConversion, 'meta', meta);
  }

  return addressConversion;
}

function createAddressResponse({ text, inputType, parseResult, conversion, convertedText, converted, data, startedAt }) {
  const warnings = unique([
    ...(parseResult.meta?.warnings || []),
    ...(conversion.warnings || [])
  ]);
  const response = {
    text,
    input_type: inputType,
    parsed: parseResult.parsed,
    street_address: parseResult.street_address,
    converted_text: convertedText,
    converted,
    match_level: parseResult.match_level,
    conversion: toAddressConversion(conversion, parseResult.parsed),
    meta: createMeta(data, startedAt, warnings)
  };

  defineDeprecatedValue(response, 'remaining_text', response.street_address);
  defineDeprecatedValue(response, 'warnings', warnings);
  return response;
}

export function parseNewAddressText(text, data = defaultData) {
  return parseNewAddressTextWithCandidates(text, buildNewTextCandidates(data), data);
}

export function parseAddressText(text, data = defaultData) {
  return parseAddressTextWithCandidates(text, buildTextCandidates(data), data);
}

export function createAddressTextConverter(data = defaultData, convertOldToNew) {
  const newTextCandidates = buildNewTextCandidates(data);
  const textCandidates = buildTextCandidates(data);

  return function convertAddressText(text, options = {}) {
    const startedAt = now();
    const newParseResult = parseNewAddressTextWithCandidates(text, newTextCandidates, data);
    const parseResult = parseAddressTextWithCandidates(text, textCandidates, data);
    const convertOptions = options.convertOptions || options;
    const conversion = convertOldToNew(parseResult.parsed, convertOptions);

    if (conversion.status !== 'not_found' && conversion.status !== 'invalid_input') {
      const shouldPreferNew = newParseResult.match_level === 'province_ward_name' && parseResult.match_level !== 'province_district_ward_name';

      if (!shouldPreferNew) {
        return createAddressResponse({
          text,
          inputType: 'old',
          parseResult,
          conversion,
          convertedText: formatConvertedText(parseResult.street_address, conversion),
          converted: getConversionComponents(conversion),
          data,
          startedAt
        });
      }
    }

    if (conversion.status === 'invalid_input') {
      return createAddressResponse({
        text,
        inputType: null,
        parseResult,
        conversion,
        convertedText: null,
        converted: null,
        data,
        startedAt
      });
    }

    const newConversion = buildNewAddressResult(newParseResult.match_level ? {
      level: newParseResult.match_level,
      input: newParseResult.parsed,
      candidate: {
        newProvince: newParseResult.new_province,
        newWard: newParseResult.new_ward
      }
    } : null, newParseResult);

    return createAddressResponse({
      text,
      inputType: newConversion.status === 'matched' ? 'new' : null,
      parseResult: newParseResult,
      conversion: newConversion,
      convertedText: newParseResult.converted_text || null,
      converted: newParseResult.components,
      data,
      startedAt
    });
  };
}
