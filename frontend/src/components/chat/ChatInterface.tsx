"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import {
  sendChatQuery,
  listConversations,
  getConversationHistory,
  deleteConversation as apiDeleteConversation,
  type Conversation,
  type Message,
  type ChatQueryRequest,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Trash2,
  Plus,
  ChevronLeft,
  ChevronRight,
  StopCircle,
} from "lucide-react";
import { MessageList } from "./MessageList";
import { QuickActions } from "./QuickActions";
import { ErrorDisplay } from "./ErrorDisplay";
import { parseError, type ErrorType } from "@/lib/chatErrorHandler";

interface ChatInterfaceProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  errorType: 'general' | 'rate_limit' | 'auth' | 'timeout' | 'clarification' | null;
  retryAfter: number | null; // seconds until retry allowed
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
}

export function ChatInterface({ isOpen, onToggle }: ChatInterfaceProps) {
  const { token, user, logout } = useAuth();
  const [state, setState] = useState<ChatState>({
    conversations: [],
    activeConversationId: null,
    messages: [],
    isLoading: false,
    error: null,
    errorType: null,
    retryAfter: null,
    isStreaming: false,
    streamingMessageId: null,
    streamingContent: "",
  });
  const [query, setQuery] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Utility function to handle errors with proper categorization
  const handleError = useCallback((error: unknown, response?: Response) => {
    console.error("Chat error:", error);

    const parsed = parseError(error, response);

    // Handle 401 - Authentication failure - redirect to login
    if (parsed.type === "auth") {
      setState((prev) => ({
        ...prev,
        error: parsed.message,
        errorType: parsed.type,
        retryAfter: parsed.retryAfter || null,
        isLoading: false,
        isStreaming: false,
      }));
      // Redirect to login after a brief delay
      setTimeout(() => {
        logout();
      }, 1500);
      return;
    }

    // Set error state for all other error types
    setState((prev) => ({
      ...prev,
      error: parsed.message,
      errorType: parsed.type,
      retryAfter: parsed.retryAfter || null,
      isLoading: false,
      isStreaming: false,
    }));
  }, [logout]);

  // Handle copy message callback
  const handleCopyMessage = useCallback((content: string) => {
    // Optional: Show a toast notification
    console.log("Message copied to clipboard");
  }, []);

  // Load conversations on mount
  useEffect(() => {
    if (isOpen && token) {
      loadConversations();
    }
  }, [isOpen, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        if (typeof eventSourceRef.current.close === 'function') {
          eventSourceRef.current.close();
        }
        eventSourceRef.current = null;
      }
    };
  }, []);

  const loadConversations = useCallback(async () => {
    if (!token) return;

    try {
      const response = await listConversations(token);
      setState((prev) => ({
        ...prev,
        conversations: response.conversations,
      }));
    } catch (error) {
      handleError(error);
    }
  }, [token, handleError]);

  const loadConversationHistory = useCallback(
    async (conversationId: string) => {
      if (!token) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null, errorType: null, retryAfter: null }));

      try {
        const response = await getConversationHistory(token, conversationId);
        setState((prev) => ({
          ...prev,
          messages: response.messages,
          activeConversationId: conversationId,
          isLoading: false,
        }));
      } catch (error) {
        handleError(error);
      }
    },
    [token, handleError]
  );

  const switchConversation = useCallback(
    async (conversationId: string) => {
      if (conversationId === state.activeConversationId) return;
      await loadConversationHistory(conversationId);
    },
    [state.activeConversationId, loadConversationHistory]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!token) return;

      try {
        await apiDeleteConversation(token, conversationId);
        
        // Remove from local state
        setState((prev) => ({
          ...prev,
          conversations: prev.conversations.filter((c) => c.id !== conversationId),
          // Clear messages if this was the active conversation
          messages: prev.activeConversationId === conversationId ? [] : prev.messages,
          activeConversationId: prev.activeConversationId === conversationId ? null : prev.activeConversationId,
        }));
      } catch (error) {
        handleError(error);
      }
    },
    [token, handleError]
  );

  const startNewConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeConversationId: null,
      messages: [],
      error: null,
      errorType: null,
      retryAfter: null,
    }));
    setQuery("");
  }, []);

  const stopGeneration = useCallback(() => {
    if (eventSourceRef.current) {
      // Close the stream (works for both EventSource and our custom abort controller)
      if (typeof eventSourceRef.current.close === 'function') {
        eventSourceRef.current.close();
      }
      eventSourceRef.current = null;
      
      // Display partial content if any was received
      setState((prev) => {
        if (prev.streamingContent) {
          const assistantMessage: Message = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: prev.streamingContent,
            created_at: new Date().toISOString(),
            metadata: {
              partial: true,
            },
          };

          return {
            ...prev,
            messages: [...prev.messages, assistantMessage],
            isStreaming: false,
            isLoading: false,
            streamingMessageId: null,
            streamingContent: "",
            error: "Generation stopped by user. Partial response displayed.",
            errorType: "general",
          };
        }

        return {
          ...prev,
          isStreaming: false,
          isLoading: false,
          streamingMessageId: null,
          streamingContent: "",
        };
      });
    }
  }, []);

  const sendStreamingQuery = useCallback(async (userQuery: string) => {
    if (!token) return;

    // Add user message to UI immediately
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: userQuery,
      created_at: new Date().toISOString(),
    };

    // Create a temporary streaming message ID
    const streamingMsgId = `streaming-${Date.now()}`;

    // Capture the current conversation ID at the time of sending
    // (state.activeConversationId may be stale inside the async closure)
    const currentConversationId = state.activeConversationId;

    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isStreaming: true,
      isLoading: true,
      error: null,
      errorType: null,
      retryAfter: null,
      streamingMessageId: streamingMsgId,
      streamingContent: "",
    }));

    try {
      // Build the streaming URL with query parameters
      const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");
      const params = new URLSearchParams({
        query: userQuery,
      });
      
      if (currentConversationId) {
        params.set("conversation_id", currentConversationId);
      }

      const streamUrl = `${API_BASE}/api/v1/chat/stream?${params.toString()}`;

      // Use fetch with ReadableStream for better control and header support
      const response = await fetch(streamUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "text/event-stream",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to start streaming" }));
        handleError(new Error(errorData.detail || `Request failed (${response.status})`), response);
        return;
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let resolvedConversationId = currentConversationId;
      let buffer = "";

      // Store reader in ref for cancellation
      const abortController = new AbortController();
      eventSourceRef.current = { close: () => abortController.abort() } as any;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          // Decode the chunk
          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE messages (separated by \n\n)
          const messages = buffer.split("\n\n");
          buffer = messages.pop() || ""; // Keep incomplete message in buffer

          for (const message of messages) {
            if (!message.trim()) continue;

            // Parse SSE message (format: "data: <json>")
            const dataMatch = message.match(/^data: (.+)$/m);
            if (!dataMatch) continue;

            try {
              const data = JSON.parse(dataMatch[1]);

              // Extract conversation_id as soon as it arrives and persist it
              if (data.conversation_id) {
                resolvedConversationId = data.conversation_id;
                // Persist immediately so the next message reuses this conversation
                setState((prev) => ({
                  ...prev,
                  activeConversationId: data.conversation_id,
                }));
              }

              if (data.error) {
                // Error occurred during streaming
                handleError(new Error(data.message || "An error occurred during streaming"));
                return;
              }

              if (data.done) {
                // Streaming completed — finalize the message
                const assistantMessage: Message = {
                  id: `msg-${Date.now()}`,
                  role: "assistant",
                  content: accumulatedContent,
                  created_at: new Date().toISOString(),
                };

                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, assistantMessage],
                  activeConversationId: resolvedConversationId || prev.activeConversationId,
                  isStreaming: false,
                  isLoading: false,
                  streamingMessageId: null,
                  streamingContent: "",
                }));

                // Reload conversations to update the sidebar list
                loadConversations();
                return;
              }

              if (data.chunk) {
                // Append chunk to accumulated content
                accumulatedContent += data.chunk;

                // Update streaming content in state
                setState((prev) => ({
                  ...prev,
                  streamingContent: accumulatedContent,
                  isLoading: false, // Show content, not loading spinner
                }));
              }
            } catch (parseError) {
              console.error("Failed to parse SSE data:", parseError);
            }
          }
        }
      } finally {
        reader.releaseLock();
        eventSourceRef.current = null;
      }
    } catch (error) {
      // Check if there's partial content to display
      if (state.streamingContent) {
        const assistantMessage: Message = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: state.streamingContent,
          created_at: new Date().toISOString(),
          metadata: {
            partial: true,
          },
        };

        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage],
          error: "Streaming was interrupted. Partial response displayed.",
          errorType: "general",
          isStreaming: false,
          isLoading: false,
          streamingMessageId: null,
          streamingContent: "",
        }));
      } else {
        handleError(error);
      }
    }
  }, [token, state.activeConversationId, loadConversations, handleError]);

  const sendQuery = useCallback(async () => {
    if (!token || !query.trim()) return;

    const userQuery = query.trim();
    setQuery("");

    // Use streaming for better user experience
    await sendStreamingQuery(userQuery);
  }, [token, query, sendStreamingQuery]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendQuery();
      }
    },
    [sendQuery]
  );

  const handleQuickAction = useCallback(
    (query: string) => {
      setQuery(query);
      // Auto-submit the query with streaming
      setTimeout(() => {
        if (token && query.trim()) {
          sendStreamingQuery(query.trim());
        }
      }, 0);
    },
    [token, sendStreamingQuery]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex animate-m3-spring">
      {/* Sidebar with conversations */}
      <div
        className={cn(
          "flex flex-col border-l border-border bg-card/95 backdrop-blur-xl transition-all duration-300 ease-in-out",
          isSidebarCollapsed ? "w-0 overflow-hidden" : "w-64"
        )}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-sm font-semibold">Conversations</h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsSidebarCollapsed(true)}
            title="Collapse sidebar"
            className="transition-transform hover:scale-110"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <Button
            variant="outline"
            size="sm"
            className="mb-2 w-full justify-start transition-all hover:bg-primary/10 hover:border-primary/50"
            onClick={startNewConversation}
          >
            <Plus className="size-4 mr-2" />
            New Chat
          </Button>

          {state.conversations.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            <div className="space-y-1">
              {state.conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg p-2 transition-all duration-200",
                    "hover:bg-accent/50 hover:scale-[1.02]",
                    state.activeConversationId === conversation.id && "bg-accent shadow-sm"
                  )}
                >
                  <button
                    className="flex-1 truncate text-left text-sm"
                    onClick={() => switchConversation(conversation.id)}
                  >
                    {conversation.title || "New conversation"}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                    onClick={() => deleteConversation(conversation.id)}
                    title="Delete conversation"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex w-full sm:w-[600px] flex-col border-l border-border bg-card/95 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2 sm:gap-3">
            {isSidebarCollapsed && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsSidebarCollapsed(false)}
                title="Show conversations"
                className="transition-transform hover:scale-110"
              >
                <ChevronLeft className="size-4" />
              </Button>
            )}
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 transition-transform hover:scale-110">
              <MessageSquare className="size-5 text-primary" />
            </div>
            <div className="hidden sm:block">
              <h2 className="text-lg font-semibold">AI Assistant</h2>
              <p className="text-xs text-muted-foreground">Ask about your payment data</p>
            </div>
            <div className="sm:hidden">
              <h2 className="text-base font-semibold">AI Assistant</h2>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon-sm" 
            onClick={onToggle}
            className="hover:bg-destructive/10 hover:text-destructive transition-all hover:scale-110"
          >
            <X className="size-5" />
          </Button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {state.messages.length === 0 && !state.isStreaming ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center animate-fade-in px-4">
                <div className="mx-auto mb-4 flex size-16 sm:size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 animate-m3-spring">
                  <MessageSquare className="size-8 sm:size-10 text-primary" />
                </div>
                <h3 className="mb-2 text-base sm:text-lg font-semibold">
                  Welcome to AI Assistant
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto">
                  Ask questions about your payment analytics data in natural language
                </p>
              </div>
            </div>
          ) : (
            <MessageList
              messages={state.messages}
              isLoading={state.isLoading}
              isStreaming={state.isStreaming}
              streamingContent={state.streamingContent}
              onCopyMessage={handleCopyMessage}
            />
          )}
        </div>

        {/* Error display */}
        {state.error && (
          <div className="animate-fade-in">
            <ErrorDisplay
              error={state.error}
              errorType={state.errorType}
              retryAfter={state.retryAfter}
              onDismiss={() => setState((prev) => ({ 
                ...prev, 
                error: null, 
                errorType: null, 
                retryAfter: null 
              }))}
            />
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-border p-3 sm:p-4 bg-muted/30">
          {/* Quick Actions */}
          <div className="mb-3">
            <QuickActions
              onSelect={handleQuickAction}
              disabled={state.isLoading || state.isStreaming}
            />
          </div>

          {/* Input field */}
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about your payment data..."
              disabled={state.isLoading || state.isStreaming}
              className="flex-1 bg-background transition-all focus:ring-2 focus:ring-primary/50"
            />
            {state.isStreaming ? (
              <Button
                onClick={stopGeneration}
                variant="destructive"
                size="icon"
                title="Stop generation"
                className="shrink-0 transition-transform hover:scale-110"
              >
                <StopCircle className="size-4" />
              </Button>
            ) : (
              <Button
                onClick={sendQuery}
                disabled={!query.trim() || state.isLoading}
                size="icon"
                className="shrink-0 bg-primary hover:bg-primary/90 transition-all hover:scale-110 disabled:hover:scale-100"
              >
                {state.isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
