// Worker thread that imports an uploaded CSV / XLS / XLSX file into MongoDB.
//
// The file is streamed and written in batches, so we never hold the whole file
// (or all of its rows) in memory, and the main thread stays free for requests.
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

const columnMap = require('../config/columnMap');
const { Agent, User, Account, LOB, Carrier, Policy } = require('../models');
const { resolveHeaders, mapRow } = require('../utils/rowMapper');

const BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const unique = (values) => [...new Set(values.filter(Boolean))];

// Users are matched by email. If a row has no email, we fall back to first name + phone.
function userKey(user) {
  if (user.email) return user.email;
  return `${(user.firstName || '').toLowerCase()}|${user.phoneNumber || ''}`;
}

function userFilter(user) {
  if (user.email) return { email: user.email };
  return { firstName: user.firstName, phoneNumber: user.phoneNumber };
}

function upsertOp(filter, update) {
  return { updateOne: { filter, update, upsert: true } };
}

function bulkWrite(Model, ops) {
  if (!ops.length) return null;
  return Model.bulkWrite(ops, { ordered: false });
}

// ---------------------------------------------------------------------------
// File readers – each one yields { values, rowNumber } for every data row
// ---------------------------------------------------------------------------

// CSV values are kept as text so zip codes and phone numbers keep leading zeros.
async function* readCsv(filePath) {
  const parser = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      info: true,
    })
  );

  for await (const { record, info } of parser) {
    yield { values: record, rowNumber: info.lines };
  }
}

// ExcelJS gives formula, rich-text and hyperlink cells as objects – unwrap them.
function plainCellValue(value) {
  if (value == null || typeof value !== 'object' || value instanceof Date) return value;
  if ('result' in value) return value.result;
  if (value.richText) return value.richText.map((part) => part.text).join('');
  if ('text' in value) return value.text;
  return undefined; // error cells like #N/A
}

// Streams only the first worksheet. Dates come back as Date objects (UTC midnight).
async function* readXlsx(filePath) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    sharedStrings: 'cache',
    styles: 'cache',
    hyperlinks: 'ignore',
    worksheets: 'emit',
  });

  for await (const worksheet of workbook) {
    let headers = null;

    for await (const row of worksheet) {
      const cells = row.values; // 1-based, cells[1] is column A

      if (!headers) {
        headers = cells.map((cell) => String(plainCellValue(cell) ?? '').trim());
        continue;
      }

      const values = {};
      headers.forEach((header, col) => {
        if (header) values[header] = plainCellValue(cells[col]);
      });

      yield { values, rowNumber: row.number };
    }

    return; // ignore any other sheets
  }
}

// Old binary .xls has no streaming reader, so it's loaded in one go.
// The 50 MB upload limit keeps this reasonable; rows are still written in batches.
function* readXls(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

  for (let i = 0; i < rows.length; i++) {
    yield { values: rows[i], rowNumber: i + 2 }; // +2: 1-based and skip the header row
  }
}

function readRows(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.csv':
      return readCsv(filePath);
    case '.xls':
      return readXls(filePath);
    default:
      return readXlsx(filePath);
  }
}

// Groups rows into batches. The next batch isn't read until the caller is done
// with the current one, so the underlying stream naturally pauses.
async function* inBatches(rows, size) {
  let batch = [];

  for await (const row of rows) {
    batch.push(row);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }

  if (batch.length) yield batch;
}

// ---------------------------------------------------------------------------
// Database writes
// ---------------------------------------------------------------------------

// Upserts any names we haven't seen yet and stores their ids in the cache (name -> _id).
async function upsertByName(Model, field, names, idCache) {
  const newNames = unique(names).filter((name) => !idCache.has(name));
  if (!newNames.length) return;

  await bulkWrite(
    Model,
    newNames.map((name) => upsertOp({ [field]: name }, { $setOnInsert: { [field]: name } }))
  );

  const docs = await Model.find({ [field]: { $in: newNames } }, { [field]: 1 }).lean();
  docs.forEach((doc) => idCache.set(doc[field], doc._id));
}

