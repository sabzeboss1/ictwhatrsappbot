import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

// Injecter automatiquement le token JWT s'il existe
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ict_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Rediriger vers login si token invalide ou expiré
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      localStorage.removeItem('ict_auth_token');
      localStorage.removeItem('ict_user_data');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
