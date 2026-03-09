// Quick script to verify your .env EMAIL_PASSWORD
import dotenv from 'dotenv';
dotenv.config();

console.log('=================================');
console.log('EMAIL CONFIGURATION CHECK');
console.log('=================================');
console.log('EMAIL_HOST:', process.env.EMAIL_HOST);
console.log('EMAIL_PORT:', process.env.EMAIL_PORT);
console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD length:', process.env.EMAIL_PASSWORD?.length);
console.log('EMAIL_PASSWORD (hidden):', process.env.EMAIL_PASSWORD?.replace(/./g, '*'));
console.log('Has spaces?:', process.env.EMAIL_PASSWORD?.includes(' ') ? '❌ YES - REMOVE THEM!' : '✅ NO');
console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('=================================');


// Check if password looks like a valid app password (16 chars, no spaces)
if (process.env.EMAIL_PASSWORD) {
  const password = process.env.EMAIL_PASSWORD;
  
  if (password.includes(' ')) {
    console.log('⚠️  WARNING: Password contains spaces!');
    console.log('Remove all spaces from EMAIL_PASSWORD in .env');
    console.log('Current:', password);
    console.log('Should be:', password.replace(/\s/g, ''));
  } else if (password.length === 16) {
    console.log('✅ Password format looks correct (16 characters, no spaces)');
  } else {
    console.log('⚠️  WARNING: Password length is', password.length, 'characters');
    console.log('Gmail app passwords are typically 16 characters');
  }
}

console.log('\n📝 TO FIX:');
console.log('1. Go to: https://myaccount.google.com/apppasswords');
console.log('2. Generate a new app password');
console.log('3. Copy it WITHOUT spaces (e.g., "abcdefghijklmnop")');
console.log('4. Update EMAIL_PASSWORD in your .env file');
console.log('5. Restart your server');
console.log('=================================');

