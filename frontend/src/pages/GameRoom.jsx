import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket, connectSocket } from '../services/socket';
import './GameRoom.css';

const SYMBOL_MAP = {
  nai: { icon: '🦌', name: 'Nai' },
  bau: { icon: '🍐', name: 'Bầu' },
  ga:  { icon: '🐓', name: 'Gà' },
  ca:  { icon: '🐟', name: 'Cá' },
  cua: { icon: '🦀', name: 'Cua' },
  tom: { icon: '🦐', name: 'Tôm' },
};

const CHIP_VALUES = [50, 100, 200, 500, 1000];

const GameRoom = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();

  const [room, setRoom] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedChip, setSelectedChip] = useState(100);
  const [myBets, setMyBets] = useState({});
  const [diceResults, setDiceResults] = useState([]);
  const [isRolling, setIsRolling] = useState(false);
  const [showResult, setShowResult] = useState(null);
  const [error, setError] = useState('');
  const chatEndRef = useRef(null);

  const isHost = room?.hostId === user?.id;
  const canBet = room?.status === 'betting' && !isHost;

  // Kết nối socket và join room
  useEffect(() => {
    const token = localStorage.getItem('token');
    const socket = connectSocket(token);

    socket.emit('room:join', { code }, (res) => {
      if (res.error) {
        setError(res.error);
        setTimeout(() => navigate('/'), 2000);
        return;
      }
      setRoom(res.room);
      setChatMessages(res.chatHistory || []);
    });

    // SOCKET EVENT LISTENERS
    socket.on('room:playerJoined', ({ players }) => {
      setRoom((prev) => prev ? { ...prev, players } : prev);
    });

    socket.on('room:playerLeft', ({ players }) => {
      setRoom((prev) => prev ? { ...prev, players } : prev);
    });

    socket.on('room:hostChanged', ({ newHostId, newHostName, players }) => {
      setRoom((prev) => prev ? { ...prev, hostId: newHostId, hostName: newHostName, players } : prev);
    });

    socket.on('room:playerKicked', ({ userId, username, reason }) => {
      if (userId === user?.id) {
        alert(`Bạn bị mời ra khỏi phòng: ${reason}`);
        navigate('/');
      }
    });

    socket.on('game:bettingStarted', ({ roundNumber }) => {
      setRoom((prev) => prev ? { ...prev, status: 'betting', roundNumber, currentRound: { bets: [], totalBetAmount: 0 } } : prev);
      setMyBets({});
      setDiceResults([]);
      setShowResult(null);
    });

    socket.on('game:betPlaced', ({ userId, username, symbol, amount, totalBetAmount }) => {
      setRoom((prev) => {
        if (!prev) return prev;
        const updatedBets = [...(prev.currentRound?.bets || []), { userId, username, symbol, amount }];
        return { ...prev, currentRound: { ...prev.currentRound, bets: updatedBets, totalBetAmount } };
      });
    });

    socket.on('game:bettingClosed', () => {
      setRoom((prev) => prev ? { ...prev, status: 'rolling' } : prev);
      setIsRolling(true);
    });

    socket.on('game:roundResult', ({ diceResults: dice, settlements, hostNetChange, balanceMap, roundNumber }) => {
      setIsRolling(false);
      setDiceResults(dice);
      setRoom((prev) => prev ? { ...prev, status: 'result' } : prev);

      // Cập nhật số dư
      const uid = user?.id;
      if (balanceMap[uid] !== undefined) {
        setUser((prev) => ({ ...prev, balance: balanceMap[uid] }));
      }

      // Tìm kết quả cá nhân — Kiểm tra host bằng cách so room data trực tiếp
      setRoom((prevRoom) => {
        const amIHost = prevRoom?.hostId === uid;
        const mySettlements = settlements.filter((s) => s.userId === uid);
        const totalChange = mySettlements.reduce((sum, s) => sum + s.change, 0);

        if (amIHost) {
          const hostType = hostNetChange > 0 ? 'win' : hostNetChange < 0 ? 'lose' : 'neutral';
          setShowResult({ type: hostType, amount: hostNetChange, dice, isHost: true });
        } else if (mySettlements.length > 0) {
          setShowResult({ type: totalChange >= 0 ? 'win' : 'lose', amount: totalChange, dice, isHost: false });
        } else {
          setShowResult({ type: 'neutral', amount: 0, dice, isHost: false });
        }
        return prevRoom;
      });
    });

    socket.on('chat:newMessage', (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    return () => {
      socket.off('room:playerJoined');
      socket.off('room:playerLeft');
      socket.off('room:hostChanged');
      socket.off('room:playerKicked');
      socket.off('game:bettingStarted');
      socket.off('game:betPlaced');
      socket.off('game:bettingClosed');
      socket.off('game:roundResult');
      socket.off('chat:newMessage');
    };
  }, [code]);

  // Auto scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handlePlaceBet = (symbol) => {
    if (!canBet) return;
    const socket = getSocket();
    socket.emit('game:placeBet', { symbol, amount: selectedChip }, (res) => {
      if (res.error) {
        alert(res.error);
        return;
      }
      setMyBets((prev) => ({
        ...prev,
        [symbol]: (prev[symbol] || 0) + selectedChip,
      }));
    });
  };

  const handleStartBetting = () => {
    const socket = getSocket();
    socket.emit('game:startBetting', (res) => {
      if (res.error) alert(res.error);
    });
  };

  const handleCloseBetting = () => {
    const socket = getSocket();
    socket.emit('game:closeBetting', (res) => {
      if (res.error) alert(res.error);
    });
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const socket = getSocket();
    socket.emit('chat:sendMessage', { message: chatInput });
    setChatInput('');
  };

  const handleLeave = () => {
    const socket = getSocket();
    socket.emit('room:leave');
    navigate('/');
  };

  // Tính tổng cược trên từng ô
  const betTotals = {};
  if (room?.currentRound?.bets) {
    for (const bet of room.currentRound.bets) {
      betTotals[bet.symbol] = (betTotals[bet.symbol] || 0) + bet.amount;
    }
  }

  if (error) {
    return (
      <div className="game-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass" style={{ padding: '2rem', textAlign: 'center', borderRadius: '16px' }}>
          <p style={{ color: 'var(--accent-red)', fontSize: '1.1rem' }}>{error}</p>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Đang quay về sảnh...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="game-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Đang tải phòng...</p>
      </div>
    );
  }

  const statusText = {
    waiting: '⏳ Chờ Nhà Cái mở cược...',
    betting: '🔥 ĐANG MỞ CƯỢC — Đặt nhanh tay!',
    rolling: '🎲 ĐANG LẮC XÚC XẮC...',
    result: '📊 Kết quả ván #' + room.roundNumber,
  };

  return (
    <div className="game-container">
      {/* HEADER */}
      <div className="game-header glass">
        <div className="game-room-info">
          <h3>Bàn {room.code}</h3>
          <p>Ván #{room.roundNumber} · Min {room.minBet} Xu</p>
        </div>
        <div className="game-header-right">
          <span className="my-balance">💰 {(user?.balance || 0).toLocaleString()}</span>
          <button className="btn-leave" onClick={handleLeave}>Rời bàn</button>
        </div>
      </div>

      {/* PLAYER STRIP */}
      <div className="player-strip">
        {room.players.map((p) => (
          <div key={p.userId} className={`player-chip glass ${p.userId === room.hostId ? 'is-host' : ''} ${p.userId === user?.id ? 'is-me' : ''}`}>
            {p.userId === room.hostId && <span className="host-badge">👑</span>}
            <div className="player-avatar">{p.username[0].toUpperCase()}</div>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{p.username}</span>
          </div>
        ))}
      </div>

      {/* STATUS */}
      <div className={`status-banner ${room.status}`}>
        {statusText[room.status]}
      </div>

      {/* BETTING BOARD */}
      <div className="betting-board">
        {Object.entries(SYMBOL_MAP).map(([key, { icon, name }]) => (
          <div
            key={key}
            className={`bet-cell glass ${!canBet ? 'disabled' : ''}`}
            onClick={() => handlePlaceBet(key)}
          >
            {betTotals[key] > 0 && <span className="bet-total">{betTotals[key]}</span>}
            <span className="symbol-icon">{icon}</span>
            <span className="symbol-name">{name}</span>
            {myBets[key] > 0 && <div className="my-bet-badge">+{myBets[key]}</div>}
          </div>
        ))}
      </div>

      {/* CHIP SELECTOR */}
      {canBet && (
        <div className="bet-selector">
          {CHIP_VALUES.map((v) => (
            <button
              key={v}
              className={`chip-btn ${selectedChip === v ? 'active' : ''}`}
              onClick={() => setSelectedChip(v)}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {/* DICE AREA */}
      <div className="dice-area">
        {isRolling ? (
          <>
            <div className="dice rolling">❓</div>
            <div className="dice rolling">❓</div>
            <div className="dice rolling">❓</div>
          </>
        ) : diceResults.length > 0 ? (
          diceResults.map((d, i) => (
            <div key={i} className="dice">{SYMBOL_MAP[d]?.icon || '?'}</div>
          ))
        ) : (
          <>
            <div className="dice" style={{ opacity: 0.3 }}>🎲</div>
            <div className="dice" style={{ opacity: 0.3 }}>🎲</div>
            <div className="dice" style={{ opacity: 0.3 }}>🎲</div>
          </>
        )}
      </div>

      {/* HOST CONTROLS */}
      {isHost && (
        <div className="host-controls">
          {(room.status === 'waiting' || room.status === 'result') && (
            <button className="btn-start-bet" onClick={handleStartBetting}>🔓 Mở Cược</button>
          )}
          {room.status === 'betting' && (
            <button className="btn-close-bet" onClick={handleCloseBetting}>🔒 Đóng Cược & Lắc</button>
          )}
        </div>
      )}

      {/* CHAT */}
      <div className="chat-section glass">
        <div className="chat-messages">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.userId === 'system' ? 'system-msg' : ''}`}>
              <span className="chat-author">{msg.username}:</span>
              <span className="chat-text">{msg.message}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form className="chat-input-row" onSubmit={handleSendChat}>
          <input
            type="text"
            placeholder="Nhập tin nhắn..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            maxLength={200}
          />
          <button type="submit">Gửi</button>
        </form>
      </div>

      {/* RESULT OVERLAY */}
      {showResult && (
        <div className="result-overlay" onClick={() => setShowResult(null)}>
          <div className="result-card glass" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: 'var(--accent-gold)' }}>Ván #{room.roundNumber}</h2>
            <div className="result-dice-row">
              {showResult.dice.map((d, i) => (
                <div key={i} className="result-dice">{SYMBOL_MAP[d]?.icon}</div>
              ))}
            </div>
            <div className={`result-settlement ${showResult.type}`}>
              {showResult.type === 'win' && `🎉 +${showResult.amount.toLocaleString()} Xu`}
              {showResult.type === 'lose' && `💸 ${showResult.amount.toLocaleString()} Xu`}
              {showResult.type === 'neutral' && (showResult.isHost ? '🏦 Không ai cược — Hòa' : '😐 Bạn không đặt ván này')}
            </div>
            <div className="result-details">
              {showResult.isHost ? '👑 Nhà Cái' : '🎮 Tay Con'}
              {' · Số dư: '}
              <strong style={{ color: 'var(--accent-gold)' }}>{(user?.balance || 0).toLocaleString()} Xu</strong>
            </div>
            <button className="btn-dismiss" onClick={() => setShowResult(null)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameRoom;
