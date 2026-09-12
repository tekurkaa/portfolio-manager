import { useEffect, useState, useRef } from "react";
import { api, timeAgo } from "@/lib/api";
import { toast } from "sonner";
import { Bot, User, Send, Plus, Trash2, ExternalLink, Sparkles, MessageSquare, Zap } from "lucide-react";

const EXEC_BRIEF_PROMPT = (
  "Generate a 60-second executive briefing structured as EXACTLY these 3 bullet groups (use markdown ## for each header, then bulletpoints under):\n" +
  "## Key Macro Risks & Rate Updates\n" +
  "## Portfolio Exposure Alerts\n" +
  "## 2 Actionable Breakouts to Watch Today\n\n" +
  "Ground every bullet in the CONTEXT news timestamps, portfolio holdings, and options/congress data provided. " +
  "Keep the total answer under 250 words. End with 'Not financial advice.'"
);

const STARTERS = [
  "What's driving my portfolio's P/L today?",
  "Why did NVDA move recently?",
  "What is the sentiment on TSLA right now?",
  "Any congress trades on my holdings this week?",
  "What macro news should I worry about?",
  "Which of my positions has the strongest signal?",
];

// Basic markdown for bold + bullet lists + newlines
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const bold = line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
      seg.startsWith("**") && seg.endsWith("**") ? <strong key={j} className="text-amber-400">{seg.slice(2, -2)}</strong> : <span key={j}>{seg}</span>
    );
    if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
      return <li key={i} className="ml-4 list-disc text-gray-200">{bold}</li>;
    }
    return <p key={i} className="text-gray-200 leading-relaxed">{bold}</p>;
  });
}

