import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from '../config/database.js';
import { runCloudinaryToR2Migration } from '../services/migration.service.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

const isDryRun = process.argv.includes('--dry-run');

async function executeMigrationScript() {
  console.log('====================================================');
  console.log('  Cloudinary to Cloudflare R2 URL Migration Script  ');
  console.log('====================================================');

  try {
    await connectDB();
  } catch (dbErr) {
    console.warn(`Primary connectDB failed: ${dbErr.message}. Trying fallback URI...`);
    const fallbackUri = process.env.MONGODB_URI_LOCAL || process.env.MONGODB_URI;
    await mongoose.connect(fallbackUri);
  }
  console.log(`Connected to MongoDB: ${mongoose.connection.host} / Database: ${mongoose.connection.name}\n`);

  const result = await runCloudinaryToR2Migration({ dryRun: isDryRun });

  console.log('----------------------------------------------------');
  console.log(`Execution Mode: ${result.dryRun ? 'DRY-RUN (No DB modifications)' : 'LIVE MIGRATION'}`);
  console.log(`R2 Target Base URL: ${result.r2PublicUrl}`);
  console.log('Collection Breakdown:');
  Object.entries(result.details).forEach(([key, val]) => {
    console.log(`   - ${key}: ${val.updated} updated / ${val.scanned} scanned`);
  });
  console.log('----------------------------------------------------');
  console.log('Migration Completed Successfully!');
  console.log(`Total Documents Updated: ${result.totalUpdatedDocs}`);
  console.log(`Total Cloudinary URLs Converted to R2: ${result.totalReplacedUrls}`);
  console.log('====================================================\n');

  await mongoose.disconnect();
}

executeMigrationScript().catch((err) => {
  console.error('\n❌ Migration Script Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
