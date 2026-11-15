const defaultApiOrigin = import.meta.env.DEV
	? 'http://localhost:3000'
	: 'https://mughal-mahal-backend.vercel.app'

export const API_ORIGIN = (import.meta.env.VITE_API_URL || defaultApiOrigin).replace(/\/$/, '')
export const API_BASE_URL = `${API_ORIGIN}/api`
export const UPLOADS_BASE_URL = `${API_ORIGIN}/uploads`