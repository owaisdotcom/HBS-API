/**
 * Seed script to populate initial Terms & Conditions content.
 * Loads from seed-terms-conditions.json when available.
 * Run: npm run seed:terms
 * (from HBS-API directory, with NODE_ENV and MONGODB_URI set)
 */
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import connectDB from '../config/database.js';
import TermsConditions from '../models/TermsConditions.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JSON_PATH = join(__dirname, '../../seed-terms-conditions.json');

function loadSeedData() {
  if (existsSync(JSON_PATH)) {
    const raw = readFileSync(JSON_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return {
      title: data.title,
      introText: data.introText,
      lastUpdated: data.lastUpdated ? new Date(data.lastUpdated) : new Date(),
      sections: data.sections || [],
      acceptanceText: data.acceptanceText
    };
  }
  return null;
}

const seedTermsConditions = async () => {
  try {
    const seedData = loadSeedData();
    if (!seedData || !seedData.sections.length) {
      console.error('✗ seed-terms-conditions.json not found or empty. Create it at HBS-API/seed-terms-conditions.json');
      process.exit(1);
    }

    await connectDB();
    const doc = await TermsConditions.getDocument();

    if (doc.sections && doc.sections.length > 0) {
      console.log('Terms & Conditions already have content. Skipping seed. Delete sections first to re-seed.');
      process.exit(0);
      return;
    }

    doc.title = seedData.title;
    doc.introText = seedData.introText;
    doc.lastUpdated = seedData.lastUpdated;
    doc.sections = seedData.sections;
    doc.acceptanceText = seedData.acceptanceText;

    await doc.save();
    console.log('✓ Terms & Conditions seeded successfully from seed-terms-conditions.json');
    process.exit(0);
  } catch (err) {
    console.error('✗ Seed error:', err.message);
    process.exit(1);
  }
};

seedTermsConditions();
