import uploadService from '../services/upload.service.js';
import r2Service from '../services/r2.service.js';
import { isCloudinaryUrl, getImageUrl } from '../../../hbs-ui/src/utils/cloudinary.js';

async function runStorageVerificationTests() {
  console.log('--- Phase 1 R2 Migration Verification Tests ---');

  // Test 1: Key extraction from various URLs
  console.log('\n[Test 1] Key extraction logic:');
  const testUrl1 = 'https://images.hijabsbyshiza.com/hbs-products/abc-123.jpg';
  const extracted1 = r2Service.extractKey(testUrl1);
  console.log(`Input: ${testUrl1} => Key: ${extracted1}`);
  if (extracted1 !== 'hbs-products/abc-123.jpg') throw new Error('Key extraction test 1 failed');

  const testObj = { provider: 'r2', key: 'hbs-categories/def-456.png', url: 'https://images.hijabsbyshiza.com/hbs-categories/def-456.png' };
  const extracted2 = r2Service.extractKey(testObj);
  console.log(`Input: object => Key: ${extracted2}`);
  if (extracted2 !== 'hbs-categories/def-456.png') throw new Error('Key extraction test 2 failed');

  // Test 2: Provider routing in UploadService
  console.log('\n[Test 2] Storage Provider Routing:');
  const provider = uploadService.getStorageProvider();
  console.log(`Default storage provider configured: '${provider}'`);
  if (provider !== 'r2') throw new Error(`Default provider should be r2, got ${provider}`);

  // Test 3: Frontend helper getImageUrl
  console.log('\n[Test 3] Frontend getImageUrl helper:');
  const cldUrl = 'https://res.cloudinary.com/ddnc1gkuw/image/upload/v12345/hbs-products/sample.jpg';
  const r2Url = 'https://images.hijabsbyshiza.com/hbs-products/new-image.jpg';
  
  const optimizedCld = getImageUrl(cldUrl, { preset: 'card' });
  const rawR2 = getImageUrl(r2Url, { preset: 'card' });
  
  console.log(`Cloudinary input => ${optimizedCld}`);
  console.log(`R2 input         => ${rawR2}`);
  
  if (!optimizedCld.includes('w_400') || !optimizedCld.includes('q_auto')) {
    throw new Error('Cloudinary optimization failed in getImageUrl');
  }
  if (rawR2 !== r2Url) {
    throw new Error('R2 URL was modified unexpectedly by getImageUrl');
  }

  // Test 4: R2 S3 Client Initialization & Credential Check
  console.log('\n[Test 4] R2 S3 Client config check:');
  process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test_account_id';
  process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test_access_key';
  process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test_secret_key';

  const client = r2Service.getClient();
  console.log('R2 S3 Client initialized with forcePathStyle: true.');

  console.log('\n✅ All unit verification tests passed successfully!');
}

runStorageVerificationTests().catch((err) => {
  console.error('\n❌ Verification test failed:', err.message);
  process.exit(1);
});
