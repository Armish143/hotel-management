import mongoose from 'mongoose'

const orderItemSchema = new mongoose.Schema({
  itemCategory: { type: String },
  itemName: { type: String },
  itemPrice: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  amount: { type: Number, default: 0 }
}, { _id: false })

const menuItemSchema = new mongoose.Schema({
  name: { type: String },
  itemName: { type: String },
  price: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 }
}, { _id: false })

const diningBookingSchema = new mongoose.Schema({
  legacyId: { type: String, unique: true, sparse: true },
  username: { type: String, required: true },
  email: { type: String },
  guestName: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String },
  serviceType: {
    type: String,
    required: true,
    enum: ['Dining', 'Redbox', 'Dining Table'],
    default: 'Dining'
  },
  selectedPage: { type: String },
  itemCategory: { type: String },
  itemName: { type: String },
  itemPrice: { type: Number, default: 0 },
  quantity: { type: Number, default: 1 },
  menuItems: { type: [menuItemSchema], default: [] },
  itemDetails: { type: [orderItemSchema], default: [] },
  totalAmount: { type: Number, default: 0 },
  timing: { type: String },
  note: { type: String },
  status: { type: String, default: 'Pending' },
  formSource: { type: String },
  isDeleted: { type: Boolean, default: false },
  numberOfGuests: { type: Number },
  recommendedTiming: { type: String },
  selectedTimeSlot: { type: String }
}, { timestamps: true })

export default mongoose.model('DiningBooking', diningBookingSchema)
