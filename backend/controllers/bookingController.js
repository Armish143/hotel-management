import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'
import Room from '../models/room.js'
import Booking from '../models/booking.js'
import { sendBookingReceiptEmail } from '../services/emailService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fallbackFile = path.join(__dirname, '../data/bookings.json')
const roomFile = path.join(__dirname, '../data/rooms.json')

const loadFallbackBookings = () => {
    try {
        if (!fs.existsSync(fallbackFile)) return []
        const raw = fs.readFileSync(fallbackFile, 'utf8')
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch (error) {
        console.error('Failed to read fallback bookings file:', error.message)
        return []
    }
}

const saveFallbackBookings = (bookings) => {
    try {
        fs.writeFileSync(fallbackFile, JSON.stringify(bookings, null, 2))
    } catch (error) {
        console.error('Failed to write fallback bookings file:', error.message)
    }
}

const normalizeBookingPayload = (body = {}) => {
    const paymentMethodValue = String(body.paymentMethod || body.paymentType || '').toLowerCase()
    const normalizedPaymentMethod = paymentMethodValue === 'card payment' || paymentMethodValue === 'card' || paymentMethodValue === 'credit_card'
        ? 'card'
        : 'cash'

    const totalAmount = Number(body.totalAmount ?? body.total ?? body.rate ?? 0)
    const paidAmount = Number(body.paidAmount ?? (normalizedPaymentMethod === 'card' ? totalAmount : 0))

    return {
        guestName: body.guestName || body.fullName || body.name || '',
        email: body.email || body.guestEmail || (body.phone ? `${String(body.phone).replace(/[^a-zA-Z0-9]/g, '')}@guest.local` : 'guest@local.invalid'),
        phone: body.phone || '',
        address: body.address || '',
        bookingType: body.bookingType || 'Room',
        roomVenue: body.roomVenue || body.roomType || body.venue || 'Standard Room',
        checkInDate: body.checkInDate || body.checkIn || '',
        checkOutDate: body.checkOutDate || body.checkOut || '',
        specialRequests: body.specialRequests || body.notes || body.specialRequest || '',
        paymentMethod: normalizedPaymentMethod,
        paymentStatus: body.paymentStatus || (normalizedPaymentMethod === 'card' ? 'paid' : 'pending'),
        totalAmount,
        paidAmount,
        internalNotes: body.internalNotes || '',
        status: body.status || (normalizedPaymentMethod === 'card' ? 'confirmed' : 'pending'),
        roomNo: body.roomVenue?.selectedRoom || body.selectedRoom || body.roomNo || '',
        roomType: body.roomVenue?.type || body.roomType || ''
    }
}

const syncRoomStatus = async (roomNo, status) => {
    if (!roomNo || mongoose.connection.readyState !== 1) return
    const room = await Room.findOne({ roomNo: String(roomNo) })
    if (!room) return
    room.status = status
    await room.save()
}

// Create a new booking
export const addBooking = async (req, res) => {
    const bookingPayload = normalizeBookingPayload(req.body)

    if (mongoose.connection.readyState === 1) {
        try {
            const booking = await Booking.create(bookingPayload)
            await syncRoomStatus(booking.roomNo, 'Booked')
            await sendBookingReceiptEmail({
                email: booking.email,
                category: 'Room',
                orderNumber: booking._id,
                buyerName: booking.guestName,
                details: {
                    Room: booking.roomType || booking.roomVenue,
                    'Check-in': booking.checkInDate,
                    'Check-out': booking.checkOutDate,
                    'Payment Method': booking.paymentMethod,
                    'Payment Status': booking.paymentStatus,
                    Notes: booking.specialRequests || '—'
                },
                total: booking.totalAmount
            })
            return res.status(201).json({ message: 'Booking Created', booking })
        } catch (error) {
            console.error('Mongo room booking failed, using fallback:', error.message)
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
        email: fallbackBooking.email,
        category: 'Room',
        orderNumber: fallbackBooking._id,
        buyerName: fallbackBooking.guestName,
        details: {
            Room: fallbackBooking.roomType || fallbackBooking.roomVenue,
            'Check-in': fallbackBooking.checkInDate,
            'Check-out': fallbackBooking.checkOutDate,
            'Payment Method': fallbackBooking.paymentMethod,
            'Payment Status': fallbackBooking.paymentStatus,
            Notes: fallbackBooking.specialRequests || '—'
        },
        total: fallbackBooking.totalAmount
    })

    const bookRoom = (roomData) => {
        if (!roomData) return
        roomData.status = 'Booked'
    }

    if (mongoose.connection.readyState === 1) {
        try {
            const room = await Room.findOne({ roomNo: String(bookingPayload.roomNo) })
            if (room) {
                room.status = 'Booked'
                await room.save()
            }
        } catch (error) {
            console.error('Failed to update room status in DB:', error.message)
        }
    } else {
        try {
            if (fs.existsSync(roomFile)) {
                const rawRooms = fs.readFileSync(roomFile, 'utf8')
                const rooms = JSON.parse(rawRooms)
                const index = rooms.findIndex((item) => String(item.roomNo) === String(bookingPayload.roomNo))
                if (index !== -1) {
                    rooms[index].status = 'Booked'
                    fs.writeFileSync(roomFile, JSON.stringify(rooms, null, 2), 'utf8')
                }
            }
        } catch (error) {
            console.error('Failed to update room status in JSON fallback:', error.message)
        }
    }

    return res.status(201).json({ message: "Booking Created", booking: fallbackBooking, storedLocally: true })
}

// Get a single booking by ID
export const getBooking = async (req, res) => {
    const { id } = req.params
    try {
        const booking = mongoose.connection.readyState === 1
            ? await Booking.findById(id)
            : loadFallbackBookings().find((item) => item._id === id)
        if (!booking) {
            return res.status(404).json({ message: "Booking not found" })
        }
        return res.status(200).json(booking)
    } catch (error) {
        return res.status(500).json({ message: "Error fetching booking" })
    }
}

// Get all bookings
export const getBookings = async (req, res) => {
    if (mongoose.connection.readyState === 1) {
        try {
            const bookings = await Booking.find().sort({ createdAt: -1 })
            const fallbackBookings = loadFallbackBookings()
            const mongoIds = new Set(bookings.map((booking) => String(booking._id)))
            return res.status(200).json([
                ...bookings,
                ...fallbackBookings.filter((booking) => !mongoIds.has(String(booking._id)))
            ])
        } catch (error) {
            console.error('Failed to read Mongo room bookings:', error.message)
        }
    }
    const fallbackBookings = loadFallbackBookings()
    return res.status(200).json(fallbackBookings)
}

// Update an existing booking
export const updateBooking = async (req, res) => {
    const { id } = req.params
    if (mongoose.connection.readyState === 1) {
        try {
            const booking = await Booking.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
            if (booking) {
                const nextStatus = String(booking.status || '').toLowerCase()
                await syncRoomStatus(booking.roomNo, nextStatus === 'cancelled' || nextStatus === 'rejected' ? 'Available' : 'Booked')
                return res.status(200).json({ message: 'Booking Updated', booking })
            }
        } catch (error) {
            console.error('Failed to update Mongo room booking:', error.message)
        }
    }
    const bookings = loadFallbackBookings()
    const index = bookings.findIndex((item) => item._id === id)

    if (index === -1) {
        return res.status(404).json({ message: "Booking not found" })
    }

    bookings[index] = {
        ...bookings[index],
        ...req.body,
        _id: id
    }
    saveFallbackBookings(bookings)
    return res.status(200).json({ message: "Booking Updated" })
}

// Delete a booking
export const deleteBooking = async (req, res) => {
    const { id } = req.params
    if (mongoose.connection.readyState === 1) {
        try {
            const booking = await Booking.findByIdAndDelete(id)
            if (booking) {
                await syncRoomStatus(booking.roomNo, 'Available')
                return res.status(200).json({ message: 'Booking Deleted' })
            }
        } catch (error) {
            console.error('Failed to delete Mongo room booking:', error.message)
        }
    }
    const bookings = loadFallbackBookings().filter((item) => item._id !== id)
    saveFallbackBookings(bookings)
    return res.status(200).json({ message: "Booking Deleted" })
}