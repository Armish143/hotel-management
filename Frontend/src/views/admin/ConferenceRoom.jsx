import React, { useState, useEffect } from "react"
import { FaPlus, FaSearch, FaFilter, FaTrashAlt, FaUsers, FaCheckCircle, FaEdit } from "react-icons/fa"
import "./ConferenceRoom.css"
import api from "../../api"

const ConferenceRoom = () => {
  const [halls, setHalls] = useState([])
  const [bookings, setBookings] = useState([])
  const [conferenceInquiries, setConferenceInquiries] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("All")
  const [roomType, setRoomType] = useState("Conference Room")
  const [selectedRoomId, setSelectedRoomId] = useState("")
  const [isRoomFormOpen, setIsRoomFormOpen] = useState(false)
  const [roomForm, setRoomForm] = useState({ name: "", capacity: "", layout: "", price: "", status: "Available", tags: [] })

  useEffect(() => {
    const fetchConferenceDashboardData = async () => {
      try {
        setLoading(true)
        const [hallsResponse, bookingsResponse, diningResponse] = await Promise.all([
          api.get("/conference/rooms"),
          api.get("/conferences"),
          api.get("/dining-queries")
        ])

        setHalls(hallsResponse.data)
        if (hallsResponse.data.length) setSelectedRoomId(hallsResponse.data[0]._id)
        setBookings(bookingsResponse.data)

        const diningInquiries = Array.isArray(diningResponse.data)
          ? diningResponse.data
              .filter((item) => item.selectedPage === "Conference Room")
              .map((item) => ({
                ...item,
                guestName: item.guestName || item.name || "Guest",
                timing: item.timing || "N/A",
                phone: item.phone || "-",
                address: item.address || item.email || "-",
                note: item.note || "Conference Inquiry",
                source: "dining"
              }))
          : []

        const bookingInquiries = Array.isArray(bookingsResponse.data)
          ? bookingsResponse.data.map((booking) => ({
              ...booking,
              guestName: booking.organizationName || booking.contactPerson || "Guest",
              timing: booking.eventDate
                ? `${new Date(booking.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ${booking.startTime || ""}-${booking.endTime || ""}`.trim()
                : `${booking.startTime || ""}-${booking.endTime || ""}`.trim(),
              phone: booking.phone || "-",
              address: booking.email || (typeof booking.conferenceHallId === "object" ? booking.conferenceHallId.name : booking.conferenceHallId) || "-",
              note: booking.requirements || booking.internalNotes || booking.status || "Conference Booking",
              source: "booking"
            }))
          : []

        setConferenceInquiries([...bookingInquiries, ...diningInquiries])
      } catch (err) {
        console.error("Failed connecting conference infrastructure dashboards:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchConferenceDashboardData()
  }, [])

  const getRoomType = (hall) => {
    const value = String(hall.roomType || "").toLowerCase()
    if (value.includes("meeting")) return "Meeting Room"
    if (value.includes("conference")) return "Conference Room"
    return hall.name?.toLowerCase().includes("meeting") ? "Meeting Room" : "Conference Room"
  }

  const roomTypeHalls = halls.filter((hall) => getRoomType(hall) === roomType)

  useEffect(() => {
    setSelectedRoomId(roomTypeHalls[0]?._id || "")
  }, [roomType, halls.length])

  const selectedRoom = roomTypeHalls.find((hall) => hall._id === selectedRoomId)

  const openRoomForm = (room = null) => {
    setRoomForm(room ? { ...room, tags: room.tags || [], roomType: room.roomType || roomType } : { roomType, name: roomType, capacity: "", layout: "", price: "", status: "Available", tags: [] })
    setIsRoomFormOpen(true)
  }

  const refreshRooms = async () => {
    const response = await api.get("/conference/rooms")
    const rooms = Array.isArray(response.data) ? response.data : []
    setHalls(rooms)
    return rooms
  }

  const saveRoom = async (event) => {
    event.preventDefault()
    try {
      const payload = { ...roomForm, roomType, capacity: Number(roomForm.capacity), price: Number(roomForm.price) }
      const response = roomForm._id
        ? await api.put(`/conference/rooms/${roomForm._id}`, payload)
        : await api.post("/conference/rooms", payload)
      const savedRoom = response.data.data || response.data
      if (!savedRoom._id) {
        await refreshRooms()
        setIsRoomFormOpen(false)
        return
      }
      const normalizedRoom = { ...roomForm, ...savedRoom, roomType, _id: savedRoom._id || roomForm._id || `local-${Date.now()}` }
      setHalls((prev) => roomForm._id ? prev.map((hall) => hall._id === roomForm._id ? normalizedRoom : hall) : [...prev, normalizedRoom])
      setSelectedRoomId(normalizedRoom._id)
      setIsRoomFormOpen(false)
    } catch (error) {
      alert(error.response?.data?.message || "Failed to save room")
    }
  }

  const deleteRoom = async () => {
    if (!selectedRoom || !window.confirm(`Delete ${selectedRoom.name}?`)) return
    try {
      await api.delete(`/conference/rooms/${selectedRoom._id}`)
      setHalls((prev) => prev.filter((hall) => hall._id !== selectedRoom._id))
    } catch (error) {
      alert(error.response?.data?.message || "Failed to delete room")
    }
  }

  const handleDeleteItem = async (itemId) => {
    if (window.confirm("Are you sure you want to delete this booking?")) {
      try {
        await api.delete(`/conference/${itemId}`)
        setBookings(bookings.filter((booking) => booking._id !== itemId))
        setConferenceInquiries(conferenceInquiries.filter((item) => item._id !== itemId))
      } catch (err) {
        alert("Failed to delete booking. Please try again.")
      }
    }
  }

  const handleApproveBooking = async (booking) => {
    if (booking.status === "approved") return

    try {
      await api.put(`/conference/${booking._id}`, { status: "approved" })
      setBookings((prev) => prev.map((item) => item._id === booking._id ? { ...item, status: "approved" } : item))
    } catch (err) {
      console.error('Approve booking error:', err)
      alert(err?.response?.data?.message || 'Failed to approve booking. Please try again.')
    }
  }

  const handleDeleteInquiry = async (inquiry) => {
    if (!window.confirm("Delete this inquiry?")) return

    try {
      if (inquiry.source === "dining") {
        await api.delete(`/dining-query/${inquiry._id}`)
      } else {
        await api.delete(`/conference/${inquiry._id}`)
      }

      setConferenceInquiries((prev) => prev.filter((item) => item._id !== inquiry._id))
      if (inquiry.source === "booking") {
        setBookings((prev) => prev.filter((booking) => booking._id !== inquiry._id))
      }
    } catch (err) {
      console.error('Delete inquiry error:', err)
      const message = err?.response?.data?.message || err?.message || 'Failed to delete inquiry. Please try again.'
      alert(message)
    }
  }

  const currentMonthBookings = bookings.filter((b) => {
    if (!b.eventDate) return false
    const matchDate = new Date(b.eventDate)
    const exactToday = new Date()
    return matchDate.getMonth() === exactToday.getMonth() && matchDate.getFullYear() === exactToday.getFullYear()
  })

  const thisMonthBookingsCount = currentMonthBookings.length

  const currentMonthMtdRevenue = currentMonthBookings.reduce((sum, curr) => {
    const revenueSum = curr.pricingBreakdown?.totalAmount || curr.totalAmount || 0
    return sum + Number(revenueSum)
  }, 0)


  const filteredBookings = bookings.filter((booking) => {
    const bId = booking._id || ""
    const bOrg = booking.organizationName || ""
    const bHallName = typeof booking.conferenceHallId === "object" && booking.conferenceHallId !== null
      ? (booking.conferenceHallId.name || "")
      : (halls.find((hall) => hall._id === booking.conferenceHallId)?.name || "Conference Hall")
    const bContact = booking.contactPerson || ""

    const matchTargets = `${bId} ${bOrg} ${bHallName} ${bContact}`.toLowerCase()
    const matchesSearch = matchTargets.includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "All" || booking.status?.toLowerCase() === statusFilter.toLowerCase()

    return matchesSearch && matchesStatus
  })

  if (loading) {
    return <div style={{ padding: "120px", textTransform: "uppercase", letterSpacing: "1px", textAlign: "center", color: "#666", fontWeight: "bold" }}>Syncing conference profiles...</div>
  }

  return (
    <div className="conference-container">
      <div className="conf-header">
        <div className="header-text">
          <h1>Conference Management</h1>
          <p>Manage conference rooms and bookings</p>
        </div>

      </div>


      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Room Type</span>
          <h2 className="stat-value">2</h2>
        </div>
        <div className="stat-card">
          <span className="stat-label">This Month Bookings</span>
          <h2 className="stat-value">{thisMonthBookingsCount}</h2>
        </div>
        <div className="stat-card">
          <span className="stat-label">Revenue (MTD)</span>
          <h2 className="stat-value">PKR {currentMonthMtdRevenue.toLocaleString()}</h2>
        </div>
      </div>

      <section className="room-type-section">
        <h3 className="section-title">Room Type</h3>
        <div className="room-type-buttons">
          {["Conference Room", "Meeting Room"].map((type) => (
            <button type="button" key={type} className={roomType === type ? "active" : ""} onClick={() => setRoomType(type)}>{type}</button>
          ))}
        </div>
        <div className="room-manager">
          <select value={selectedRoomId} onChange={(event) => setSelectedRoomId(event.target.value)}>
            {roomTypeHalls.length ? roomTypeHalls.map((hall) => <option key={hall._id} value={hall._id}>{hall.name}</option>) : <option value="">No rooms available</option>}
          </select>
          <button type="button" onClick={() => openRoomForm()}><FaPlus /> Add New</button>
          <button type="button" disabled={!selectedRoom} onClick={() => openRoomForm(selectedRoom)}><FaEdit /> Edit</button>
          <button type="button" className="danger" disabled={!selectedRoom} onClick={deleteRoom}><FaTrashAlt /> Delete</button>
        </div>
        {isRoomFormOpen && (
          <form className="room-editor" onSubmit={saveRoom}>
            <input placeholder="Room name" value={roomForm.name} onChange={(event) => setRoomForm({ ...roomForm, name: event.target.value })} required />
            <input type="number" placeholder="Capacity" value={roomForm.capacity} onChange={(event) => setRoomForm({ ...roomForm, capacity: event.target.value })} required />
            <input placeholder="Layout" value={roomForm.layout} onChange={(event) => setRoomForm({ ...roomForm, layout: event.target.value })} />
            <input type="number" placeholder="Price per day" value={roomForm.price} onChange={(event) => setRoomForm({ ...roomForm, price: event.target.value })} required />
            <select value={roomForm.status} onChange={(event) => setRoomForm({ ...roomForm, status: event.target.value })}><option>Available</option><option>Booked</option><option>Maintenance</option></select>
            <button type="submit">Save Room</button>
            <button type="button" onClick={() => setIsRoomFormOpen(false)}>Cancel</button>
          </form>
        )}
      </section>


      <div className="table-container">
        <div className="table-header">
          <h3>Conference Inquiries</h3>
        </div>
        <table className="conf-table">
          <thead>
            <tr>
              <th>Guest</th>
              <th>Timing</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Note</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {conferenceInquiries.map((inquiry) => (
              <tr key={inquiry._id}>
                <td>{inquiry.guestName}</td>
                <td>{inquiry.timing}</td>
                <td>{inquiry.phone}</td>
                <td>{inquiry.address || "—"}</td>
                <td>{inquiry.note || "—"}</td>
                <td>
                  <button
                    className="icon-button"
                    onClick={() => handleDeleteInquiry(inquiry)}
                    title="Delete inquiry"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#e74c3c' }}
                  >
                    <FaTrashAlt />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h3>Upcoming Bookings</h3>
          <div className="table-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #ccc", borderRadius: "4px", padding: "4px 8px", background: "#fff" }}>
              <FaSearch style={{ color: "#888", marginRight: "6px" }} />
              <input
                type="text"
                placeholder="Search bookings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ border: "none", outline: "none", fontSize: "14px" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #ccc", borderRadius: "4px", padding: "4px 8px", background: "#fff" }}>
              <FaFilter style={{ color: "#888", marginRight: "6px" }} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", cursor: "pointer" }}
              >
                <option value="All">All Status</option>
                <option value="Confirmed">Confirmed</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>
        </div>

        <table className="conf-table">
          <thead>
            <tr>
              <th>Booking ID</th>
              <th>Organization</th>
              <th>Hall</th>
              <th>Event Type</th>
              <th>Date</th>
              <th>Duration</th>
              <th>Attendees</th>
              <th>Status</th>
              <th>Contact</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.map((booking) => {
              const bHallTitle = typeof booking.conferenceHallId === "object" && booking.conferenceHallId !== null
                ? (booking.conferenceHallId.name || "Assigned Space")
                : (halls.find((hall) => hall._id === booking.conferenceHallId)?.name || "Conference Hall")

              const displayDate = booking.eventDate ? new Date(booking.eventDate).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric"
              }) : "N/A"

              const dynamicDuration = booking.startTime && booking.endTime
                ? `${booking.startTime} - ${booking.endTime}`
                : "Full Day"

              return (
                <tr key={booking._id} className="clickable-row">
                  <td className="bold-text">{booking._id.substring(booking._id.length - 6).toUpperCase()}</td>
                  <td>{booking.organizationName}</td>
                  <td>{bHallTitle}</td>
                  <td style={{ textTransform: "capitalize" }}>{booking.eventType}</td>
                  <td>{displayDate}</td>
                  <td>{dynamicDuration}</td>
                  <td><FaUsers size={12} /> {booking.expectedAttendees || 0}</td>
                  <td>
                    <span className={`status-badge ${(booking.status || "pending").toLowerCase().replace(" ", "-")}`}>
                      {booking.status || "Pending"}
                    </span>
                  </td>
                  <td>{booking.contactPerson}</td>
                  <td>
                    <div className="action-icons" onClick={(e) => e.stopPropagation()}>
                      <FaCheckCircle
                        className="action-icon-approve"
                        onClick={() => handleApproveBooking(booking)}
                        style={{ cursor: "pointer", color: booking.status === "approved" ? "#1abc9c" : "#2ecc71", marginRight: "10px" }}
                      />
                      <FaTrashAlt
                        className="action-icon-delete"
                        onClick={() => handleDeleteItem(booking._id)}
                        style={{ cursor: "pointer", color: "#e74c3c" }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredBookings.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: "#aaa", fontSize: "0.95rem" }}>
            No conference schedules.
          </div>
        )}
      </div>
    </div>
  )
}

export default ConferenceRoom