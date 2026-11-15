import { useEffect, useState } from "react"
import { FaDownload, FaExternalLinkAlt, FaPrint, FaReceipt, FaSearch } from "react-icons/fa"
import api from "../../api"
import "./Receipts.css"

const categoryColors = {
  Banquet: "gold",
  Dining: "green",
  Room: "blue",
  Redbox: "red",
  "Dining Table": "teal",
  Conference: "purple"
}

const formatDate = (value) => value ? new Date(value).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—"
const amount = (item) => Number(item?.receiptCategory === "Room"
  ? item?.totalAmount ?? item?.total ?? item?.rate ?? item?.price ?? 0
  : item?.price ?? item?.totalAmount ?? item?.total ?? item?.rate ?? 0)
const normalize = (item, category) => ({
  ...item,
  receiptCategory: category,
  eventName: item.eventName || item.selectedPage || item.roomType || item.itemName || category,
  venue: item.venue || item.roomVenue || item.selectedPage || item.itemCategory || "—",
  eventDate: item.eventDate || item.checkInDate || item.diningDate || item.createdAt,
  timeSlot: item.timeSlot || item.timing || item.diningTime || `${item.checkInDate || ""}${item.checkOutDate ? ` - ${item.checkOutDate}` : ""}`,
  receiptItems: Array.isArray(item.itemDetails) && item.itemDetails.length ? item.itemDetails : Array.isArray(item.menuItems) ? item.menuItems : [],
  note: item.note || item.specialRequests || item.internalNotes || "—"
})

