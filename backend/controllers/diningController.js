import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import Dining from '../models/dining.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const diningsFilePath = path.join(__dirname, '..', 'data', 'dinings.json')
const usingDatabase = () => mongoose.connection.readyState === 1

const loadDiningsFromFile = () => {
    try {
        const data = fs.readFileSync(diningsFilePath, 'utf-8')
        return JSON.parse(data)
    } catch (error) {
        console.error('Error reading dinings.json:', error)
        return []
    }
}

const saveDiningsToFile = (dinings) => {
    try {
        fs.writeFileSync(diningsFilePath, JSON.stringify(dinings, null, 2), 'utf-8')
        return true
    } catch (error) {
        console.error('Error writing dinings.json:', error)
        return false
    }
}

const generateDiningId = () => `dining_${Date.now()}_${Math.floor(Math.random() * 10000)}`

const serializeDining = (item) => {
    const value = item.toObject ? item.toObject() : { ...item }
    value._id = value.publicId || String(value._id)
    delete value.publicId
    delete value.source
    delete value.isDeleted
    delete value.legacyId
    return value
}

export const migrateLegacyDinings = async () => {
    if (!usingDatabase()) return
    const legacyDinings = loadDiningsFromFile()
    for (const item of legacyDinings) {
        const legacyId = String(item._id || '')
        if (!legacyId || await Dining.exists({ legacyId })) continue
        const { _id, ...itemData } = item
        await Dining.create({ ...itemData, publicId: legacyId, legacyId, source: 'custom' })
    }
}

const getStableBrowseId = (categoryId, item) => {
    let hash = 0
    const value = `${categoryId}:${item.name}`
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
    }
    return `menu_${categoryId}_${Math.abs(hash).toString(36)}`
}

const getBrowseMenuItem = (id) => {
    const match = /^menu_(.+)_(.+)$/.exec(id)
    if (!match) return null
    const diningMenu = loadBrowseMenu()
    const categoryIndex = diningMenu.findIndex((category) => String(category.categoryId) === match[1])
    if (categoryIndex === -1) return null
    const items = diningMenu[categoryIndex]?.items || []
    const itemIndex = /^\d+$/.test(match[2])
        ? Number(match[2])
        : items.findIndex((item) => item._id === id || getStableBrowseId(match[1], item) === id)
    if (!items[itemIndex]) return null
    return { categoryIndex, itemIndex }
}

const toDiningItem = (item, category) => ({
    ...item,
    _id: item._id,
    itemName: item.name,
    category: category.categoryName
})

const loadBrowseMenu = () => {
    try {
        const menuPath = path.join(__dirname, '..', 'data', 'diningMenu.json')
        const data = JSON.parse(fs.readFileSync(menuPath, 'utf-8'))
        return data.menu || data
    } catch (error) {
        console.error('Error reading diningMenu.json:', error)
        return []
    }
}

const saveBrowseMenu = (menu) => {
    try {
        const menuPath = path.join(__dirname, '..', 'data', 'diningMenu.json')
        fs.writeFileSync(menuPath, JSON.stringify({ menu }, null, 2), 'utf-8')
        return true
    } catch (error) {
        console.error('Error writing diningMenu.json:', error)
        return false
    }
}

