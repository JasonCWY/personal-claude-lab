import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";

function TranslateBox({ bookId }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLookup(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const card = await api.translate(text.trim(), bookId);
      setResult(card);
      setText("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Translate a word or phrase</h2>
      <form onSubmit={handleLookup} className="row">
        <input
          type="text"
          placeholder="Type a word or phrase (EN or 中文)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ marginBottom: 0 }}
        />
        <button className="btn-primary" disabled={loading}>
          {loading ? "…" : "Look up"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {result && (
        <p className="mt">
          <strong>{result.source_text}</strong> → <strong>{result.translated_text}</strong>
          <span className="muted"> (saved to flashcards)</span>
        </p>
      )}
    </div>
  );
}

function NotesSection({ bookId }) {
  const [notes, setNotes] = useState(null);
  const [type, setType] = useState("note");
  const [content, setContent] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listNotes(bookId).then(setNotes).catch((e) => setError(e.message));
  }, [bookId]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      const note = await api.addNote(bookId, { type, content: content.trim(), location: location.trim() || null });
      setNotes((prev) => [...(prev || []), note]);
      setContent("");
      setLocation("");
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(noteId) {
    await api.deleteNote(bookId, noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  return (
    <div className="card">
      <h2>Notes & Quotes</h2>
      <form onSubmit={handleAdd}>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "auto", marginBottom: 8 }}>
          <option value="note">Note</option>
          <option value="quote">Quote</option>
        </select>
        <textarea
          rows={3}
          placeholder={type === "quote" ? "Paste the quote…" : "Jot down your thought…"}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <input
          type="text"
          placeholder="Page / chapter (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary btn-sm">Add</button>
      </form>

      <div className="mt">
        {notes === null && <p className="muted">Loading…</p>}
        {notes?.length === 0 && <p className="muted">No notes or quotes yet.</p>}
        {notes?.map((n) => (
          <div className="note-item" key={n.id}>
            <span className={`badge ${n.type === "quote" ? "badge-yellow" : "badge-blue"}`}>{n.type}</span>
            <p className="mt" style={{ marginTop: 4 }}>{n.content}</p>
            {n.location && <p className="note-location">{n.location}</p>}
            <button className="btn-secondary btn-sm mt" onClick={() => handleDelete(n.id)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatSection({ bookId }) {
  const [history, setHistory] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getChatHistory(bookId).then(setHistory).catch((e) => setError(e.message));
  }, [bookId]);

  async function handleSend(e) {
    e.preventDefault();
    if (!message.trim()) return;
    const userMsg = { id: `tmp-${Date.now()}`, role: "user", content: message.trim() };
    setHistory((prev) => [...(prev || []), userMsg]);
    setMessage("");
    setSending(true);
    setError(null);
    try {
      const reply = await api.sendChatMessage(bookId, userMsg.content);
      setHistory((prev) => [...prev, reply]);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card">
      <h2>Discuss this book</h2>
      <div className="chat-log">
        {history?.map((m) => (
          <div className={`chat-msg ${m.role}`} key={m.id}>{m.content}</div>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSend} className="row mt">
        <input
          type="text"
          placeholder="Share a thought or ask a question…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          style={{ marginBottom: 0 }}
        />
        <button className="btn-primary" disabled={sending}>{sending ? "…" : "Send"}</button>
      </form>
    </div>
  );
}

function FinishSection({ book, onFinished }) {
  const [rating, setRating] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFinish() {
    if (rating < 1) { setError("Pick a rating first."); return; }
    setLoading(true);
    setError(null);
    try {
      const updated = await api.finishBook(book.id, rating);
      onFinished(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (book.status === "finished") {
    return (
      <div className="card">
        <h2>Finished</h2>
        <div className="star-picker mb">
          {[1, 2, 3, 4, 5].map((n) => (
            <span key={n} className={n <= book.rating ? "filled" : ""} style={{ fontSize: "1.5rem", color: n <= book.rating ? "#f59e0b" : "#d1d5db" }}>★</span>
          ))}
        </div>
        {book.summary && <p>{book.summary}</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Mark as finished</h2>
      <div className="star-picker mb">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n <= rating ? "filled" : ""} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn-primary" onClick={handleFinish} disabled={loading}>
        {loading ? "Generating summary…" : "Finish & generate summary"}
      </button>
    </div>
  );
}

export default function BookDetail() {
  const { bookId } = useParams();
  const [book, setBook] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getBook(bookId).then(setBook).catch((e) => setError(e.message));
  }, [bookId]);

  if (error) return <div className="container"><p className="error">{error}</p></div>;
  if (!book) return <div className="container"><p className="muted">Loading…</p></div>;

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{book.title}</h1>
          {book.author && <p className="muted">{book.author}</p>}
        </div>
        <span className={`badge ${book.status === "finished" ? "badge-green" : "badge-blue"}`}>{book.status}</span>
      </div>

      <div className="mt">
        <TranslateBox bookId={book.id} />
        <NotesSection bookId={book.id} />
        {book.is_fiction === false && <ChatSection bookId={book.id} />}
        <FinishSection book={book} onFinished={setBook} />
      </div>
    </div>
  );
}
