import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';
import cacheService from '../services/cache.service.js';

const getRangeDates = ({ range, from, to }) => {
  const now = new Date();

  const normalizeStart = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const normalizeEnd = (date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  if (from && to) {
    return {
      start: normalizeStart(from),
      end: normalizeEnd(to)
    };
  }

  const start = new Date(now);

  switch (range) {
    case 'quarter':
      start.setMonth(start.getMonth() - 3);
      break;
    case 'half-year':
      start.setMonth(start.getMonth() - 6);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'month':
    default:
      start.setMonth(start.getMonth() - 1);
      break;
  }

  return {
    start: normalizeStart(start),
    end: normalizeEnd(now)
  };
};

const buildTimeSeries = async (match) => {
  const rangeDays = Math.ceil((match.createdAt.$lte - match.createdAt.$gte) / (1000 * 60 * 60 * 24));
  const format = rangeDays <= 31 ? '%Y-%m-%d' : '%Y-%m';

  const series = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format, date: '$createdAt' } },
        orders: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [{ $eq: ['$paymentStatus', 'verified'] }, '$total', 0]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return {
    labels: series.map((item) => item._id),
    orders: series.map((item) => item.orders),
    revenue: series.map((item) => item.revenue)
  };
};

export const getDashboardOverview = asyncHandler(async (req, res) => {
  const { range = 'month', from, to } = req.query;

  const cacheKey = `admin_dashboard_${range}_${from || ''}_${to || ''}`;
  const cachedData = cacheService.get(cacheKey);
  if (cachedData) {
    return res.json(new ApiResponse(200, cachedData, 'Dashboard overview retrieved (cached)'));
  }

  const { start, end } = getRangeDates({ range, from, to });

  const match = {
    createdAt: { $gte: start, $lte: end }
  };

  const [
    orderAgg,
    paymentStatusAgg,
    orderStatusAgg,
    timeSeries,
    bestSellers,
    costTotals,
    inventoryStats,
    stockAlerts
  ] = await Promise.all([
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          verifiedOrders: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'verified'] }, 1, 0] }
          },
          totalRevenue: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'verified'] }, '$total', 0] }
          },
          refundCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'cancelled'] },
                    { $eq: ['$paymentStatus', 'verified'] }
                  ]
                },
                1,
                0
              ]
            }
          },
          refundAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 'cancelled'] },
                    { $eq: ['$paymentStatus', 'verified'] }
                  ]
                },
                '$total',
                0
              ]
            }
          }
        }
      }
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    buildTimeSeries(match),
    Order.aggregate([
      { $match: { ...match, paymentStatus: 'verified' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
        }
      },
      { $sort: { quantity: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          name: '$product.name',
          slug: '$product.slug',
          price: '$product.price',
          costPrice: '$product.costPrice',
          stock: '$product.stock',
          image: {
            $ifNull: [{ $arrayElemAt: ['$product.images.url', 0] }, '$product.thumbnail']
          },
          quantity: 1,
          revenue: 1
        }
      }
    ]),
    Order.aggregate([
      { $match: { ...match, paymentStatus: 'verified' } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: { $multiply: ['$items.quantity', '$items.price'] } },
          totalCost: {
            $sum: { $multiply: ['$items.quantity', { $ifNull: ['$product.costPrice', 0] }] }
          }
        }
      }
    ]),
    Product.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          inStock: { $sum: { $cond: [{ $gt: ['$stock', 0] }, 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $eq: ['$stock', 0] }, 1, 0] } },
          lowStock: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] },
                1,
                0
              ]
            }
          },
          totalStockUnits: { $sum: '$stock' },
          inventoryValueCost: {
            $sum: { $multiply: ['$stock', { $ifNull: ['$costPrice', 0] }] }
          },
          inventoryValueRetail: { $sum: { $multiply: ['$stock', '$price'] } }
        }
      }
    ]),
    Product.find({
      status: 'active',
      $expr: { $lte: ['$stock', '$lowStockThreshold'] }
    })
      .sort({ stock: 1 })
      .limit(10)
      .select('name slug stock lowStockThreshold price costPrice images thumbnail')
  ]);

  const orderStats = orderAgg[0] || {
    totalOrders: 0,
    verifiedOrders: 0,
    totalRevenue: 0,
    refundCount: 0,
    refundAmount: 0
  };

  const netRevenue = orderStats.totalRevenue || 0;
  const verifiedOrders = orderStats.verifiedOrders || 0;
  const totalOrders = orderStats.totalOrders || 0;
  const aov = verifiedOrders > 0 ? netRevenue / verifiedOrders : 0;
  const conversionRate = totalOrders > 0 ? (verifiedOrders / totalOrders) * 100 : 0;

  const costStats = costTotals[0] || { totalSales: 0, totalCost: 0 };

  const responseData = {
    range: { start, end, preset: range },
    kpis: {
      totalOrders,
      verifiedOrders,
      grossSales: costStats.totalSales || 0,
      netRevenue,
      averageOrderValue: aov,
      paymentConversionRate: conversionRate,
      refundCount: orderStats.refundCount || 0,
      refundAmount: orderStats.refundAmount || 0
    },
    paymentStatus: paymentStatusAgg,
    orderStatus: orderStatusAgg,
    timeSeries,
    bestSellers,
    costTotals: {
      grossSales: costStats.totalSales || 0,
      netRevenue,
      totalCost: costStats.totalCost || 0,
      grossProfit: (costStats.totalSales || 0) - (costStats.totalCost || 0)
    },
    inventory: inventoryStats[0] || {
      totalProducts: 0,
      inStock: 0,
      outOfStock: 0,
      lowStock: 0,
      totalStockUnits: 0,
      inventoryValueCost: 0,
      inventoryValueRetail: 0
    },
    stockAlerts
  };

  cacheService.set(cacheKey, responseData, 60);

  res.json(
    new ApiResponse(200, responseData, 'Dashboard overview retrieved')
  );
});

