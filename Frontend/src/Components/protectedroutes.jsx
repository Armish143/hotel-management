import { Navigate } from "react-router-dom"

const ProtectedRoutes = ({ children }) => {
    const user = localStorage.getItem('user')
    const adminToken = localStorage.getItem('adminToken')

    if (!user || !adminToken) return <Navigate to="/admin/login" replace />
    return children
}

export default ProtectedRoutes