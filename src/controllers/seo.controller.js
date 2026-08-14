import Product from '../models/Product.js';
import Category from '../models/Category.js';
import PreMadeBundle from '../models/PreMadeBundle.js';
import asyncHandler from '../utils/asyncHandler.js';

export const getSitemap = asyncHandler(async (req, res) => {
  const baseUrl = process.env.PUBLIC_FRONTEND_URL || 'https://www.hijabsbyshiza.com';

  const staticPages = [
    '',
    '/about',
    '/contact',
    '/terms-conditions',
    '/categories',
    '/bundles/create-your-own',
    '/bundles/pre-made'
  ];

  const [products, categories, bundles] = await Promise.all([
    Product.find({ isDeleted: { $ne: true }, status: { $ne: 'inactive' } }).select('slug updatedAt').lean(),
    Category.find({ isActive: { $ne: false } }).select('slug updatedAt').lean(),
    PreMadeBundle.find({ isActive: { $ne: false } }).select('slug updatedAt').lean()
  ]);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Static pages
  for (const page of staticPages) {
    xml += '  <url>\n';
    xml += `    <loc>${baseUrl}${page}</loc>\n`;
    xml += `    <changefreq>${page === '' ? 'daily' : 'weekly'}</changefreq>\n`;
    xml += `    <priority>${page === '' ? '1.0' : '0.8'}</priority>\n`;
    xml += '  </url>\n';
  }

  // Categories
  for (const cat of categories) {
    if (cat.slug) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/category/${cat.slug}</loc>\n`;
      xml += `    <lastmod>${(cat.updatedAt || new Date()).toISOString().split('T')[0]}</lastmod>\n`;
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';
    }
  }

  // Products
  for (const prod of products) {
    if (prod.slug) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/product/${prod.slug}</loc>\n`;
      xml += `    <lastmod>${(prod.updatedAt || new Date()).toISOString().split('T')[0]}</lastmod>\n`;
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.9</priority>\n';
      xml += '  </url>\n';
    }
  }

  // Pre-made Bundles
  for (const bundle of bundles) {
    if (bundle.slug) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}/bundles/pre-made/${bundle.slug}</loc>\n`;
      xml += `    <lastmod>${(bundle.updatedAt || new Date()).toISOString().split('T')[0]}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    }
  }

  xml += '</urlset>';

  res.header('Content-Type', 'application/xml');
  res.send(xml);
});
