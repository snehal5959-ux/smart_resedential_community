import { useEffect, useRef, useState } from "react";
import { apiFetch as fetch } from "./api";

const starterPrompts = [
	"Which flats are currently available?",
	"How many flats are occupied?",
	"What information is available on this website?",
];

export default function CommunityAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
		content: "Hi, I’m Nestora AI. I can help with information from this community website, including current flat availability.",
    },
  ]);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages, sending]);

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || sending || content.length > 1_200) return;

    const userMessage = { role: "user", content };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft("");
    setSending(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages.slice(-8) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The assistant could not answer.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error.message || "The assistant is unavailable. Please try again.",
        error: true,
      }]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  return (
    <div className="community-assistant">
      {open && (
        <section className="assistant-window" aria-label="Nestora AI assistant">
          <video className="assistant-backdrop-video" autoPlay muted loop playsInline aria-hidden="true">
            <source src="/nestoraai.mp4" type="video/mp4" />
          </video>
          <header className="assistant-header">
            <div className="assistant-avatar" aria-hidden="true">N</div>
            <div><strong>Nestora AI</strong><span>Community guide · Gemini 3.8 Flash</span></div>
            <button type="button" aria-label="Close assistant" onClick={() => setOpen(false)}>×</button>
          </header>

          <div className="assistant-transcript" ref={listRef} aria-live="polite">
            {messages.map((message, index) => (
              <div className={`assistant-message ${message.role}${message.error ? " assistant-message-error" : ""}`} key={`${index}-${message.role}`}>
                {message.content}
              </div>
            ))}
            {sending && <div className="assistant-message assistant">Thinking…</div>}
          </div>

          {messages.length === 1 && (
            <div className="assistant-prompts">
              {starterPrompts.map((prompt) => (
                <button key={prompt} type="button" disabled={sending} onClick={() => sendMessage(prompt)}>{prompt}</button>
              ))}
            </div>
          )}

          <form className="assistant-composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="assistant-message">Ask Nestora AI</label>
            <textarea
              id="assistant-message"
              ref={inputRef}
              value={draft}
              maxLength={1_200}
              rows={2}
              placeholder="Ask about homes or amenities…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit(event);
                }
              }}
            />
            <button type="submit" aria-label="Send message" disabled={sending || !draft.trim()}>
              {sending ? "…" : "↑"}
            </button>
          </form>
          <p className="assistant-privacy">Messages are sent to Google Gemini. Avoid sharing private details, passwords, or lock codes.</p>
        </section>
      )}

      <button
        type="button"
        className={`assistant-launcher${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-label={open ? "Close Nestora AI" : "Open Nestora AI"}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "×" : <><span className="assistant-sparkle">✦</span><span>Ask Nestora AI</span></>}
      </button>
    </div>
  );
}
