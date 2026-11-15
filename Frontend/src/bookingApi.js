import axios from 'axios'
import { API_BASE_URL } from './config'

const bookingApi = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true
})

export default bookingApi
