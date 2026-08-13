// Quick script to verify your .env EMAIL_PASSWORD
import dotenv from 'dotenv';
dotenv.config();














// Check if password looks like a valid app password (16 chars, no spaces)
if (process.env.EMAIL_PASSWORD) {
  const password = process.env.EMAIL_PASSWORD;

  if (password.includes(' ')) {




  } else if (password.length === 16) {

  } else {


  }
}









