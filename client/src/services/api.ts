import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach Authorization header if token in localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sop_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor to handle responses and 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // If unauthorized and not already on /login or /setup, we can clear token
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/setup')) {
        localStorage.removeItem('sop_auth_token');
        localStorage.removeItem('sop_user');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
