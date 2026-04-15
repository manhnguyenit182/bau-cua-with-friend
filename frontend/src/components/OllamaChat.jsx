import { useState, useEffect, useRef, useCallback } from 'react';
import './OllamaChat.css';

// ═══════════════════════════════════════════════════════
// OLLAMA CHAT COMPONENT
// Kết nối trực tiếp từ trình duyệt lên Ollama local API
// Không cần đi qua Backend Node.js
// ═══════════════════════════════════════════════════════

const STORAGE_URL_KEY = 'ollama_url';
const STORAGE_MODEL_KEY = 'ollama_model';

// ─── Giới hạn history ──────────────────────────────────
// Giữ tối đa N cặp (user + assistant) gần nhất để tránh vượt context window
// Tăng con số này nếu model của bạn có context window lớn (vd: 32k+)
const MAX_HISTORY_PAIRS = 8; // = 16 messages (8 user + 8 assistant)

// ─── System Prompt ─────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là **Cua Bot** 🦀 – trợ lý AI thông minh, hài hước được tích hợp vào **Bầu Cua Online**, nền tảng chơi Bầu Cua Tôm Cá trực tuyến cùng bạn bè theo thời gian thực.

## Về ứng dụng Bầu Cua Online
- Đây là game dân gian truyền thống Việt Nam được số hóa, cho phép nhiều người chơi cùng lúc qua mạng.
- Người chơi có thể **tạo phòng** hoặc **tham gia phòng** của người khác bằng mã phòng.
- Mỗi phòng có một **Host** (chủ phòng) điều khiển ván chơi – lắc xúc xắc, bắt đầu/kết thúc lượt.
- Có hệ thống **ví xu** (coins) – người chơi đặt cược xu và nhận thưởng theo kết quả.
- Giao diện có hiệu ứng 3D động, animation confetti khi thắng, thiết kế casino cao cấp.

## Luật chơi Bầu Cua Tôm Cá
**Dụng cụ:** 3 xúc xắc đặc biệt, mỗi mặt là một hình: 🦀 Cua, 🦐 Tôm, 🐟 Cá, 🦌 Nai, 🏥 Bầu (quả bầu), 🐓 Gà.

**Cách chơi:**
1. Trước mỗi lượt, người chơi đặt cược xu vào **một hoặc nhiều ô** bất kỳ trong 6 ô (Cua/Tôm/Cá/Nai/Bầu/Gà).
2. Host lắc 3 xúc xắc. Kết quả hiện ra sau animation lắc.
3. **Tính thưởng:** Với mỗi xu đặt cược, người chơi thắng theo số mặt xúc xắc trùng với ô mình chọn:
   - 0 mặt trùng → **thua** (mất tiền cược)
   - 1 mặt trùng → **thắng 1x** (lấy lại cược + được thêm bằng số tiền cược)
   - 2 mặt trùng → **thắng 2x** (lấy lại cược + được thêm 2× số tiền cược)
   - 3 mặt trùng → **thắng 3x** (lấy lại cược + được thêm 3× số tiền cược) – Jackpot!
4. Sau khi tính thưởng xong, ván tiếp theo bắt đầu (Host bấm lắc tiếp).

**Chiến thuật phổ biến:**
- *Trải cược đều*: Đặt nhỏ vào nhiều ô để giảm rủi ro (xác suất thắng cao hơn nhưng lợi nhuận thấp hơn).
- *Cược tập trung*: Đặt lớn vào 1-2 ô để tối đa hóa lợi nhuận nếu trúng.
- *Martingale*: Nhân đôi cược sau mỗi lần thua (rủi ro cao, cần vốn lớn).
- *Lưu ý:* Xác suất mỗi ô là ~42.1% (1 − (5/6)³) – không có chiến thuật nào đảm bảo thắng!

**Xác suất chi tiết (mỗi ô):**
- P(ít nhất 1 mặt trùng) ≈ 42.1%
- P(đúng 1 mặt trùng) ≈ 34.7% → thắng 1x
- P(đúng 2 mặt trùng) ≈ 6.9% → thắng 2x
- P(đúng 3 mặt trùng) ≈ 0.46% → thắng 3x (Jackpot)

