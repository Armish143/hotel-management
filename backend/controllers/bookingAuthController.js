import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sendOtpEmail, sendPasswordChangedEmail, sendPasswordResetEmail } from '../services/emailService.js'
import DiningBooking from '../models/diningBooking.js'
import BookingUser from '../models/bookingUser.js'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dataDir = path.join(__dirname, '../data')
const usersFile = path.join(dataDir, 'bookingUsers.json')

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString()

const getRequestContext = (req) => {
  const forwardedFor = req.headers['x-forwarded-for']
  const ipAddress = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') || req.headers['x-real-ip'] || req.socket.remoteAddress || 'Unavailable'
  const userAgent = String(req.headers['user-agent'] || '')
  const browser = /Edg\//.test(userAgent) ? 'Microsoft Edge' : /Chrome\//.test(userAgent) ? 'Google Chrome' : /Firefox\//.test(userAgent) ? 'Mozilla Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser unavailable'
  const operatingSystem = /Android/i.test(userAgent) ? 'Android' : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS' : /Windows/i.test(userAgent) ? 'Windows' : /Mac OS/i.test(userAgent) ? 'macOS' : /Linux/i.test(userAgent) ? 'Linux' : 'Device unavailable'
  const device = `${operatingSystem} - ${browser}`
  const city = req.headers['x-vercel-ip-city']
  const region = req.headers['x-vercel-ip-country-region']
  const country = req.headers['x-vercel-ip-country']
  const location = [city, region, country].filter(Boolean).join(', ') || 'Location unavailable'
  const changedAt = new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'long', timeZone: 'Asia/Karachi' }).format(new Date())
  return { ipAddress, device, location, changedAt }
}

const ensureStorage = async () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  if (!fs.existsSync(usersFile)) {
    await fs.promises.writeFile(usersFile, '[]', 'utf8')
  }
}

const readUsers = async () => {
  await ensureStorage()
  const content = await fs.promises.readFile(usersFile, 'utf8')
  try {
    return JSON.parse(content || '[]')
  } catch {
    return []
  }
}

const writeUsers = async (users) => {
  await ensureStorage()
  await fs.promises.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8')
}

const usingDatabase = () => mongoose.connection.readyState === 1
const isServerlessRuntime = () => Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME)

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()
const normalizeUsername = (username) => String(username || '').trim().toLowerCase()

const removeAbandonedRegistrations = async (users) => {
  const now = new Date()
  if (usingDatabase()) {
    await BookingUser.deleteMany({
      isVerified: false,
      $or: [
        { otpCode: { $exists: false } },
        { otpCode: null },
        { otpExpiresAt: { $exists: false } },
        { otpExpiresAt: null },
        { otpExpiresAt: { $lt: now } }
      ]
    })
    return users
  }

  return users.filter((user) => user.isVerified === true || (user.otpCode && user.otpExpiresAt && new Date(user.otpExpiresAt) >= now))
}

const findBookingUserByEmail = (email) => BookingUser.findOne({
  email: { $regex: `^${escapeRegex(email)}$`, $options: 'i' }
})

const findBookingUserByUsername = (username) => BookingUser.findOne({
  username: { $regex: `^${escapeRegex(username)}$`, $options: 'i' }
})

const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

export const getRegisteredUsers = async (req, res) => {
  try {
    if (usingDatabase()) {
      const users = await BookingUser.find({ isVerified: true })
        .select('firstName lastName email username city address phone isVerified createdAt profileImage')
        .sort({ createdAt: -1 })
      return res.json(users)
    }

    const users = await readUsers()
    return res.json(users.filter((user) => user.isVerified === true).map(({ password, otpCode, otpExpiresAt, passwordResetToken, passwordResetExpiresAt, ...safeUser }) => safeUser).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)))
  } catch (error) {
    console.error('Get registered users error:', error)
    return res.status(500).json({ message: 'Unable to load registered users' })
  }
}

const safeUserResponse = (user) => ({
  _id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  username: user.username,
  city: user.city,
  address: user.address,
  phone: user.phone,
  profileImage: user.profileImage,
  isVerified: user.isVerified,
  createdAt: user.createdAt
})