async function upsertUsers(rows, state) {
  // If the same user appears more than once, the last row wins.
  const usersByKey = new Map();
  rows.forEach((row) => usersByKey.set(userKey(row.user), row.user));
  const users = [...usersByKey.values()];

  await bulkWrite(
    User,
    users.map((user) => upsertOp(userFilter(user), { $set: user }))
  );

  const emails = users.filter((user) => user.email).map((user) => user.email);
  const usersWithoutEmail = users.filter((user) => !user.email);

  const savedUsers = await User.find({
    $or: [{ email: { $in: emails } }, ...usersWithoutEmail.map(userFilter)],
  }).lean();

  for (const key of usersByKey.keys()) state.userKeys.add(key);

  return new Map(savedUsers.map((user) => [userKey(user), user._id]));
}

async function upsertAccounts(rows, userIds, state) {
  const opsByKey = new Map();

  for (const row of rows) {
    const userId = userIds.get(userKey(row.user));
    if (!row.accountName || !userId) continue;

    const filter = { accountName: row.accountName, userId };
    const update = { $set: { ...filter, accountType: row.accountType } };
    opsByKey.set(`${row.accountName}|${userId}`, upsertOp(filter, update));
  }

  await bulkWrite(Account, [...opsByKey.values()]);
  for (const key of opsByKey.keys()) state.accountKeys.add(key);
}

async function upsertPolicies(rows, userIds, state) {
  const ops = rows.map((row) => {
    const policy = {
      ...row.policy,
      policyCategoryId: state.lobIds.get(row.categoryName),
      companyId: state.carrierIds.get(row.companyName),
      userId: userIds.get(userKey(row.user)),
      agentId: state.agentIds.get(row.agentName),
    };

    state.policyNumbers.add(policy.policyNumber);
    return upsertOp({ policyNumber: policy.policyNumber }, { $set: policy });
  });

  await bulkWrite(Policy, ops);
}

// Writes one batch in dependency order. `state` holds id caches and counters across batches.
async function importBatch(rows, state) {
  // Lookup collections have no dependencies, so they can go in parallel.
  await Promise.all([
    upsertByName(Agent, 'agentName', rows.map((r) => r.agentName), state.agentIds),
    upsertByName(LOB, 'categoryName', rows.map((r) => r.categoryName), state.lobIds),
    upsertByName(Carrier, 'companyName', rows.map((r) => r.companyName), state.carrierIds),
  ]);

  const userIds = await upsertUsers(rows, state);
  await upsertAccounts(rows, userIds, state);
  await upsertPolicies(rows, userIds, state);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// if policyNumber and firstName is not found donot push data in database
function validateRows(batch, headers, skipped) {
  const valid = [];

  for (const { values, rowNumber } of batch) {
    const row = mapRow(values, headers);

    if (!row.policy.policyNumber) {
      skipped.push({ row: rowNumber, reason: 'missing policy number' });
    } else if (!row.user.firstName) {
      skipped.push({ row: rowNumber, reason: 'missing first name' });
    } else {
      valid.push(row);
    }
  }

  return valid;
}

async function run() {
  const { filePath, mongoUri } = workerData;
  const startedAt = Date.now();

  // Only ids and keys are kept between batches – never the rows themselves.
  const state = {
    agentIds: new Map(),
    lobIds: new Map(),
    carrierIds: new Map(),
    userKeys: new Set(),
    accountKeys: new Set(),
    policyNumbers: new Set(),
  };

  const skipped = [];
  let headers = null;
  let totalRows = 0;
  let imported = 0;

  await mongoose.connect(mongoUri);

  try {
    for await (const batch of inBatches(readRows(filePath), BATCH_SIZE)) {
      headers ??= resolveHeaders(Object.keys(batch[0].values));
      totalRows += batch.length;

      const rows = validateRows(batch, headers, skipped);
      if (rows.length) await importBatch(rows, state);
      imported += rows.length;
    }
  } finally {
    await mongoose.disconnect();
  }

  const durationMs = Date.now() - startedAt;

  if (!totalRows) {
    return { totalRows: 0, imported: 0, skipped: [], durationMs };
  }

  return {
    totalRows,
    imported,
    skipped,
    counts: {
      agents: state.agentIds.size,
      users: state.userKeys.size,
      accounts: state.accountKeys.size,
      lobs: state.lobIds.size,
      carriers: state.carrierIds.size,
      policies: state.policyNumbers.size,
    },
    unmappedFields: Object.keys(columnMap).filter((field) => !headers[field]),
    durationMs,
  };
}

run()
  .then((result) => parentPort.postMessage({ ok: true, result }))
  .catch((err) => parentPort.postMessage({ ok: false, error: err.message }));
