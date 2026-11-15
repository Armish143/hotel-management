import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import bookingApi from "../bookingApi";
import Navbar from "../Components/home/Navbar";
import Footer from "../Components/home/Footer";
import "./ProfilePage.css";
import { UPLOADS_BASE_URL } from "../config";

const UPLOAD_BASE_URL = `${UPLOADS_BASE_URL}/profile`;
const getImageUrl = (profileImage) => (profileImage ? `${UPLOAD_BASE_URL}/${profileImage}` : null);

function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({});
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [objectUrl, setObjectUrl] = useState(null);
  const [bookingHistoryResult, setBookingHistoryResult] = useState({ email: "", records: null });

  useEffect(() => {
    const loadProfile = async () => {
      const username = localStorage.getItem("bookingUser");
      if (!username) {
        setLoading(false);
        return;
      }

      try {
        const response = await bookingApi.get(`/booking/user/profile/${encodeURIComponent(username)}`);
        const user = response.data.user;
        setProfile(user);
        setFormData({ ...user, profileImage: user.profileImage || null });
        setImagePreview(getImageUrl(user.profileImage));
        localStorage.setItem("bookingUserProfile", JSON.stringify(user));
      } catch {
        setError("Unable to load profile information. Please login again.");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    const handleProfileChange = (event) => {
      if (!event.detail) {
        navigate("/");
        return;
      }

      const parsed = event.detail;
      const username = localStorage.getItem("bookingUser");
      if (!username || parsed.username?.toLowerCase() !== username.toLowerCase()) return;
      setProfile(parsed);
      setFormData({ ...parsed, profileImage: parsed.profileImage || null });
      setImagePreview(getImageUrl(parsed.profileImage));
      setLoading(false);
    };

    const handleStorageChange = (event) => {
      if (event.key === "bookingUserProfile") {
        if (!event.newValue) {
          navigate("/");
          return;
        }

        const parsed = JSON.parse(event.newValue);
        const username = localStorage.getItem("bookingUser");
        if (!username || parsed.username?.toLowerCase() !== username.toLowerCase()) return;
        setProfile(parsed);
        setFormData({ ...parsed, profileImage: parsed.profileImage || null });
        setImagePreview(getImageUrl(parsed.profileImage));
        setLoading(false);
      }
    };

    window.addEventListener("bookingUserProfileChanged", handleProfileChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("bookingUserProfileChanged", handleProfileChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [navigate]);

  const profileEmail = profile?.email?.trim().toLowerCase() || "";

  useEffect(() => {
    if (!profileEmail) return;

    let isCurrent = true;
    bookingApi.get("/bookings")
      .then((response) => {
        const records = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.bookings)
          ? response.data.bookings
          : [];
        const userBookings = records
          .filter((booking) => String(booking.email || "").trim().toLowerCase() === profileEmail)
          .map((booking) => {
            const roomVenue = booking.roomVenue;
            const roomType = typeof roomVenue === "object" && roomVenue !== null
              ? roomVenue.type || roomVenue.roomType || booking.roomType
              : booking.roomType || roomVenue;

            return {
              ...booking,
              roomType: roomType || "Room",
              checkIn: booking.checkInDate || booking.checkIn || "",
              checkOut: booking.checkOutDate || booking.checkOut || "",
              adults: booking.adults || booking.specialRequests?.match(/Adults:\s*(\d+)/)?.[1] || "1",
            };
          });

        if (isCurrent) setBookingHistoryResult({ email: profileEmail, records: userBookings });
      })
      .catch((bookingError) => {
        console.error("Unable to load booking history:", bookingError);
        if (isCurrent) setBookingHistoryResult({ email: profileEmail, records: [] });
      });

    return () => {
      isCurrent = false;
    };
  }, [profileEmail]);

  const bookingHistory = bookingHistoryResult.email === profileEmail
    ? bookingHistoryResult.records
    : null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    setFormData((prev) => ({ ...prev, profileImage: file }));
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    if (file) {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      setImagePreview(url);
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!profile) {
      setError("No profile loaded.");
      return;
    }

    try {
      setSaving(true);
      const body = new FormData();
      body.append("currentUsername", profile.username);
      body.append("firstName", formData.firstName || "");
      body.append("lastName", formData.lastName || "");
      body.append("email", formData.email || "");
      body.append("username", formData.username || "");
      body.append("city", formData.city || "");
      body.append("address", formData.address || "");
      body.append("phone", formData.phone || "");
      if (formData.profileImage instanceof File) {
        body.append("profileImage", formData.profileImage);
      }

      const response = await bookingApi.put("/booking/user/update-profile", body);

      const updatedUser = response.data.user;
      const normalizedUser = {
        ...updatedUser,
        profileImage: updatedUser.profileImage || null,
      };

      localStorage.setItem("bookingUserProfile", JSON.stringify(normalizedUser));
      localStorage.setItem("bookingUser", normalizedUser.username);
      window.dispatchEvent(new CustomEvent("bookingUserProfileChanged", { detail: normalizedUser }));
      setProfile(normalizedUser);
      setFormData({
        ...normalizedUser,
        profileImage: normalizedUser.profileImage || null,
      });
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        setObjectUrl(null);
      }
      setImagePreview(getImageUrl(normalizedUser.profileImage));
      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(err?.response?.data?.message || "Unable to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }, [objectUrl]);

  if (loading) {
    return <div className="profile-page-loading">Loading profile...</div>;
  }

  if (!profile) {
    return (
      <>
        <Navbar />
        <div className="profile-page-empty">
          <h2>Please login to view your profile.</h2>
          <button className="btn btn-dark mt-4" onClick={() => navigate("/")}>Go Home</button>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="profile-page-container">
        <div className="profile-page-header">
          <div className="profile-page-avatar-card">
            <div className="profile-avatar-wrapper">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Profile"
                  className="profile-avatar-image"
                  onError={() => setImagePreview(null)}
                />
              ) : (
                <span className="profile-avatar-fallback">{profile.firstName?.[0] || "U"}</span>
              )}
            </div>
            <h2>{profile.firstName} {profile.lastName}</h2>
            <p>{profile.email}</p>
            <p className="profile-role">Booking account</p>
          </div>

          <div className="profile-booking-summary">
            <div className="profile-summary-card">
              <span>Bookings</span>
              <strong>{bookingHistory === null ? "..." : bookingHistory.length}</strong>
            </div>
            <div className="profile-summary-card">
              <span>Username</span>
              <strong>{profile.username}</strong>
            </div>
            <div className="profile-summary-card">
              <span>Phone</span>
              <strong>{profile.phone || "-"}</strong>
            </div>
          </div>
        </div>

        <div className="profile-page-grid">
          <div className="profile-form-card">
            <h3>Account details</h3>
            <form onSubmit={handleSaveProfile} className="profile-form">
              <label>First Name</label>
              <input name="firstName" value={formData.firstName || ""} onChange={handleChange} />

              <label>Last Name</label>
              <input name="lastName" value={formData.lastName || ""} onChange={handleChange} />

              <label>Email</label>
              <input name="email" type="email" value={formData.email || ""} onChange={handleChange} />

              <label>Username</label>
              <input name="username" value={formData.username || ""} onChange={handleChange} />

              <label>City</label>
              <input name="city" value={formData.city || ""} onChange={handleChange} />

              <label>Address</label>
              <input name="address" value={formData.address || ""} onChange={handleChange} />

              <label>Phone</label>
              <input name="phone" value={formData.phone || ""} onChange={handleChange} />

              <label>Profile Image</label>
              <input type="file" accept="image/*" onChange={handleImageChange} />

              {error && <div className="profile-alert profile-alert-error">{error}</div>}
              {success && <div className="profile-alert profile-alert-success">{success}</div>}

              <button type="submit" className="btn btn-dark profile-save-btn" disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </button>
            </form>
          </div>

          <div className="profile-history-card">
            <h3>Booking history</h3>
            {bookingHistory === null ? (
              <p>Loading bookings...</p>
            ) : bookingHistory.length === 0 ? (
              <p>No saved bookings yet. Book now to see them here.</p>
            ) : (
              <div className="profile-history-list">
                {bookingHistory.map((booking) => (
                  <div key={booking.id} className="profile-history-row">
                    <div>
                      <strong>{booking.roomType}</strong>
                      <p>{booking.checkIn} → {booking.checkOut}</p>
                    </div>
                    <div>
                      <span>{booking.adults} adults</span>
                      <p>{booking.phone}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default ProfilePage;