const registeredUserFilter = (identifier) => {
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return { _id: identifier, isVerified: true }
  }
  return { isVerified: true, $or: [{ username: identifier }, { email: identifier }] }
}

export const updateRegisteredUser = async (req, res) => {
  try {
    const { firstName, lastName, email, username, city, address, phone } = req.body || {}
    if (!firstName || !lastName || !email || !username || !city || !address || !phone) {
      return res.status(400).json({ message: 'All user fields are required.' })
    }

    if (usingDatabase()) {
      const user = await BookingUser.findOne(registeredUserFilter(req.params.id))
      if (!user) return res.status(404).json({ message: 'Verified user not found.' })
      const emailTaken = await BookingUser.findOne({ email, _id: { $ne: user._id } })
      if (emailTaken) return res.status(409).json({ message: 'Email already used by another account.' })
      const usernameTaken = await BookingUser.findOne({ username, _id: { $ne: user._id } })
      if (usernameTaken) return res.status(409).json({ message: 'Username already taken.' })
      Object.assign(user, { firstName, lastName, email, username, city, address, phone })
      await user.save()
      return res.json({ user: safeUserResponse(user) })
    }

    const users = await readUsers()
    const index = users.findIndex((user) => String(user._id || user.username) === String(req.params.id) && user.isVerified === true)
    if (index === -1) return res.status(404).json({ message: 'Verified user not found.' })
    const duplicate = users.find((user, userIndex) => userIndex !== index && (user.email.toLowerCase() === email.toLowerCase() || user.username.toLowerCase() === username.toLowerCase()))
    if (duplicate) return res.status(409).json({ message: 'Email or username already used by another account.' })
    users[index] = { ...users[index], firstName, lastName, email, username, city, address, phone }
    await writeUsers(users)
    return res.json({ user: safeUserResponse(users[index]) })
  } catch (error) {
    return res.status(400).json({ message: 'Unable to update user', error: error.message })
  }
}

export const deleteRegisteredUser = async (req, res) => {
  try {
    if (usingDatabase()) {
      const user = await BookingUser.findOne(registeredUserFilter(req.params.id))
      if (!user) return res.status(404).json({ message: 'Verified user not found.' })
      const emailPattern = new RegExp(`^${escapeRegex(user.email)}$`, 'i')
      const result = await BookingUser.deleteMany({ email: emailPattern })
      return res.json({ message: 'User deleted', deletedCount: result.deletedCount })
    }
    const users = await readUsers()
    const targetUser = users.find((user) => String(user._id || user.username) === String(req.params.id) && user.isVerified === true)
    if (!targetUser) return res.status(404).json({ message: 'Verified user not found.' })
    const targetEmail = targetUser.email.toLowerCase()
    const nextUsers = users.filter((user) => String(user.email || '').toLowerCase() !== targetEmail)
    if (nextUsers.length === users.length) return res.status(404).json({ message: 'Verified user not found.' })
    await writeUsers(nextUsers)
    return res.json({ message: 'User deleted', deletedCount: users.length - nextUsers.length })
  } catch (error) {
    return res.status(400).json({ message: 'Unable to delete user', error: error.message })
  }
}

