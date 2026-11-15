import mongoose from 'mongoose'
import ConferenceRoom from '../models/conferenceRoom.js'

const checkConferenceRooms = async () => {
    try {
        const defaultRooms = [
            { roomType: "Conference Room", name: "Conference Room A", capacity: 20, layout: "Theater Style", price: 100, tags: ["WiFi", "Projector", "Whiteboard"] },
            { roomType: "Conference Room", name: "Conference Room B", capacity: 15, layout: "Boardroom Style", price: 80, tags: ["WiFi", "Projector"] },
            { roomType: "Conference Room", name: "Conference Room C", capacity: 10, layout: "Classroom Style", price: 60, tags: ["WiFi", "Projector"] },
            { roomType: "Meeting Room", name: "Meeting Room A", capacity: 8, layout: "Boardroom Style", price: 50, tags: ["WiFi", "Whiteboard"] },
            { roomType: "Meeting Room", name: "Meeting Room B", capacity: 10, layout: "U-shape", price: 60, tags: ["WiFi", "Projector"] },
            { roomType: "Meeting Room", name: "Meeting Room C", capacity: 12, layout: "Theater Style", price: 70, tags: ["WiFi", "Conference Phone"] }
        ]

        for (const room of defaultRooms) {
            const existingRoom = await ConferenceRoom.findOne({ name: room.name })
            if (!existingRoom) await ConferenceRoom.create({ ...room, status: "Available" })
        }

        const roomsEndingWithD = await ConferenceRoom.find({ name: /(?:^|\s)D$/i }).sort({ _id: 1 })
        const uniqueDRooms = new Set()
        const duplicateDIds = []
        for (const room of roomsEndingWithD) {
            const key = `${room.roomType || 'Conference Room'}:${room.name.trim().toLowerCase()}`
            if (uniqueDRooms.has(key)) duplicateDIds.push(room._id)
            else uniqueDRooms.add(key)
        }
        if (duplicateDIds.length) await ConferenceRoom.deleteMany({ _id: { $in: duplicateDIds } })
    } catch (error) {
        console.error('Error in ConferenceRoom:', error)
    }
}

export default checkConferenceRooms