import { useCallback, useEffect, useMemo, useState } from "react"
import { FaSyncAlt } from "react-icons/fa"
import api from "../../api"
import "./Orders.css"

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short" })
const asArray = (value) => (Array.isArray(value) ? value : [])
const getDate = (record) => record.createdAt || record.bookingDate || record.date || record.checkInDate

const getAmount = (record) => Number(record.totalAmount || record.paidAmount || record.price || record.pricingBreakdown?.totalAmount || 0) || 0

const getReadableName = (value, fallback) => {
  if (typeof value === "string" && value.trim() && value.trim() !== "[object Object]") return value.trim()
  if (typeof value === "number") return String(value)
  if (value && typeof value === "object") {
    const preferredKeys = ["itemName", "name", "title", "label", "menuItem", "item", "product", "dish", "menu"]
    for (const key of preferredKeys) {
      const readableName = getReadableName(value[key], "")
      if (readableName) return readableName
    }
  }
  return fallback
}

const getProductEntries = (record, service) => {
  if (service === "Dining" || service === "Redbox") {
    const items = asArray(record.itemDetails).length ? record.itemDetails : asArray(record.menuItems)
    if (items.length) return items.map((item) => {
      const quantity = Number(item.quantity) || 1
      const unitPrice = Number(item.itemPrice ?? item.price ?? 0) || 0
      return {
        name: getReadableName(item.itemName || item.name || item.title || record.itemName, service),
        quantity,
        amount: Number(item.amount ?? unitPrice * quantity) || 0
      }
    })
    return [{
      name: getReadableName(record.itemName || record.selectedPage, service),
      quantity: Number(record.quantity) || 1,
      amount: Number(record.totalAmount || record.itemPrice || record.price || 0) || 0
    }]
  }

  const name = service === "Rooms"
    ? getReadableName(record.roomType || record.roomVenue, "Room booking")
    : service === "Banquet"
      ? getReadableName(record.venue || record.subHall || record.eventName, "Banquet booking")
      : getReadableName(record.roomName || record.roomType || record.eventType, "Conference booking")
  return [{ name, quantity: 1, amount: getAmount(record) }]
}