export const registerInit = async (req, res) => {
  try {
    const { firstName, lastName, email, username, password, city, address, phone } = req.body
    if (!firstName || !lastName || !email || !username || !password || !city || !address || !phone) {
      return res.status(400).json({ message: 'All registration fields are required.' })
    }

    if (isServerlessRuntime() && !usingDatabase()) {
      return res.status(503).json({ message: 'Database is temporarily unavailable. Please try again shortly.' })
    }

    const normalizedEmail = normalizeEmail(email)
    const normalizedUsername = normalizeUsername(username)
    let users = usingDatabase() ? null : await readUsers()
    if (!usingDatabase()) {
      users = await removeAbandonedRegistrations(users)
      await writeUsers(users)
    } else {
      await removeAbandonedRegistrations()
    }
    const existingEmail = usingDatabase()
      ? await findBookingUserByEmail(normalizedEmail)
      : users.find((u) => normalizeEmail(u.email) === normalizedEmail)
    if (existingEmail && existingEmail.isVerified) {
      return res.status(409).json({ message: 'Email already registered.' })
    }

    const existingUsername = usingDatabase()
      ? await findBookingUserByUsername(normalizedUsername)
      : users.find((u) => normalizeUsername(u.username) === normalizedUsername)
    if (existingUsername && existingUsername.isVerified && normalizeEmail(existingUsername.email) !== normalizedEmail) {
      return res.status(409).json({ message: 'Username already taken.' })
    }

    const otpCode = generateOtp()
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const profileImage = req.file ? req.file.filename : undefined
    if (usingDatabase()) {
      const user = existingEmail || existingUsername || new BookingUser({
        firstName,
        lastName,
        email: normalizedEmail,
        username: normalizedUsername,
        password,
        city,
        address,
        phone,
        createdAt: new Date()
      })

      user.firstName = firstName
      user.lastName = lastName
      user.email = normalizedEmail
      user.username = normalizedUsername
      user.password = password
      user.city = city
      user.address = address
      user.phone = phone
      user.profileImage = profileImage || user.profileImage
      user.isVerified = false
      user.otpCode = otpCode
      user.otpExpiresAt = new Date(otpExpiresAt)

      await sendOtpEmail({ email: normalizedEmail, otp: otpCode })
      await user.save()
      return res.status(200).json({ message: 'OTP sent to email', email: normalizedEmail })
    }

    const hashedPassword = await bcrypt.hash(password, 14)

    let user = existingEmail || existingUsername
    let updatedUser
    if (user) {
      updatedUser = {
        ...user,
        firstName,
        lastName,
        email: normalizedEmail,
        username: normalizedUsername,
        password: hashedPassword,
        city,
        address,
        phone,
        profileImage: profileImage || user.profileImage,
        isVerified: false,
        otpCode,
        otpExpiresAt
      }
    } else {
      updatedUser = {
        firstName,
        lastName,
        email: normalizedEmail,
        username: normalizedUsername,
        password: hashedPassword,
        city,
        address,
        phone,
        profileImage,
        isVerified: false,
        otpCode,
        otpExpiresAt,
        createdAt: new Date().toISOString()
      }
    }

    await sendOtpEmail({ email: normalizedEmail, otp: otpCode })

    if (user) {
      const userIndex = users.indexOf(user)
      users[userIndex] = updatedUser
    } else {
      users.push(updatedUser)
    }
    await writeUsers(users)
    res.status(200).json({ message: 'OTP sent to email', email: normalizedEmail })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
}

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body
    const normalizedEmail = typeof email === 'string' ? email.trim() : ''
    const normalizedOtp = typeof otp === 'string' || typeof otp === 'number' ? String(otp).trim() : ''
    if (!normalizedEmail || !normalizedOtp) {
      return res.status(400).json({ message: 'Email and OTP are required.' })
    }
    if (!/^\d{6}$/.test(normalizedOtp)) {
      return res.status(400).json({ message: 'OTP must be a 6-digit code.' })
    }

    if (usingDatabase()) {
      const user = await findBookingUserByEmail(normalizedEmail)
      if (!user) return res.status(404).json({ message: 'User not found.' })
      if (user.isVerified) return res.status(400).json({ message: 'User is already verified.' })
      if (!user.otpCode || !user.otpExpiresAt) return res.status(400).json({ message: 'OTP not requested.' })
      if (user.otpExpiresAt < new Date()) return res.status(400).json({ message: 'OTP has expired.' })
      if (String(user.otpCode).trim() !== normalizedOtp) return res.status(400).json({ message: 'Invalid OTP code.' })

      user.isVerified = true
      user.otpCode = undefined
      user.otpExpiresAt = undefined
      await user.save()

      return res.status(200).json({ message: 'Verification successful', user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        city: user.city,
        address: user.address,
        phone: user.phone,
        profileImage: user.profileImage
      }})
    }

    const users = await readUsers()
    const user = users.find((u) => u.email.toLowerCase() === normalizedEmail.toLowerCase())
    if (!user) return res.status(404).json({ message: 'User not found.' })
    if (user.isVerified) return res.status(400).json({ message: 'User is already verified.' })
    if (!user.otpCode || !user.otpExpiresAt) return res.status(400).json({ message: 'OTP not requested.' })
    if (new Date(user.otpExpiresAt) < new Date()) return res.status(400).json({ message: 'OTP has expired.' })
    if (String(user.otpCode).trim() !== normalizedOtp) return res.status(400).json({ message: 'Invalid OTP code.' })

    user.isVerified = true
    user.otpCode = undefined
    user.otpExpiresAt = undefined
    await writeUsers(users)

    const responseUser = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      city: user.city,
      address: user.address,
      phone: user.phone,
      profileImage: user.profileImage
    }

    res.status(200).json({ message: 'Verification successful', user: responseUser })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
}

