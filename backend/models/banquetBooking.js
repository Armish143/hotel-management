import mongoose from 'mongoose'

const banquetBookingSchema = new mongoose.Schema({
  legacyId: { type: String, unique: true, sparse: true },
  username: { type: String, required: true },
  email: { type: String },
  eventId: { type: String, required: true },
  eventName: { type: String, required: true },
  venue: { type: String },
  subHall: { type: String },
  eventDate: { type: String },
  timeSlot: { type: String },
  guestName: { type: String },
  phone: { type: String, required: true },
  note: { type: String },
  season: { type: String, enum: ['Winter', 'Summer'], default: 'Winter' },
  climateSetup: { type: String },
  amenities: { type: [String], default: [] },
  status: { type: String, default: 'Pending' },
  price: { type: Number, default: 0 },
  serviceType: { type: String, default: 'Banquet' }
}, { timestamps: true })

export default mongoose.model('BanquetBooking', banquetBookingSchema)