const Orders = ({ embedded = false, refreshTrigger = 0, dateRange = { from: "", to: "" } }) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [secondsLeft, setSecondsLeft] = useState(30)

  const loadOrders = useCallback(async () => {
    try {
      const [rooms, dining, redbox, conference, banquet] = await Promise.all([
        api.get("/bookings"), api.get("/dining-queries"), api.get("/redbox-orders"),
        api.get("/conferences"), api.get("/booking/banquet-bookings")
      ])
      setOrders([
        ...asArray(rooms.data).map((record) => ({ record, service: "Rooms" })),
        ...asArray(dining.data).map((record) => ({ record, service: "Dining" })),
        ...asArray(redbox.data).map((record) => ({ record, service: "Redbox" })),
        ...asArray(conference.data).map((record) => ({ record, service: "Conference Room" })),
        ...asArray(banquet.data).map((record) => ({ record, service: "Banquet" }))
      ])
      setSecondsLeft(30)
    } catch (error) {
      console.error("Unable to refresh orders dashboard:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
    const refreshTimer = setInterval(loadOrders, 30000)
    const countdownTimer = setInterval(() => setSecondsLeft((value) => value > 1 ? value - 1 : 30), 1000)
    return () => { clearInterval(refreshTimer); clearInterval(countdownTimer) }
  }, [loadOrders])

  useEffect(() => {
    if (refreshTrigger > 0) loadOrders()
  }, [loadOrders, refreshTrigger])

  const filteredOrders = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return orders
    const start = dateRange.from ? new Date(`${dateRange.from}T00:00:00`) : null
    const end = dateRange.to ? new Date(`${dateRange.to}T23:59:59.999`) : null
    return orders.filter(({ record }) => {
      const date = new Date(getDate(record))
      if (Number.isNaN(date.getTime())) return false
      return (!start || date >= start) && (!end || date <= end)
    })
  }, [dateRange.from, dateRange.to, orders])
  const revenue = useMemo(() => filteredOrders.reduce((sum, item) => sum + getAmount(item.record), 0), [filteredOrders])
  const monthlyRevenue = useMemo(() => {
    const today = new Date()
    const months = Array.from({ length: 6 }, (_, index) => new Date(today.getFullYear(), today.getMonth() - 5 + index, 1))
    const totals = months.map(() => 0)
    filteredOrders.forEach(({ record }) => {
      const date = new Date(getDate(record))
      const monthIndex = months.findIndex((month) => month.getFullYear() === date.getFullYear() && month.getMonth() === date.getMonth())
      if (monthIndex >= 0) totals[monthIndex] += getAmount(record)
    })
    if (!totals.some(Boolean) && revenue) totals[totals.length - 1] = revenue
    return months.map((month, index) => ({ label: monthFormatter.format(month), value: totals[index] }))
  }, [filteredOrders, revenue])
  const topSelling = useMemo(() => {
    const products = new Map()
    filteredOrders.forEach(({ record, service }) => getProductEntries(record, service).forEach(({ name, quantity, amount }) => {
      const cleanName = getReadableName(name, service)
      const current = products.get(cleanName) || { quantity: 0, amount: 0 }
      products.set(cleanName, { quantity: current.quantity + quantity, amount: current.amount + amount })
    }))
    return [...products.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 5)
  }, [filteredOrders])

  const maxRevenue = Math.max(...monthlyRevenue.map((item) => item.value), 1)
  const chartPoints = monthlyRevenue.map((item, index) => `${(index / (monthlyRevenue.length - 1)) * 100},${100 - (item.value / maxRevenue) * 82}`).join(" ")
  const formatCurrency = (value) => `Rs. ${Math.round(value).toLocaleString("en-IN")}`

  if (loading) return <div className="orders-loading">Loading orders overview...</div>

  return (
    <section className="orders-page">
      {!embedded && <header className="orders-heading">
        <div><p className="orders-eyebrow">Admin analytics</p><h1>Orders</h1></div>
        <button className="orders-refresh" onClick={loadOrders} title="Refresh orders now"><FaSyncAlt /> Refresh <span>{secondsLeft}s</span></button>
      </header>}
      <div className="orders-main-grid">
        <article className="orders-panel revenue-panel">
          <div className="orders-panel-heading"><div><h2>Revenue Overview</h2><span className="chart-legend"><i /> Revenue (Rs.)</span></div></div>
          <div className="chart-wrap"><div className="chart-y-axis"><span>{formatCurrency(maxRevenue)}</span><span>{formatCurrency(maxRevenue * .75)}</span><span>{formatCurrency(maxRevenue * .5)}</span><span>{formatCurrency(maxRevenue * .25)}</span><span>Rs. 0</span></div><div className="chart-area"><div className="chart-grid-lines"><i /><i /><i /><i /><i /></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Combined revenue chart"><polyline points={chartPoints} fill="none" stroke="#1674c4" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />{monthlyRevenue.map((item, index) => <circle key={item.label} cx={(index / (monthlyRevenue.length - 1)) * 100} cy={100 - (item.value / maxRevenue) * 82} r="1.5" fill="#1674c4" vectorEffect="non-scaling-stroke" />)}</svg><div className="chart-x-axis">{monthlyRevenue.map((item) => <span key={item.label}>{item.label}</span>)}</div></div></div>
        </article>
        <article className="orders-panel selling-panel"><h2>Top Selling</h2><ol>{topSelling.map(([name, details]) => <li key={name}><span>{name}</span><div className="selling-values"><b>{details.quantity}x</b><strong>{formatCurrency(details.amount)}</strong></div></li>)}</ol>{!topSelling.length && <p className="empty-orders">No orders yet</p>}</article>
      </div>
    </section>
  )
}

export default Orders