export const getBookingProfile = async (req, res) => {
  try {
    const { username } = req.params
    if (!username) {
      return res.status(400).json({ message: 'Username is required.' })
    }

    if (usingDatabase()) {
      const user = await findBookingUserByUsername(username)
      if (!user) return res.status(404).json({ message: 'User not found.' })

      let diningQueries = []
      try {
        diningQueries = await DiningBooking.find({ username: user.username }).sort({ createdAt: -1 })
      } catch {
        diningQueries = []
      }

      return res.status(200).json({ user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        city: user.city,
        address: user.address,
        phone: user.phone,
        profileImage: user.profileImage,
        diningQueries
      }})
    }

    const users = await readUsers()
    const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase())
    if (!user) {
      return res.status(404).json({ message: 'User not found.' })
    }

    // attach user's dining queries (if Mongo is available)
    let diningQueries = []
    try {
      diningQueries = await DiningBooking.find({ username: user.username }).sort({ createdAt: -1 })
    } catch (err) {
      // ignore DB errors (server may be running without Mongo)
      diningQueries = []
    }

    res.status(200).json({ user: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      city: user.city,
      address: user.address,
      phone: user.phone,
      profileImage: user.profileImage,
      diningQueries
    }})
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
}

export const updateBookingProfile = async (req, res) => {
  try {
    const { currentUsername, firstName, lastName, email, username, city, address, phone } = req.body || {}
    if (!currentUsername) {
      return res.status(400).json({ message: 'Current username is required.' })
    }

    if (usingDatabase()) {
      const user = await findBookingUserByUsername(currentUsername)
      if (!user) return res.status(404).json({ message: 'User not found.' })

      const emailTaken = email && await findBookingUserByEmail(email)
      if (emailTaken && String(emailTaken._id) !== String(user._id)) {
        return res.status(409).json({ message: 'Email already used by another account.' })
      }

      const usernameTaken = username && await findBookingUserByUsername(username)
      if (usernameTaken && String(usernameTaken._id) !== String(user._id)) {
        return res.status(409).json({ message: 'Username already taken.' })
      }

      user.firstName = firstName || user.firstName
      user.lastName = lastName || user.lastName
      user.email = email || user.email
      user.username = username || user.username
      user.city = city || user.city
      user.address = address || user.address
      user.phone = phone || user.phone
      if (req.file) user.profileImage = req.file.filename
      await user.save()

      return res.status(200).json({ user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        city: user.city,
        address: user.address,
        phone: user.phone,
        profileImage: user.profileImage
      }})
    }

    const users = await readUsers()
    const user = users.find((u) => u.username.toLowerCase() === currentUsername.toLowerCase())
    if (!user) {
      return res.status(404).json({ message: 'User not found.' })
    }

    const emailTaken = users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.username.toLowerCase() !== currentUsername.toLowerCase())
    if (emailTaken) {
      return res.status(409).json({ message: 'Email already used by another account.' })
    }

    const usernameTaken = users.find((u) => u.username.toLowerCase() === username.toLowerCase() && u.username.toLowerCase() !== currentUsername.toLowerCase())
    if (usernameTaken) {
      return res.status(409).json({ message: 'Username already taken.' })
    }

    user.firstName = firstName || user.firstName
    user.lastName = lastName || user.lastName
    user.email = email || user.email
    user.username = username || user.username
    user.city = city || user.city
    user.address = address || user.address
    user.phone = phone || user.phone

    if (req.file) {
      user.profileImage = req.file.filename
    }

    await writeUsers(users)

    res.status(200).json({ user: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      city: user.city,
      address: user.address,
      phone: user.phone,
      profileImage: user.profileImage
    }})
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
}