const AdminReceipts = () => {
  const [receipts, setReceipts] = useState([])
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState("All")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadReceipts = async () => {
      try {
        const [banquet, dining, rooms, redbox, tables, conferences] = await Promise.all([
          api.get("/booking/banquet-bookings"),
          api.get("/dining-queries"),
          api.get("/bookings"),
          api.get("/redbox-orders"),
          api.get("/dining-table-bookings"),
          api.get("/conferences")
        ])
        const roomItems = Array.isArray(rooms.data) ? rooms.data.filter((item) => String(item.bookingType || "Room").toLowerCase() === "room") : []
        const all = [
          ...(Array.isArray(banquet.data) ? banquet.data : []).map((item) => normalize(item, "Banquet")),
          ...(Array.isArray(dining.data) ? dining.data : []).map((item) => normalize(item, "Dining")),
          ...roomItems.map((item) => normalize(item, "Room")),
          ...(Array.isArray(redbox.data) ? redbox.data : []).map((item) => normalize(item, "Redbox")),
          ...(Array.isArray(tables.data) ? tables.data : []).map((item) => normalize(item, "Dining Table")),
          ...(Array.isArray(conferences.data) ? conferences.data : []).map((item) => normalize(item, "Conference"))
        ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        setReceipts(all)
      } catch (error) {
        console.error("Failed to load receipts", error)
        setReceipts([])
      } finally {
        setLoading(false)
      }
    }
    loadReceipts()
  }, [])

  const receiptId = (item) => item.eventId || item._id || "—"
  const receiptMarkup = (item) => `<!doctype html><html><head><meta charset="utf-8"><title>Mughal Mahal Receipt ${receiptId(item)}</title><style>body{font-family:Arial,sans-serif;color:#182234;margin:0;background:#f2f4f7}.receipt{max-width:820px;margin:30px auto;background:#fff;padding:40px}.top{display:flex;justify-content:space-between;border-bottom:3px solid #bf9236;padding-bottom:20px}.brand{font-size:25px;font-weight:800;color:#a1741b}.muted{font-size:12px;color:#6a7585;margin-top:5px}.right{text-align:right}.right h1{margin:0;font-size:27px}.section{margin-top:26px}.section h2{font-size:12px;text-transform:uppercase;color:#a1741b;border-bottom:1px solid #e3e7ec;padding-bottom:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 26px}.field{font-size:13px;border-bottom:1px solid #eef0f3;padding:8px 0}.field b{display:inline-block;min-width:130px;color:#687486}.items p{display:flex;justify-content:space-between;border-bottom:1px solid #eef0f3;padding:9px 0;margin:0;font-size:13px}.total{text-align:right;border-top:2px solid #182234;margin:25px 0 0 auto;padding-top:13px;width:260px;font-size:20px;font-weight:800;color:#a1741b}.footer{border-top:1px solid #e3e7ec;margin-top:32px;padding-top:14px;color:#6a7585;font-size:11px}@media print{body{background:#fff}.receipt{margin:0;max-width:none}}</style></head><body><main class="receipt"><div class="top"><div><div class="brand">MUGHAL MAHAL</div><div class="muted">Hotel, Dining & Events</div><div class="muted">Buyer + Admin Confirmation Receipt</div></div><div class="right"><h1>RECEIPT</h1><div class="muted">Order No: ${receiptId(item)}</div><div class="muted">Date: ${formatDate(item.createdAt)}</div></div></div><section class="section"><h2>Order Confirmation</h2><div class="grid"><div class="field"><b>Category</b>${item.receiptCategory}</div><div class="field"><b>Status</b>${item.status || "Pending"}</div><div class="field"><b>Buyer</b>${item.guestName || item.contactPerson || item.username || "—"}</div><div class="field"><b>Phone</b>${item.phone || "—"}</div></div></section><section class="section"><h2>Booking / Order Details</h2><div class="grid"><div class="field"><b>Order / Event</b>${item.eventName || "—"}</div><div class="field"><b>Venue / Area</b>${item.venue || "—"}</div><div class="field"><b>Room / Hall / Type</b>${item.subHall || item.roomType || item.itemCategory || "—"}</div><div class="field"><b>Date / Stay</b>${formatDate(item.eventDate)}</div><div class="field"><b>Time</b>${item.timeSlot || "—"}</div><div class="field"><b>Email / User</b>${item.email || item.username || "—"}</div></div></section>${item.receiptItems?.length ? `<section class="section"><h2>Ordered Items</h2><div class="items">${item.receiptItems.map((entry) => `<p><span>${entry.itemName || entry.name || "Item"}${entry.quantity ? ` × ${entry.quantity}` : ""}</span><b>PKR ${Number(entry.amount ?? entry.itemPrice ?? entry.price ?? 0).toLocaleString()}</b></p>`).join("")}</div></section>` : ""}<section class="section"><h2>Admin Record</h2><div class="grid"><div class="field"><b>Receipt ID</b>${receiptId(item)}</div><div class="field"><b>Created</b>${formatDate(item.createdAt)}</div><div class="field"><b>Notes</b>${item.note || "—"}</div><div class="field"><b>Payment / Amount</b>PKR ${amount(item).toLocaleString()}</div></div><div class="total">Total: PKR ${amount(item).toLocaleString()}</div></section><div class="footer">Thank you for choosing Mughal Mahal. Keep this receipt for your booking and order reference.</div></main></body></html>`

  const openReceipt = (item, print = false) => {
    const receiptUrl = URL.createObjectURL(new Blob([receiptMarkup(item)], { type: "text/html;charset=utf-8" }))
    const popup = window.open(receiptUrl, "_blank")
    if (!popup) {
      URL.revokeObjectURL(receiptUrl)
      return
    }
    if (print) {
      popup.addEventListener("load", () => {
        popup.focus()
        popup.print()
      }, { once: true })
    }
    setTimeout(() => URL.revokeObjectURL(receiptUrl), 60000)
  }

  const downloadReceipt = (item) => {
    const receiptUrl = URL.createObjectURL(new Blob([receiptMarkup(item)], { type: "text/html;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = receiptUrl
    link.download = `receipt-${receiptId(item)}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(receiptUrl), 1000)
  }

  const filtered = receipts.filter((item) => {
    const text = `${receiptId(item)} ${item.guestName || ""} ${item.eventName || ""} ${item.receiptCategory}`.toLowerCase()
    return (filter === "All" || item.receiptCategory === filter) && text.includes(search.toLowerCase())
  })

  return <div className="receipts-page">
    <header className="receipts-page-header"><div><span className="receipts-kicker">MUGHAL MAHAL · ADMIN</span><h1>Receipts</h1><p>Professional buyer and admin confirmations for every hotel service.</p></div><div className="receipt-count">{filtered.length}<span>Receipts</span></div></header>
    <div className="receipt-toolbar"><div className="receipt-search"><FaSearch /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, buyer or category" /></div><div className="receipt-filters">{["All", "Banquet", "Dining", "Room", "Redbox", "Dining Table", "Conference"].map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
    {loading ? <div className="receipts-empty">Loading receipts...</div> : <div className="receipt-list">{filtered.length ? filtered.map((item) => <button type="button" className="receipt-row" key={`${item.receiptCategory}-${item._id}`} onClick={() => setSelected(item)}><span className={`receipt-type ${categoryColors[item.receiptCategory] || "gold"}`}>{item.receiptCategory}</span><span className="receipt-row-main"><strong>{receiptId(item)}</strong><small>{item.guestName || item.contactPerson || item.username || "Buyer"} · {item.eventName || item.selectedPage || "Order"}</small></span><span className="receipt-row-date">{formatDate(item.createdAt)}</span><strong className="receipt-row-amount">PKR {amount(item).toLocaleString()}</strong><FaExternalLinkAlt className="receipt-row-icon" /></button>) : <div className="receipts-empty">No receipts found.</div>}</div>}
    {selected && <div className="receipt-dialog-backdrop" onClick={(event) => event.target === event.currentTarget && setSelected(null)}><div className="receipt-dialog"><div className="dialog-heading"><div><span>{selected.receiptCategory} · Order Confirmation</span><h2>Receipt {receiptId(selected)}</h2></div><button type="button" onClick={() => setSelected(null)}>×</button></div><div className="dialog-actions"><button type="button" onClick={() => openReceipt(selected)}><FaExternalLinkAlt /> View</button><button type="button" onClick={() => openReceipt(selected, true)}><FaPrint /> Print</button><button type="button" onClick={() => downloadReceipt(selected)}><FaDownload /> Download</button></div><div className="dialog-preview" dangerouslySetInnerHTML={{ __html: receiptMarkup(selected).replace(/<html>[\s\S]*?<body>/, "").replace(/<\/body><\/html>/, "") }} /></div></div>}
  </div>
}

export default AdminReceipts
