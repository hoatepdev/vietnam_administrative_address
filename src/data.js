import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const mapping = require('../data/old_to_new.json');
const newProvinces = require('../admin_new/province.json');
const newWards = require('../admin_new/ward.json');
const oldProvinces = require('../admin_old_2025/province_old.json');
const oldDistricts = require('../admin_old_2025/district_old.json');
const oldWards = require('../admin_old_2025/ward_old.json');

export {
  mapping,
  newProvinces,
  newWards,
  oldProvinces,
  oldDistricts,
  oldWards
};

export const defaultData = {
  mapping,
  newProvinces,
  newWards,
  oldProvinces,
  oldDistricts,
  oldWards
};
