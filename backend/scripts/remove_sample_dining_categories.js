import dotenv from 'dotenv'
import mongoose from 'mongoose'
import Dining from '../models/dining.js'

dotenv.config()

const categoriesToRemove = ['Main Course', 'Dessert', 'Beverage']

try {
  await mongoose.connect(process.env.MONGO_URI)
  const result = await Dining.deleteMany({
    source: 'custom',
    category: { $in: categoriesToRemove }
  })
  console.log('deleted=' + result.deletedCount)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
