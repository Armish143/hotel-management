import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { FaPlus, FaSearch, FaFilter, FaTrashAlt, FaUsers, FaCalendarAlt, FaSync, FaCheck, FaRegEdit, FaReceipt, FaPrint, FaDownload, FaExternalLinkAlt } from "react-icons/fa"
import "./Banquet.css"
import api from "../../api"

const Banquet = () => {
  const navigate = useNavigate()

  const [halls, setHalls] = useState([])
  const [events, setEvents] = useState([])
  const [guestInquiries, setGuestInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [refreshing, setRefreshing] = useState(false)
  const [editingPriceId, setEditingPriceId] = useState(null)
  const [editingPrice, setEditingPrice] = useState("")
  const [selectedReceipt, setSelectedReceipt] = useState(null)
  const [receiptRecords, setReceiptRecords] = useState([])
  const autoRefreshIntervalRef = useRef(null)

  const normalizeReceipt = (item, receiptCategory, amountField = "totalAmount") => ({
    ...item,
    receiptCategory,
    serviceType: receiptCategory,
    eventName: item.eventName || item.selectedPage || item.roomType || item.itemName || receiptCategory,
    venue: item.venue || item.roomVenue || item.selectedPage || item.itemCategory || "—",
    price: Number(item.price ?? item[amountField] ?? item.total ?? item.rate ?? 0),
    receiptItems: Array.isArray(item.itemDetails) && item.itemDetails.length
      ? item.itemDetails
      : Array.isArray(item.menuItems) ? item.menuItems : [],
    eventDate: item.eventDate || item.checkInDate || item.diningDate || item.createdAt,
    timeSlot: item.timeSlot || item.timing || item.diningTime || `${item.checkInDate || ""}${item.checkOutDate ? ` - ${item.checkOutDate}` : ""}`,
    note: item.note || item.specialRequests || item.internalNotes || "—"
    ,season: item.season || "—"
    ,climateSetup: item.climateSetup || "—"
    ,amenities: Array.isArray(item.amenities) ? item.amenities : []
  })

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true)

      let hallsData = []
      let eventsData = []
      let banquetQueries = []
      let receiptData = []

      try {
        const banquetQueriesRes = await api.get("/booking/banquet-bookings")
        banquetQueries = Array.isArray(banquetQueriesRes.data) ? banquetQueriesRes.data : []
      } catch (err) {
        console.error("Failed to load banquet inquiries:", err)
      }

      try {
        const hallsRes = await api.get("/banquets")
        hallsData = hallsRes.data || []
      } catch (err) {
        console.warn("Failed to load banquet halls:", err)
      }

      try {
        const eventsRes = await api.get("/events")
        eventsData = eventsRes.data || []
      } catch (err) {
        console.warn("Failed to load banquet events:", err)
      }

      try {
        const [diningRes, roomRes, redboxRes, tableRes] = await Promise.all([
          api.get("/dining-queries"),
          api.get("/bookings"),
          api.get("/redbox-orders"),
          api.get("/dining-table-bookings")
        ])
        receiptData = [
          ...banquetQueries.map((item) => normalizeReceipt(item, "Banquet", "price")),
          ...(Array.isArray(diningRes.data) ? diningRes.data : []).map((item) => normalizeReceipt(item, "Dining")),
          ...(Array.isArray(roomRes.data) ? roomRes.data : []).filter((item) => String(item.bookingType || "Room").toLowerCase() === "room").map((item) => normalizeReceipt(item, "Room")),
          ...(Array.isArray(redboxRes.data) ? redboxRes.data : []).map((item) => normalizeReceipt(item, "Redbox")),
          ...(Array.isArray(tableRes.data) ? tableRes.data : []).map((item) => normalizeReceipt(item, "Dining Table"))
        ].sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
      } catch (err) {
        console.warn("Failed to load receipt records:", err)
      }

      setHalls(hallsData)
      setEvents(eventsData)
      setGuestInquiries(banquetQueries)
      setReceiptRecords(receiptData)
    } catch (err) {
      console.error("Unexpected error fetching banquet dashboard data:", err)
      setHalls([])
      setEvents([])
      setGuestInquiries([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()

    // Auto-refresh every 3 seconds when page is visible
    const startAutoRefresh = () => {
      autoRefreshIntervalRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          fetchDashboardData()
        }
      }, 3000)
    }

    const stopAutoRefresh = () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current)
      }
    }

    startAutoRefresh()

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startAutoRefresh()
        fetchDashboardData()
      } else {
        stopAutoRefresh()
      }
    }

    const handleFocus = () => {
      if (!autoRefreshIntervalRef.current) {
        startAutoRefresh()
      }
      fetchDashboardData()
    }

    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      stopAutoRefresh()
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  const handleDeleteItem = async (itemOrId) => {
    if (!window.confirm("Are you sure you want to delete this booking?")) return

    const item = typeof itemOrId === 'string'
      ? [...guestInquiries, ...events].find((entry) => String(entry._id) === String(itemOrId))
      : itemOrId
    const id = item?._id || itemOrId

    // Banquet inquiries are stored separately from admin events.
    const isInquiry = item?.source === 'Inquiry' || guestInquiries.some((inquiry) => String(inquiry._id) === String(id))
    if (isInquiry) {
      try {
        await api.delete(`/booking/banquet-bookings/${encodeURIComponent(id)}`)
        setGuestInquiries((prev) => prev.filter((inquiry) => String(inquiry._id) !== String(id)))
      } catch (err) {
        alert(err?.response?.data?.message || "Failed to delete banquet booking. Please try again.")
      }
      return
    }

    try {
      await api.delete(`/event/${id}`)
      setEvents((prev) => prev.filter((event) => String(event._id) !== String(id)))
    } catch (err) {
      alert("Failed to delete event. Please try again.")
    }
  }

  const startPriceEdit = (hall) => {
    setEditingPriceId(hall._id)
    setEditingPrice(String(hall.price ?? ""))
  }

  const savePrice = async (hall) => {
    const price = editingPrice.trim()
    if (!price || Number(price) < 0) {
      setEditingPrice(String(hall.price ?? ""))
      setEditingPriceId(null)
      return
    }

    try {
      await api.put(`/banquet/${hall._id}`, {
        name: hall.name,
        capacity: hall.capacity,
        area: hall.area,
        price,
        status: hall.status,
        tags: hall.tags
      })
      setHalls((prev) => prev.map((item) => (
        item._id === hall._id ? { ...item, price } : item
      )))
      setEditingPriceId(null)
    } catch (err) {
      alert(err?.response?.data?.message || "Failed to update banquet price")
    }
  }

  const handleToggleConfirm = async (item) => {
    const eventId = item._id
    const currentlyConfirmed = ((item.status || '').toLowerCase() === 'confirmed')
    const newStatus = currentlyConfirmed ? 'Pending' : 'Confirmed'

    // If this is an inquiry (no backend event), update inquiries locally and return
    if (item.source === 'Inquiry') {
      try {
        await api.put(`/booking/banquet-bookings/${eventId}`, { status: newStatus })
        setGuestInquiries((prev) => prev.map((inq) => (inq._id === eventId ? { ...inq, status: newStatus } : inq)))
      } catch (err) {
        alert(`Failed to update status: ${err?.response?.data?.message || err?.message || 'Unknown error'}`)
      }
      return
    }

    // Optimistic UI update for real events
    setEvents((prev) => prev.map((ev) => (ev._id === eventId ? { ...ev, status: newStatus } : ev)))

    try {
      // Build full payload matching backend's Event schema to avoid partial-update issues
      const origEvent = events.find((ev) => ev._id === eventId) || item
      const payload = {
        eventName: origEvent.eventName || '',
        eventType: origEvent.eventType || '',
        banquetHall: typeof origEvent.banquetHall === 'object' && origEvent.banquetHall !== null ? (origEvent.banquetHall.name || '') : (origEvent.banquetHall || ''),
        eventDate: origEvent.eventDate || null,
        startTime: origEvent.startTime || '',
        endTime: origEvent.endTime || '',
        expectedGuests: origEvent.expectedGuests || 0,
        contactPerson: origEvent.contactPerson || '',
        email: origEvent.email || '',
        phone: origEvent.phone || '',
        hallRental: origEvent.hallRental || '',
        catering: origEvent.catering || '',
        decoration: origEvent.decoration || '',
        paidAmount: origEvent.paidAmount || 0,
        specialRequests: origEvent.specialRequests || '',
        internalNotes: origEvent.internalNotes || '',
        status: newStatus
      }

      await api.put(`/event/${eventId}`, payload)
    } catch (err) {
      // Revert on failure
      setEvents((prev) => prev.map((ev) => (ev._id === eventId ? { ...ev, status: currentlyConfirmed ? 'Confirmed' : 'Pending' } : ev)))
      console.error('Status update failed', err)
      const msg = err?.response?.data?.message || err?.message || 'Unknown error'
      alert(`Failed to update status: ${msg}`)
    }
  }

  const banquetInquiryEvents = guestInquiries.map((inquiry) => ({
    ...inquiry,
    banquetHall: {
      name: inquiry.venue ? `${inquiry.venue}${inquiry.subHall ? ` (${inquiry.subHall})` : ''}` : ''
    },
    contactPerson: inquiry.guestName,
    source: 'Inquiry'
  }))

  const combinedEvents = [...events, ...banquetInquiryEvents]
  const totalInquiries = guestInquiries.length

  const thisMonthInquiries = guestInquiries.filter((e) => {
    if (!e.eventDate) return false
    return new Date(e.eventDate).getMonth() === new Date().getMonth()
  }).length

  const totalRevenue = guestInquiries.reduce((sum, curr) => {
    return sum + Number(curr.price || 0)
  }, 0)

  const filteredEvents = combinedEvents.filter((event) => {
    const hallName = typeof event.banquetHall === "object" && event.banquetHall !== null
      ? (event.banquetHall.name || "")
      : ""
    const searchTarget = `${event._id} ${event.eventName || ""} ${event.contactPerson || ""} ${hallName}`.toLowerCase()

    const matchesSearch = searchTarget.includes(searchTerm.toLowerCase())
    const matchesFilter = statusFilter === "All" || event.status?.toLowerCase() === statusFilter.toLowerCase()

    return matchesSearch && matchesFilter
  })

  const getFrontendHallName = (hall, index) => {
    const publicHallNames = [
      "Sheesh Mahal - S-M1",
      "Sheesh Mahal - S-M2",
      "Husnain Hall - H-H1",
      "Husnain Hall - H-H2"
    ]
    return publicHallNames[index] || hall.name
  }

  const handleFilterClick = () => {
    if (statusFilter === "All") setStatusFilter("Confirmed")
    else if (statusFilter === "Confirmed") setStatusFilter("Pending")
    else setStatusFilter("All")
  }

  const formatReceiptDate = (value) => value ? new Date(value).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" }) : "—"
  const receiptAmount = (receipt) => Number(receipt?.price || 0).toLocaleString()

  const getReceiptMarkup = (receipt) => {
    const amount = receiptAmount(receipt)
    return `<!doctype html><html><head><meta charset="utf-8"><title>${receipt.receiptCategory || "Booking"} Receipt ${receipt.eventId || receipt._id}</title><style>
      body{font-family:Arial,sans-serif;color:#172033;margin:0;background:#f3f5f7}.receipt{max-width:820px;margin:30px auto;background:#fff;padding:38px;box-sizing:border-box}.head{display:flex;justify-content:space-between;border-bottom:2px solid #c89b3c;padding-bottom:22px}.brand{font-size:24px;font-weight:700;color:#a87920}.muted{color:#657184;font-size:13px}.title{text-align:right}.title h1{margin:0 0 8px;font-size:26px}.section{margin-top:26px}.section h2{font-size:14px;text-transform:uppercase;color:#a87920;border-bottom:1px solid #e4e7eb;padding-bottom:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px}.field{padding:8px 0;border-bottom:1px solid #eef0f3;font-size:14px}.field b{display:inline-block;min-width:125px;color:#647084}.total{margin:25px 0 0 auto;width:260px;font-size:20px;font-weight:700;border-top:2px solid #172033;padding-top:14px;text-align:right}.footer{margin-top:32px;padding-top:14px;border-top:1px solid #e4e7eb;color:#657184;font-size:12px}@media print{body{background:#fff}.receipt{margin:0;max-width:none;box-shadow:none}}
    </style></head><body><main class="receipt"><div class="head"><div><div class="brand">MUGHAL MAHAL</div><div class="muted">Banquet & Events Department</div><div class="muted">Buyer receipt and admin record</div></div><div class="title"><h1>RECEIPT</h1><div class="muted">Receipt # ${receipt.eventId || receipt._id || "—"}</div><div class="muted">Issued ${formatReceiptDate(receipt.createdAt)}</div></div></div>
      <section class="section"><h2>Buyer Details</h2><div class="grid"><div class="field"><b>Name</b>${receipt.guestName || "—"}</div><div class="field"><b>Username</b>${receipt.username || "—"}</div><div class="field"><b>Phone</b>${receipt.phone || "—"}</div><div class="field"><b>Status</b>${receipt.status || "Pending"}</div></div></section>
      <section class="section"><h2>Booking Details</h2><div class="grid"><div class="field"><b>Category</b>${receipt.receiptCategory || receipt.serviceType || "—"}</div><div class="field"><b>Event ID</b>${receipt.eventId || receipt._id || "—"}</div><div class="field"><b>Event / Order</b>${receipt.eventName || "—"}</div><div class="field"><b>Venue / Area</b>${receipt.venue || "—"}</div><div class="field"><b>Sub Hall / Type</b>${receipt.subHall || receipt.roomType || receipt.itemCategory || "—"}</div><div class="field"><b>Season / Setup</b>${receipt.season || "—"} / ${receipt.climateSetup || "—"}</div><div class="field"><b>Amenities</b>${receipt.amenities.length ? receipt.amenities.join(', ') : "None"}</div><div class="field"><b>Date</b>${formatReceiptDate(receipt.eventDate)}</div><div class="field"><b>Time / Stay</b>${receipt.timeSlot || "—"}</div></div></section>
      ${receipt.receiptItems?.length ? `<section class="section"><h2>Ordered Items</h2>${receipt.receiptItems.map((item) => `<div class="field"><b>${item.itemName || item.name || "Item"}${item.quantity ? ` × ${item.quantity}` : ""}</b>PKR ${Number(item.amount ?? item.itemPrice ?? item.price ?? 0).toLocaleString()}</div>`).join("")}</section>` : ""}
      <section class="section"><h2>Payment Details</h2><div class="grid"><div class="field"><b>Description</b>${receipt.receiptCategory || receipt.serviceType || "Booking"}</div><div class="field"><b>Payment Status</b>${receipt.status || "Pending"}</div></div><div class="total">Total: PKR ${amount}</div></section>
      <section class="section"><h2>Notes</h2><div class="field">${receipt.note || "No special notes provided."}</div></section>
      <div class="footer">Admin record generated by Mughal Mahal. Please retain this receipt for your booking reference.</div></main></body></html>`
  }

  const viewReceipt = (receipt) => {
    const receiptWindow = window.open("", "_blank", "noopener,noreferrer")
    if (!receiptWindow) return
    receiptWindow.document.write(getReceiptMarkup(receipt))
    receiptWindow.document.close()
  }

  const printReceipt = (receipt) => {
    const receiptWindow = window.open("", "_blank", "noopener,noreferrer")
    if (!receiptWindow) return
    receiptWindow.document.write(getReceiptMarkup(receipt))
    receiptWindow.document.close()
    receiptWindow.focus()
    receiptWindow.print()
  }

  const downloadReceipt = (receipt) => {
    const blob = new Blob([getReceiptMarkup(receipt)], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `banquet-receipt-${receipt.eventId || receipt._id || "booking"}.html`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ padding: "100px", textAlign: "center" }}>Loading Banquet Data...</div>

  return (
    <div className="banquet-container">
      <div className="banquet-header">
        <div>
          <h1>Banquet Management</h1>
          <p>Manage banquet halls and events</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={fetchDashboardData}
            disabled={refreshing}
            title="Refresh data"
            style={{ marginRight: "10px", display: "flex", alignItems: "center", gap: "5px" }}
          >
            <FaSync style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>

        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="banquet-stats-grid">
        <div className="b-stat-card"><span>Total Inquiries</span><h2>{totalInquiries}</h2></div>
        <div className="b-stat-card"><span>This Month Inquiries</span><h2>{thisMonthInquiries}</h2></div>
        <div className="b-stat-card"><span>Revenue Total</span><h2>Rs. {totalRevenue.toLocaleString()}</h2></div>
      </div>

      <h3 className="section-title">Banquet Halls</h3>
      <div className="halls-grid">
        {halls.map((hall, index) => (
          <div key={hall._id} className="hall-card">
            <div className="hall-image-placeholder">
              <FaUsers size={40} />
              <h4>{getFrontendHallName(hall, index)}</h4>
            </div>
            <div className="hall-content">
              <div className="hall-id-row">
                <span>ID: {hall._id.substring(hall._id.length - 4).toUpperCase()}</span>
                <span className={`status-pill ${(hall.status || "available").toLowerCase()}`}>{hall.status || "Available"}</span>
              </div>
              <p><strong>Capacity:</strong> {hall.capacity} guests</p>
              {editingPriceId === hall._id ? (
                <input
                  className="hall-price"
                  type="number"
                  min="0"
                  value={editingPrice}
                  onChange={(event) => setEditingPrice(event.target.value)}
                  onBlur={() => savePrice(hall)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                    if (event.key === "Escape") setEditingPriceId(null)
                  }}
                  autoFocus
                />
              ) : (
                <h3 className="hall-price" onClick={() => startPriceEdit(hall)} title="Click to edit price">
                  PKR {hall.price}/day
                </h3>
              )}
              <div className="hall-actions">
                <button className="btn-view-schedule" onClick={() => navigate("/admin/banquet/schedule")}>
                  <FaCalendarAlt /> Schedule
                </button>
                <button className="btn-edit-icon" onClick={() => navigate(`/admin/banquet/edit/${hall._id}`)} title="Edit hall"><FaRegEdit /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="events-section">
        <div className="table-header">
          <h3>Banquet Guest Inquiries</h3>
        </div>
        <div className="table-responsive">
          <table className="events-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Guest Name</th>
                <th>Venue</th>
                <th>Sub Hall</th>
                <th>Event Date</th>
                <th>Time Slot</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {guestInquiries.map((inquiry) => (
                <tr key={inquiry._id}>
                  <td>{inquiry.eventId}</td>
                  <td>{inquiry.guestName}</td>
                  <td>{inquiry.venue}</td>
                  <td>{inquiry.subHall}</td>
                  <td>{inquiry.eventDate ? new Date(inquiry.eventDate).toLocaleDateString() : "—"}</td>
                  <td>{inquiry.timeSlot}</td>
                  <td>{inquiry.phone}</td>
                  <td><span className={`status-pill ${(inquiry.status || "pending").toLowerCase()}`}>{inquiry.status}</span></td>
                  <td>Rs. {inquiry.price?.toLocaleString() || "0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="events-section">
        <div className="table-header">
          <h3>Upcoming Events</h3>
          <div className="header-tools">
            <div className="search-box-mini">
              <FaSearch />
              <input type="text" placeholder="Search events..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <button className="btn-filter" onClick={handleFilterClick}>
              <FaFilter /> Status: {statusFilter}
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="events-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Event Name</th>
                <th>Hall</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((e) => (
                <tr key={e._id} onClick={() => navigate(`/admin/event/details/${e._id}`)} className="clickable-row" style={{ cursor: "pointer" }}>
                  <td>{e._id.substring(e._id.length - 6).toUpperCase()}</td>
                  <td className="bold-text">{e.eventName}</td>
                  <td>{e.banquetHall?.name || "Assigned Space"}</td>
                  <td>{e.eventDate ? new Date(e.eventDate).toLocaleDateString() : "N/A"}</td>
                  <td><span className={`status-pill ${(e.status || "pending").toLowerCase()}`}>{e.status}</span></td>
                  <td>
                    <div className="action-icons-group" onClick={(evt) => evt.stopPropagation()}>
                      <FaCheck
                        className="confirm-icon"
                        onClick={() => handleToggleConfirm(e)}
                        style={{ cursor: 'pointer', color: (e.status || '').toLowerCase() === 'confirmed' ? 'green' : '#bdbdbd', marginRight: '8px' }}
                        title={((e.status || '').toLowerCase() === 'confirmed') ? 'Confirmed — click to mark Pending' : 'Mark as Confirmed'}
                      />
                      <FaTrashAlt
                        className="action-icon-delete"
                        onClick={() => handleDeleteItem(e)}
                        style={{ cursor: "pointer", color: "#e74c3c" }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}

export default Banquet