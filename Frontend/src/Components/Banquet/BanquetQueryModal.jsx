import React, { useState, useEffect } from 'react'
import bookingApi from '../../bookingApi'
import './BanquetQueryModal.css'

const BanquetQueryModal = ({ show, onClose, prefill }) => {
  const [eventId, setEventId] = useState('')
  const [eventName, setEventName] = useState('')
  const [venue, setVenue] = useState('Sheesh Mahal')
  const [subHall, setSubHall] = useState('S-M1')
  const [eventDate, setEventDate] = useState('')
  const [timeSlot, setTimeSlot] = useState('9am - 12pm')
  const [guestName, setGuestName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [season, setSeason] = useState('Winter')
  const [climateSetup, setClimateSetup] = useState('Heater')
  const [amenities, setAmenities] = useState([])
  const [amenitiesOpen, setAmenitiesOpen] = useState(false)
  const [price, setPrice] = useState(0)
  const [banquetPrices, setBanquetPrices] = useState({
    'S-M1': 80000,
    'S-M2': 75000,
    'H-H1': 65000,
    'H-H2': 71000
  })
  const [availableDates, setAvailableDates] = useState([])
  const [availableTimeSlots, setAvailableTimeSlots] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const subHallsMap = {
    'Sheesh Mahal': ['S-M1', 'S-M2'],
    'Husnain Hall': ['H-H1', 'H-H2']
  }

  const timeSlots = ['9am - 12pm', '1pm - 3pm', '4pm - 7pm']
  const amenityOptions = ['Wifi', 'Sound System', 'Stage', 'Catering', 'Projector']

  // Generate Event ID on mount
  useEffect(() => {
    setClimateSetup(season === 'Summer' ? 'AC' : 'Heater')
  }, [season])

  useEffect(() => {
    if (show && !eventId) {
      const newEventId = 'EV' + Date.now()
      setEventId(newEventId)
    }
  }, [show])

  useEffect(() => {
    if (!show) return
    bookingApi.get('/banquets')
      .then(({ data }) => {
        const subHallIds = ['S-M1', 'S-M2', 'H-H1', 'H-H2']
        const prices = { ...banquetPrices }
        data.slice(0, subHallIds.length).forEach((banquet, index) => {
          if (banquet.price !== undefined) prices[subHallIds[index]] = Number(banquet.price) || 0
        })
        setBanquetPrices(prices)
      })
      .catch(() => { })
  }, [show])

  // Prefill user data
  useEffect(() => {
    if (prefill && show) {
      setGuestName(`${prefill.firstName || ''} ${prefill.lastName || ''}`.trim())
      setPhone(prefill.phone || '')
    }
  }, [prefill, show])

  // Update sub-hall when venue changes
  useEffect(() => {
    const subHalls = subHallsMap[venue]
    if (subHalls && !subHalls.includes(subHall)) {
      setSubHall(subHalls[0])
    }
  }, [venue])

  // Update price when sub-hall changes
  useEffect(() => {
    setPrice(banquetPrices[subHall] || 0)
  }, [subHall, banquetPrices])

  useEffect(() => {
    if (!show) return
    const loadAvailability = async () => {
      try {
        const params = new URLSearchParams({ subHall })
        if (eventDate) params.set('date', eventDate)
        const response = await bookingApi.get(`/booking/banquet-availability?${params.toString()}`)
        setAvailableDates(response.data.dates || [])
        setAvailableTimeSlots(response.data.timeSlots || [])
        if (eventDate && !(response.data.timeSlots || []).includes(timeSlot)) {
          setTimeSlot(response.data.timeSlots?.[0] || '')
        }
      } catch {
        setAvailableDates([])
        setAvailableTimeSlots([])
        setTimeSlot('')
      }
    }
    loadAvailability()
  }, [show, subHall, eventDate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const username = localStorage.getItem('bookingUser')
    const bookingProfile = JSON.parse(localStorage.getItem('bookingUserProfile') || '{}')
    const email = bookingProfile.email || ''
    if (!username) {
      setError('You must be logged in to submit a booking query.')
      return
    }

    if (!eventName || !eventDate) {
      setError('Please fill in Event Name and Date')
      return
    }

    try {
      const payload = {
        username,
        email,
        eventId,
        eventName,
        venue,
        subHall,
        eventDate,
        timeSlot,
        guestName,
        phone,
        note,
        season,
        climateSetup,
        amenities,
        status: 'Pending',
        price
      }
      const res = await bookingApi.post('/booking/banquet-query', payload)
      setSuccess(res.data.message || 'Banquet query submitted successfully')
      setTimeout(() => {
        onClose()
        // Reset form
        setEventName('')
        setEventDate('')
        setVenue('Sheesh Mahal')
        setSubHall('S-M1')
        setTimeSlot('9am - 12pm')
        setGuestName('')
        setPhone('')
        setNote('')
        setSeason('Winter')
        setClimateSetup('Heater')
        setAmenities([])
        setAmenitiesOpen(false)
      }, 900)
    } catch (err) {
      setError(err?.response?.data?.message || 'Submission failed')
    }
  }

  if (!show) return null

  return (
    <div className="bq-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bq-modal">
        <button className="bq-close" onClick={onClose}>×</button>
        <h2 className="bq-title">Banquet Booking Query</h2>

        <form className="bq-form" onSubmit={handleSubmit}>
          {/* Row 1: Event ID & Event Name */}
          <div className="bq-row">
            <div className="bq-field bq-field-half">
              <input type="text" value={eventId} disabled className="bq-disabled" placeholder="Event ID" />
            </div>
            <div className="bq-field bq-field-half">
              <input type="text" placeholder="Event Name" value={eventName} onChange={(e) => setEventName(e.target.value)} required />
            </div>
          </div>

          {/* Row 2: Venue & Sub-Hall */}
          <div className="bq-row">
            <div className="bq-field bq-field-half">
              <select value={venue} onChange={(e) => setVenue(e.target.value)}>
                <option>Sheesh Mahal</option>
                <option>Husnain Hall</option>
              </select>
            </div>
            <div className="bq-field bq-field-half">
              <select value={subHall} onChange={(e) => setSubHall(e.target.value)}>
                {subHallsMap[venue].map((hall) => (
                  <option key={hall} value={hall}>{hall}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Date & Time Slot */}
          <div className="bq-row">
            <div className="bq-field bq-field-half">
              <input
                type="date"
                value={eventDate}
                min={availableDates[0]}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </div>
            <div className="bq-field bq-field-half">
              <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} required disabled={!eventDate || availableTimeSlots.length === 0}>
                {availableTimeSlots.length === 0 && <option value="">Select an available date first</option>}
                {availableTimeSlots.map((slot) => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Season, climate setup & price */}
          <div className="bq-row">
            <div className="bq-field bq-field-half">
              <select value={season} onChange={(e) => setSeason(e.target.value)}>
                <option value="Winter">Winter</option>
                <option value="Summer">Summer</option>
              </select>
            </div>
            <div className="bq-field bq-field-half">
              <select value={climateSetup} onChange={(e) => setClimateSetup(e.target.value)}>
                {season === 'Winter' ? (
                  <>
                    <option value="Heater">Heater</option>
                    <option value="Non Heater">Non Heater</option>
                  </>
                ) : (
                  <>
                    <option value="AC">AC</option>
                    <option value="Non AC">Non AC</option>
                  </>
                )}
              </select>
            </div>
          </div>
          <div className="bq-row bq-price-amenities-row">
            <div className="bq-field bq-field-half">
              <input type="text" value={`Rs. ${price.toLocaleString()}`} disabled className="bq-disabled" placeholder="Price" />
            </div>
            <div className="bq-field bq-field-half">
              <div className="bq-amenities-dropdown">
                <button
                  type="button"
                  className="bq-amenities-trigger"
                  onClick={() => setAmenitiesOpen((open) => !open)}
                  aria-expanded={amenitiesOpen}
                >
                  <span>Amenities {amenities.length ? `(${amenities.length})` : ''}</span>
                  <span className="bq-amenities-arrow">{amenitiesOpen ? '▴' : '▾'}</span>
                </button>
                {amenitiesOpen && <div className="bq-amenities-options">
                  {amenityOptions.map((amenity) => (
                    <button
                      key={amenity}
                      type="button"
                      className={`bq-amenity-option${amenities.includes(amenity) ? ' selected' : ''}`}
                      onClick={() => setAmenities((current) => current.includes(amenity)
                          ? current.filter((item) => item !== amenity)
                          : [...current, amenity])}
                    >
                      {amenity}
                    </button>
                  ))}
                </div>}
              </div>
            </div>
          </div>

          {/* Row 5: Guest Name & Phone */}
          <div className="bq-row">
            <div className="bq-field bq-field-half">
              <input type="text" placeholder="Guest Name" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </div>
            <div className="bq-field bq-field-half">
              <input type="tel" placeholder="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          {/* Row 6: Note/Action */}
          <div className="bq-row">
            <div className="bq-field bq-field-full">
              <textarea placeholder="Note / Special Request" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {/* Messages */}
          {error && <div className="bq-error">{error}</div>}
          {success && <div className="bq-success">{success}</div>}

          {/* Action Buttons */}
          <div className="bq-actions">
            <button type="submit" className="bq-submit">Submit Query</button>
            <button type="button" className="bq-cancel" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default BanquetQueryModal
