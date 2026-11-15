import { useEffect, useState } from "react"
import { FaEdit, FaSave, FaTrashAlt, FaUsers } from "react-icons/fa"
import api from "../../api"
import "./RegisteredUsers.css"

const RegisteredUsers = () => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await api.get("/booking-users")
        setUsers(Array.isArray(response.data) ? response.data : [])
      } catch (error) {
        console.error("Failed to load registered users:", error)
        setUsers([])
      } finally {
        setLoading(false)
      }
    }
    loadUsers()
  }, [])

  const startEditing = (user) => {
    setEditingId(user._id || user.username)
    setEditForm({ ...user })
  }

  const saveUser = async (userId) => {
    try {
      const response = await api.put(`/booking-users/${userId}`, editForm)
      setUsers((current) => current.map((user) => (user._id || user.username) === userId ? response.data.user : user))
      setEditingId(null)
    } catch (error) {
      alert(error.response?.data?.message || "Failed to update user")
    }
  }

  const deleteUser = async (user) => {
    const userId = user._id || user.username
    if (!window.confirm(`Delete ${user.firstName || user.username}?`)) return
    try {
      await api.delete(`/booking-users/${userId}`)
      setUsers((current) => current.filter((item) => (item._id || item.username) !== userId))
    } catch (error) {
      alert(error.response?.data?.message || "Failed to delete user")
    }
  }

  return (
    <div className="registered-users-page">
      <div className="registered-users-header">
        <div>
          <h1><FaUsers /> Registered Users</h1>
          <p>Customers registered on the booking website</p>
        </div>
        <strong>{users.length} Users</strong>
      </div>

      <div className="registered-users-card">
        {loading ? <p className="registered-users-empty">Loading registered users...</p> : users.length === 0 ? <p className="registered-users-empty">No registered users found.</p> : (
          <div className="registered-users-table-wrap">
            <table className="registered-users-table">
              <thead>
                <tr><th>Name</th><th>Username</th><th>Email</th><th>Phone</th><th>City</th><th>Registered</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id || user.username || user.email}>
                    {editingId === (user._id || user.username) ? <>
                      <td><input value={editForm.firstName || ""} onChange={(event) => setEditForm({ ...editForm, firstName: event.target.value })} /><input value={editForm.lastName || ""} onChange={(event) => setEditForm({ ...editForm, lastName: event.target.value })} /></td>
                      <td><input value={editForm.username || ""} onChange={(event) => setEditForm({ ...editForm, username: event.target.value })} /></td>
                      <td><input type="email" value={editForm.email || ""} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></td>
                      <td><input value={editForm.phone || ""} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></td>
                      <td><input value={editForm.city || ""} onChange={(event) => setEditForm({ ...editForm, city: event.target.value })} /></td>
                      <td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-PK") : "—"}</td>
                      <td><button className="user-action save" type="button" onClick={() => saveUser(user._id || user.username)}><FaSave /></button><button className="user-action" type="button" onClick={() => setEditingId(null)}>Cancel</button></td>
                    </> : <>
                      <td><strong>{`${user.firstName || ""} ${user.lastName || ""}`.trim() || "—"}</strong></td>
                      <td>{user.username || "—"}</td><td>{user.email || "—"}</td><td>{user.phone || "—"}</td><td>{user.city || "—"}</td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-PK") : "—"}</td>
                      <td><button className="user-action" type="button" onClick={() => startEditing(user)}><FaEdit /></button><button className="user-action delete" type="button" onClick={() => deleteUser(user)}><FaTrashAlt /></button></td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default RegisteredUsers
