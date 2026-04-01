import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './Auth.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/auth/login', { username, password });
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const [particlesConfig, setParticlesConfig] = useState([]);
  useEffect(() => {
    setParticlesConfig(Array.from({ length: 15 }).map(() => ({
      left: `${Math.random() * 100}%`,
      animationDuration: `${5 + Math.random() * 10}s`,
      animationDelay: `${Math.random() * 5}s`,
      width: `${5 + Math.random() * 15}px`,
      height: `${5 + Math.random() * 15}px`,
    })));
  }, []);

  return (
    <div className="auth-container">
      <div className="particles-bg">
        {particlesConfig.map((style, i) => (
          <div key={i} className="particle" style={style} />
        ))}
      </div>
      <div className="auth-card glass animate-fade-in">
        <div className="auth-header">
          <div className="auth-logo">🎲</div>
          <h1 className="auth-title">BẦU CUA ONLINE</h1>
          <p className="auth-subtitle">Sòng bạc tỷ phú - Đăng nhập</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form className="auth-form" onSubmit={handleLogin}>
          <div className="input-group">
            <label>Tên người chơi</label>
            <input 
              type="text" 
              className="casino-input" 
              placeholder="Nhập tên..." 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div className="input-group">
            <label>Mã PIN bảo mật</label>
            <input 
              type="password" 
              className="casino-input" 
              placeholder="Nhập mã bí mật..." 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="casino-btn shimmer-bg" disabled={loading}>
            {loading ? 'ĐANG KẾT NỐI SÒNG...' : 'VÀO BÀN NGAY'}
          </button>
        </form>

        <div className="auth-footer">
          Người chơi mới? <Link to="/register">Lấy số ngay (Tặng 3,000 Xu)</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
