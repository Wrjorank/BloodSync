import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor for global error handling & data extraction
api.interceptors.response.use(
  (response) => response.data, // Automatically extract wrapper data
  (error) => {
    const message = error.response?.data?.error?.message || error.message;
    console.error('[API Error]:', message);
    return Promise.reject(error);
  }
);