## Phong cách trả lời
- Ngắn gọn, thân thiện, hài hước. Dùng emoji phù hợp.
- Trả lời bằng **tiếng Việt** trừ khi người dùng hỏi bằng ngôn ngữ khác.
- Nếu câu hỏi không liên quan đến game, vẫn trả lời hữu ích như một trợ lý thông thường.`;

export default function OllamaChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  // Ref để abort stream đang chạy khi cần
  const abortControllerRef = useRef(null);

  // Đọc cấu hình Ollama từ localStorage khi mount và khi settings thay đổi
  const reloadSettings = useCallback(() => {
    const url = localStorage.getItem(STORAGE_URL_KEY) || '';
    const model = localStorage.getItem(STORAGE_MODEL_KEY) || 'llama3';
    setOllamaUrl(url.trim());
    setOllamaModel(model.trim() || 'llama3');
  }, []);

  useEffect(() => {
    reloadSettings();
    window.addEventListener('ollama-settings-changed', reloadSettings);
    return () => window.removeEventListener('ollama-settings-changed', reloadSettings);
  }, [reloadSettings]);

  // Tự cuộn xuống tin nhắn mới nhất
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input khi mở chat
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (messages.length === 0) {
        setMessages([
          {
            role: 'assistant',
            content:
              '🦀 Xin chào! Tôi là **Cua Bot** – trợ lý AI của Bầu Cua Online!\n\nTôi có thể giúp bạn:\n- 📖 Giải thích **luật chơi** Bầu Cua Tôm Cá\n- 🎯 Tư vấn **chiến thuật** đặt cược\n- 🎲 Trả lời câu hỏi về **cách dùng app**\n\nHỏi tôi bất cứ điều gì nhé!',
          },
        ]);
      }
    }
  }, [isOpen]);

  // Nếu chưa cấu hình URL Ollama, ẩn hoàn toàn component
  if (!ollamaUrl) return null;

  // ─── Xây dựng history gửi lên Ollama ──────────────────
  // Bỏ tin nhắn chào mừng (index 0 từ assistant), giữ MAX_HISTORY_PAIRS cặp gần nhất
  const buildHistoryMessages = (allMessages) => {
    // Lọc bỏ tin nhắn chào mừng ban đầu của bot
    const conversationMessages = allMessages.filter((_, i) => i > 0);
    // Lấy MAX_HISTORY_PAIRS * 2 tin nhắn cuối (mỗi cặp gồm user + assistant)
    const limited = conversationMessages.slice(-(MAX_HISTORY_PAIRS * 2));
    return limited;
  };

  // ─── Gửi tin nhắn với Streaming ───────────────────────
  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    // Thêm placeholder tin nhắn assistant để stream vào
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    // Abort controller để huỷ stream nếu cần
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const historyMessages = buildHistoryMessages(updatedMessages);

      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: ollamaModel,
          stream: true,
          think: false, // 🚀 Tắt chain-of-thought (dành cho thinking models: deepseek-r1, qwen3, phi4...)
          options: {
            temperature: 0.3, // Thấp hơn = xác định hơn, phản hồi nhanh hơn
            num_predict: 256, // Giảm xuống 256 để trả lời ngắn gọn, nhanh hơn
            num_ctx: 2048, // Giảm context window → tốc độ prefill nhanh hơn
          },
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...historyMessages],
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama trả về lỗi: ${response.status} ${response.statusText}`);
      }

      // ─── Đọc stream từng dòng (NDJSON) ────────────────
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((l) => l.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const token = parsed?.message?.content || '';
            if (token) {
              accumulated += token;
              // Cập nhật tin nhắn cuối mỗi khi nhận được token mới
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: accumulated };
                return updated;
              });
            }
          } catch {
            // Bỏ qua dòng không parse được JSON
          }
        }
      }

      // Nếu stream kết thúc mà nội dung trống
      if (!accumulated) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: '(Phản hồi trống)' };
          return updated;
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // Người dùng huỷ, không hiện lỗi

      let errorMsg = '❌ Không thể kết nối Ollama. ';
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        errorMsg +=
          'Hãy kiểm tra Ollama đang chạy và URL đã đúng chưa. Nhớ bật với biến môi trường OLLAMA_ORIGINS="*" nhé!';
      } else {
        errorMsg += err.message;
      }
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: errorMsg };
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Gửi bằng phím Enter (Shift+Enter = xuống dòng)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Huỷ stream đang chạy
  const handleAbort = () => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  };

  // Xoá toàn bộ lịch sử hội thoại
  const handleClearHistory = () => {
    setMessages([
      {
        role: 'assistant',
        content: '🦀 Đã xoá lịch sử! Bắt đầu cuộc trò chuyện mới nhé. Tôi có thể giúp gì cho bạn?',
      },
    ]);
  };

  return (
    <>
      {/* Cửa sổ Chat */}
      {isOpen && (
        <div className="ollama-chat-window">
          {/* Header */}
          <div className="ollama-chat-header">
            <div className="ollama-chat-header-info">
              <div className="ollama-avatar">🦀</div>
              <div>
                <div className="ollama-chat-title">Cua Bot · Trợ Lý AI</div>
                <div className="ollama-chat-subtitle">
                  {ollamaModel} · {ollamaUrl}
                </div>
              </div>
            </div>
            <div className="ollama-header-actions">
              <button
                className="ollama-clear-btn"
                onClick={handleClearHistory}
                title="Xoá lịch sử hội thoại"
                disabled={isLoading}
              >
                🗑️
              </button>
              <button className="ollama-close-btn" onClick={() => setIsOpen(false)} title="Thu gọn">
                ✕
              </button>
            </div>
          </div>

          {/* Danh sách tin nhắn */}
          <div className="ollama-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                {msg.content}
              </div>
            ))}

            {/* Hiệu ứng "đang gõ" khi chưa có token nào */}
            {isLoading && messages[messages.length - 1]?.content === '' && (
              <div className="typing-indicator">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Khu vực nhập tin nhắn */}
          <div className="ollama-input-area">
            <textarea
              ref={inputRef}
              className="ollama-input"
              placeholder="Hỏi về luật chơi, chiến thuật... (Enter để gửi)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />
            {isLoading ? (
              <button className="ollama-send-btn abort" onClick={handleAbort} title="Dừng phản hồi">
                ⏹
              </button>
            ) : (
              <button className="ollama-send-btn" onClick={sendMessage} disabled={!input.trim()} title="Gửi">
                ➤
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nút nổi FAB */}
      <button className="ollama-fab" onClick={() => setIsOpen((prev) => !prev)} title="Mở Trợ Lý AI (Ollama)">
        {isOpen ? '✕' : '🤖'}
      </button>
    </>
  );
}
