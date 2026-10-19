const { User, Policy } = require('../models');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const policyLookups = [
  { $lookup: { from: 'lobs', localField: 'policyCategoryId', foreignField: '_id', as: 'category' } },
  { $lookup: { from: 'carriers', localField: 'companyId', foreignField: '_id', as: 'carrier' } },
  { $lookup: { from: 'agents', localField: 'agentId', foreignField: '_id', as: 'agent' } },
  {
    $set: {
      category: { $first: '$category.categoryName' },
      carrier: { $first: '$carrier.companyName' },
      agent: { $first: '$agent.agentName' },
    },
  },
];

// GET /api/policies/search?username=Lura[&partial=true]
// The sheet has no username column; its "firstname" column holds the full name ("Lura Lucca").
// By default the search matches whole leading words, so "Lura" and "Lura Lucca" both find
// "Lura Lucca" but "Lu" does not. partial=true matches anywhere in the name.
async function searchByUsername(req, res, next) {
  try {
    const username = String(req.query.username || '').trim().replace(/\s+/g, ' ');
    if (!username) return res.status(400).json({ message: 'Query parameter "username" is required' });

    const pattern = escapeRegex(username).replace(/ /g, '\\s+');
    const regex = new RegExp(req.query.partial === 'true' ? pattern : `^${pattern}(\\s|$)`, 'i');
    const users = await User.find({ firstName: regex }).lean();
    if (!users.length) return res.status(404).json({ message: `No user found for "${username}"`, data: [] });

    const policies = await Policy.aggregate([
      { $match: { userId: { $in: users.map((u) => u._id) } } },
      ...policyLookups,
      { $project: { __v: 0, createdAt: 0, updatedAt: 0 } },
      { $sort: { policyStartDate: -1 } },
    ]);

    const byUser = new Map(users.map((u) => [String(u._id), { user: u, policies: [] }]));
    policies.forEach((p) => byUser.get(String(p.userId))?.policies.push(p));

    res.json({ count: policies.length, data: [...byUser.values()] });
  } catch (err) {
    next(err);
  }
}

// GET /api/policies/aggregate[?page=1&limit=50]
// One entry per user with their policy count, date range and policy list.
async function aggregateByUser(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 10));

    const [result] = await Policy.aggregate([
      ...policyLookups,
      {
        $group: {
          _id: '$userId',
          totalPolicies: { $sum: 1 },
          totalPremium: { $sum: '$premiumAmount' },
          firstPolicyStart: { $min: '$policyStartDate' },
          lastPolicyEnd: { $max: '$policyEndDate' },
          categories: { $addToSet: '$category' },
          carriers: { $addToSet: '$carrier' },
          policies: {
            $push: {
              _id: '$_id',
              policyNumber: '$policyNumber',
              policyStartDate: '$policyStartDate',
              policyEndDate: '$policyEndDate',
              policyType: '$policyType',
              premiumAmount: '$premiumAmount',
              category: '$category',
              carrier: '$carrier',
              agent: '$agent',
            },
          },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          firstName: '$user.firstName',
          email: '$user.email',
          userType: '$user.userType',
          totalPolicies: 1,
          totalPremium: { $round: ['$totalPremium', 2] },
          firstPolicyStart: 1,
          lastPolicyEnd: 1,
          categories: 1,
          carriers: 1,
          policies: 1,
        },
      },
      { $sort: { totalPolicies: -1, firstName: 1 } },
      {
        $facet: {
          meta: [{ $count: 'totalUsers' }],
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ]);

    res.json({ page, limit, totalUsers: result.meta[0]?.totalUsers || 0, data: result.data });
  } catch (err) {
    next(err);
  }
}

module.exports = { searchByUsername, aggregateByUser };
