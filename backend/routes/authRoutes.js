import { verifyToken } from '../middlewares/authMiddleware.js'
import express from 'express'
import { login, register, logout, changePassword } from '../controllers/authController.js'

const router = express.Router()

router.post('/login', login)
router.post('/register', verifyToken, register)
router.post('/logout', logout)
router.post('/change-password', verifyToken, changePassword)

export default router