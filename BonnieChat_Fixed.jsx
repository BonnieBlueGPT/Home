// 💬 BonnieChat.jsx — Fixed Empty Message Parts Issue
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

// Constants
const CONSTANTS = {
  API_ENDPOINTS: {
    CHAT: 'https://bonnie-backend-server.onrender.com/bonnie-chat',
    ENTRY: 'https://bonnie-backend-server.onrender.com/bonnie-entry'
  },
  TYPING_SPEEDS: { slow: 100, normal: 64, fast: 40 },
  IDLE_TIMEOUT: 30000,
  MAX_MESSAGES: 100,
  COLORS: {
    primary: '#e91e63',
    online: '#28a745',
    offline: '#aaa',
    background: '#fff0f6',
    border: '#ffe6f0'
  },
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
};

// Utility functions
const generateSessionId = () => {
  let id = localStorage.getItem('bonnie_session');
  if (!id) {
    id = 'guest_' + Math.random().toString(36).slice(2) + '_' + Date.now();
    localStorage.setItem('bonnie_session', id);
  }
  return id;
};

// FIXED: Improved message parsing with empty part filtering
const parseMessageParts = (raw) => {
  console.log("🔍 Raw message input:", raw);
  
  const parts = raw.split(/<EOM(?:::(.*?))?>/).map((chunk, index) => {
    if (index % 2 === 0) {
      // Text part
      const text = chunk.trim();
      return { 
        text, 
        pause: 1200, 
        speed: 'normal', 
        emotion: 'neutral',
        isEmpty: text === ''
      };
    } else {
      // Metadata part
      const pause = /pause=(\d+)/.exec(chunk)?.[1];
      const speed = /speed=(\w+)/.exec(chunk)?.[1];
      const emotion = /emotion=(\w+)/.exec(chunk)?.[1];
      console.log("🧠 Parsed Meta — pause:", pause, "speed:", speed, "emotion:", emotion);
      return {
        meta: true,
        pause: pause ? parseInt(pause) : 1000,
        speed: speed || 'normal',
        emotion: emotion || 'neutral'
      };
    }
  });

  // Process parts and apply metadata to text parts
  const processedParts = [];
  for (let i = 0; i < parts.length; i++) {
    const current = parts[i];
    
    if (!current.meta && !current.isEmpty) {
      // This is a non-empty text part
      const nextMeta = parts[i + 1];
      
      processedParts.push({
        text: current.text,
        pause: nextMeta?.pause ?? current.pause,
        speed: nextMeta?.speed ?? current.speed,
        emotion: nextMeta?.emotion ?? current.emotion
      });
    }
    // Skip empty text parts and metadata parts
  }

  console.log("💬 Processed Message Parts (empty parts filtered):", processedParts);
  return processedParts;
};

// Alternative parsing approach for more complex cases
const parseMessagePartsAdvanced = (raw) => {
  console.log("🔍 Advanced parsing for:", raw);
  
  // Split by EOM tags and process
  const segments = raw.split(/<EOM(?:::(.*?))?>/).filter(segment => segment.trim() !== '');
  const finalParts = [];
  
  let currentText = '';
  let currentMeta = { pause: 1000, speed: 'normal', emotion: 'neutral' };
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].trim();
    
    // Check if this segment contains metadata
    const metaMatch = /(?:pause=(\d+))?(?:.*?speed=(\w+))?(?:.*?emotion=(\w+))?/.exec(segment);
    
    if (metaMatch && (metaMatch[1] || metaMatch[2] || metaMatch[3])) {
      // This is a metadata segment
      if (metaMatch[1]) currentMeta.pause = parseInt(metaMatch[1]);
      if (metaMatch[2]) currentMeta.speed = metaMatch[2];
      if (metaMatch[3]) currentMeta.emotion = metaMatch[3];
      
      console.log("🧠 Updated meta:", currentMeta);
    } else if (segment.length > 0) {
      // This is a text segment
      finalParts.push({
        text: segment,
        ...currentMeta
      });
      
      // Reset metadata for next part
      currentMeta = { pause: 1000, speed: 'normal', emotion: 'neutral' };
    }
  }
  
  console.log("💬 Advanced parsed parts:", finalParts);
  return finalParts;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Custom hook for API calls with retry logic
