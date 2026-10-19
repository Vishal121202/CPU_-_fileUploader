# Policy Upload Assessment (Node.js + MongoDB)

An Express + Mongoose REST API, written in plain JavaScript, that covers both assessment tasks:

- importing an insurance data sheet (XLSX/CSV) into normalized MongoDB collections using **worker threads**
- searching and aggregating policies
- monitoring CPU in real time and **restarting the server automatically** at 70%
- **scheduling messages** that are inserted into the database at a given day and time

Interactive API documentation (Swagger UI) is served at **http://localhost:3000/api-docs**.

---

## Contents

- [Task checklist](#task-checklist)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [npm scripts](#npm-scripts)
- [API documentation (Swagger)](#api-documentation-swagger)
- [Endpoint summary](#endpoint-summary)
- [Data model (Task 1.4)](#data-model-task-14)
- [Task 1 APIs](#task-1-apis)
- [Task 2](#task-2)
- [Environment variables](#environment-variables)
- [Project layout](#project-layout)
- [Error handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Assumptions](#assumptions)

---

## Task checklist

| Task | Requirement | Implementation |
|---|---|---|
| 1.1 | Upload XLSX/CSV into MongoDB using worker threads | `POST /api/upload`, `src/workers/uploadWorker.js` |
| 1.2 | Search policy info by username | `GET /api/policies/search?username=` |
| 1.3 | Aggregated policies per user | `GET /api/policies/aggregate` |
| 1.4 | Separate collections: Agent, User, Account, LOB, Carrier, Policy | `src/models/` |
| 2.1 | Track CPU in real time and restart the server at 70% | `src/index.js`, `src/services/cpuMonitor.js` |
| 2.2 | POST message + day + time, inserted into the DB at that moment | `POST /api/messages/schedule`, `src/services/messageScheduler.js` |

## Tech stack

| Purpose | Package |
|---|---|
| Runtime | Node.js 18+ (`worker_threads`, `cluster`) |
| HTTP server | `express` |
| Database | MongoDB via `mongoose` |
| File upload | `multer` |
| XLSX/CSV parsing | `xlsx` (SheetJS) |
| API docs | `swagger-ui-express`, `yaml` |
| Config | `dotenv` |

## Getting started

### Prerequisites

- Node.js **18 or newer**
- A running **MongoDB** instance (local or Atlas)

No MongoDB installed? Start one with Docker:

```bash
docker run -d -p 27017:27017 --name mongo mongo:7
```

### Install and run

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm start
```

The server prints:

```
[supervisor] 12345 started
[server 12346] listening on http://localhost:3000
```

Then open:

- Swagger UI: http://localhost:3000/api-docs
- Health check: http://localhost:3000/api/health

### Try it with sample data

```bash
npm run sample                                     # writes sample/data-sheet.csv and .xlsx (50 rows)
curl -F file=@sample/data-sheet.xlsx http://localhost:3000/api/upload
curl "http://localhost:3000/api/policies/search?username=lura"
curl "http://localhost:3000/api/policies/aggregate"
```

The first 9 sample rows are copied from the real data sheet. Later rows renew those same people's policies, so each user has several. Use `npm run sample -- 30000` to generate a larger file.

## npm scripts

| Script | What it does |
|---|---|
| `npm start` | Runs the supervisor (`src/index.js`), which runs the API and replaces it on a CPU breach. **Recommended.** |
| `npm run start:app` | Runs the API process alone (`src/server.js`). On a CPU breach it exits with code 1, so an external manager (pm2, nodemon, Docker) can restart it. |
| `npm run sample [-- rows]` | Generates sample CSV/XLSX files in `sample/` with the assessment sheet's columns. |

## API documentation (Swagger)

The full OpenAPI 3.0 specification is in [`docs/swagger.yaml`](docs/swagger.yaml). It is served by the running app:

| URL | Content |
|---|---|
| http://localhost:3000/api-docs | Swagger UI: browse and try every endpoint, including file upload |
| http://localhost:3000/api-docs.json | Raw OpenAPI spec as JSON, for import into Postman or Insomnia |

To import into **Postman**: *Import → Link →* `http://localhost:3000/api-docs.json` (or import the `docs/swagger.yaml` file).

The spec documents every request parameter, request body, response schema, example, and error response. To validate it after editing:

```bash
npx @redocly/cli lint docs/swagger.yaml --extends=spec
```

## Endpoint summary

Base URL: `http://localhost:3000/api`

| Method | Path | Task | Description |
|---|---|---|---|
| `POST` | `/upload` | 1.1 | Upload a `.csv` / `.xlsx` / `.xls` file (multipart field `file`) |
| `GET` | `/policies/search?username=&partial=` | 1.2 | Policies for a user, searched by first name |
| `GET` | `/policies/aggregate?page=&limit=` | 1.3 | Policies grouped per user (paginated) |
| `POST` | `/messages/schedule` | 2.2 | Schedule `{ message, day, time }` |
| `GET` | `/messages/scheduled?status=` | 2.2 | List schedules (`pending`, `processing`, `done`, `failed`) |
| `GET` | `/messages` | 2.2 | Messages already inserted by the scheduler |
| `GET` | `/health` | 2.1 | Status, pid, uptime and live CPU % |
| `GET` | `/debug/cpu-burn?seconds=` | 2.1 | Burns CPU to demo the auto restart (only when `ENABLE_DEBUG_ROUTES=true`) |

## Data model (Task 1.4)

Each entity has its own collection. References are `ObjectId`s.

| Collection | Fields | Unique key |
|---|---|---|
| `agents` | agentName | agentName |
| `users` | firstName, dob, address, city, phoneNumber, state, zipCode, email, gender, userType | email (sparse) |
| `accounts` | accountName, accountType, userId → users | accountName + userId |
| `lobs` | categoryName | categoryName |
| `carriers` | companyName | companyName |
| `policies` | policyNumber, policyStartDate, policyEndDate, policyCategoryId → lobs, companyId → carriers, userId → users, agentId → agents, plus policyMode, policyType, premiumAmount, premiumAmountWritten, producer, csr | policyNumber |
| `scheduledmessages` | message, day, time, runAt, status, insertedMessageId, error | (Task 2.2) |
| `messages` | message, scheduledFor, scheduleId → scheduledmessages | scheduleId (Task 2.2) |

```
agents ◄──── policies ────► lobs
                │  │
                │  └──────► carriers
                ▼
              users ◄──── accounts
```

Some stored fields go beyond the assessment's list, because the data sheet has them:

- `agentId` on a policy keeps each agent linked to the business they wrote.
- `city` on users and `accountType` on accounts.
- `policyMode` (term in months), `policyType`, `premiumAmount`, `premiumAmountWritten`, `producer` and `csr` on policies.

The sheet's `primary`, `Applicant ID`, `agency_id` and `hasActive ClientPolicy` columns are empty in the data and are ignored.

**Re-uploads are idempotent.** Uploading the same file twice does not create duplicates. Agents, LOBs and carriers match on name. Users match on email, or on first name + phone when there is no email. Accounts match on name + user, and policies on policy number. Existing records are updated.

## Task 1 APIs

### 1.1 Upload: `POST /api/upload`

Multipart form with the file in the `file` field (`.csv`, `.xlsx` or `.xls`, up to 50 MB).

```bash
curl -F file=@sample/data-sheet.xlsx http://localhost:3000/api/upload
```

**201 Created**

```json
{
  "message": "File imported",
  "file": "data-sheet.xlsx",
  "totalRows": 50,
  "imported": 50,
  "skipped": [],
  "counts": { "agents": 1, "users": 9, "accounts": 9, "lobs": 3, "carriers": 5, "policies": 50 },
  "unmappedFields": [],
  "durationMs": 137
}
```

| Field | Meaning |
|---|---|
| `totalRows` | Data rows found in the first sheet |
| `imported` | Rows written to the database |
| `skipped` | Rows without a policy number or first name, with their spreadsheet row number and reason |
| `counts` | Distinct records written per collection |
| `unmappedFields` | Expected fields whose column was not found in the headers |

**How it uses worker threads.** The route saves the file and starts `uploadWorker.js` in a `Worker`. The worker parses the sheet, opens its own MongoDB connection, and writes the six collections with batched `bulkWrite` upserts (1,000 per batch). It writes them in dependency order: agents, LOBs and carriers first, then users, accounts and policies. The main thread only awaits the result, so other requests stay fast during a big import. In testing, `/api/health` answered in 12 ms while a 30,000-row XLSX was importing (about 7.5 s).

**Column names.** Headers are matched case-insensitively, ignoring spaces, `_` and `-`. The defaults follow the assessment sheet:

| Field | Accepted headers |
|---|---|
| agentName | `agent`, `agentName` |
| firstName | `firstname`, `first_name`, `username`, `name` (holds the full name, e.g. "Lura Lucca") |
| dob | `dob`, `dateOfBirth`, `birthDate` |
| address | `address` |
| phoneNumber | `phone`, `phoneNumber`, `mobile` |
| state | `state` |
| zipCode | `zip`, `zipCode`, `postalCode` (5-digit or ZIP+4) |
| city | `city` |
| email | `email`, `emailId` |
| gender | `gender` |
| userType | `userType` |
| accountName | `account_name`, `account` |
| accountType | `account_type` |
| categoryName | `category_name`, `category`, `lob` |
| companyName | `company_name`, `company`, `carrier` |
| policyNumber | `policy_number`, `policyNo` |
| policyStartDate | `policy_start_date`, `startDate` |
| policyEndDate | `policy_end_date`, `endDate` |
| policyMode | `policy_mode` |
| policyType | `policy_type` |
| premiumAmount | `premium_amount`, `premium` |
| premiumAmountWritten | `premium_amount_written` |
| producer | `producer` |
| csr | `csr` |

Other columns are ignored. To support other headers, add aliases in `src/config/columnMap.js`.

**Value handling:**

- **Dates** may be Excel date cells, `M/D/YYYY` text (`11/2/2018`, `2/11/1960`) or ISO strings. They are stored at UTC midnight of that day, so they don't shift by a day with the server's timezone.
- **Zip codes** that Excel stored as numbers get their leading zeros back (`4101` becomes `04101`). ZIP+4 text such as `27101-3843` is kept as-is.
- **Phone numbers** are stored as text (`8677356559`).
- **Premiums** accept `1180.83`, `1,180.83` or `$1180.83`.
- **Blank cells** (e.g. an empty `gender`) are not stored, and they don't erase existing values on a re-upload.

**Errors:** `400` when no file is attached or the extension isn't allowed, `413` when the file is over 50 MB, `500` when parsing or the database fails.

### 1.2 Search by username: `GET /api/policies/search`

| Query param | Required | Description |
|---|---|---|
| `username` | yes | The user's name from the sheet's `firstname` column (the sheet has no separate username column) |
| `partial` | no | `true` to match anywhere in the name |

The `firstname` column holds the full name ("Lura Lucca"). Matching is case-insensitive:

| Query | Default | `partial=true` |
|---|---|---|
| `Lura` | ✅ matches "Lura Lucca" (whole leading word) | ✅ |
| `lura lucca` | ✅ | ✅ |
| `Lu` | ❌ 404 (not a whole word) | ✅ also matches "Lucius Galeana" |
| `Lucca` | ❌ 404 (not a leading word) | ✅ |

```bash
curl "http://localhost:3000/api/policies/search?username=lura"
curl "http://localhost:3000/api/policies/search?username=lura%20lucca"
curl "http://localhost:3000/api/policies/search?username=lucca&partial=true"
```

**200 OK**

```json
{
  "count": 6,
  "data": [
    {
      "user": {
        "_id": "…", "firstName": "Lura Lucca", "email": "madler@yahoo.ca", "phoneNumber": "8677356559",
        "address": "170 MATTHIAS CT", "city": "MOCKSVILLE", "state": "NC", "zipCode": "27028",
        "userType": "Active Client", "dob": "1960-02-11T00:00:00.000Z"
      },
      "policies": [
        {
          "_id": "…", "policyNumber": "YEEX9MOIBU7X",
          "policyStartDate": "2018-11-02T00:00:00.000Z", "policyEndDate": "2019-11-02T00:00:00.000Z",
          "policyMode": 12, "policyType": "Single", "premiumAmount": 1180.83,
          "producer": "Brandie Placencia", "csr": "Tami Ellison",
          "category": "Commercial Auto", "carrier": "Integon Gen Ins Corp", "agent": "Alex Watson",
          "policyCategoryId": "…", "companyId": "…", "userId": "…", "agentId": "…"
        }
      ]
    }
  ]
}
```

Policies are sorted newest start date first. **Errors:** `400` when `username` is missing, `404` when no user matches.

### 1.3 Aggregated policies per user: `GET /api/policies/aggregate`

| Query param | Default | Description |
|---|---|---|
| `page` | 1 | Page number |
| `limit` | 50 | Users per page (max 500) |

```bash
curl "http://localhost:3000/api/policies/aggregate?page=1&limit=50"
```

A single MongoDB aggregation pipeline joins `lobs`, `carriers`, `agents` and `users` with `$lookup`, groups policies by user, and paginates with `$facet`:

```json
{
  "page": 1, "limit": 50, "totalUsers": 9,
  "data": [
    {
      "userId": "…", "firstName": "Lura Lucca", "email": "madler@yahoo.ca", "userType": "Active Client",
      "totalPolicies": 6,
      "totalPremium": 7793.48,
      "firstPolicyStart": "2018-11-02T00:00:00.000Z",
      "lastPolicyEnd": "2024-11-02T00:00:00.000Z",
      "categories": ["Commercial Auto"],
      "carriers": ["Integon Gen Ins Corp"],
      "policies": [
        {
          "_id": "…", "policyNumber": "YEEX9MOIBU7X", "policyType": "Single", "premiumAmount": 1180.83,
          "category": "Commercial Auto", "carrier": "Integon Gen Ins Corp", "agent": "Alex Watson",
          "policyStartDate": "2018-11-02T00:00:00.000Z", "policyEndDate": "2019-11-02T00:00:00.000Z"
        }
      ]
    }
  ]
}
```

`totalPremium` is the sum of `premiumAmount` across the user's policies. Results are sorted by policy count (descending), then name.

## Task 2

### 2.1 CPU monitoring and auto restart

`npm start` runs `src/index.js`, a small supervisor that forks the API (`src/server.js`) with Node's `cluster` module.

1. Every second (`CPU_CHECK_INTERVAL_MS`), the API process samples its own CPU with `process.cpuUsage()`. 100% means one core fully busy. Worker-thread CPU counts too, so the value can go above 100%.
2. When usage stays at or above `CPU_THRESHOLD` (70) for `CPU_BREACH_COUNT` (3) samples in a row, the API tells the supervisor. If the event loop is blocked, each missed interval counts, so a long synchronous task still triggers a restart.
3. The supervisor starts a fresh API process and waits until it is listening. Only then does it ask the old process to shut down. The old process stops taking new connections, finishes in-flight requests (such as an upload), and exits. The port is never closed during the switch.
4. If the old process hasn't exited `SHUTDOWN_GRACE_MS` + 5 s later, it is killed.
5. If the API process crashes for any other reason, the supervisor starts a new one after 1 s.

Set `CPU_SCOPE=system` to measure whole-machine CPU (`os.cpus()`) instead of the server process.

`npm run start:app` (no supervisor) still monitors CPU. On a breach it exits with code 1, so pm2, nodemon or a Docker restart policy can restart it.

**Try it** (requires `ENABLE_DEBUG_ROUTES=true`):

```bash
curl http://localhost:3000/api/health                 # note the pid
curl "http://localhost:3000/api/debug/cpu-burn?seconds=5"
sleep 8; curl http://localhost:3000/api/health        # new pid
```

Log output:

```
[server 992] CPU at 84.7% (threshold 70%), restarting
[supervisor] pid 992 hit 84.7% CPU, starting replacement (restart #1)
[server 1150] listening on http://localhost:3000
[server 992] shutting down: replaced by supervisor
```

`GET /api/health` response:

```json
{ "status": "ok", "pid": 1150, "uptimeSeconds": 4, "cpuPercent": 1.8, "cpuThreshold": 70, "cpuScope": "process", "cores": 8 }
```

### 2.2 Scheduled message: `POST /api/messages/schedule`

```bash
curl -X POST http://localhost:3000/api/messages/schedule \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "day": "2026-10-20", "time": "14:30"}'
```

| Field | Format |
|---|---|
| `message` | Any non-empty string |
| `day` | A date `YYYY-MM-DD`, or a weekday name such as `"monday"` (its next occurrence) |
| `time` | `HH:mm`, `HH:mm:ss` or `hh:mm AM/PM` |

Day and time are read in the **server's local timezone**. A missing field, a bad format, an invalid date (e.g. `2026-02-30`) or a time in the past returns `400`.

**201 Created**

```json
{
  "message": "Message scheduled",
  "data": {
    "_id": "…", "message": "Hello", "day": "2026-10-20", "time": "14:30",
    "runAt": "2026-10-20T09:00:00.000Z", "status": "pending",
    "createdAt": "…", "updatedAt": "…"
  }
}
```

**How it works.** The request is stored in `scheduledmessages` with its computed `runAt` and `status: "pending"`. A scheduler in the API process checks every second (`SCHEDULER_INTERVAL_MS`). Once `runAt` arrives, it inserts the message into the `messages` collection and marks the schedule `done`.

- Schedules live in MongoDB, not in in-memory timers, so they survive a CPU-triggered restart or a crash. Jobs left in `processing` are put back to `pending` on startup.
- Each job is claimed atomically (`findOneAndUpdate` from `pending` to `processing`). The message is inserted with an upsert on `scheduleId`, so it is never inserted twice, even with two server processes running during a restart.

Check the results:

```bash
curl "http://localhost:3000/api/messages/scheduled?status=pending"
curl http://localhost:3000/api/messages
```

## Environment variables

Copy `.env.example` to `.env`. All variables are optional.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/insurance_db` | MongoDB connection string |
| `CPU_THRESHOLD` | `70` | Restart threshold, percent |
| `CPU_CHECK_INTERVAL_MS` | `1000` | CPU sample interval |
| `CPU_BREACH_COUNT` | `3` | Consecutive samples over the threshold before a restart |
| `CPU_SCOPE` | `process` | `process` (this server) or `system` (whole machine) |
| `SHUTDOWN_GRACE_MS` | `60000` | Time a replaced server gets to finish in-flight requests |
| `SCHEDULER_INTERVAL_MS` | `1000` | How often due messages are checked |
| `ENABLE_DEBUG_ROUTES` | `false` | Enables `GET /api/debug/cpu-burn` (keep off in production) |

## Project layout

```
docs/
  swagger.yaml             OpenAPI 3.0 spec, served at /api-docs
src/
  index.js                 supervisor: forks the API, replaces it on CPU breach (Task 2.1)
  server.js                API process: DB connect, HTTP server, CPU monitor, scheduler
  app.js                   express app, Swagger UI, 404 + error handler
  routes/index.js          all routes, multer upload config
  controllers/
    uploadController.js    POST /upload
    policyController.js    search + aggregate
    messageController.js   schedule + list
  workers/uploadWorker.js  worker thread: parse the sheet and write all six collections
  services/
    workerRunner.js        promise wrapper around worker_threads
    cpuMonitor.js          CPU sampling + breach detection
    messageScheduler.js    inserts scheduled messages when they fall due
  models/                  Agent, User, Account, LOB, Carrier, Policy, ScheduledMessage, Message
  config/
    index.js               env-based config
    db.js                  mongoose connection
    columnMap.js           spreadsheet header -> field mapping (edit for other sheets)
  utils/
    rowMapper.js           header resolution, row -> documents, date parsing
    schedule.js            day/time parsing for scheduled messages
scripts/generateSample.js  sample data generator
sample/                    generated sample CSV/XLSX
uploads/                   temporary upload storage (files are deleted after import)
```

## Error handling

Every error response is JSON with a `message` field:

```json
{ "message": "Query parameter \"username\" is required" }
```

| Status | When |
|---|---|
| `400` | Validation failed (missing file/field, bad format, past time) |
| `404` | Unknown route, or no user matches a search |
| `413` | Uploaded file larger than 50 MB |
| `500` | Unexpected server or database error (logged on the server) |

## Troubleshooting

| Problem | Fix |
|---|---|
| `failed to start: connect ECONNREFUSED 127.0.0.1:27017` | MongoDB isn't running, or `MONGO_URI` is wrong. |
| `unmappedFields` lists columns after upload | The sheet's headers differ from the defaults. Add aliases in `src/config/columnMap.js`. |
| `/api/debug/cpu-burn` returns 404 | Set `ENABLE_DEBUG_ROUTES=true` in `.env` and restart. |
| Server doesn't restart during the CPU demo | Use `npm start` (the supervisor), not `npm run start:app`, and burn for longer than `CPU_BREACH_COUNT` × `CPU_CHECK_INTERVAL_MS`. |
| Scheduled message arrives at an unexpected hour | `day`/`time` are in the server's local timezone. `runAt` is stored in UTC. |
| `EADDRINUSE` | Another process uses `PORT`. Stop it or change `PORT`. |

## Assumptions

- The sheet's columns follow the standard assessment sheet listed above. A different sheet needs only a one-line change in `src/config/columnMap.js`.
- "Username" means the name in the sheet's `firstname` column. It holds the full name ("Lura Lucca"), so a search on the first word ("Lura") also matches.
- Only the first worksheet of an XLSX file is imported.
- The upload responds when the import finishes, with a summary. For very large files, it could instead return a job id right away.
- The API has no authentication, as none was required by the assessment.