export const loginBookingUser = async (req, res) => {
  try {
    const { username, email, password } = req.body || {}
    const loginIdentifier = (username || email || '').trim().toLowerCase()
    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: 'Username/email and password are required.' })
    }

    if (isServerlessRuntime() && !usingDatabase()) {
      return res.status(503).json({ message: 'Database is temporarily unavailable. Please try again shortly.' })
    }

    let user
    if (usingDatabase()) {
      user = await BookingUser.findOne({
        $or: [
          { username: { $regex: `^${escapeRegex(loginIdentifier)}$`, $options: 'i' } },
          { email: { $regex: `^${escapeRegex(loginIdentifier)}$`, $options: 'i' } }
        ]
      })
    }

    if (!user) {
      const users = await readUsers()
      user = users.find((candidate) => {
        const storedUsername = normalizeUsername(candidate.username)
        const storedEmail = normalizeEmail(candidate.email)
        return storedUsername === loginIdentifier || storedEmail === loginIdentifier
      })
    }
    if (!user) return res.status(404).json({ message: 'User not found.' })
    const allowUnverifiedLogin = process.env.ALLOW_UNVERIFIED_LOGIN === 'true' || process.env.NODE_ENV !== 'production'
    if (!user.isVerified && !allowUnverifiedLogin) {
      return res.status(403).json({ message: 'Please verify your email before login.' })
    }

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials.' })

    return res.status(200).json({ message: 'Login successful', user: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      city: user.city,
      address: user.address,
      phone: user.phone,
      profileImage: user.profileImage
    }})
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
}

export const requestPasswordReset = async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : ''
    if (!email) return res.status(400).json({ message: 'Email is required.' })

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashResetToken(rawToken)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
    let user

    if (usingDatabase()) {
      user = await findBookingUserByEmail(email)
      if (user) {
        user.passwordResetToken = tokenHash
        user.passwordResetExpiresAt = expiresAt
        await user.save()
      }
    } else {
      const users = await readUsers()
      user = users.find((item) => item.email.toLowerCase() === email.toLowerCase())
      if (user) {
        user.passwordResetToken = tokenHash
        user.passwordResetExpiresAt = expiresAt.toISOString()
        await writeUsers(users)
      }
    }

    if (user) await sendPasswordResetEmail({
      email: user.email,
      token: rawToken,
      frontendUrl: req.get('origin') || process.env.FRONTEND_URL
    })
    res.status(200).json({ message: 'If an account exists for that email, a reset link has been sent.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
}

export const resetPassword = async (req, res) => {
  try {
    const token = typeof req.params.token === 'string' ? req.params.token : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const confirmPassword = typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : ''
    if (!token || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Token, password, and password confirmation are required.' })
    }
    if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match.' })
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[.@!#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(password)) {
      return res.status(400).json({ message: 'Password must include uppercase, lowercase, number and special character.' })
    }

    const tokenHash = hashResetToken(token)
    let user
    if (usingDatabase()) {
      user = await BookingUser.findOne({
        passwordResetToken: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() }
      })
      if (!user) return res.status(400).json({ message: 'This reset link is invalid or expired.' })
      user.password = password
      user.passwordResetToken = undefined
      user.passwordResetExpiresAt = undefined
      await user.save()
    } else {
      const users = await readUsers()
      user = users.find((item) => item.passwordResetToken === tokenHash && new Date(item.passwordResetExpiresAt) > new Date())
      if (!user) return res.status(400).json({ message: 'This reset link is invalid or expired.' })
      user.password = await bcrypt.hash(password, 14)
      delete user.passwordResetToken
      delete user.passwordResetExpiresAt
      await writeUsers(users)
    }

    await sendPasswordChangedEmail({ email: user.email, ...getRequestContext(req) })
    res.status(200).json({ message: 'Password changed successfully. A confirmation email has been sent.' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: error.message })
  }
}
