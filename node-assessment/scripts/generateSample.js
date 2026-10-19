// Writes sample/data-sheet.csv and sample/data-sheet.xlsx in the same layout as the
// assessment's data sheet, for trying the upload API without the real file.
// The first rows are copied from the real sheet; the rest reuse those people with new
// policies, so the aggregate API shows several policies per user.
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const rows = Number(process.argv[2]) || 50;

// [producer, policy_number, premium, company, category, start, end, policy_mode, csr,
//  account_name, email, firstname, city, phone, address, state, zip, dob]
const REAL = [
  ['Brandie Placencia', 'YEEX9MOIBU7X', 1180.83, 'Integon Gen Ins Corp', 'Commercial Auto', '11/2/2018', '11/2/2019', 12, 'Tami Ellison', 'Lura Lucca & Owen Dodson', 'madler@yahoo.ca', 'Lura Lucca', 'MOCKSVILLE', 8677356559, '170 MATTHIAS CT', 'NC', 27028, '2/11/1960'],
  ['Sol Birney', '7CZ3CLKWMSKH', 2105.9, 'Integon Ind Corp', 'Commercial Auto', '11/9/2018', '11/9/2019', 12, 'Molly Eaton', 'Torie Buchanan & Glenda Ruiz', 'mbalazin@mac.com', 'Torie Buchanan', 'WINSTON SALEM', 6094964988, '910 DELMONTE DR', 'NC', 27106, '10/17/1946'],
  ['Yee Ribble', 'ZSB972578CRV', 2105.9, 'Integon Ind Corp', 'Commercial Auto', '11/9/2018', '11/9/2019', 12, 'Gordon Carey', 'Sebastian Scarberry & Jonah Bishop', 'maikelnai@msn.com', 'Sebastian Scarberry', 'WINSTON SALEM', 6888541383, '910 DELMONTE DR', 'NC', 27106, '8/20/1958'],
  ['Carmella Landers', 'JRWJV5U5XWE4', 1323.63, 'Nationwide Prop & Cas Ins Co_Copy', 'Personal Auto', '12/31/2018', '6/30/2019', 6, 'Cliff Alvarez', 'Vergie Hardesty & Wilma Wong', 'killmenow@me.com', 'Vergie Hardesty', 'Winston Salem', 4183346713, '301 N Main St Ste 2100', 'NC', '27101-3843', '8/2/1958'],
  ['Jared Roan', 'AUU730H3S5JU', 1323.63, 'Nationwide Prop & Cas Ins Co_Copy', 'Personal Auto', '12/31/2018', '6/30/2019', 6, 'Jan Hensley', 'Omar Rossbach & Laurie Ortega', 'bhtower@hotmail.com', 'Omar Rossbach', 'Winston Salem', 7645408831, '301 N Main St Ste 2100', 'NC', '27101-3843', '11/20/1949'],
  ['Victorina Ebert', '60G18LYQO157', 729.13, 'Nationwide Prop & Cas Ins Co_Copy', 'Personal Auto', '12/7/2018', '6/7/2019', 6, 'Cara Mccoy', 'Lucius Galeana & Efren Pena', 'whimsy@hotmail.com', 'Lucius Galeana', 'Winston Salem', 7556142383, '1505 Barrington Way Ct', 'NC', '27106-4798', '11/20/1949'],
  ['Emiko Lobo', '52W3TI0WSRYZ', 1495, 'Nationwide Mut Fire Ins Co', 'Homeowners', '7/5/2018', '7/5/2019', 12, 'Harley Kerr', 'Humberto Boykins & Angelo Pugh', 'jimxugle@me.com', 'Humberto Boykins', 'Winston Salem', 5813432048, '2970 Kedron Ct', 'NC', '27106-5009', '11/15/1951'],
  ['Xavier Hughes', '1L4U1S4WVUS0', 644.01, 'Nationwide Mut Ins Co_Copy', 'Personal Auto', '2/1/2019', '8/1/2019', 6, 'Todd Mckee', 'Chia Duque & Moses Wilcox', 'dwendlan@gmail.com', 'Chia Duque', 'Winston Salem', 7045490404, '2970 Kedron Ct', 'NC', '27106-5009', '9/24/1952'],
  ['Aubrey Loder', 'CNJHKXQCQVBM', 548.38, 'Nationwide Mut Ins Co_Copy', 'Personal Auto', '11/14/2018', '5/14/2019', 6, 'Sherri Austin', 'Shawnda Armond & Long Miranda', 'vertigo@msn.com', 'Shawnda Armond', 'Winston Salem', 9103623679, '2460 Lake Forest Dr', 'NC', '27106-9734', '8/9/1960'],
];

// "11/2/2018" -> local-midnight Date, which SheetJS stores as a whole Excel serial number
const parseUS = (s) => {
  const [m, d, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
};

// Deterministic 12-character policy numbers like the real sheet's
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const policyNumber = (i) => {
  let n = (i + 1) * 2654435761;
  let out = '';
  for (let k = 0; k < 12; k += 1) {
    out += CHARS[n % CHARS.length];
    n = Math.floor(n / CHARS.length) + (k + 1) * 7919 * (i + 3);
  }
  return out;
};

const data = Array.from({ length: rows }, (_, i) => {
  const base = REAL[i % REAL.length];
  const [producer, realNumber, realPremium, company, category, realStart, realEnd, mode, csr,
    account, email, name, city, phone, address, state, zip, dob] = base;

  // First pass uses the real rows as-is; later passes renew each policy one term later.
  const term = Math.floor(i / REAL.length);
  const start = parseUS(realStart);
  const end = parseUS(realEnd);
  if (term > 0) {
    start.setMonth(start.getMonth() + mode * term);
    end.setMonth(end.getMonth() + mode * term);
  }

  return {
    agent: 'Alex Watson',
    userType: 'Active Client',
    policy_mode: mode,
    producer,
    policy_number: term === 0 ? realNumber : policyNumber(i),
    premium_amount_written: '',
    premium_amount: term === 0 ? realPremium : Math.round(realPremium * (1 + 0.04 * term) * 100) / 100,
    policy_type: 'Single',
    company_name: company,
    category_name: category,
    policy_start_date: start,
    policy_end_date: end,
    csr,
    account_name: account,
    email,
    gender: '',
    firstname: name,
    city,
    account_type: 'Commercial',
    phone,
    address,
    state,
    zip,
    dob: parseUS(dob),
    primary: '',
    'Applicant ID': '',
    agency_id: '',
    'hasActive ClientPolicy': '',
  };
});

const outDir = path.join(__dirname, '..', 'sample');
fs.mkdirSync(outDir, { recursive: true });
const sheet = XLSX.utils.json_to_sheet(data, { dateNF: 'm/d/yyyy' });
fs.writeFileSync(path.join(outDir, 'data-sheet.csv'), XLSX.utils.sheet_to_csv(sheet));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet, 'Sheet1');
XLSX.writeFile(wb, path.join(outDir, 'data-sheet.xlsx'));
console.log(`Wrote ${rows} rows to sample/data-sheet.csv and sample/data-sheet.xlsx`);
