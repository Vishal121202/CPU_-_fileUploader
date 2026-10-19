// Maps each field we store to its column in sample/data-sheet.csv.
// Headers are compared after lowercasing and stripping spaces/underscores/dashes/dots,
// so "policy_number" is written here as "policynumber" (the CSV header is in the comment).
// If another sheet uses different column names, add them to the relevant list.
//
// CSV columns not stored (empty in the data): primary, Applicant ID, agency_id, hasActive ClientPolicy
module.exports = {
  agentName: ['agent'], // agent

  firstName: ['firstname'], // firstname (holds the full name, e.g. "Lura Lucca")
  dob: ['dob'], // dob
  address: ['address'], // address
  phoneNumber: ['phone'], // phone
  state: ['state'], // state
  zipCode: ['zip'], // zip
  city: ['city'], // city
  email: ['email'], // email
  gender: ['gender'], // gender
  userType: ['usertype'], // userType

  accountName: ['accountname'], // account_name
  accountType: ['accounttype'], // account_type

  categoryName: ['categoryname'], // category_name

  companyName: ['companyname'], // company_name

  policyNumber: ['policynumber'], // policy_number
  policyStartDate: ['policystartdate'], // policy_start_date
  policyEndDate: ['policyenddate'], // policy_end_date
  policyMode: ['policymode'], // policy_mode
  policyType: ['policytype'], // policy_type
  premiumAmount: ['premiumamount'], // premium_amount
  premiumAmountWritten: ['premiumamountwritten'], // premium_amount_written
  producer: ['producer'], // producer
  csr: ['csr'], // csr
};
