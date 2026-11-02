import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { executeLegacyR2Migration, rollbackLegacyR2Migration } from '../src/services/legacyMigration.service.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hbs-ecommerce';

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute') || args.includes('-e') || args.includes('--live');
  const isForceAll = args.includes('--force-all') || args.includes('--all');
  const noVerify = args.includes('--no-verify');
  const rollbackIdx = args.indexOf('--rollback');
  const rollbackId = rollbackIdx !== -1 ? args[rollbackIdx + 1] : null;

  console.log('===============================================================');
  console.log('  HBS Legacy R2 URL Migration & Verification Tool');
  console.log('===============================================================');

  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to database: ${MONGODB_URI}\n`);

  if (rollbackId) {
    console.log(`[ACTION] Initiating rollback with backup identifier: ${rollbackId}`);
    try {
      const rollbackResult = await rollbackLegacyR2Migration(rollbackId);
      console.log('\n✅ Rollback completed successfully!');
      console.log(`Restored documents: ${rollbackResult.totalRestoredDocs}`);
      console.log('Collections restored:', rollbackResult.restoredCollections);
    } catch (err) {
      console.error('\n❌ Rollback failed:', err.message);
    } finally {
      await mongoose.disconnect();
      return;
    }
  }

  const dryRun = !isExecute;
  const verifyR2 = !isForceAll && !noVerify;

  console.log(`Mode:            ${dryRun ? 'DRY-RUN (Preview only, no DB writes)' : 'LIVE EXECUTION (Database will be updated)'}`);
  console.log(`R2 Verification: ${verifyR2 ? 'ENABLED (Checks R2 HTTP status 200 before migrating)' : 'DISABLED (Migrating all legacy domain URLs)'}`);
  console.log(`Force All:       ${isForceAll ? 'YES' : 'NO'}`);
  console.log('---------------------------------------------------------------\n');

  console.log('Scanning database and verifying objects against Cloudflare R2...\n');
  const result = await executeLegacyR2Migration({
    dryRun,
    verifyR2,
    forceAll: isForceAll
  });

  console.log('===============================================================');
  console.log('                     MIGRATION SUMMARY');
  console.log('===============================================================');
  console.log(`Total Documents Scanned:  ${result.totalDocumentsScanned}`);
  console.log(`Total Legacy URLs Found:  ${result.totalLegacyUrlsFound}`);
  console.log(`Total URLs Migrated:      ${result.totalUrlsMigrated}`);
  console.log(`Total URLs Skipped:       ${result.totalUrlsSkipped}`);
  console.log(`Total Documents Modified: ${result.totalDocumentsModified}`);

  if (result.backupFile) {
    console.log(`\nBackup Saved To File:     ${result.backupFile}`);
    console.log(`Backup ID:                ${result.backupId}`);
  }

  console.log('\n--- Per-Collection Breakdown ---');
  for (const [colName, stats] of Object.entries(result.collections)) {
    if (stats.legacyUrlsFound > 0 || stats.modifiedDocs > 0) {
      console.log(`\n• ${colName.toUpperCase()}:`);
      console.log(`    Docs Scanned:        ${stats.scannedDocs}`);
      console.log(`    Docs Modified:       ${stats.modifiedDocs}`);
      console.log(`    Legacy URLs Found:   ${stats.legacyUrlsFound}`);
      console.log(`    URLs Migrated:       ${stats.urlsMigrated}`);
      console.log(`    URLs Skipped:        ${stats.urlsSkipped}`);
      console.log(`    Affected Fields:     ${stats.affectedFields.join(', ')}`);
    }
  }

  if (result.skippedItems.length > 0) {
    console.log('\n--- Skipped / Missing Objects (First 15 items) ---');
    result.skippedItems.slice(0, 15).forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.collection}] doc:${item.docId} field:${item.fieldPath}`);
      console.log(`     Key:    ${item.objectKey}`);
      console.log(`     Reason: ${item.reason}`);
    });
    if (result.skippedItems.length > 15) {
      console.log(`     ... and ${result.skippedItems.length - 15} more.`);
    }
  }

  if (result.migratedItems.length > 0) {
    console.log('\n--- Migrated Samples (First 5 items) ---');
    result.migratedItems.slice(0, 5).forEach((item, idx) => {
      console.log(`  ${idx + 1}. [${item.collection}] doc:${item.docId} field:${item.fieldPath}`);
      console.log(`     Old: ${item.oldUrl}`);
      console.log(`     New: ${item.newUrl}`);
    });
  }

  console.log('\n===============================================================');
  if (dryRun) {
    console.log('DRY-RUN COMPLETE: No changes were committed to MongoDB.');
    console.log('To execute the live migration, run:');
    console.log('  node scripts/migrate-legacy-r2-urls.js --execute');
  } else {
    console.log('LIVE MIGRATION COMPLETE: All verified records updated successfully.');
  }
  console.log('===============================================================');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});

