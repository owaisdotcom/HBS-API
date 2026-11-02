import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hbs-ecommerce';
const LEGACY_DOMAIN = 'images.hijabsbyshiza.com';

async function scan() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to:', MONGODB_URI);
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  const results = {};

  for (const col of collections) {
    const c = db.collection(col.name);
    const docs = await c.find({}).toArray();
    let count = 0;
    const occurrences = [];

    function check(val, path, docId) {
      if (!val) return;
      if (typeof val === 'string') {
        if (val.includes(LEGACY_DOMAIN)) {
          count++;
          occurrences.push({ docId, path, val });
        }
      } else if (Array.isArray(val)) {
        val.forEach((item, idx) => check(item, `${path}[${idx}]`, docId));
      } else if (typeof val === 'object') {
        for (const k of Object.keys(val)) {
          check(val[k], path ? `${path}.${k}` : k, docId);
        }
      }
    }

    docs.forEach(doc => check(doc, '', doc._id));
    if (count > 0) {
      results[col.name] = { totalDocs: docs.length, count, occurrences };
    }
  }

  console.log('\n--- SCAN RESULTS ---');
  let totalLegacy = 0;
  for (const [col, data] of Object.entries(results)) {
    console.log(`\nCollection: ${col} (Total Docs: ${data.totalDocs}, Legacy URLs: ${data.count})`);
    totalLegacy += data.count;
    const paths = [...new Set(data.occurrences.map(o => o.path))];
    console.log(`  Affected fields: ${paths.join(', ')}`);
    console.log('  Sample occurrences (up to 5):');
    data.occurrences.slice(0, 5).forEach(o => {
      console.log(`    Doc ${o.docId} [${o.path}] => ${o.val}`);
    });
  }
  console.log(`\nTOTAL LEGACY URLS FOUND ACROSS DATABASE: ${totalLegacy}`);

  await mongoose.disconnect();
}

scan().catch(err => {
  console.error('Scan error:', err);
  process.exit(1);
});

