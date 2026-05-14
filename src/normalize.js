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

export function normalizeVietnameseName(value) {
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

  let strippedPrefix = true;
  while (strippedPrefix) {
    strippedPrefix = false;
    for (const prefix of ADMIN_PREFIXES) {
      if (normalized === prefix) {
        return '';
      }

      if (normalized.startsWith(`${prefix} `)) {
        normalized = normalized.slice(prefix.length + 1).trim();
        strippedPrefix = true;
        break;
      }
    }
  }

  return normalized.replace(/\s+/g, ' ');
}

export function getComparableNames(record) {
  if (!record) {
    return [];
  }

  return Array.from(new Set([
    normalizeVietnameseName(record.name),
    normalizeVietnameseName(record.name_with_type),
    normalizeVietnameseName(record.slug),
    normalizeVietnameseName(record.path),
    normalizeVietnameseName(record.path_with_type)
  ].filter(Boolean)));
}
