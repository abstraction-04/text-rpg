"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

const getBackendUrl = () => {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }
  const hostname = window.location.hostname;
  // If accessing via a tunnel service, do not append port 8000 as it won't connect
  if (
    hostname.includes("ngrok") ||
    hostname.includes("localtunnel") ||
    hostname.includes("trycloudflare") ||
    hostname.includes("cloudflare")
  ) {
    return "";
  }
  return `http://${hostname}:8000`;
};

interface Message {
  text: string;
  sender: string;
  avatar?: string;
  color?: string;
  isSystem?: boolean;
  isAI?: boolean;
  isStreaming?: boolean;
}

interface User {
  sid: string;
  username: string;
  avatar: string;
  color: string;
}

const AVATARS = ["🦊", "🐱", "🐻", "🐼", "🦁", "🐸", "🐙", "🦄", "🦖", "🐝", "🦥", "🦉", "🤖", "🦙"];
const COLORS = [
  { name: "Violet", hex: "#a855f7" },
  { name: "Emerald", hex: "#10b981" },
  { name: "Cyan", hex: "#06b6d4" },
  { name: "Rose", hex: "#f43f5e" },
  { name: "Amber", hex: "#f59e0b" },
  { name: "Indigo", hex: "#6366f1" },
];

export default function ChatPage() {
  // Connection states
  const [isConnected, setIsConnected] = useState(false);
  
  // Registration / Join states
  const [usernameInput, setUsernameInput] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [selectedColor, setSelectedColor] = useState(COLORS[0].hex);
  const [isJoined, setIsJoined] = useState(false);
  const [myUser, setMyUser] = useState<{ username: string; color: string; avatar: string } | null>(null);

  // Chatroom states
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [aiTyping, setAiTyping] = useState(false);
  
  // App Config states
  const [ollamaModel, setOllamaModel] = useState("llama3.2:3b");
  const [aiTrigger, setAiTrigger] = useState<"mention" | "always">("mention");

  // Socket.IO dynamic connection states
  const [socket, setSocket] = useState<Socket | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful AI assistant. Keep responses helpful and concise.");
  const [backendUrl, setBackendUrl] = useState("");
  const [backendUrlInput, setBackendUrlInput] = useState("");

  // Sync backend URL and initialize socket on mount
  useEffect(() => {
    const defaultUrl = getBackendUrl();
    const s = io(defaultUrl, {
      path: "/socket.io/",
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    
    setSocket(s);
    setBackendUrl(defaultUrl);
    setBackendUrlInput(defaultUrl);

    return () => {
      s.disconnect();
    };
  }, []);

  const handleReconnectBackend = (newUrl: string) => {
    if (!newUrl.trim()) return;
    const url = newUrl.trim();
    
    if (socket) {
      socket.disconnect();
    }
    
    const s = io(url, {
      path: "/socket.io/",
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
    });
    
    setSocket(s);
    setBackendUrl(url);
    setBackendUrlInput(url);
  };

  // Local UI states
  const [isLocalTyping, setIsLocalTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiTyping]);

  useEffect(() => {
    if (!socket) return;
    
    // Synchronize initial socket connection state
    setIsConnected(socket.connected);

    const onConnect = () => {
      setIsConnected(true);
      // Rejoin if already joined and disconnected
      if (isJoined && myUser) {
        socket.emit("join", {
          username: myUser.username,
          avatar: myUser.avatar,
          color: myUser.color,
        });
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onJoinSuccess = (data: { username: string; color: string; avatar: string }) => {
      setMyUser(data);
      setIsJoined(true);
    };

    const onUserList = (users: User[]) => {
      setActiveUsers(users);
    };

    const onMessage = (data: Message) => {
      setMessages((prev) => [...prev, data]);
    };

    const onMessageChunk = (data: { text: string }) => {
      setMessages((prev) => {
        const updated = [...prev];
        // Append to the last streaming AI message
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].isAI && updated[i].isStreaming) {
            updated[i] = {
              ...updated[i],
              text: updated[i].text + data.text,
            };
            return updated;
          }
        }
        // Fallback in case chunk arrives before main message
        return [
          ...prev,
          {
            text: data.text,
            sender: `Ollama (${ollamaModel})`,
            avatar: "🦙",
            color: "#10b981",
            isAI: true,
            isStreaming: true,
          },
        ];
      });
    };

    const onMessageChunkEnd = () => {
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].isAI && updated[i].isStreaming) {
            updated[i] = {
              ...updated[i],
              isStreaming: false,
            };
            break;
          }
        }
        return updated;
      });
    };

    const onAiTyping = (data: { status: boolean }) => {
      setAiTyping(data.status);
    };

    const onUserTyping = (data: { username: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        if (data.isTyping) {
          if (prev.includes(data.username)) return prev;
          return [...prev, data.username];
        } else {
          return prev.filter((name) => name !== data.username);
        }
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("join_success", onJoinSuccess);
    socket.on("user_list", onUserList);
    socket.on("message", onMessage);
    socket.on("message_chunk", onMessageChunk);
    socket.on("message_chunk_end", onMessageChunkEnd);
    socket.on("ai_typing", onAiTyping);
    socket.on("user_typing", onUserTyping);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("join_success", onJoinSuccess);
      socket.off("user_list", onUserList);
      socket.off("message", onMessage);
      socket.off("message_chunk", onMessageChunk);
      socket.off("message_chunk_end", onMessageChunkEnd);
      socket.off("ai_typing", onAiTyping);
      socket.off("user_typing", onUserTyping);
    };
  }, [socket, isJoined, myUser, ollamaModel]);

  // Handle typing status notification
  const handleInputChange = (val: string) => {
    setInput(val);

    if (!isLocalTyping && socket) {
      setIsLocalTyping(true);
      socket.emit("typing", { isTyping: true });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsLocalTyping(false);
      if (socket) {
        socket.emit("typing", { isTyping: false });
      }
    }, 2000);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim() || !socket) return;

    socket.emit("join", {
      username: usernameInput.trim(),
      avatar: selectedAvatar,
      color: selectedColor,
    });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;

    if (!socket.connected) {
      alert("Not connected to the chat server. Reconnecting...");
      return;
    }

    // Prepare message payload
    const payload = {
      text: input.trim(),
      model: ollamaModel,
      systemPrompt: systemPrompt,
    };

    // If "always respond" mode is active and message doesn't already trigger AI,
    // append `@ollama` to trigger the backend model.
    const lowerText = input.toLowerCase();
    const hasTrigger = lowerText.startsWith("/ai") || lowerText.startsWith("/ollama") || lowerText.includes("@ollama") || lowerText.includes("@ai");
    
    if (aiTrigger === "always" && !hasTrigger) {
      payload.text = `@ollama ${input.trim()}`;
    }

    socket.emit("message", payload);
    setInput("");

    // Clear typing timeout and emit typing: false
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    setIsLocalTyping(false);
    socket.emit("typing", { isTyping: false });
  };

  // Basic Markdown-like renderer for code and text formatting
  const renderMarkdown = (text: string) => {
    if (!text) return "";
    
    // Split by code blocks
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const code = part.slice(3, -3).trim();
        const firstLineBreak = code.indexOf("\n");
        const language = firstLineBreak !== -1 ? code.substring(0, firstLineBreak) : "";
        const codeContent = firstLineBreak !== -1 ? code.substring(firstLineBreak + 1) : code;
        
        return (
          <pre key={index} className="bg-slate-950 text-slate-200 p-4 rounded-xl my-3 overflow-x-auto border border-slate-800 font-mono text-xs shadow-inner leading-relaxed">
            {language && (
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 border-b border-slate-900 pb-1">
                {language}
              </div>
            )}
            <code>{codeContent}</code>
          </pre>
        );
      }

      // Inline codes, bold styles and newlines
      const inlineParts = part.split(/(\*\*.*?\*\*|`.*?`|\n)/g);
      return (
        <span key={index}>
          {inlineParts.map((subPart, subIndex) => {
            if (subPart.startsWith("**") && subPart.endsWith("**")) {
              return <strong key={subIndex} className="font-extrabold text-slate-50">{subPart.slice(2, -2)}</strong>;
            }
            if (subPart.startsWith("`") && subPart.endsWith("`")) {
              return <code key={subIndex} className="bg-slate-800/80 px-1.5 py-0.5 rounded font-mono text-xs border border-slate-700 text-rose-300">{subPart.slice(1, -1)}</code>;
            }
            if (subPart === "\n") {
              return <br key={subIndex} />;
            }
            return subPart;
          })}
        </span>
      );
    });
  };

  if (!isJoined) {
    return (
      <main className="min-h-screen bg-[#070b13] flex items-center justify-center p-4 relative overflow-hidden">
        {/* Decorative background glows */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />

        <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 shadow-lg shadow-purple-900/40 mb-4 text-3xl">
              🦙
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">OllaChat</h1>
            <p className="text-slate-400 mt-2 text-sm">
              Connect with friends and query local Ollama LLMs in real-time
            </p>
          </div>

          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Choose Username
              </label>
              <input
                type="text"
                maxLength={15}
                required
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="Enter nickname..."
                className="w-full bg-slate-950/80 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white rounded-xl px-4 py-3 outline-none transition-all placeholder:text-slate-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Select Avatar
              </label>
              <div className="grid grid-cols-7 gap-2">
                {AVATARS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    onClick={() => setSelectedAvatar(avatar)}
                    className={`text-2xl p-2 rounded-xl transition-all ${
                      selectedAvatar === avatar
                        ? "bg-purple-600/30 border border-purple-500 scale-110 shadow-md"
                        : "bg-slate-950 hover:bg-slate-800 border border-transparent"
                    }`}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Pick Chat Color
              </label>
              <div className="flex gap-3">
                {COLORS.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => setSelectedColor(color.hex)}
                    style={{ backgroundColor: color.hex }}
                    className={`w-8 h-8 rounded-full transition-all relative ${
                      selectedColor === color.hex
                        ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110 shadow-lg"
                        : "hover:scale-105"
                    }`}
                    title={color.name}
                  >
                    {selectedColor === color.hex && (
                      <span className="absolute inset-0 flex items-center justify-center text-xs text-white">
                        ✓
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Backend Server URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={backendUrlInput}
                  onChange={(e) => setBackendUrlInput(e.target.value)}
                  placeholder="e.g. http://localhost:8000"
                  className="flex-1 bg-slate-950/80 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white rounded-xl px-4 py-2 text-sm outline-none transition-all placeholder:text-slate-700 font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleReconnectBackend(backendUrlInput)}
                  className="px-3 py-2 bg-slate-850 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all border border-slate-700 active:scale-95"
                >
                  Connect
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Currently connected to: <code className="font-mono text-purple-400">{backendUrl}</code>
              </p>
            </div>

            <button
              type="submit"
              disabled={!isConnected}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold rounded-xl shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isConnected ? (
                <>Enter Chatroom</>
              ) : (
                <>
                  <span className="animate-pulse inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-2" />
                  Connecting to Server...
                </>
              )}
            </button>
          </form>

          {/* Connection status footer in join modal */}
          <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-center text-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full mr-2 ${
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-slate-500">
              {isConnected ? "Server connected" : "Server offline (Make sure backend is running)"}
            </span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen bg-[#070b13] text-slate-100 overflow-hidden font-sans">
      {/* 1. Sidebar - Glass Card Panel */}
      <section className="w-80 bg-slate-900/50 backdrop-blur-lg border-r border-slate-800/80 flex flex-col h-full shrink-0">
        {/* Brand */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl bg-purple-600/30 p-2 rounded-xl border border-purple-500/30 shadow-inner">
              🦙
            </span>
            <div>
              <h1 className="font-extrabold text-white tracking-tight leading-none">OllaChat</h1>
              <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider mt-1 inline-block">
                Lobby Active
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-full border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className="text-[10px] text-slate-400 font-medium">
              {isConnected ? "live" : "offline"}
            </span>
          </div>
        </div>

        {/* AI & Ollama Configuration */}
        <div className="p-5 border-b border-slate-800/60 space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Ollama Model
              </label>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                Local
              </span>
            </div>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="e.g. llama3.2:3b"
              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              System Instruction (System Prompt)
            </label>
            <textarea
              rows={3}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="e.g. You are a helpful AI assistant..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              AI Trigger Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAiTrigger("mention")}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all border ${
                  aiTrigger === "mention"
                    ? "bg-purple-600/20 text-purple-300 border-purple-500/50"
                    : "bg-slate-950 text-slate-400 border-transparent hover:bg-slate-800"
                }`}
              >
                Mention (@ai)
              </button>
              <button
                type="button"
                onClick={() => setAiTrigger("always")}
                className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all border ${
                  aiTrigger === "always"
                    ? "bg-purple-600/20 text-purple-300 border-purple-500/50"
                    : "bg-slate-950 text-slate-400 border-transparent hover:bg-slate-800"
                }`}
                title="AI responds to every message sent in the chatroom"
              >
                Auto-Respond
              </button>
            </div>
          </div>
        </div>

        {/* Active Users */}
        <div className="flex-1 p-5 overflow-y-auto min-h-0">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Online Room ({activeUsers.length + 1})</span>
          </h2>
          <div className="space-y-2.5">
            {/* Self User */}
            {myUser && (
              <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-800/40 border border-slate-700/30">
                <span className="text-2xl">{myUser.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span className="truncate">{myUser.username}</span>
                    <span className="text-[9px] bg-purple-500 text-white font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wide">
                      You
                    </span>
                  </div>
                  <span
                    className="text-[10px] block font-semibold"
                    style={{ color: myUser.color }}
                  >
                    Active poster
                  </span>
                </div>
              </div>
            )}

            {/* AI Bot Row */}
            <div className="flex items-center gap-3 p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <span className="text-2xl">🦙</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>Ollama AI</span>
                  <span className="text-[9px] bg-emerald-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wide">
                    Bot
                  </span>
                </div>
                <span className="text-[10px] block text-emerald-400 font-semibold font-mono truncate">
                  {ollamaModel}
                </span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* Other Active Users */}
            {activeUsers
              .filter((u) => u.username !== myUser?.username)
              .map((u) => (
                <div
                  key={u.sid}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/20 transition-all border border-transparent hover:border-slate-800"
                >
                  <span className="text-2xl">{u.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-slate-200 block truncate">
                      {u.username}
                    </span>
                    <span
                      className="text-[10px] block font-semibold"
                      style={{ color: u.color }}
                    >
                      Online
                    </span>
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                </div>
              ))}
          </div>
        </div>

        {/* Sidebar Footer - Network Config */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Backend Server Connection
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={backendUrlInput}
              onChange={(e) => setBackendUrlInput(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-900 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded px-2 py-1 text-[11px] text-slate-300 outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => handleReconnectBackend(backendUrlInput)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold rounded text-white border border-slate-700 active:scale-95"
            >
              Sync
            </button>
          </div>
        </div>
      </section>

      {/* 2. Main Chat Area */}
      <section className="flex-1 flex flex-col h-full bg-[#0a0f1d] relative">
        {/* Chat header */}
        <header className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/30 backdrop-blur-md flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>💬 lobby-lounge</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Query LLM using <code className="text-purple-400 bg-purple-500/10 px-1 py-0.5 rounded font-mono font-bold">@ai</code> or <code className="text-purple-400 bg-purple-500/10 px-1 py-0.5 rounded font-mono font-bold">/ai</code>
            </p>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-3">
              <span className="text-4xl text-slate-600">💬</span>
              <h3 className="text-base font-bold text-slate-300">Welcome to Lobby Lounge</h3>
              <p className="text-xs text-slate-500">
                This room is empty. Send a message to start conversing, or ping Ollama to test out your local intelligence!
              </p>
            </div>
          ) : (
            messages.map((msg, index) => {
              if (msg.isSystem) {
                return (
                  <div key={index} className="flex justify-center my-3">
                    <div className="bg-slate-900/40 border border-slate-800/50 text-slate-400 text-xs px-3.5 py-1.5 rounded-full shadow-inner flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-600" />
                      {msg.text}
                    </div>
                  </div>
                );
              }

              const isMe = msg.sender === myUser?.username;

              if (isMe) {
                return (
                  <div key={index} className="flex justify-end items-end gap-2.5 max-w-[80%] ml-auto">
                    <div className="flex flex-col items-end">
                      <div className="text-[10px] text-slate-500 font-bold mb-1 mr-1 flex items-center gap-1.5">
                        <span>{msg.sender}</span>
                      </div>
                      <div className="bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 text-sm shadow-lg shadow-purple-950/20 leading-relaxed break-words">
                        {msg.text}
                      </div>
                    </div>
                    <span className="text-2xl bg-purple-500/10 border border-purple-500/20 w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                      {msg.avatar || "👤"}
                    </span>
                  </div>
                );
              }

              // Message from others or AI
              return (
                <div key={index} className="flex items-end gap-2.5 max-w-[85%]">
                  <span
                    className="text-2xl w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm"
                    style={{
                      backgroundColor: msg.isAI ? "rgba(16, 185, 129, 0.1)" : "rgba(30, 41, 59, 0.4)",
                      border: `1px solid ${msg.isAI ? "rgba(16, 185, 129, 0.2)" : "rgba(71, 85, 105, 0.2)"}`,
                    }}
                  >
                    {msg.avatar || "👤"}
                  </span>
                  <div>
                    <div className="text-[10px] text-slate-500 font-bold mb-1 ml-1 flex items-center gap-1.5">
                      <span style={{ color: msg.color }}>{msg.sender}</span>
                      {msg.isAI && (
                        <span className="text-[8px] bg-emerald-500 text-slate-950 font-extrabold px-1 rounded-sm uppercase tracking-wide leading-none py-0.5 shadow-sm">
                          AI
                        </span>
                      )}
                    </div>
                    <div
                      className={`rounded-2xl rounded-tl-none px-4 py-2.5 text-sm leading-relaxed break-words shadow-sm ${
                        msg.isAI
                          ? "bg-slate-900 border border-emerald-500/20 text-slate-200"
                          : "bg-slate-900/80 border border-slate-800 text-slate-200"
                      }`}
                    >
                      {msg.isAI ? renderMarkdown(msg.text) : msg.text}
                      {msg.isStreaming && (
                        <span className="inline-block w-1.5 h-3.5 bg-emerald-400 animate-pulse ml-0.5 align-middle" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing Notification and Info */}
        <div className="px-6 py-1 min-h-[22px] flex items-center justify-between text-xs text-slate-500">
          <div>
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" />
                <span className="font-semibold text-slate-400">
                  {typingUsers.join(", ")}
                </span>{" "}
                {typingUsers.length === 1 ? "is" : "are"} typing...
              </div>
            )}
            {aiTyping && !typingUsers.length && (
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold animate-pulse">
                <span className="animate-spin text-[10px]">⚡</span>
                <span>Ollama AI is thinking...</span>
              </div>
            )}
          </div>
          {aiTrigger === "always" && (
            <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-purple-400 rounded-full" />
              Auto-Respond Mode Active
            </div>
          )}
        </div>

        {/* Input Bar Form */}
        <form
          onSubmit={sendMessage}
          className="p-6 border-t border-slate-800/80 bg-slate-900/20 backdrop-blur-md flex gap-3 items-center"
        >
          {/* Quick AI Tag Button */}
          <button
            type="button"
            onClick={() => handleInputChange(input ? `@ai ${input}` : "@ai ")}
            className="px-3.5 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 font-mono text-xs hover:text-emerald-400 hover:border-emerald-500/30 transition-all font-bold cursor-pointer"
            title="Mention AI (@ai)"
          >
            @ai
          </button>

          {/* Main Input */}
          <input
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={
              aiTrigger === "always"
                ? "Type a message (AI will auto-reply)..."
                : "Type message or ask AI using @ai..."
            }
            className="flex-1 bg-slate-950/80 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-slate-200 placeholder:text-slate-600 rounded-xl px-4 py-3 outline-none transition-all text-sm"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5 text-sm"
          >
            <span>Send</span>
            <svg
              className="w-3.5 h-3.5 transform rotate-45"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              ></path>
            </svg>
          </button>
        </form>
      </section>
    </main>
  );
}