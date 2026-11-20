import { useCallback, useEffect, useState } from "react";
import { apiFetch, readApiJson } from "./api";

export default function MessagesPage({ currentUser }) {
  const isManager = currentUser.role === "manager";
  const allSocietiesView = typeof window !== "undefined" && window.localStorage.getItem("nestora-admin-society-id") === "all";
  const [messages, setMessages] = useState([]);
  const [messageType, setMessageType] = useState("manager_admin");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyBody, setReplyBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/auth/messages");
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not load messages.");
      setMessages(data);
    } catch (cause) {
      setError(cause.message || "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function send(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/auth/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: messageType,
          subject,
          body,
          ...(messageType === "event_invitation" ? { eventAt: new Date(eventAt).toISOString(), eventLocation } : {}),
        }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not send message.");
      setNotice(data.message);
      setSubject("");
      setBody("");
      setEventAt("");
      setEventLocation("");
      await load();
    } catch (cause) {
      setError(cause.message || "Could not send message.");
    } finally {
      setSaving(false);
    }
  }

  async function markRead(message) {
    setError("");
    try {
      const response = await apiFetch(`/api/auth/messages/${message.id}/read`, { method: "PATCH" });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not update message.");
      await load();
    } catch (cause) {
      setError(cause.message || "Could not update message.");
    }
  }

  async function reply(event, message) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/api/auth/messages/${message.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody }),
      });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.message || "Could not reply to the manager.");
      setNotice(data.message);
      setReplyingTo(null);
      setReplyBody("");
      await load();
    } catch (cause) {
      setError(cause.message || "Could not reply to the manager.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <section className="welcome-row">
      <div><p className="eyebrow">COMMUNITY COMMUNICATION</p><h1>{isManager ? "Messages to platform admin" : "Manager messages"}</h1>
        <p className="welcome-subtitle">{isManager ? "Send a message to the platform administrator. It is saved in the platform inbox and an email notification is sent." : "Messages from managers in the selected society."}</p>
      </div>
    </section>
    {currentUser.role === "admin" && allSocietiesView && <p className="calendar-source-note" role="status">Select one society to reply to a community manager.</p>}
    {error && <p className="flat-error" role="alert">{error}</p>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    {isManager && <form className="panel resident-form" onSubmit={(event) => void send(event)}>
      <div className="panel-heading"><div><h2>Contact platform administrator</h2><p>Messages are visible to platform administrators and email notifications are sent when mail is configured.</p></div></div>
      <div className="form-grid">
        <label>Type<select value={messageType} onChange={(event) => setMessageType(event.target.value)}><option value="manager_admin">Message</option><option value="event_invitation">Event invitation</option></select></label>
        <label>Subject / event name<input required maxLength="180" value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        {messageType === "event_invitation" && <>
          <label>Event date and time<input required type="datetime-local" value={eventAt} onChange={(event) => setEventAt(event.target.value)} /></label>
          <label>Venue<input required maxLength="180" value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} /></label>
        </>}
        <label>{messageType === "event_invitation" ? "Invitation details" : "Message"}<textarea required maxLength="5000" rows="5" value={body} onChange={(event) => setBody(event.target.value)} /></label>
      </div>
      <button className="primary-button" disabled={saving || (messageType === "event_invitation" && (!eventAt || !eventLocation.trim()))}>{saving ? "Sending…" : messageType === "event_invitation" ? "Send event invitation" : "Send message"}</button>
    </form>}
    <section className="panel residents-panel">
      <div className="panel-heading"><div><h2>{isManager ? "Inbox and sent messages" : "Inbox"}</h2><p>{messages.length} message{messages.length === 1 ? "" : "s"}</p></div><button className="secondary-button" type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
      {loading ? <p>Loading messages…</p> : messages.length === 0 ? <p className="empty-state">No messages yet.</p> : <div className="message-list">
        {messages.map((message) => <article className="panel message-card" key={`${message.societyId || ""}-${message.id}`}>
          <div className="panel-heading"><div><p className="eyebrow">{message.type === "tenant_added" ? "TENANT ADDED" : message.type === "event_invitation" ? "EVENT INVITATION" : message.type === "admin_manager_reply" ? "FROM PLATFORM ADMIN" : message.senderName === currentUser.name ? "SENT TO PLATFORM ADMIN" : "FROM COMMUNITY MANAGER"}</p><h2>{message.subject}</h2><p>{message.senderName}{currentUser.role === "admin" && message.type === "admin_manager_reply" ? ` · To ${message.recipientName || "Community Manager"}` : ""} · {new Date(message.createdAt).toLocaleString()}{message.societyName ? ` · ${message.societyName}` : ""}</p></div>
            {!allSocietiesView && !message.readAt && currentUser.role === "manager" && ["tenant_added", "admin_manager_reply"].includes(message.type) && <button className="secondary-button" type="button" onClick={() => void markRead(message)}>Mark read</button>}
            {currentUser.role === "admin" && !allSocietiesView && ["manager_admin", "event_invitation"].includes(message.type) && <button className="secondary-button" type="button" onClick={() => { setReplyingTo(replyingTo === message.id ? null : message.id); setReplyBody(""); }}>Reply</button>}
          </div>
          {message.type === "event_invitation" && <p><strong>When:</strong> {message.eventAt ? new Date(message.eventAt).toLocaleString() : "—"} <strong>Where:</strong> {message.eventLocation || "—"}</p>}
          <p className="message-body">{message.body}</p>
          {replyingTo === message.id && currentUser.role === "admin" && <form className="resident-form" onSubmit={(event) => void reply(event, message)}>
            <label>Reply to {message.senderName}<textarea required maxLength="5000" rows="4" value={replyBody} onChange={(event) => setReplyBody(event.target.value)} /></label>
            <div className="form-actions"><button className="primary-button" disabled={saving || !replyBody.trim()}>{saving ? "Sending…" : "Send reply"}</button><button className="secondary-button" type="button" onClick={() => { setReplyingTo(null); setReplyBody(""); }}>Cancel</button></div>
          </form>}
        </article>)}
      </div>}
    </section>
  </>;
}
