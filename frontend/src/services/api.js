import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.DEV ? 'http://localhost:5000/api' : '/api',
});

// Thêm interceptor để tự động chèn Token vào header
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
