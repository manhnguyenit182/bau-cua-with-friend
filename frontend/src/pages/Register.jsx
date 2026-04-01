import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './Auth.css';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    
    if (password.length < 6) {
      return setError('Mã bảo mật phải có ít nhất 6 ký tự.');
    }

    setLoading(true);

    try {
      const { data } = await api.post('/auth/register', { username, password });
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể cấp số. Vui lòng thử lại.');
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
          <div className="auth-logo">💎</div>
          <h1 className="auth-title">ĐĂNG KÝ THẺ VIP</h1>
          <p className="auth-subtitle">Mở tài khoản nhận ngay 3,000 Vàng</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form className="auth-form" onSubmit={handleRegister}>
          <div className="input-group">
            <label>Tên hiển thị</label>
            <input 
              type="text" 
              className="casino-input" 
              placeholder="Chọn tên giang hồ của bạn" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </div>
          
          <div className="input-group">
            <label>Mã PIN bảo mật</label>
            <input 
              type="password" 
              className="casino-input" 
              placeholder="Tạo mã PIN (tối thiểu 6 ký tự)" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="casino-btn shimmer-bg" disabled={loading}>
            {loading ? 'ĐANG XUẤT THẺ...' : 'MỞ TÀI KHOẢN'}
          </button>
        </form>

        <div className="auth-footer">
          Đã có thẻ thành viên? <Link to="/login">Đăng nhập ngay</Link>
        </div>
      </div>
    </div>
  );
};

export default Register;
