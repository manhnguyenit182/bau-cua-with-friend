import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Lobby = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="container" style={{ paddingTop: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1rem', background: 'var(--bg-panel)', borderRadius: 'var(--radius-md)' }} className="glass">
        <div>
          <h2 className="text-gold">SẢNH CHỜ TỶ PHÚ</h2>
          <p>Xin chào, <strong>{user?.username}</strong></p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--accent-gold)', fontWeight: 'bold', fontSize: '1.2rem' }}>
            💰 {user?.balance?.toLocaleString()} Xu
          </div>
          <button onClick={handleLogout} style={{ background: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Rời bàn
          </button>
        </div>
      </header>

      <main>
        <h3>Khu Vực Bàn Chơi (Đang xây dựng - Phase 3)</h3>
        <p className="text-secondary" style={{ marginTop: '1rem' }}>
          Tại đây người chơi sẽ nhìn thấy các phòng đang mở, có thể ấn tham gia hoặc tự tạo phòng VIP.
        </p>
      </main>
    </div>
  );
};

export default Lobby;
