import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Admin from '../models/admin.js'

const ADMIN_ROLES = ['admin', 'administrator']

// JWT secret must come from the environment. There is no default on purpose:
// a known fallback secret would let anyone forge an admin token.
export const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET
    if (!secret) {
        throw new Error('JWT_SECRET is not configured. Set it in backend/.env')
    }
    return secret
}

// Fallback admin list, used only when MongoDB is not connected (local demo mode).
// It is filled from ADMIN_EMAIL / ADMIN_PASSWORD in the environment; no account is hardcoded.
let testUsers = []

const buildEnvAdmin = async () => {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
    const password = process.env.ADMIN_PASSWORD
    if (!email || !password) return null
    return {
        _id: new mongoose.Types.ObjectId('64a000000000000000000001'),
        fullname: process.env.ADMIN_NAME || 'Admin',
        email,
        password: await bcrypt.hash(password, 10),
        role: 'Admin'
    }
}

let envAdminReady = null
const ensureEnvAdmin = () => {
    if (!envAdminReady) {
        envAdminReady = buildEnvAdmin().then((admin) => {
            if (admin && !testUsers.some((u) => u.email === admin.email)) testUsers.push(admin)
        })
    }
    return envAdminReady
}

// Creates the first admin in MongoDB from ADMIN_EMAIL / ADMIN_PASSWORD if no admin exists yet.
export const seedAdminFromEnv = async () => {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
    const password = process.env.ADMIN_PASSWORD
    if (!email || !password) return
    if (mongoose.connection.readyState !== 1) return
    const existing = await Admin.countDocuments()
    if (existing > 0) return
    // The Admin model hashes the password in its pre-save hook.
    await Admin.create({ fullname: process.env.ADMIN_NAME || 'Admin', email, password, role: 'Admin' })
    console.log('Created the first admin account from ADMIN_EMAIL.')
}

const cookieOptions = (maxAge) => ({
    httpOnly: true,
    maxAge,
    sameSite: 'none',
    secure: process.env.NODE_ENV === 'production'
})

const publicAdminInfo = (admin) => ({
    _id: admin._id,
    fullname: admin.fullname,
    email: admin.email,
    role: admin.role
})

export const login = async (req, res) => {
    const { email, password } = req.body
    try {
        if (!email || !password) return res.status(400).json({ message: 'Email and password are required' })
        const normalizedEmail = String(email).trim().toLowerCase()

        let admin = null
        if (mongoose.connection.readyState === 1) {
            admin = await Admin.findOne({ email: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
        }

        if (!admin) {
            await ensureEnvAdmin()
            admin = testUsers.find((u) => u.email === normalizedEmail)
        }

        if (!admin) return res.status(404).json({ message: 'Admin not found' })

        if (!admin.role || !ADMIN_ROLES.includes(String(admin.role).toLowerCase())) {
            return res.status(403).json({ message: 'Admin access only' })
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password)
        if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' })

        const token = jwt.sign({ id: admin._id.toString(), role: admin.role, email: admin.email }, getJwtSecret(), {
            expiresIn: '24h'
        })

        res
            .status(201)
            .cookie('access_token', token, cookieOptions(24 * 60 * 60 * 1000))
            .json({ message: 'Login Successfully', info: publicAdminInfo(admin), token })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

// Creates another admin. This route is protected by verifyToken:
// only an admin who is already logged in can add a new admin.
export const register = async (req, res) => {
    const { fullname, email, password } = req.body
    try {
        if (!fullname || !email || !password) {
            return res.status(400).json({ message: 'Full name, email and password are required' })
        }
        if (String(password).length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' })
        }
        const normalizedEmail = String(email).trim().toLowerCase()

        if (mongoose.connection.readyState === 1) {
            const existing = await Admin.findOne({ email: normalizedEmail })
            if (existing) return res.status(400).json({ message: 'User already exists' })
            const created = await Admin.create({ fullname, email: normalizedEmail, password, role: 'Admin' })
            return res.status(201).json({ message: 'Register Successfully', info: publicAdminInfo(created) })
        }

        await ensureEnvAdmin()
        if (testUsers.some((u) => u.email === normalizedEmail)) {
            return res.status(400).json({ message: 'User already exists' })
        }
        const newUser = {
            _id: new mongoose.Types.ObjectId(),
            fullname,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 10),
            role: 'Admin'
        }
        testUsers.push(newUser)
        res.status(201).json({ message: 'Register Successfully', info: publicAdminInfo(newUser) })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

export const logout = (req, res) => {
    res.clearCookie('access_token').json({ message: 'Logout' })
}

// Changes the password of the logged-in admin (route is protected by verifyToken).
export const changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body
    try {
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: 'Old and new password are required' })
        }
        if (String(newPassword).length < 8) {
            return res.status(400).json({ message: 'New password must be at least 8 characters' })
        }
        const adminId = String(req.admin?._id || '')

        if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(adminId)) {
            const admin = await Admin.findById(adminId)
            if (admin) {
                const ok = await bcrypt.compare(oldPassword, admin.password)
                if (!ok) return res.status(401).json({ message: 'Old password is incorrect' })
                admin.password = newPassword // hashed by the model's pre-save hook
                await admin.save()
                return res.status(200).json({ message: 'Password changed successfully' })
            }
        }

        const admin = testUsers.find((u) => u._id.toString() === adminId)
        if (!admin) return res.status(404).json({ message: 'Admin not found' })
        const ok = await bcrypt.compare(oldPassword, admin.password)
        if (!ok) return res.status(401).json({ message: 'Old password is incorrect' })
        admin.password = await bcrypt.hash(newPassword, 10)
        res.status(200).json({ message: 'Password changed successfully' })
    } catch (error) {
        res.status(500).json({ message: error.message })
    }
}

// Exported for the auth middleware
export { testUsers }
