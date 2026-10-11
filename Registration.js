const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    phone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    email: { type: String, trim: true, lowercase: true, default: '', maxlength: 120 },
    city: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    pincode: { type: String, required: true, match: /^[1-9]\d{5}$/ },
    category: { type: String, required: true, enum: ['singles', 'doubles'] },
    level: { type: String, required: true, enum: ['Beginner', 'Intermediate', 'Advanced'] },
    partner: { type: String, trim: true, default: '', maxlength: 80 },
    utr: { type: String, required: true, unique: true, uppercase: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Registration', registrationSchema);
