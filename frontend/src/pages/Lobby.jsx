import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { connectSocket, getSocket } from '../services/socket';
import api from '../services/api';
import './Lobby.css';

const Lobby = () => {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [minBet, setMinBet] = useState(100);
  const [toast, setToast] = useState(null);
  // Ollama Settings
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem('ollama_url') || '');
  const [ollamaModel, setOllamaModel] = useState(() => localStorage.getItem('ollama_model') || 'llama3');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Kết nối socket khi vào lobby
  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = connectSocket(token);

    socket.emit('lobby:getRooms', (data) => {
      setRooms(data.rooms || []);
    });

    socket.on('lobby:roomUpdate', (updatedRooms) => {
      setRooms(updatedRooms);
    });

    return () => {
      socket.off('lobby:roomUpdate');
    };
  }, []);

  // Điểm danh
  const handleCheckin = async () => {
    try {
      const { data } = await api.post('/wallet/checkin');
      showToast(data.message);
      setUser((prev) => ({ ...prev, balance: data.newBalance }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Lỗi điểm danh.', 'error');
    }
  };

  // Tạo phòng
  const handleCreateRoom = () => {
    const socket = getSocket();
    socket.emit('room:create', { isPublic, minBet }, (res) => {
      if (res.error) return showToast(res.error, 'error');
      navigate(`/room/${res.room.code}`);
    });
  };

  // Tham gia phòng Private bằng Code
  const handleJoinByCode = () => {
    if (!joinCode.trim()) return;
    navigate(`/room/${joinCode.trim().toUpperCase()}`);
  };

  // Tham gia phòng Public
  const handleJoinRoom = (code) => {
    navigate(`/room/${code}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSaveSettings = () => {
    localStorage.setItem('ollama_url', ollamaUrl.trim());
    localStorage.setItem('ollama_model', ollamaModel.trim() || 'llama3');
    // Thông báo cho OllamaChat biết cài đặt đã thay đổi
    window.dispatchEvent(new Event('ollama-settings-changed'));
    setShowSettingsModal(false);
    showToast(ollamaUrl.trim() ? '🤖 Đã lưu cài đặt AI!' : '⚙️ Đã xoá cài đặt AI.');
  };

  const statusLabel = { waiting: 'Chờ', betting: 'Đang cược', rolling: 'Đang lắc', result: 'Kết quả' };

  return (
    <div className="lobby-container">
      {/* TOP BAR */}
      <div className="lobby-topbar glass animate-fade-in">
        <div className="lobby-user-info">
          <h2>🎲 BẦU CUA ONLINE</h2>
          <p>Xin chào, <strong>{user?.username}</strong></p>
        </div>
        <div className="lobby-balance">
          <div className="balance-amount">💰 {(user?.balance || 0).toLocaleString()} Xu</div>
          <div className="lobby-actions-row">
            <button className="btn-sm btn-checkin" onClick={handleCheckin}>📅 Điểm danh</button>
            <button className="btn-sm btn-settings" onClick={() => setShowSettingsModal(true)} title="Cài đặt AI">⚙️</button>
            <button className="btn-sm btn-logout" onClick={handleLogout}>Thoát</button>
          </div>
        </div>
      </div>

      {/* HÀNH ĐỘNG */}
      <div className="lobby-actions animate-fade-in">
        <div className="action-card glass" onClick={() => setShowCreateModal(true)}>
          <div className="icon">🏠</div>
          <h3>Mở Bàn Mới</h3>
          <p>Bạn sẽ làm Nhà Cái</p>
        </div>
        <div className="action-card glass" onClick={() => setShowJoinModal(true)}>
          <div className="icon">🔑</div>
          <h3>Nhập Code Phòng</h3>
          <p>Vào phòng Private</p>
        </div>
      </div>

      {/* DANH SÁCH PHÒNG PUBLIC */}
      <h3 className="room-list-title">🌐 Phòng đang mở</h3>
      <div className="room-list">
        {rooms.length === 0 ? (
          <div className="empty-rooms glass">
            <p>Chưa có phòng nào. Hãy mở bàn đầu tiên! 🎰</p>
          </div>
        ) : (
          rooms.map((room) => (
            <div key={room.code} className="room-item glass" onClick={() => handleJoinRoom(room.code)}>
              <div className="room-info">
                <h4>🎯 Bàn {room.code}</h4>
                <p>Chủ bàn: {room.hostName} · Min: {room.minBet} Xu</p>
              </div>
              <div className="room-meta">
                <div className="room-players">👥 {room.playerCount}/{room.maxPlayers}</div>
                <div className={`room-status status-${room.status}`}>
                  {statusLabel[room.status] || room.status}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL TẠO PHÒNG */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <h3>🏠 Mở Bàn Mới</h3>
            <div className="input-group">
              <label>Mức cược tối thiểu</label>
              <input
                type="number"
                className="casino-input"
                value={minBet}
                onChange={(e) => setMinBet(Number(e.target.value))}
                min={50}
                step={50}
              />
            </div>
            <div className="toggle-row">
              <label>Phòng Public (ai cũng thấy)?</label>
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowCreateModal(false)}>Hủy</button>
              <button className="btn-confirm" onClick={handleCreateRoom}>Mở Bàn</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NHẬP CODE */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <h3>🔑 Nhập Mã Phòng</h3>
            <div className="input-group">
              <input
                type="text"
                className="casino-input"
                placeholder="VD: ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ textAlign: 'center', letterSpacing: '4px', fontSize: '1.5rem' }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowJoinModal(false)}>Hủy</button>
              <button className="btn-confirm" onClick={handleJoinByCode}>Vào Phòng</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CÀI ĐẶT OLLAMA */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content glass" onClick={(e) => e.stopPropagation()}>
            <h3>⚙️ Cài Đặt Trợ Lý AI</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', textAlign: 'center' }}>
              Nhập địa chỉ Ollama đang chạy trên máy tính của bạn.<br/>
              Nếu để trống, nút Chat AI sẽ bị ẩn đi.
            </p>
            <div className="input-group">
              <label>🌐 Ollama URL</label>
              <input
                type="text"
                className="casino-input"
                placeholder="http://localhost:11434"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
              />
            </div>
            <div className="input-group" style={{ marginTop: '0.75rem' }}>
              <label>🤖 Tên Model</label>
              <input
                type="text"
                className="casino-input"
                placeholder="llama3, qwen2.5, gemma3..."
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
              />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem', padding: '0.6rem', background: 'rgba(124,58,237,0.08)', borderRadius: '8px', border: '1px solid rgba(124,58,237,0.2)' }}>
              ⚠️ Để Ollama hoạt động từ Web, bạn cần khởi động với:<br/>
              <code style={{ color: '#a78bfa', fontSize: '0.8rem' }}>OLLAMA_ORIGINS="*" ollama serve</code>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowSettingsModal(false)}>Hủy</button>
              <button className="btn-confirm" onClick={handleSaveSettings}>💾 Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
};

export default Lobby;
