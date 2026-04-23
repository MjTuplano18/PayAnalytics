"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Message } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { format } from "date-fns";
import { ChartRenderer } from "./ChartRenderer";

/** Three-dot typing animation — each dot bounces in sequence */
function TypingDots() {
  return (
    <>
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        .typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
          display: inline-block;
          animation: typingBounce 1.2s ease-in-out infinite;
        }
        .typing-dot:nth-child(1) { animation-delay: 0s; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>
      <div className="flex items-center gap-1.5">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </>
  );
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isStreaming?: boolean;
  streamingContent?: string;
  onCopyMessage?: (content: string) => void;
}

export function MessageList({
  messages,
  isLoading,
  isStreaming = false,
  streamingContent = "",
  onCopyMessage,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, streamingContent]);

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          onCopy={onCopyMessage}
        />
      ))}

      {/* Streaming: show content as it arrives with dots below */}
      {isStreaming && streamingContent && (
        <div className="flex justify-start">
          <div className="group relative max-w-[80%] rounded-2xl bg-accent px-4 py-3 text-accent-foreground">
            <div className="space-y-2">
              <MarkdownContent content={streamingContent} />
            </div>
            <div className="mt-2">
              <TypingDots />
            </div>
          </div>
        </div>
      )}

      {/* Loading: show dots bubble before first chunk arrives */}
      {(isLoading || (isStreaming && !streamingContent)) && (
        <div className="flex justify-start">
          <div className="rounded-2xl bg-accent px-5 py-4 text-accent-foreground">
            <TypingDots />
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  onCopy?: (content: string) => void;
}

function MessageItem({ message, onCopy }: MessageItemProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      onCopy?.(message.content);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return format(new Date(timestamp), "MMM d, h:mm a");
    } catch {
      return "";
    }
  };

  return (
    <div
      className={cn(
        "flex",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "group relative max-w-[80%] rounded-2xl px-4 py-3",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "bg-accent text-accent-foreground"
        )}
      >
        {/* Message content */}
        <div className="space-y-2">
          {message.role === "assistant" ? (
            <MarkdownContent content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
          )}

          {/* Chart visualization for AI responses with chart metadata */}
          {message.role === "assistant" && message.metadata?.chart_metadata && (
            <ChartRenderer chartData={message.metadata.chart_metadata} />
          )}
        </div>

        {/* Timestamp */}
        <div
          className={cn(
            "mt-2 text-xs opacity-60",
            message.role === "user" ? "text-right" : "text-left"
          )}
        >
          {formatTimestamp(message.created_at)}
          {message.metadata?.cached && (
            <span className="ml-2">(cached)</span>
          )}
        </div>

        {/* Copy button for AI responses */}
        {message.role === "assistant" && (
          <Button
            variant="ghost"
            size="icon-xs"
            className={cn(
              "absolute -right-2 -top-2 opacity-0 transition-opacity group-hover:opacity-100",
              "size-6 rounded-full bg-background shadow-md hover:bg-accent"
            )}
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="size-3 text-green-600" />
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

interface MarkdownContentProps {
  content: string;
}

/**
 * Component for rendering markdown content in AI responses using react-markdown.
 */
function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      className="prose prose-sm max-w-none dark:prose-invert"
      components={{
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-2 text-sm leading-relaxed last:mb-0">{children}</p>
        ),
        // Headings
        h1: ({ children }) => (
          <h1 className="mb-2 text-lg font-bold">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 text-base font-bold">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 text-sm font-bold">{children}</h3>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc space-y-1 text-sm">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal space-y-1 text-sm">{children}</ol>
        ),
        li: ({ children }) => <li className="text-sm">{children}</li>,
        // Inline code
        code: ({ className, children, ...props }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            // Block code is handled by pre > code
            return <code className={className} {...props}>{children}</code>;
          }
          return (
            <code
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
              {...props}
            >
              {children}
            </code>
          );
        },
        // Code blocks
        pre: ({ children }) => {
          // Extract language and code from children
          const codeElement = React.Children.toArray(children)[0];
          if (React.isValidElement(codeElement) && codeElement.type === "code") {
            const className = codeElement.props.className || "";
            const match = /language-(\w+)/.exec(className);
            const language = match ? match[1] : "text";
            const code = String(codeElement.props.children).replace(/\n$/, "");
            return <CodeBlock language={language} code={code} />;
          }
          return <pre className="overflow-x-auto rounded-lg bg-muted p-4">{children}</pre>;
        },
        // Strong (bold)
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        // Emphasis (italic)
        em: ({ children }) => <em className="italic">{children}</em>,
        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            {children}
          </a>
        ),
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-muted-foreground/20 pl-4 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

interface CodeBlockProps {
  language: string;
  code: string;
}

/**
 * Component for rendering code blocks with syntax highlighting.
 * 
 * TODO: Once react-syntax-highlighter is installed (Task 14.2),
 * this will provide proper syntax highlighting.
 */
function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy code:", error);
    }
  };

  return (
    <div className="group relative my-2 rounded-lg bg-muted">
      {/* Language label and copy button */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {language}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-6 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <Check className="size-3 text-green-600" />
          ) : (
            <Copy className="size-3" />
          )}
        </Button>
      </div>

      {/* Code content */}
      <pre className="overflow-x-auto p-4">
        <code className="font-mono text-xs">{code}</code>
      </pre>
    </div>
  );
}
