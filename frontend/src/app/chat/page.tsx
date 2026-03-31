"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Sparkles,
  FileText,
  ExternalLink,
  ChevronDown,
  AlertCircle,
  Scale,
  Bot,
  User,
  Copy,
  Check,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchCases, askQuestionStream } from "@/lib/api";
import type { Citation, Case } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass-card overflow-hidden cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <div
          className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{
            background: "rgba(0,255,136,0.1)",
            color: "var(--color-glow-primary)",
            border: "1px solid rgba(0,255,136,0.15)",
          }}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] truncate" style={{ color: "var(--color-text-secondary)" }}>
            {citation.source === "graph" ? "Graph Source" : "Narrative Source"}
            {citation.page && ` · Page ${citation.page}`}
          </p>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }}>
          <ChevronDown size={12} style={{ color: "var(--color-text-muted)" }} />
        </motion.div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-3 pb-2.5 text-[11px] leading-relaxed max-h-32 overflow-y-auto"
              style={{
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-mono)",
                borderTop: "1px solid rgba(255,255,255,0.04)",
                paddingTop: "8px",
              }}
            >
              {citation.text && citation.text.length > 300
                ? citation.text.slice(0, 300) + "..."
                : citation.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded cursor-pointer transition-colors"
      style={{ color: "var(--color-text-muted)" }}
      title="Copy response"
    >
      {copied ? <Check size={13} style={{ color: "var(--color-glow-primary)" }} /> : <Copy size={13} />}
    </button>
  );
}

function ChatMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {/* AI Avatar */}
      {!isUser && (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1"
          style={{
            background: "linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,204,106,0.08))",
            border: "1px solid rgba(0,255,136,0.15)",
          }}
        >
          <Scale size={14} style={{ color: "var(--color-glow-primary)" }} />
        </div>
      )}

      <div className={`max-w-[75%] ${isUser ? "max-w-[65%]" : ""}`}>
        <div className={isUser ? "chat-bubble-user" : "chat-bubble-ai"}>
          <div className="px-4 py-3">
            {isUser ? (
              <p className="text-sm" style={{ color: "var(--color-text-primary)" }}>
                {message.content}
              </p>
            ) : (
              <div className="chat-markdown text-sm" style={{ color: "var(--color-text-primary)" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="inline-block w-2 h-4 ml-0.5 animate-pulse-glow" style={{
                    background: "var(--color-glow-primary)",
                    borderRadius: "1px",
                  }} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions for AI messages */}
        {!isUser && !message.isStreaming && message.content && (
          <div className="flex items-center gap-1 mt-1 ml-1">
            <CopyButton text={message.content} />
          </div>
        )}

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] font-medium ml-1" style={{ color: "var(--color-text-muted)" }}>
              {message.citations.length} source{message.citations.length !== 1 ? "s" : ""}
            </p>
            {message.citations.map((c, i) => (
              <CitationCard key={c.chunk_id} citation={c} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* User Avatar */}
      {isUser && (
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-1"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <User size={14} style={{ color: "var(--color-text-secondary)" }} />
        </div>
      )}
    </motion.div>
  );
}

function ChatContent() {
  const searchParams = useSearchParams();
  const preselectedCase = searchParams.get("case");

  const [selectedCaseId, setSelectedCaseId] = useState<string>(preselectedCase || "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ["cases"],
    queryFn: fetchCases,
  });

  useEffect(() => {
    if (preselectedCase) setSelectedCaseId(preselectedCase);
  }, [preselectedCase]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedCaseId || isStreaming) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: Message = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setIsStreaming(true);

    try {
      await askQuestionStream(
        selectedCaseId,
        input.trim(),
        (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, content: m.content + delta } : m
            )
          );
        },
        (citations) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId ? { ...m, citations, isStreaming: false } : m
            )
          );
        },
        (error) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? { ...m, content: `Error: ${error}`, isStreaming: false }
                : m
            )
          );
        }
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId
            ? {
                ...m,
                content: "Failed to connect to the backend. Please make sure the server is running.",
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId ? { ...m, isStreaming: false } : m
        )
      );
    }
  }, [input, selectedCaseId, isStreaming]);

  const selectedCase = cases?.find((c) => c.id === selectedCaseId);

  return (
    <div className="flex flex-col h-screen">
      {/* Chat Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-6 py-4 flex items-center justify-between shrink-0"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(5,5,5,0.6)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,204,106,0.08))",
              border: "1px solid rgba(0,255,136,0.12)",
            }}
          >
            <Sparkles size={14} style={{ color: "var(--color-glow-primary)" }} />
          </div>
          <div>
            <h2
              className="text-sm font-semibold"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--color-text-primary)",
              }}
            >
              GraphRAG Assistant
            </h2>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
              Knowledge Graph-augmented legal analysis
            </p>
          </div>
        </div>

        {/* Case Selector */}
        <div className="relative">
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="glass-input text-xs pl-3 pr-8 py-2 appearance-none cursor-pointer"
            style={{ minWidth: "180px" }}
          >
            <option value="">Select a case...</option>
            {cases?.map((c) => (
              <option
                key={c.id}
                value={c.id}
                style={{
                  background: "var(--color-matrix-surface)",
                  color: "var(--color-text-primary)",
                }}
              >
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--color-text-muted)" }}
          />
        </div>
      </motion.div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Empty State */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
              style={{
                background: "linear-gradient(135deg, rgba(0,255,136,0.08), rgba(0,204,106,0.03))",
                border: "1px solid rgba(0,255,136,0.08)",
              }}
            >
              <Scale size={32} style={{ color: "var(--color-glow-dim)" }} />
            </div>
            <h3
              className="text-lg font-semibold mb-2"
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--color-text-primary)",
              }}
            >
              Ask anything about your case
            </h3>
            <p
              className="text-sm max-w-md mb-8"
              style={{ color: "var(--color-text-muted)" }}
            >
              The GraphRAG engine will search the Knowledge Graph and source documents to provide cited, accurate answers.
            </p>

            {/* Suggested Prompts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg w-full">
              {[
                "What are the key terms of the merger agreement?",
                "Who are the parties involved in this deal?",
                "What conditions must be met before closing?",
                "What are the termination provisions?",
              ].map((prompt, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setInput(prompt)}
                  className="glass-card p-3 text-left text-xs cursor-pointer"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {prompt}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Message Bubbles */}
        {messages.map((msg) => (
          <ChatMessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-6 py-4 shrink-0"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(5,5,5,0.6)",
          backdropFilter: "blur(12px)",
        }}
      >
        {!selectedCaseId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs"
            style={{
              background: "rgba(255,170,0,0.06)",
              border: "1px solid rgba(255,170,0,0.12)",
              color: "var(--color-status-warning)",
            }}
          >
            <AlertCircle size={13} />
            Please select a case before asking questions
          </motion.div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                selectedCaseId
                  ? "Ask a question about this case..."
                  : "Select a case first..."
              }
              disabled={!selectedCaseId || isStreaming}
              rows={1}
              className="glass-input w-full px-4 py-3 text-sm resize-none disabled:opacity-40"
              style={{ maxHeight: "120px" }}
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={!input.trim() || !selectedCaseId || isStreaming}
            className="glow-button-solid !p-3 !rounded-xl disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            {isStreaming ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </motion.button>
        </div>

        {selectedCase && (
          <p className="text-[10px] mt-2 ml-1" style={{ color: "var(--color-text-muted)" }}>
            Querying: {selectedCase.name} · {selectedCase.documents?.length || 0} docs ·{" "}
            Press Enter to send, Shift+Enter for new line
          </p>
        )}
      </motion.div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--color-glow-primary)" }} />
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
