import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { FaEye, FaEyeSlash } from "react-icons/fa"
import bookingApi from "../bookingApi"
import roundLogo from "../assets/Mediacenter/Home/mughal-mahal-round.png"
import "./ResetPassword.css"

const isPasswordStrong = (value) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[.@!#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/.test(value)

function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError("")
    setSuccess("")
    if (!isPasswordStrong(password)) {
      setError("Password must include uppercase, lowercase, number and special character.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    setSubmitting(true)
    try {
      const response = await bookingApi.post(`/booking/reset-password/${token}`, { password, confirmPassword })
      setSuccess(response.data.message || "Password changed successfully.")
      setTimeout(() => navigate("/"), 1800)
    } catch (err) {
      setError(err?.response?.data?.message || "This reset link is invalid or expired.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="reset-password-page">
      <section className="reset-password-card" aria-labelledby="reset-password-title">
        <img className="reset-password-mark" src={roundLogo} alt="Mughal Mahal round logo" />
        <p className="reset-password-kicker">Mughal Mahal</p>
        <h1 id="reset-password-title">Create a new password</h1>
        <p className="reset-password-intro">Choose a strong password for your booking account.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="new-password">New password</label>
          <div className="reset-password-input-wrap">
            <input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" autoComplete="new-password" />
            <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <FaEyeSlash /> : <FaEye />}</button>
          </div>
          <label htmlFor="confirm-password">Confirm password</label>
          <div className="reset-password-input-wrap">
            <input id="confirm-password" type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" autoComplete="new-password" />
            <button type="button" aria-label={showConfirmPassword ? "Hide password" : "Show password"} onClick={() => setShowConfirmPassword((visible) => !visible)}>{showConfirmPassword ? <FaEyeSlash /> : <FaEye />}</button>
          </div>
          {error && <p className="reset-password-error">{error}</p>}
          {success && <p className="reset-password-success">{success}</p>}
          <button className="reset-password-submit" type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save new password"}</button>
        </form>
        <button className="reset-password-back" type="button" onClick={() => navigate("/")}>Back to Mughal Mahal</button>
      </section>
    </main>
  )
}

export default ResetPassword
