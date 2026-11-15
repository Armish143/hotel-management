import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/authRoutes.js'
import bookingAuthRoutes from './routes/bookingAuthRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import diningRoutes from './routes/diningRoutes.js'
import checkBanquetHalls from './services/checkBanquetHalls.js'
import checkConferenceRooms from './services/checkConferenceRoom.js'
import { migrateRoomsToMongo, normalizeRoomSequences } from './controllers/roomController.js'
import { setDatabaseAvailable } from './controllers/conferenceController.js'
import { migrateDiningBookingsToMongo } from './controllers/diningBookingController.js'
import { migrateBanquetBookingsToMongo } from './controllers/banquetBookingController.js'
import { seedAdminFromEnv } from './controllers/authController.js'

dotenv.config()

const server = express()
server.disable('etag')
const port = process.env.PORT || 3000

let databaseInitialization

const initializeDatabase = async () => {
    if (process.env.MONGO_URI) {
        try {
            await mongoose.connect(process.env.MONGO_URI)
            setDatabaseAvailable(true)
            console.log('MongoDB connected successfully')

            await Promise.allSettled([
                checkBanquetHalls(),
                checkConferenceRooms(),
                migrateDiningBookingsToMongo(),
                migrateBanquetBookingsToMongo()
            ])
            await migrateRoomsToMongo()
            await normalizeRoomSequences({ initialCleanup: true })
            await seedAdminFromEnv()
        } catch (err) {
            console.error('MongoDB connection error:', err.message)
            setDatabaseAvailable(false)
            databaseInitialization = null
            console.warn('Continuing without MongoDB. Some database-backed features may not work.')
        }
    } else {
        console.warn('MONGO_URI is not configured. Starting backend without MongoDB.')
        setDatabaseAvailable(false)
        if (process.env.VERCEL) {
            throw new Error('MONGO_URI is required in the Vercel environment.')
        }
    }
}

const ensureDatabaseInitialized = () => {
    const connectionIsReady = mongoose.connection.readyState === 1
    const connectionIsOpening = mongoose.connection.readyState === 2
    if (!databaseInitialization || (!connectionIsReady && !connectionIsOpening)) {
        databaseInitialization = initializeDatabase().catch((error) => {
            databaseInitialization = null
            throw error
        })
    }
    return databaseInitialization
}

const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'https://mughal-mahal.vercel.app',
        process.env.FRONTEND_URL
    ].filter(Boolean)

const isLocalhostOrigin = (origin) => {
        if (!origin) return false
        return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    }

const isAllowedOrigin = (origin) => {
        if (!origin) return false
        if (isLocalhostOrigin(origin)) return true
        return allowedOrigins.includes(origin)
    }

const corsOptions = {
        origin: (origin, callback) => {
            if (!origin || isAllowedOrigin(origin)) {
                callback(null, true)
                return
            }
            callback(new Error(`Origin not allowed by CORS: ${origin}`))
        },
        credentials: true
    }

server.use(helmet({
        crossOriginResourcePolicy: {
            policy: 'cross-origin'
        }
    }))
    server.use(cors(corsOptions))
    server.use(express.json())
    server.use(cookieParser())

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
server.use('/uploads', (req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        next()
    }, express.static(path.join(__dirname, 'uploads')))

server.use(async (req, res, next) => {
    try {
        await ensureDatabaseInitialized()
        next()
    } catch (error) {
        next(error)
    }
})

server.use('/api', authRoutes)
server.use('/api/booking', bookingAuthRoutes)
server.use('/api/dining', diningRoutes)
server.use('/api', adminRoutes)

server.use((error, req, res, next) => {
    console.error('Request initialization error:', error.message)
    if (res.headersSent) {
        next(error)
        return
    }
    res.status(503).json({ message: 'Database is temporarily unavailable. Please try again shortly.' })
})

export default server

if (!process.env.VERCEL) {
    ensureDatabaseInitialized().then(() => {
        server.listen(port, '0.0.0.0', () => {
            console.log(`Server is running at http://0.0.0.0:${port}`)
        })
    })
}