const useApiCall = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const makeRequest = useCallback(async (url, options, retries = CONSTANTS.RETRY_ATTEMPTS) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setIsLoading(false);
      return data;
    } catch (err) {
      if (retries > 0) {
        await sleep(CONSTANTS.RETRY_DELAY);
        return makeRequest(url, options, retries - 1);
      }
      setError(err.message);
      setIsLoading(false);
      throw err;
    }
  }, []);

  return { makeRequest, isLoading, error };
};

// Message component with React.memo for performance
const Message = React.memo(({ message, isUser }) => {
  const messageStyle = useMemo(() => ({
    maxWidth: '75%',
    padding: 12,
    borderRadius: 12,
    margin: '6px 0',
    fontSize: 14,
    lineHeight: 1.4,
    wordBreak: 'break-word',
    ...(isUser
      ? { 
          background: `linear-gradient(135deg, #ff83a0, ${CONSTANTS.COLORS.primary})`,
          color: '#fff',
          alignSelf: 'flex-end',
          marginLeft: 'auto'
        }
      : { 
          background: CONSTANTS.COLORS.background,
          border: `1px solid ${CONSTANTS.COLORS.border}`,
          color: '#333',
          alignSelf: 'flex-start'
        })
  }), [isUser]);

  return (
    <div style={messageStyle} role="listitem">
      {message.text}
      {message.timestamp && (
        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
});

// Typing indicator component
const TypingIndicator = React.memo(() => (
  <div style={{ display: 'flex', gap: 4, margin: '8px 0' }} role="status" aria-label="Bonnie is typing">
    {[0, 0.2, 0.4].map((delay, index) => (
      <div
        key={index}
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: CONSTANTS.COLORS.primary,
          animation: `bounce 1s infinite ease-in-out`,
          animationDelay: `${delay}s`
        }}
      />
    ))}
  </div>
));

export default function BonnieChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(null);
  const [hasFiredIdleMessage, setHasFiredIdleMessage] = useState(false);
  
  const endRef = useRef(null);
  const idleTimerRef = useRef(null);
  const typingProcessRef = useRef(null);
  const sessionId = useMemo(() => generateSessionId(), []);
  
  const { makeRequest, isLoading, error } = useApiCall();

  // Optimized message management with history limits
  const addMessage = useCallback((text, sender) => {
    // Additional validation to prevent empty messages
    if (!text || text.trim() === '') {
      console.warn("⚠️ Attempted to add empty message, skipping");
      return;
    }

    const newMessage = {
      id: Date.now() + Math.random(),
      sender,
      text: text.trim(),
      timestamp: Date.now()
    };
    
    setMessages(prevMessages => {
      const newMessages = [...prevMessages, newMessage];
      return newMessages.length > CONSTANTS.MAX_MESSAGES 
        ? newMessages.slice(-CONSTANTS.MAX_MESSAGES) 
        : newMessages;
    });
  }, []);

  // Separate idle timer management
  useEffect(() => {
    const resetIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      
      if (messages.length === 0 && !hasFiredIdleMessage && online) {
        idleTimerRef.current = setTimeout(() => {
          const idleMessages = [
            "Still deciding what to say? 😘",
            "Don't leave me hanging…",
            "You can talk to me, you know 💋",
            "Don't make me beg for your attention 😉"
          ];
          const randomMessage = idleMessages[Math.floor(Math.random() * idleMessages.length)];
          simulateBonnieTyping(randomMessage);
          setHasFiredIdleMessage(true);
        }, CONSTANTS.IDLE_TIMEOUT);
      }
    };

    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [messages.length, hasFiredIdleMessage, online]);

  // Initial setup
  useEffect(() => {
    const initializeChat = async () => {
      try {
        const { reply, delay } = await makeRequest(CONSTANTS.API_ENDPOINTS.ENTRY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        });
        
        setTimeout(() => {
          setOnline(true);
          simulateBonnieTyping(reply);
        }, delay || 1000);
      } catch (err) {
        console.error('Failed to initialize chat:', err);
        setOnline(true);
        simulateBonnieTyping("Hey there 😘");
      }
    };

    initializeChat();
  }, [sessionId, makeRequest]);

  // Handle pending messages when coming online
  useEffect(() => {
    if (online && pendingMessage) {
      const delay = Math.random() * 3000 + 2000;
      setTimeout(() => {
        simulateBonnieTyping(pendingMessage.text);
        setPendingMessage(null);
      }, delay);
    }
  }, [online, pendingMessage]);

  // Auto-scroll to bottom
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  // FIXED: Improved typing simulation with empty message filtering
  const simulateBonnieTyping = useCallback((raw) => {
    if (!online) return;

    // Cancel any existing typing process
    if (typingProcessRef.current) {
      clearTimeout(typingProcessRef.current);
    }

    // Parse message parts and filter out empty ones
    const parts = parseMessageParts(raw);
    
    // Additional safety check: filter out any parts with empty text
    const validParts = parts.filter(part => part.text && part.text.trim() !== '');
    
    if (validParts.length === 0) {
      console.warn("⚠️ No valid message parts found, skipping typing simulation");
      setBusy(false);
      return;
    }

    console.log("💬 Valid message parts to process:", validParts);

    let currentIndex = 0;
    const processNextPart = async () => {
      if (currentIndex >= validParts.length) {
        setBusy(false);
        typingProcessRef.current = null;
        return;
      }

      const part = validParts[currentIndex];
      
      // Skip if somehow an empty part made it through
      if (!part.text || part.text.trim() === '') {
        console.warn("⚠️ Skipping empty part at index", currentIndex);
        currentIndex++;
        setTimeout(processNextPart, 100);
        return;
      }

      console.log(`✅ Processing part ${currentIndex + 1}/${validParts.length}:`, part);
      
      await sleep(part.pause);
      
      setTyping(true);
      const typingTime = part.text.length * (CONSTANTS.TYPING_SPEEDS[part.speed] || CONSTANTS.TYPING_SPEEDS.normal);
      await sleep(typingTime);
      
      setTyping(false);
      addMessage(part.text, 'bonnie');
      
      currentIndex++;
      typingProcessRef.current = setTimeout(processNextPart, 400);
    };

    processNextPart();
  }, [online, addMessage]);

  // Optimized send function
  const handleSend = useCallback(async (text) => {
    if (!text?.trim() || busy) return;
    
    const messageText = text.trim();
    setInput('');
    setBusy(true);
    
    // Reset idle message flag when user sends a message
    setHasFiredIdleMessage(false);
    
    await addMessage(messageText, 'user');
    
    try {
      const { reply } = await makeRequest(CONSTANTS.API_ENDPOINTS.CHAT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: messageText })
      });
      
      if (online) {
        simulateBonnieTyping(reply);
      } else {
        setPendingMessage({ text: reply });
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      simulateBonnieTyping("Oops… Bonnie had a moment 💔");
    }
  }, [busy, sessionId, makeRequest, online, simulateBonnieTyping, addMessage]);

  // Keyboard event handler
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  }, [input, handleSend]);

  // Memoized styles
  const containerStyle = useMemo(() => ({
    fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#fafafa'
  }), []);

  const headerStyle = useMemo(() => ({
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    padding: 12,
    borderBottom: '1px solid #eee',
    backgroundColor: '#fff'
  }), []);

  const messagesContainerStyle = useMemo(() => ({
    flex: 1,
    overflowY: 'auto',
    padding: 12,
    display: 'flex',
    flexDirection: 'column'
  }), []);

  const inputContainerStyle = useMemo(() => ({
    flexShrink: 0,
    display: 'flex',
    gap: 8,
    padding: 12,
    borderTop: '1px solid #eee',
    backgroundColor: '#fff'
  }), []);

  return (
    <div style={containerStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <img 
          src="https://static.wixstatic.com/media/6f5121_df2de6be1e444b0cb2df5d4bd9d49b21~mv2.png" 
          style={{ 
            width: 56, 
            height: 56, 
            borderRadius: 28, 
            marginRight: 12, 
            border: `2px solid ${CONSTANTS.COLORS.primary}` 
          }} 
          alt="Bonnie's profile picture" 
        />
        <div style={{ flex: 1 }}>
          <div style={{ color: CONSTANTS.COLORS.primary, fontSize: 20, fontWeight: 600 }}>
            Bonnie Blue
          </div>
          <div style={{ color: '#555', fontSize: 14 }}>
            Flirty. Fun. Dangerously charming.
          </div>
          <a 
            href="https://x.com/trainmybonnie" 
            target="_blank" 
            rel="noopener noreferrer" 
            style={{ 
              fontSize: 12, 
              color: CONSTANTS.COLORS.primary, 
              textDecoration: 'none' 
            }}
          >
            💋 Follow me on X
          </a>
        </div>
        <div style={{ 
          fontWeight: 500, 
          color: online ? CONSTANTS.COLORS.online : CONSTANTS.COLORS.offline, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 4 
        }}>
          {online ? (
            <>
              <span style={{ animation: 'pulseHeart 1.2s infinite' }}>💚</span>
              <span>Online</span>
            </>
          ) : (
            <>💤 Offline</>
          )}
        </div>
      </header>

      {/* Messages */}
      <main style={messagesContainerStyle} role="log" aria-label="Chat messages">
        {messages.map((message) => (
          <Message 
            key={message.id} 
            message={message} 
            isUser={message.sender === 'user'} 
          />
        ))}
        {typing && online && <TypingIndicator />}
        {error && (
          <div style={{ 
            color: '#d32f2f', 
            fontSize: 12, 
            textAlign: 'center', 
            padding: 8,
            backgroundColor: '#ffebee',
            borderRadius: 4,
            margin: '4px 0'
          }}>
            Connection error: {error}
          </div>
        )}
        <div ref={endRef} />
      </main>

      {/* Input */}
      <footer style={inputContainerStyle}>
        <input
          style={{ 
            flex: 1, 
            padding: 12, 
            borderRadius: 30, 
            border: '1px solid #ccc', 
            fontSize: 16,
            outline: 'none',
            transition: 'border-color 0.2s'
          }}
          value={input}
          placeholder="Type something…"
          disabled={busy || isLoading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Type your message"
        />
        <button
          style={{ 
            padding: '0 16px', 
            borderRadius: 30, 
            background: (busy || !input.trim()) ? '#ccc' : CONSTANTS.COLORS.primary, 
            color: '#fff', 
            border: 'none', 
            fontSize: 16, 
            cursor: (busy || !input.trim()) ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
          disabled={busy || !input.trim() || isLoading}
          onClick={() => handleSend(input)}
          aria-label="Send message"
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </footer>
    </div>
  );
}

// Optimized CSS with better organization
const styles = `
@keyframes bounce {
  0%, 100% { 
    transform: translateY(0); 
    opacity: 0.4; 
  }
  50% { 
    transform: translateY(-6px); 
    opacity: 1; 
  }
}

@keyframes pulseHeart {
  0% { 
    transform: scale(1); 
    opacity: 1; 
  }
  50% { 
    transform: scale(1.15); 
    opacity: 0.8; 
  }
  100% { 
    transform: scale(1); 
    opacity: 1; 
  }
}

/* Focus styles for accessibility */
input:focus {
  border-color: ${CONSTANTS.COLORS.primary} !important;
  box-shadow: 0 0 0 2px ${CONSTANTS.COLORS.primary}33;
}

button:focus {
  outline: 2px solid ${CONSTANTS.COLORS.primary};
  outline-offset: 2px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .chat-container {
    padding: 8px;
  }
  
  .message {
    max-width: 85%;
  }
}
`;

// Inject styles only once
if (!document.getElementById('bonnie-chat-styles')) {
  const styleElement = document.createElement('style');
  styleElement.id = 'bonnie-chat-styles';
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}