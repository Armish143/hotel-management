import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getScheduleData } from './banquetScheduleController.js'
import { sendBookingReceiptEmail } from '../services/emailService.js'
import mongoose from 'mongoose'
import BanquetBooking from '../models/banquetBooking.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fallbackFile = path.join(__dirname, '../data/banquetBookings.json')

const loadFallbackBookings = () => {
  try {
    if (!fs.existsSync(fallbackFile)) return []
    const raw = fs.readFileSync(fallbackFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to read fallback banquet bookings file:', error.message)
    return []
  }
}

const saveFallbackBookings = (bookings) => {
  try {
    fs.writeFileSync(fallbackFile, JSON.stringify(bookings, null, 2))
  } catch (error) {
    console.error('Failed to write fallback banquet bookings file:', error.message)
  }
}

export const migrateBanquetBookingsToMongo = async () => {
  if (mongoose.connection.readyState !== 1) return
  for (const legacyBooking of loadFallbackBookings()) {
    const legacyId = String(legacyBooking._id || '')
    if (!legacyId || await BanquetBooking.exists({ legacyId })) continue
    const { _id, createdAt, updatedAt, ...bookingData } = legacyBooking
    await BanquetBooking.create({ ...bookingData, legacyId, createdAt: createdAt ? new Date(createdAt) : undefined, updatedAt: updatedAt ? new Date(updatedAt) : undefined })
  }
}

const saveWithFallback = async (bookingPayload, res, successMessage) => {
  if (mongoose.connection.readyState === 1) {
    try {
      const booking = await BanquetBooking.create(bookingPayload)
      await sendBookingReceiptEmail({ email: booking.email || booking.username, category: 'Banquet', orderNumber: booking.eventId || booking._id, buyerName: booking.guestName, details: { 'Event ID': booking.eventId, Event: booking.eventName, Venue: `${booking.venue || '—'} (${booking.subHall || '—'})`, Season: booking.season, Setup: booking.climateSetup, Amenities: booking.amenities?.join(', ') || 'None', Date: booking.eventDate, 'Time Slot': booking.timeSlot }, total: booking.price })
      return res.status(201).json({ message: successMessage, booking, storedInMongo: true })
    } catch (error) {
      console.error('Mongo banquet booking failed, using fallback:', error.message)
    }
  }
  const bookings = loadFallbackBookings()
  const fallbackBooking = {
    _id: `${Date.now()}`,
    ...bookingPayload,
    createdAt: new Date().toISOString()
  }
  bookings.unshift(fallbackBooking)
  saveFallbackBookings(bookings)
  await sendBookingReceiptEmail({
    email: fallbackBooking.email || fallbackBooking.username,
    category: 'Banquet',
    orderNumber: fallbackBooking.eventId || fallbackBooking._id,
    buyerName: fallbackBooking.guestName,
    details: {
      Event: fallbackBooking.eventName,
      'Event ID': fallbackBooking.eventId,
      Venue: `${fallbackBooking.venue || '—'} (${fallbackBooking.subHall || '—'})`,
      'Sub Hall': fallbackBooking.subHall,
      Season: fallbackBooking.season,
      Setup: fallbackBooking.climateSetup,
      Amenities: fallbackBooking.amenities?.join(', ') || 'None',
      Date: fallbackBooking.eventDate,
      'Time Slot': fallbackBooking.timeSlot,
      Phone: fallbackBooking.phone,
      Notes: fallbackBooking.note || '—'
    },
    total: fallbackBooking.price
  })
  return res.status(201).json({ message: successMessage, booking: fallbackBooking, storedLocally: true })
}

export const addBanquetBooking = async (req, res) => {
  try {
    const {
      username,
      email,
      eventId,
      eventName,
      venue,
      subHall,
      eventDate,
      timeSlot,
      guestName,
      phone,
      note,
      season,
      climateSetup,
      amenities,
      status,
      price
    } = req.body

    if (!username || !eventId || !eventName || !phone) {
      return res.status(400).json({ message: 'username, eventId, eventName, and phone are required' })
    }

    const schedule = getScheduleData()[subHall]
    if (!schedule?.dates.includes(eventDate) || !schedule.timeSlots.includes(timeSlot)) {
      return res.status(409).json({ message: 'This date or time slot is not available for the selected hall.' })
    }
    const alreadyBooked = loadFallbackBookings().some((booking) => (
      booking.subHall === subHall && booking.eventDate === eventDate && booking.timeSlot === timeSlot &&
      String(booking.status || '').toLowerCase() !== 'cancelled'
    ))
    if (alreadyBooked) {
      return res.status(409).json({ message: 'This hall is already booked for the selected date and time.' })
    }

    const bookingPayload = {
      username,
      email,
      eventId,
      eventName,
      venue,
      subHall,
      eventDate,
      timeSlot,
      guestName,
      phone,
      note,
      season,
      climateSetup,
      amenities: Array.isArray(amenities) ? amenities : [],
      status: status || 'Pending',
      price,
      serviceType: 'Banquet'
    }
    return saveWithFallback(bookingPayload, res, 'Banquet query recorded successfully')
  } catch (err) {
    console.error('Add BanquetBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const getBanquetAvailability = (req, res) => {
  const { subHall, date } = req.query
  const schedule = getScheduleData()[subHall]
  if (!schedule) return res.status(404).json({ message: 'Sub-hall not found' })
  const bookings = loadFallbackBookings()
  const bookedSlots = bookings
    .filter((booking) => booking.subHall === subHall && booking.eventDate === date && String(booking.status || '').toLowerCase() !== 'cancelled')
    .map((booking) => booking.timeSlot)
  const timeSlots = date && schedule.dates.includes(date)
    ? schedule.timeSlots.filter((slot) => !bookedSlots.includes(slot))
    : []
  return res.json({ dates: schedule.dates, timeSlots, bookedSlots })
}

export const getUserBanquetBookings = async (req, res) => {
  try {
    const { username } = req.params
    if (!username) {
      return res.status(400).json({ message: 'username parameter is required' })
    }
    const bookings = loadFallbackBookings()
    const userBookings = bookings.filter((booking) => booking.username === username)
    return res.json(userBookings)
  } catch (err) {
    console.error('Get BanquetBookings Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const getAllBanquetBookings = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const bookings = await BanquetBooking.find().sort({ createdAt: -1 })
      const migratedLegacyIds = new Set(bookings.map((booking) => booking.legacyId).filter(Boolean))
      const localBookings = loadFallbackBookings().filter((booking) => !migratedLegacyIds.has(String(booking._id)))
      return res.json([...bookings, ...localBookings])
    }
    const bookings = loadFallbackBookings()
    return res.json(bookings)
  } catch (err) {
    console.error('Get All Banquet Bookings Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const updateBanquetBooking = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(req.params.id)) {
      const booking = await BanquetBooking.findByIdAndUpdate(
        req.params.id,
        { $set: { status: req.body.status } },
        { new: true }
      )
      if (!booking) {
        return res.status(404).json({ message: 'Banquet booking not found' })
      }
      return res.json({ message: 'Banquet booking updated', booking })
    }

    const bookings = loadFallbackBookings()
    const index = bookings.findIndex((booking) => booking._id === req.params.id)
    if (index === -1) {
      return res.status(404).json({ message: 'Banquet booking not found' })
    }

    bookings[index] = { ...bookings[index], status: req.body.status || bookings[index].status }
    saveFallbackBookings(bookings)
    return res.json({ message: 'Banquet booking updated', booking: bookings[index] })
  } catch (err) {
    console.error('Update BanquetBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const deleteBanquetBooking = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(req.params.id)) {
      const result = await BanquetBooking.deleteOne({ _id: req.params.id })
      if (!result.deletedCount) {
        return res.status(404).json({ message: 'Banquet booking not found' })
      }
      return res.json({ message: 'Banquet booking deleted' })
    }

    const bookings = loadFallbackBookings()
    const remainingBookings = bookings.filter((booking) => booking._id !== req.params.id)
    if (remainingBookings.length === bookings.length) {
      return res.status(404).json({ message: 'Banquet booking not found' })
    }

    saveFallbackBookings(remainingBookings)
    return res.json({ message: 'Banquet booking deleted' })
  } catch (err) {
    console.error('Delete BanquetBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}
