import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sendBookingReceiptEmail } from '../services/emailService.js'
import mongoose from 'mongoose'
import DiningBooking from '../models/diningBooking.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fallbackFile = path.join(__dirname, '../data/diningBookings.json')

const loadFallbackBookings = () => {
  try {
    if (!fs.existsSync(fallbackFile)) return []
    const raw = fs.readFileSync(fallbackFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to read fallback dining bookings file:', error.message)
    return []
  }
}

const saveFallbackBookings = (bookings) => {
  try {
    fs.writeFileSync(fallbackFile, JSON.stringify(bookings, null, 2))
  } catch (error) {
    console.error('Failed to write fallback dining bookings file:', error.message)
  }
}

const getItemDisplayLabel = (booking) => {
  const itemNames = []

  if (Array.isArray(booking.itemDetails) && booking.itemDetails.length > 0) {
    for (const item of booking.itemDetails) {
      const itemName = item.itemName || item.name || item.title || item.menuItem
      if (itemName) itemNames.push(itemName)
    }
  }

  if (!itemNames.length && Array.isArray(booking.menuItems) && booking.menuItems.length > 0) {
    for (const item of booking.menuItems) {
      const itemName = item.itemName || item.name || item.title
      if (itemName) itemNames.push(itemName)
    }
  }

  if (itemNames.length) return itemNames.join(', ')

  if (booking.itemName) return booking.itemName
  if (booking.selectedPage) return booking.selectedPage
  if (booking.itemCategory) return booking.itemCategory

  return '—'
}

export const migrateDiningBookingsToMongo = async () => {
  if (mongoose.connection.readyState !== 1) return
  const legacyBookings = loadFallbackBookings()
  for (const legacyBooking of legacyBookings) {
    if (legacyBooking.serviceType === 'Dining' && legacyBooking.selectedPage === 'Sheesh Mahal') continue
    const legacyId = String(legacyBooking._id || '')
    if (!legacyId || await DiningBooking.exists({ legacyId })) continue
    const { _id, createdAt, updatedAt, ...bookingData } = legacyBooking
    await DiningBooking.create({
      ...bookingData,
      legacyId,
      createdAt: createdAt ? new Date(createdAt) : undefined,
      updatedAt: updatedAt ? new Date(updatedAt) : undefined
    })
  }
}

const saveWithFallback = async (bookingPayload, res, successMessage) => {
  if (mongoose.connection.readyState === 1) {
    try {
      const booking = await DiningBooking.create(bookingPayload)
      await sendBookingReceiptEmail({
        email: booking.email || booking.username,
        category: booking.serviceType,
        orderNumber: booking._id,
        buyerName: booking.guestName,
        details: {
          Item: getItemDisplayLabel(booking),
          'Dining Time': booking.timing || booking.selectedTimeSlot || booking.recommendedTiming || booking.diningTime || '—',
          Notes: booking.note || booking.specialRequests || '—'
        },
        items: booking.itemDetails || [],
        total: booking.totalAmount
      })
      return res.status(201).json({ message: successMessage, booking, storedInMongo: true })
    } catch (error) {
      console.error('Mongo dining booking failed, using fallback:', error.message)
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
    category: fallbackBooking.serviceType,
    orderNumber: fallbackBooking._id,
    buyerName: fallbackBooking.guestName,
    details: {
      Item: getItemDisplayLabel(fallbackBooking),
      'Dining Time': fallbackBooking.timing || fallbackBooking.selectedTimeSlot || fallbackBooking.recommendedTiming || fallbackBooking.diningTime || '—',
      Notes: fallbackBooking.note || fallbackBooking.specialRequests || '—'
    },
    items: fallbackBooking.itemDetails || fallbackBooking.menuItems || [],
    total: fallbackBooking.totalAmount
  })
  return res.status(201).json({ message: successMessage, booking: fallbackBooking, storedLocally: true })
}

export const addDiningBooking = async (req, res) => {
  try {
    const {
      username,
      email,
      guestName,
      phone,
      address,
      selectedPage,
      timing,
      note,
      specialRequests,
      numberOfGuests,
      recommendedTiming,
      selectedTimeSlot,
      menuItems,
      totalAmount,
      formSource
    } = req.body

    if (!username || !guestName || !phone) {
      return res.status(400).json({ message: 'username, guestName and phone are required' })
    }

    const normalizedNote = note || specialRequests || ''
    const normalizedTiming = timing || selectedTimeSlot || recommendedTiming || '—'

    const bookingPayload = {
      username,
      email,
      guestName,
      phone,
      address,
      serviceType: 'Dining',
      selectedPage,
      timing: normalizedTiming,
      note: normalizedNote,
      numberOfGuests,
      recommendedTiming,
      selectedTimeSlot,
      menuItems: Array.isArray(menuItems) ? menuItems.map((item) => ({
        name: item.name || item.itemName,
        itemName: item.itemName || item.name,
        price: Number(item.price ?? item.itemPrice) || 0,
        quantity: Number(item.quantity) || 1
      })) : [],
      itemDetails: Array.isArray(menuItems) ? menuItems.map((item) => ({
        itemCategory: item.category || item.itemCategory,
        itemName: item.itemName || item.name,
        itemPrice: Number(item.itemPrice ?? item.price) || 0,
        quantity: Number(item.quantity) || 1,
        amount: (Number(item.itemPrice ?? item.price) || 0) * (Number(item.quantity) || 1)
      })) : [],
      totalAmount,
      formSource: formSource || 'dining-page',
      status: 'Pending'
    }
    return saveWithFallback(bookingPayload, res, 'Dining query recorded')
  } catch (err) {
    console.error('Add DiningBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const addRedboxBooking = async (req, res) => {
  try {
    const {
      username,
      email,
      guestName,
      phone,
      address,
      itemCategory,
      itemName,
      itemPrice,
      quantity,
      itemDetails,
      totalAmount,
      timing,
      note
    } = req.body

    const normalizedItems = Array.isArray(itemDetails) && itemDetails.length
      ? itemDetails.map((item) => ({
          itemCategory: item.itemCategory,
          itemName: item.itemName,
          itemPrice: Number(item.itemPrice) || 0,
          quantity: Number(item.quantity) || 1,
          amount: Number(item.amount) || (Number(item.itemPrice) || 0) * (Number(item.quantity) || 1)
        }))
      : [{
          itemCategory,
          itemName,
          itemPrice: Number(itemPrice) || 0,
          quantity: Number(quantity) || 1,
          amount: (Number(itemPrice) || 0) * (Number(quantity) || 1)
        }]

    if (!username || !guestName || !phone || !normalizedItems.length) {
      return res.status(400).json({ message: 'username, guestName, phone, and at least one item are required' })
    }

    const firstItem = normalizedItems[0]
    const bookingPayload = {
      username,
      email,
      guestName,
      phone,
      address,
      serviceType: 'Redbox',
      itemCategory: firstItem.itemCategory,
      itemName: firstItem.itemName,
      itemPrice: firstItem.itemPrice,
      quantity: firstItem.quantity,
      itemDetails: normalizedItems,
      totalAmount: Number(totalAmount) || normalizedItems.reduce((sum, item) => sum + item.amount, 0),
      timing,
      note
    }

    return saveWithFallback(bookingPayload, res, 'Redbox order recorded')
  } catch (err) {
    console.error('Add RedboxBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const getDiningBookings = async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    try {
      const bookings = await DiningBooking.find({
        serviceType: 'Dining',
        isDeleted: { $ne: true },
        selectedPage: { $ne: 'Sheesh Mahal' },
        $or: [
          { formSource: 'dining-page' },
          { formSource: 'homepage' },
          { formSource: { $exists: false } },
          { formSource: null }
        ]
      }).sort({ createdAt: -1 })
      return res.status(200).json(bookings)
    } catch (error) {
      console.error('Failed to read Mongo dining bookings:', error.message)
    }
  }

  const fallbackBookings = loadFallbackBookings().filter((item) => (
    item.serviceType === 'Dining'
    && item.selectedPage !== 'Sheesh Mahal'
    && (item.formSource === 'dining-page' || item.formSource === 'homepage' || item.formSource === undefined || item.formSource === null)
  ))
  fallbackBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return res.status(200).json(fallbackBookings)
}

export const updateDiningBooking = async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
      const booking = await DiningBooking.findOneAndUpdate(
        { _id: id, serviceType: 'Dining', isDeleted: { $ne: true } },
        { $set: updates },
        { new: true, runValidators: true }
      )
      if (!booking) {
        return res.status(404).json({ message: 'Dining query not found' })
      }
      return res.status(200).json({ message: 'Dining query updated', booking })
    }

    const bookings = loadFallbackBookings()
    const index = bookings.findIndex((item) => item._id === id && item.serviceType === 'Dining')
    if (index === -1) {
      return res.status(404).json({ message: 'Dining query not found' })
    }

    const existingBooking = bookings[index]
    const updatedBooking = {
      ...existingBooking,
      ...updates,
      updatedAt: new Date().toISOString()
    }
    bookings[index] = updatedBooking
    saveFallbackBookings(bookings)
    return res.status(200).json({ message: 'Dining query updated', booking: updatedBooking })
  } catch (err) {
    console.error('Update DiningBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const getRedboxBookings = async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    try {
      return res.status(200).json(await DiningBooking.find({ serviceType: 'Redbox' }).sort({ createdAt: -1 }))
    } catch (error) {
      console.error('Failed to read Mongo Redbox bookings:', error.message)
    }
  }
  const fallbackBookings = loadFallbackBookings().filter((item) => item.serviceType === 'Redbox')
  return res.status(200).json(fallbackBookings)
}

