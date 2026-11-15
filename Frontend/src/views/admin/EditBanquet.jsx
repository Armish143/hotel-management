import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FaArrowLeft, FaSave } from "react-icons/fa";
import api from "../../api";
import "./EditBanquet.css";

const EditBanquet = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Updated State
  const [venue, setVenue] = useState("");
  const [subHall, setSubHall] = useState("");
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("Available");
  const [description, setDescription] = useState("");
  const [amenities, setAmenities] = useState([]);

  const availableAmenities = ["WiFi", "Sound System", "AC", "Stage", "Catering", "Parking", "Projector", "Generator"];
  const subHallsByVenue = {
    "Sheesh Mahal": ["S-M1", "S-M2"],
    "Husnain Hall": ["H-H1", "H-H2"]
  };

  const handleAmenityClick = (amenity) => {
    setAmenities(prev => prev.includes(amenity) ? prev.filter(a => a !== amenity) : [...prev, amenity]);
  };

  useEffect(() => {
    const fetchBanquetDetails = async () => {
      try {
        const res = await api.get(`/banquet/${id}`);
        const b = res.data;
        const matchedVenue = b.name?.startsWith("Husnain Hall") ? "Husnain Hall" : "Sheesh Mahal";
        const matchedSubHall = b.name?.match(/(S-M[12]|H-H[12])/)?.[1] || subHallsByVenue[matchedVenue][0];
        setVenue(matchedVenue);
        setSubHall(matchedSubHall);
        setCapacity(b.capacity || "");
        setPrice(b.price || "");
        setStatus(b.status || "Available");
        setDescription(b.description || "");
        setAmenities(b.amenities || []);
      } catch (err) { console.error(err); }
    };
    if (id) fetchBanquetDetails();
  }, [id]);

  const handleVenueChange = (event) => {
    const selectedVenue = event.target.value;
    setVenue(selectedVenue);
    setSubHall(subHallsByVenue[selectedVenue][0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/banquet/${id}`, {
        name: `${venue} - ${subHall}`,
        capacity,
        price,
        status
      });
      navigate("/admin/banquet");
    } catch (err) { alert("Error updating hall"); }
  };

  return (
    <div className="add-room-page">
      <div className="top-section">
        <button className="back-btn" onClick={() => navigate("/admin/banquet")}><FaArrowLeft /> Back</button>
        <div className="title-area"><h1>Edit Banquet Hall</h1></div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="room-layout">
          <div className="left-side">
            <div className="card-box">
              <h2>Basic Information</h2>
              <div className="form-grid">
                <select value={venue} onChange={handleVenueChange} className="white-input" required>
                  <option value="">Select Venue</option>
                  <option value="Sheesh Mahal">Sheesh Mahal</option>
                  <option value="Husnain Hall">Husnain Hall</option>
                </select>
                <select value={subHall} onChange={(e) => setSubHall(e.target.value)} className="white-input" required>
                  <option value="">Select Hall</option>
                  {(subHallsByVenue[venue] || []).map((hall) => (
                    <option key={hall} value={hall}>{hall}</option>
                  ))}
                </select>
                <input type="number" value={capacity} placeholder="Capacity (Guests)" onChange={(e) => setCapacity(e.target.value)} required />
                <input type="number" value={price} placeholder="Price per Day ($)" onChange={(e) => setPrice(e.target.value)} required />
              </div>
              <textarea className="white-input mt-3" value={description} placeholder="Description" onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
            </div>

            <div className="card-box mt-4">
              <h2>Amenities</h2>
              <div className="amenities-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {availableAmenities.map(a => (
                  <span key={a} className={`amenity-item ${amenities.includes(a) ? "active" : ""}`} onClick={() => handleAmenityClick(a)}>
                    {a}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="right-side">
            <div className="card-box">
              <h2>Status</h2>
              <input type="text" value={status} placeholder="Room Status" onChange={(e) => setStatus(e.target.value)} required />
            </div>

            <div className="card-box mt-4">
              <h2>Visuals</h2>
              <div className="upload-box" style={{ border: '2px dashed #ddd', padding: '20px', textAlign: 'center' }}>
                <p>Upload Hall Images</p>
              </div>
            </div>

            <button className="create-room-btn mt-4" type="submit"><FaSave /> Update Hall</button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default EditBanquet;