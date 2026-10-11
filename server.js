require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const Registration = require('./Registration');

const { MONGODB_URI, PORT = 3000 } = process.env;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
if (!process.env.ADMIN_KEY) {
  console.warn('ADMIN_KEY is not set, so the admin endpoints are disabled.');
}

(async () => {
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await Registration.init(); // builds the unique indexes before taking requests
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Pocket Club running on http://localhost:${PORT}`));
  } catch (e) {
    console.error('MongoDB connection failed:', e.message);
    process.exit(1);
  }
})();
