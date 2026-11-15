import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const scheduleFile = path.join(__dirname, '../data/banquetSchedules.json')
export const banquetTimeSlots = ['9am - 12pm', '1pm - 3pm', '4pm - 7pm']
export const banquetSubHalls = ['S-M1', 'S-M2', 'H-H1', 'H-H2']

const dateKey = (date) => date.toISOString().slice(0, 10)

const defaultDates = () => {
  const dates = []
  const today = new Date()
  for (let index = 0; index < 30; index += 1) {
    const date = new Date(today)
    date.setDate(today.getDate() + index)
    dates.push(dateKey(date))
  }
  return dates
}

const defaultSchedule = () => Object.fromEntries(
  banquetSubHalls.map((subHall) => [subHall, { dates: defaultDates(), timeSlots: banquetTimeSlots }])
)

const readSchedules = () => {
  try {
    if (!fs.existsSync(scheduleFile)) return defaultSchedule()
    const parsed = JSON.parse(fs.readFileSync(scheduleFile, 'utf8'))
    return { ...defaultSchedule(), ...parsed }
  } catch {
    return defaultSchedule()
  }
}

export const writeSchedules = (schedules) => {
  fs.writeFileSync(scheduleFile, JSON.stringify(schedules, null, 2), 'utf8')
}

export const getBanquetSchedule = (req, res) => {
  const subHall = req.query.subHall
  const schedules = readSchedules()
  if (subHall && !schedules[subHall]) return res.status(404).json({ message: 'Sub-hall not found' })
  return res.json(subHall ? { subHall, ...schedules[subHall] } : schedules)
}

export const updateBanquetSchedule = (req, res) => {
  const { subHall, dates, timeSlots } = req.body || {}
  if (!banquetSubHalls.includes(subHall)) return res.status(400).json({ message: 'Valid sub-hall is required' })
  const cleanDates = [...new Set((Array.isArray(dates) ? dates : []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))]
  const cleanSlots = [...new Set((Array.isArray(timeSlots) ? timeSlots : []).filter((slot) => banquetTimeSlots.includes(slot)))]
  const schedules = readSchedules()
  schedules[subHall] = { dates: cleanDates, timeSlots: cleanSlots }
  writeSchedules(schedules)
  return res.json({ message: 'Banquet schedule updated', subHall, dates: cleanDates, timeSlots: cleanSlots })
}

export const getScheduleData = () => readSchedules()
