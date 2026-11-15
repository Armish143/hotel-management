import axios from 'axios'
import { API_BASE_URL } from './config'

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('adminToken')
    if (token) {
        config.headers = config.headers || {}
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && window.location.pathname.startsWith('/admin')) {
            localStorage.removeItem("user")
            localStorage.removeItem("adminToken")
            window.location.href = "/admin"
        }
        return Promise.reject(error)
    }
)

export default api