import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

export default function Flashcards() {
  const [cards, setCards] = useState(null);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState("date");

  useEffect(() => {
    api.listFlashcards().then(setCards).catch((e) => setError(e.message));
  }, []);

  const sorted = useMemo(() => {
    if (!cards) return [];
    const copy = [...cards];
    if (sortBy === "date") {
      copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === "book") {
      copy.sort((a, b) => (a.book_id || "").localeCompare(b.book_id || ""));
    }
    return copy;
  }, [cards, sortBy]);

  async function handleDelete(id) {
    await api.deleteFlashcard(id);
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Flashcards</h1>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ width: "auto" }}>
          <option value="date">Sort by date</option>
          <option value="book">Sort by book</option>
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {!cards && !error && <p className="muted">Loading…</p>}
      {cards && cards.length === 0 && (
        <p className="muted mt">No flashcards yet. Look up a word or phrase from a book to save one.</p>
      )}

      <div className="card mt">
        {sorted.map((c) => (
          <div className="flashcard-item" key={c.id}>
            <div>
              <span className="flashcard-text">{c.source_text}</span>
              <span className="flashcard-arrow">→</span>
              <span className="flashcard-text">{c.translated_text}</span>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => handleDelete(c.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
