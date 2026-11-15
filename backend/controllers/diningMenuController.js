import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import DiningTable from '../models/diningTable.js'
import mongoose from 'mongoose'
import Dining from '../models/dining.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const menuFilePath = path.join(__dirname, '../data/diningMenu.json')
const tablesFilePath = path.join(__dirname, '../data/diningTables.json')
const legacySampleCategories = new Set(['Main Course', 'Dessert', 'Beverage'])

const normalizeMenuPrice = (price) => {
  if (typeof price === 'number') return price
  if (typeof price === 'string') {
    const cleaned = String(price).split('/')[0].replace(/[^0-9.]/g, '').trim()
    if (!cleaned) return 0
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const loadMenuData = () => {
  try {
    const raw = fs.readFileSync(menuFilePath, 'utf8')
    const data = JSON.parse(raw)
    return data.menu || data
  } catch (err) {
    console.error('Error loading menu data:', err.message)
    return []
  }
}

const loadTablesData = () => {
  try {
    const raw = fs.readFileSync(tablesFilePath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    console.error('Error loading tables data:', err.message)
    return []
  }
}

// In-memory data
let diningTables = loadTablesData()

const loadAdminDiningItems = async () => {
  if (mongoose.connection.readyState !== 1) {
    return []
  }

  const items = await Dining.find({
    source: 'custom',
    isDeleted: false,
    category: { $nin: Array.from(legacySampleCategories) }
  }).sort({ createdAt: 1 })

  return items.map((item) => ({ ...item.toObject(), _id: item.publicId || String(item._id) }))
}

const getStableMenuItemId = (categoryId, item) => {
  let hash = 0
  const value = `${categoryId}:${item.name}`
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return `menu_${categoryId}_${Math.abs(hash).toString(36)}`
}

const getCurrentDiningMenu = async () => {
  const menu = loadMenuData().map((category) => ({
    ...category,
    items: Array.isArray(category.items)
      ? category.items.map((item) => ({
          ...item,
          price: normalizeMenuPrice(item.price),
          _id: item._id || getStableMenuItemId(category.categoryId, item)
        }))
      : []
  }))
  const adminItems = await loadAdminDiningItems()
  const baseOverrides = mongoose.connection.readyState === 1
    ? await Dining.find({ source: 'base' })
    : []

  baseOverrides.forEach((overrideDocument) => {
    const override = overrideDocument.toObject()
    let currentCategory = menu.find((category) => category.items.some((item) => item._id === override.publicId))
    const currentItem = currentCategory?.items.find((item) => item._id === override.publicId)
    if (!currentCategory || !currentItem) return
    if (override.isDeleted) {
      currentCategory.items = currentCategory.items.filter((item) => item._id !== override.publicId)
      return
    }
    currentItem.name = override.itemName
    currentItem.price = override.price
    currentItem.availability = override.availability
    if (override.category && override.category !== currentCategory.categoryName) {
      currentCategory.items = currentCategory.items.filter((item) => item._id !== override.publicId)
      let targetCategory = menu.find((category) => category.categoryName === override.category)
      if (!targetCategory) {
        targetCategory = {
          categoryId: `admin-${String(override.category).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          categoryName: override.category,
          items: []
        }
        menu.push(targetCategory)
      }
      targetCategory.items.push(currentItem)
    }
  })

  adminItems.forEach((item) => {
    let category = menu.find((entry) => entry.categoryName === item.category)
    if (!category) {
      category = {
        categoryId: `admin-${String(item.category || 'other').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        categoryName: item.category || 'Other',
        items: []
      }
      menu.push(category)
    }
    category.items.push({
      _id: item._id,
      name: item.itemName,
      price: Number(item.price) || 0,
      availability: item.availability || 'available'
    })
  })

  return menu
}

// Get dining menu
export const getDiningMenu = async (req, res) => {
  try {
    res.status(200).json(await getCurrentDiningMenu())
  } catch (err) {
    console.error('Error fetching dining menu:', err)
    res.status(500).json({ message: 'Error fetching menu', error: err.message })
  }
}

// Get all dining tables with availability
export const getDiningTables = async (req, res) => {
  try {
    res.status(200).json(diningTables)
  } catch (err) {
    console.error('Error fetching dining tables:', err)
    res.status(500).json({ message: 'Error fetching tables', error: err.message })
  }
}

// Get tables by type
export const getTablesByType = async (req, res) => {
  try {
    const { tableTypeId } = req.params
    const table = diningTables.find(t => t.tableTypeId === tableTypeId)
    
    if (!table) {
      return res.status(404).json({ message: 'Table type not found' })
    }
    
    res.status(200).json(table)
  } catch (err) {
    console.error('Error fetching table type:', err)
    res.status(500).json({ message: 'Error fetching table', error: err.message })
  }
}

// Get available tables of a specific type
export const getAvailableTablesByType = async (req, res) => {
  try {
    const { tableTypeId } = req.params
    const table = diningTables.find(t => t.tableTypeId === tableTypeId)
    
    if (!table) {
      return res.status(404).json({ message: 'Table type not found' })
    }
    
    const availableTables = table.tables.filter(t => !t.isBooked)
    res.status(200).json({
      tableTypeId: table.tableTypeId,
      tableTypeName: table.tableTypeName,
      capacity: table.capacity,
      availableTables: availableTables
    })
  } catch (err) {
    console.error('Error fetching available tables:', err)
    res.status(500).json({ message: 'Error fetching available tables', error: err.message })
  }
}

// Book a table (update booking status)
export const bookTable = async (req, res) => {
  try {
    const { tableTypeId, tableNumber } = req.body
    
    const table = diningTables.find(t => t.tableTypeId === tableTypeId)
    if (!table) {
      return res.status(404).json({ message: 'Table type not found' })
    }
    
    const tableToBook = table.tables.find(t => t.tableNumber === tableNumber)
    if (!tableToBook) {
      return res.status(404).json({ message: 'Table number not found' })
    }
    
    if (tableToBook.isBooked) {
      return res.status(400).json({ message: 'Table is already booked' })
    }
    
    tableToBook.isBooked = true
    res.status(200).json({ message: 'Table booked successfully', table: tableToBook })
  } catch (err) {
    console.error('Error booking table:', err)
    res.status(500).json({ message: 'Error booking table', error: err.message })
  }
}

// Release a table
export const releaseTable = async (req, res) => {
  try {
    const { tableTypeId, tableNumber } = req.body
    
    const table = diningTables.find(t => t.tableTypeId === tableTypeId)
    if (!table) {
      return res.status(404).json({ message: 'Table type not found' })
    }
    
    const tableToRelease = table.tables.find(t => t.tableNumber === tableNumber)
    if (!tableToRelease) {
      return res.status(404).json({ message: 'Table number not found' })
    }
    
    tableToRelease.isBooked = false
    res.status(200).json({ message: 'Table released successfully', table: tableToRelease })
  } catch (err) {
    console.error('Error releasing table:', err)
    res.status(500).json({ message: 'Error releasing table', error: err.message })
  }
}