export const addDining = async (req, res) => {
    const { itemName, category, price, preparationTime, servingSize, calories, description, ingredients, allergens, availability } = req.body
    const normalizedItemName = String(itemName || '').trim()
    const normalizedCategory = String(category || '').trim()
    if (!normalizedItemName || !normalizedCategory) {
        return res.status(400).json({ message: 'Item name and category are required' })
    }
    const newDining = {
        publicId: generateDiningId(),
        itemName: normalizedItemName,
        category: normalizedCategory,
        price: Number(price) || 0,
        preparationTime: Number(preparationTime) || 0,
        servingSize,
        calories: Number(calories) || 0,
        description,
        ingredients: Array.isArray(ingredients)
            ? ingredients
            : typeof ingredients === 'string'
            ? ingredients.split(',').map((item) => item.trim()).filter(Boolean)
            : [],
        allergens: Array.isArray(allergens)
            ? allergens
            : typeof allergens === 'string'
            ? allergens.split(',').map((item) => item.trim()).filter(Boolean)
            : [],
        availability: availability || 'available',
        createdAt: new Date().toISOString()
    }

    if (usingDatabase()) {
        try {
            const duplicate = await Dining.findOne({
                source: 'custom',
                isDeleted: false,
                itemName: { $regex: `^${normalizedItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
                category: { $regex: `^${normalizedCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
            })
            if (duplicate) return res.status(409).json({ message: 'This menu item already exists' })
            const savedDining = await Dining.create({ ...newDining, source: 'custom' })
            return res.status(201).json({ message: 'Dining Created', item: serializeDining(savedDining) })
        } catch (error) {
            console.error('Error saving dining item to MongoDB:', error)
            return res.status(500).json({ message: 'Error saving dining item', error: error.message })
        }
    }

    const dinings = loadDiningsFromFile()
    const duplicate = dinings.find((item) => (
        String(item.itemName || '').trim().toLowerCase() === normalizedItemName.toLowerCase()
        && String(item.category || '').trim().toLowerCase() === normalizedCategory.toLowerCase()
    ))
    if (duplicate) return res.status(409).json({ message: 'This menu item already exists' })
    newDining._id = newDining.publicId
    delete newDining.publicId

    dinings.push(newDining)

    if (!saveDiningsToFile(dinings)) {
        return res.status(500).json({ message: 'Error saving dining item' })
    }

    return res.status(201).json({ message: 'Dining Created', item: newDining })
}

export const getDining = async (req, res) => {
    const { id } = req.params
    if (usingDatabase()) {
        const dining = await Dining.findOne({ publicId: id, source: 'custom', isDeleted: false })
        if (dining) return res.status(200).json(serializeDining(dining))
    }
    const dinings = loadDiningsFromFile()
    const dining = dinings.find((item) => item._id === id)

    if (dining) {
        return res.status(200).json(dining)
    }

    const browseItem = getBrowseMenuItem(id)
    if (browseItem) {
        const menu = loadBrowseMenu()
        const category = menu[browseItem.categoryIndex]
        const item = category.items[browseItem.itemIndex]
        return res.status(200).json(toDiningItem({ ...item, _id: id }, category))
    }

    return res.status(404).json({ message: 'Dining item not found' })
}

export const getDinings = async (req, res) => {
    if (usingDatabase()) {
        const dinings = await Dining.find({ source: 'custom', isDeleted: false }).sort({ createdAt: 1 })
        return res.status(200).json(dinings.map(serializeDining))
    }
    const dinings = loadDiningsFromFile()
    return res.status(200).json(dinings)
}

export const updateDining = async (req, res) => {
    const { id } = req.params
    const { itemName, category, price, preparationTime, servingSize, calories, description, ingredients, allergens, availability } = req.body
    const browseItem = getBrowseMenuItem(id)

    if (browseItem) {
        const menu = loadBrowseMenu()
        const item = menu[browseItem.categoryIndex].items[browseItem.itemIndex]
        const currentCategory = menu[browseItem.categoryIndex]
        if (usingDatabase()) {
            const updatedItem = {
                publicId: id,
                source: 'base',
                itemName: itemName ?? item.name,
                category: category ?? currentCategory.categoryName,
                price: price !== undefined ? (Number(price) || 0) : (Number(item.price) || 0),
                preparationTime: 0,
                availability: availability ?? item.availability,
                isDeleted: false
            }
            const savedOverride = await Dining.findOneAndUpdate(
                { publicId: id, source: 'base' },
                updatedItem,
                { upsert: true, new: true, setDefaultsOnInsert: true }
            )
            return res.status(200).json({
                message: 'Dining Updated',
                item: toDiningItem({
                    ...item,
                    _id: id,
                    name: savedOverride.itemName,
                    price: savedOverride.price,
                    availability: savedOverride.availability
                }, { ...currentCategory, categoryName: savedOverride.category })
            })
        }
        item._id = item._id || id
        item.name = itemName ?? item.name
        item.price = price !== undefined ? (Number(price) || 0) : item.price
        item.availability = availability ?? item.availability

        if (category && category !== currentCategory.categoryName) {
            let targetCategory = menu.find((entry) => entry.categoryName === category)
            if (!targetCategory) {
                targetCategory = {
                    categoryId: `admin-${String(category).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                    categoryName: category,
                    items: []
                }
                menu.push(targetCategory)
            }
            currentCategory.items.splice(browseItem.itemIndex, 1)
            targetCategory.items.push(item)
        }

        if (!saveBrowseMenu(menu)) return res.status(500).json({ message: 'Error updating dining item' })
        const updatedCategory = menu.find((entry) => entry.items.includes(item)) || currentCategory
        return res.status(200).json({ message: 'Dining Updated', item: toDiningItem({ ...item, _id: id }, updatedCategory) })
    }

    if (usingDatabase()) {
        await migrateLegacyDinings()
        const dining = await Dining.findOne({ publicId: id, source: 'custom', isDeleted: false })
        if (!dining) return res.status(404).json({ message: 'Dining item not found' })
        Object.assign(dining, {
            itemName: itemName ?? dining.itemName,
            category: category ?? dining.category,
            price: price !== undefined ? Number(price) || 0 : dining.price,
            preparationTime: preparationTime ?? dining.preparationTime,
            servingSize: servingSize ?? dining.servingSize,
            calories: calories !== undefined ? Number(calories) || 0 : dining.calories,
            description: description ?? dining.description,
            ingredients: Array.isArray(ingredients) ? ingredients : dining.ingredients,
            allergens: Array.isArray(allergens) ? allergens : dining.allergens,
            availability: availability || dining.availability
        })
        await dining.save()
        return res.status(200).json({ message: 'Dining Updated', item: serializeDining(dining) })
    }

    const dinings = loadDiningsFromFile()
    const index = dinings.findIndex((item) => item._id === id)

    if (index === -1) {
        return res.status(404).json({ message: 'Dining item not found' })
    }

    dinings[index] = {
        ...dinings[index],
        itemName: itemName ?? dinings[index].itemName,
        category: category ?? dinings[index].category,
        price: price !== undefined ? Number(price) || 0 : dinings[index].price,
        preparationTime: preparationTime ?? dinings[index].preparationTime,
        servingSize: servingSize ?? dinings[index].servingSize,
        calories: calories !== undefined ? Number(calories) || 0 : dinings[index].calories,
        description: description ?? dinings[index].description,
        ingredients: Array.isArray(ingredients)
            ? ingredients
            : typeof ingredients === 'string'
            ? ingredients.split(',').map((item) => item.trim()).filter(Boolean)
            : dinings[index].ingredients,
        allergens: Array.isArray(allergens)
            ? allergens
            : typeof allergens === 'string'
            ? allergens.split(',').map((item) => item.trim()).filter(Boolean)
            : dinings[index].allergens,
        availability: availability || dinings[index].availability
    }

    if (!saveDiningsToFile(dinings)) {
        return res.status(500).json({ message: 'Error updating dining item' })
    }

    return res.status(200).json({ message: 'Dining Updated', item: dinings[index] })
}

export const deleteDining = async (req, res) => {
    const { id } = req.params
    const browseItem = getBrowseMenuItem(id)

    if (browseItem) {
        const menu = loadBrowseMenu()
        if (usingDatabase()) {
            const item = menu[browseItem.categoryIndex].items[browseItem.itemIndex]
            await Dining.findOneAndUpdate(
                { publicId: id, source: 'base' },
                {
                    publicId: id,
                    source: 'base',
                    itemName: item.name,
                    category: menu[browseItem.categoryIndex].categoryName,
                    price: Number(item.price) || 0,
                    preparationTime: 0,
                    availability: item.availability || 'available',
                    isDeleted: true
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            )
            return res.status(200).json({ message: 'Dining Deleted' })
        }
        menu[browseItem.categoryIndex].items.splice(browseItem.itemIndex, 1)
        if (!saveBrowseMenu(menu)) return res.status(500).json({ message: 'Error deleting dining item' })
        return res.status(200).json({ message: 'Dining Deleted' })
    }

    if (usingDatabase()) {
        await migrateLegacyDinings()
        const dining = await Dining.findOneAndUpdate(
            { publicId: id, source: 'custom', isDeleted: false },
            { isDeleted: true },
            { new: true }
        )
        if (!dining) return res.status(404).json({ message: 'Dining item not found' })
        return res.status(200).json({ message: 'Dining Deleted' })
    }

    const dinings = loadDiningsFromFile()
    const index = dinings.findIndex((item) => item._id === id)

    if (index === -1) {
        return res.status(404).json({ message: 'Dining item not found' })
    }

    dinings.splice(index, 1)

    if (!saveDiningsToFile(dinings)) {
        return res.status(500).json({ message: 'Error deleting dining item' })
    }

    return res.status(200).json({ message: 'Dining Deleted' })
}