export const getDiningBooking = async (req, res) => {
  const { id } = req.params
  const booking = loadFallbackBookings().find((item) => item._id === id)
  if (!booking) return res.status(404).json({ message: 'Not found' })
  return res.status(200).json(booking)
}

export const getRedboxBooking = async (req, res) => {
  const { id } = req.params
  const booking = loadFallbackBookings().find((item) => item._id === id)
  if (!booking) return res.status(404).json({ message: 'Not found' })
  return res.status(200).json(booking)
}

export const deleteRedboxBooking = async (req, res) => {
  try {
    const { id } = req.params

    if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
      const result = await DiningBooking.deleteOne({ _id: id, serviceType: 'Redbox' })
      if (!result.deletedCount) {
        return res.status(404).json({ message: 'Redbox order not found' })
      }
      return res.status(200).json({ message: 'Redbox order deleted successfully' })
    }

    const bookings = loadFallbackBookings()
    const index = bookings.findIndex((item) => item._id === id && item.serviceType === 'Redbox')
    if (index === -1) {
      return res.status(404).json({ message: 'Redbox order not found' })
    }

    bookings.splice(index, 1)
    saveFallbackBookings(bookings)
    return res.status(200).json({ message: 'Redbox order deleted successfully' })
  } catch (err) {
    console.error('Delete RedboxBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const getUserDiningBookings = async (req, res) => {
  const { username } = req.params
  if (!username) return res.status(400).json({ message: 'username required' })
  const bookings = loadFallbackBookings().filter((item) => item.username === username && item.serviceType === 'Dining')
  return res.status(200).json(bookings)
}

export const getDiningTableBookings = async (req, res) => {
  if (mongoose.connection.readyState === 1) {
    try {
      return res.status(200).json(await DiningBooking.find({ serviceType: 'Dining Table' }).sort({ createdAt: -1 }))
    } catch (error) {
      console.error('Failed to read Mongo dining table bookings:', error.message)
    }
  }
  const fallbackBookings = loadFallbackBookings().filter((item) => item.serviceType === 'Dining Table')
  fallbackBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return res.status(200).json(fallbackBookings)
}

export const deleteDiningBooking = async (req, res) => {
  try {
    const { id } = req.params

    if (mongoose.connection.readyState === 1 && mongoose.isValidObjectId(id)) {
      const booking = await DiningBooking.findOneAndUpdate(
        { _id: id, serviceType: 'Dining', isDeleted: { $ne: true } },
        { isDeleted: true },
        { new: true }
      )
      if (!booking) {
        return res.status(404).json({ message: 'Dining query not found' })
      }
      return res.status(200).json({ message: 'Dining query deleted successfully' })
    }

    const bookings = loadFallbackBookings()
    const index = bookings.findIndex((item) => item._id === id && item.serviceType === 'Dining')
    if (index === -1) {
      return res.status(404).json({ message: 'Dining query not found' })
    }

    bookings.splice(index, 1)
    saveFallbackBookings(bookings)
    return res.status(200).json({ message: 'Dining query deleted successfully' })
  } catch (err) {
    console.error('Delete DiningBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}

export const getUserRedboxBookings = async (req, res) => {
  const { username } = req.params
  if (!username) return res.status(400).json({ message: 'username required' })
  const bookings = loadFallbackBookings().filter((item) => item.username === username && item.serviceType === 'Redbox')
  return res.status(200).json(bookings)
}

export const addDiningTableBooking = async (req, res) => {
  try {
    const {
      username,
      guestName,
      phone,
      email,
      serviceType,
      selectedPage,
      selectedTableType,
      selectedTableNumber,
      numberOfGuests,
      diningDate,
      diningTime,
      itemDetails,
      totalAmount,
      note
    } = req.body

    if (!username || !guestName || !phone || !selectedTableType || !selectedTableNumber) {
      return res.status(400).json({ message: 'Missing required booking details' })
    }

    const normalizedItems = Array.isArray(itemDetails) && itemDetails.length
      ? itemDetails.map((item) => ({
          itemCategory: item.categoryName || item.itemCategory,
          itemName: item.itemName,
          itemPrice: Number(item.itemPrice) || 0,
          quantity: Number(item.quantity) || 1,
          amount: Number(item.itemPrice || 0) * Number(item.quantity || 1)
        }))
      : []

    const bookingPayload = {
      username,
      guestName,
      phone,
      email,
      address: '',
      serviceType: 'Dining Table',
      selectedPage,
      selectedTableType,
      selectedTableNumber,
      numberOfGuests,
      diningDate,
      diningTime,
      itemDetails: normalizedItems,
      totalAmount: Number(totalAmount) || normalizedItems.reduce((sum, item) => sum + item.amount, 0),
      note
    }

    return saveWithFallback(bookingPayload, res, 'Table booking confirmed successfully')
  } catch (err) {
    console.error('Add DiningTableBooking Error:', err)
    return res.status(500).json({ message: err.message })
  }
}
