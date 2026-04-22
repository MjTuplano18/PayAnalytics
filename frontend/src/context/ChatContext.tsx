"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface ChatContextType {
  isChatOpen: boolean;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const CHAT_OPEN_KEY = "pa_chat_open";

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load chat state from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(CHAT_OPEN_KEY);
    if (stored !== null) {
      setIsChatOpen(stored === "true");
    }
  }, []);

  // Persist chat state to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem(CHAT_OPEN_KEY, String(isChatOpen));
    }
  }, [isChatOpen, mounted]);

  const toggleChat = () => setIsChatOpen((prev) => !prev);
  const openChat = () => setIsChatOpen(true);
  const closeChat = () => setIsChatOpen(false);

  return (
    <ChatContext.Provider value={{ isChatOpen, toggleChat, openChat, closeChat }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}
