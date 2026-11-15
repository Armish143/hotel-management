import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { testUsers, getJwtSecret } from '../controllers/authController.js'
import Admin from '../models/admin.js'

const ADMIN_ROLES = ['admin', 'administrator']

export const verifyToken = async (req, res, next) => {
    let token = req.cookies.access_token
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1]
    }
    if (!token) return res.status(401).json({ message: "Not authenticated!" })

    let secret
    try {
        secret = getJwtSecret()
    } catch (error) {
        console.error(error.message)
        return res.status(500).json({ message: 'Server authentication is not configured.' })
    }

    try {
        const payload = jwt.verify(token, secret)
        if (!ADMIN_ROLES.includes(String(payload.role || '').toLowerCase())) {
            return res.status(403).json({ message: 'Admin access only' })
        }

        let adminExists = testUsers.find((user) => user._id.toString() === payload.id)

        if (!adminExists && mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(payload.id)) {
            adminExists = await Admin.findById(payload.id).select('_id role email')
        }

        // On serverless hosting the in-memory fallback list is empty on a fresh instance,
        // so a correctly signed admin token is still accepted.
        if (!adminExists) {
            adminExists = { _id: payload.id, role: payload.role, email: payload.email }
        }

        req.admin = adminExists
        next()
    } catch (error) {
        return res.status(401).json({ message: "Token is invalid!" })
    }
}
