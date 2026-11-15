import dotenv from 'dotenv'
import mongoose from 'mongoose'
import Dining from '../models/dining.js'

dotenv.config()

try {
  await mongoose.connect(process.env.MONGO_URI)
  const items = await Dining.find({}).sort({ createdAt: 1 }).lean()
  console.log('items=' + items.length)
  console.log(items.map((item) => `${item.source}|${item.category}|${item.itemName}|${item.publicId || item._id}`).join('\n'))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
