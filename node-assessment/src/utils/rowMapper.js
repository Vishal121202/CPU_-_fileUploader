const columnMap = require('../config/columnMap');

const normalizeHeader = (h) => String(h).toLowerCase().replace(/[\s_\-.]/g, '');

// Builds { field: actualHeaderInSheet } from the first row's headers.
function resolveHeaders(headers) {
  const byNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const resolved = {};
  for (const [field, aliases] of Object.entries(columnMap)) {
    const hit = aliases.map(normalizeHeader).find((a) => byNormalized.has(a));
    if (hit) resolved[field] = byNormalized.get(hit);
  }
  return resolved;
}

const clean = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
};

const DAY_MS = 86400000; //

// Accepts JS Dates, Excel serial numbers, ISO strings and M/D/YYYY strings ("11/2/2018").
// Dates are built at UTC midnight so they don't shift by a day with the server's timezone.
// Excel dates are rounded to the nearest day: every date column here is date-only, and
// sheets saved in some timezones store them a few seconds off midnight.
function toDate(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? undefined : new Date(Math.round(v.getTime() / DAY_MS) * DAY_MS);
  }
  const s = String(v).trim();
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(s)) {
    // Excel serial: days since 1899-12-30
    return new Date(Math.round(Number(v) - 25569) * DAY_MS);
  }
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})$/);
  if (us) {
    const [m, d] = [Number(us[1]), Number(us[2])];
    let y = Number(us[3]);
    if (us[3].length === 2) y += y < 50 ? 2000 : 1900;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : undefined;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// "1,180.83", "$1180.83", 1180.83 -> 1180.83
function toNumber(v) {
  const s = clean(v);
  if (s === undefined) return undefined;
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

// Excel keeps 5-digit zips as numbers, which drops leading zeros (04101 -> 4101).
// ZIP+4 values such as "27101-3843" arrive as text and are kept as-is.
const toZip = (v) => (typeof v === 'number' ? String(v).padStart(5, '0') : clean(v));

function mapRow(row, headers) {
  const get = (field) => (headers[field] ? row[headers[field]] : undefined);
  return {
    agentName: clean(get('agentName')),
    user: {
      firstName: clean(get('firstName')),
      dob: toDate(get('dob')),
      address: clean(get('address')),
      phoneNumber: clean(get('phoneNumber')),
      state: clean(get('state')),
      zipCode: toZip(get('zipCode')),
      city: clean(get('city')),
      email: clean(get('email'))?.toLowerCase(),
      gender: clean(get('gender')),
      userType: clean(get('userType')),
    },
    accountName: clean(get('accountName')),
    accountType: clean(get('accountType')),
    categoryName: clean(get('categoryName')),
    companyName: clean(get('companyName')),
    policy: {
      policyNumber: clean(get('policyNumber')),
      policyStartDate: toDate(get('policyStartDate')),
      policyEndDate: toDate(get('policyEndDate')),
      policyMode: toNumber(get('policyMode')),
      policyType: clean(get('policyType')),
      premiumAmount: toNumber(get('premiumAmount')),
      premiumAmountWritten: toNumber(get('premiumAmountWritten')),
      producer: clean(get('producer')),
      csr: clean(get('csr')),
    },
  };
}

module.exports = { resolveHeaders, mapRow, toDate, toNumber };