export default function ChatTab() {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [convs, setConvs] = useState([]);
  const listRef = useRef(null);

  const loadConversations = async () => {
    try {
      const { data } = await api.get("/chat/conversations");
      setConvs(data.conversations || []);
    } catch {}
  };

  const loadConversation = async (id) => {
    try {
      const { data } = await api.get(`/chat/conversations/${id}`);
      setConversationId(id);
      setMessages(data.messages || []);
    } catch {
      toast.error("Failed to load conversation");
    }
  };

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
  };

  const deleteConv = async (id) => {
    try {
      await api.delete(`/chat/conversations/${id}`);
      if (id === conversationId) newChat();
      loadConversations();
    } catch {}
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput("");
    const userMsg = { role: "user", content: question };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const { data } = await api.post("/chat/message", { conversation_id: conversationId, message: question });
      setConversationId(data.conversation_id);
      setMessages((m) => [...m, {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        tickers: data.extracted_tickers || [],
      }]);
      loadConversations();
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Request failed. Try again.", sources: [] }]);
      toast.error("Chat request failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[240px_1fr] gap-3" data-testid="chat-tab" style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>
      {/* Sidebar */}
      <aside className="border border-[#222C3D] bg-[#121721] rounded-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#222C3D] flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" /> Chats
          </span>
          <button
            onClick={newChat}
            data-testid="new-chat-button"
            className="text-xs font-mono text-gray-300 hover:text-amber-400 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> NEW
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convs.length === 0 && <div className="p-3 text-[11px] font-mono text-gray-600">No conversations yet.</div>}
          {convs.map((c) => (
            <div
              key={c.conversation_id}
              onClick={() => loadConversation(c.conversation_id)}
              data-testid={`conv-${c.conversation_id}`}
              className={`p-3 border-b border-[#1A2232] cursor-pointer hover:bg-[#161C26] group ${
                c.conversation_id === conversationId ? "bg-[#161C26]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] text-gray-300 flex-1 line-clamp-2">{c.preview || "(empty)"}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConv(c.conversation_id); }}
                  className="text-gray-600 hover:text-rose-500 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              <div className="text-[9px] font-mono text-gray-600 mt-1">{c.message_count} msgs · {timeAgo(c.updated_at)}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* Chat */}
      <section className="border border-[#222C3D] bg-[#121721] rounded-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#222C3D] flex items-center justify-between gap-2 bg-[#0E131F]">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-amber-500" />
            <span className="text-[10px] font-mono tracking-widest text-amber-500 uppercase">Terminal AI · Grounded Fintech Research</span>
          </div>
          <button
            onClick={() => send(EXEC_BRIEF_PROMPT)}
            disabled={sending}
            data-testid="exec-brief-button"
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-sm border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-black transition-colors disabled:opacity-50"
          >
            <Zap className="w-3 h-3" /> 60-Sec Executive Briefing
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-messages">
          {messages.length === 0 && (
            <div className="text-center max-w-xl mx-auto py-8">
              <Bot className="w-12 h-12 mx-auto text-amber-500 mb-3" />
              <div className="text-lg font-mono text-gray-200 mb-1">Ask your Portfolio Terminal</div>
              <div className="text-[11px] font-mono text-gray-500 mb-6">
                Grounded in your portfolio, news, sentiment, congress trades & options flow
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-left">
                {STARTERS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s)}
                    data-testid={`starter-${i}`}
                    className="text-[11px] font-mono text-gray-300 border border-[#222C3D] bg-[#0E131F] hover:border-amber-500 hover:text-amber-400 p-3 rounded-sm text-left transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              data-testid={`message-${i}`}
              className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div className={`shrink-0 w-8 h-8 rounded-sm flex items-center justify-center ${
                m.role === "user" ? "bg-amber-500 text-black" : "bg-[#0E131F] border border-[#222C3D] text-amber-500"
              }`}>
                {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[85%] ${m.role === "user" ? "text-right" : ""}`}>
                <div className={`inline-block text-left p-3 rounded-sm text-sm ${
                  m.role === "user"
                    ? "bg-amber-500/10 border border-amber-800 text-gray-100"
                    : "bg-[#0E131F] border border-[#222C3D] text-gray-100"
                }`}>
                  <div className="space-y-1">{renderMarkdown(m.content)}</div>
                  {m.tickers?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.tickers.map((t) => (
                        <span key={t} className="text-[10px] font-mono text-amber-400 border border-amber-800 bg-amber-950/40 px-1.5 py-0.5 rounded-sm">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {m.sources?.length > 0 && (
                  <div className="mt-2 space-y-1" data-testid={`sources-${i}`}>
                    <div className="text-[9px] font-mono text-gray-500 uppercase tracking-widest flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Sources ({m.sources.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.sources.slice(0, 8).map((s, j) => (
                        <a
                          key={j}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-mono text-gray-400 hover:text-amber-400 border border-[#222C3D] bg-[#0E131F] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1 max-w-[280px] truncate"
                        >
                          <ExternalLink className="w-2.5 h-2.5" />
                          <span className="text-gray-600">[{s.source || s.type}]</span>
                          <span className="truncate">{s.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-sm bg-[#0E131F] border border-[#222C3D] flex items-center justify-center">
                <Bot className="w-4 h-4 text-amber-500 animate-pulse" />
              </div>
              <div className="bg-[#0E131F] border border-[#222C3D] p-3 rounded-sm">
                <div className="text-[11px] font-mono text-gray-400 animate-pulse">Researching · gathering news · congress · sentiment · options...</div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-[#222C3D] bg-[#0E131F]">
          <div className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask about your portfolio, a ticker, news, sentiment, congress trades..."
              data-testid="chat-input"
              disabled={sending}
              className="flex-1 bg-[#121721] border border-[#222C3D] text-gray-100 text-sm px-3 py-2 rounded-sm focus:outline-none focus:border-amber-500 disabled:opacity-50"
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              data-testid="chat-send"
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider px-4 py-2 rounded-sm disabled:opacity-50 flex items-center gap-1"
            >
              <Send className="w-3.5 h-3.5" /> Send
            </button>
          </div>
          <div className="mt-2 pt-1.5 border-t border-[#1C2536] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-gray-500" data-testid="chat-disclaimer-footer">
            <div className="flex items-center gap-1.5 text-gray-400">
              <span className="text-amber-500 font-bold text-xs">⚠</span>
              <span className="text-gray-300">
                This application is for informational purposes only and does not constitute financial advice.
              </span>
            </div>
            <span className="text-gray-600 hidden md:inline">
              Grounded in Reddit · StockTwits · NewsAPI · Kadoa Congress · yfinance
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
