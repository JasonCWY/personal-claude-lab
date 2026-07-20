import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function AddBook() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError("Please enter a title."); return; }
    setLoading(true);
    setError(null);
    try {
      const book = await api.createBook({ title: title.trim(), author: author.trim() || null });
      navigate(`/books/${book.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Add a Book</h1>
        <p className="muted mb">We'll look up the cover and genre automatically.</p>

        <form onSubmit={handleSubmit}>
          <label className="muted" style={{ display: "block", marginBottom: 4 }}>Title</label>
          <input
            type="text"
            placeholder="e.g. Sapiens"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="muted" style={{ display: "block", marginBottom: 4 }}>Author (optional)</label>
          <input
            type="text"
            placeholder="e.g. Yuval Noah Harari"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />

          {error && <p className="error mt">{error}</p>}

          <button type="submit" className="btn-primary mt" style={{ width: "100%" }} disabled={loading}>
            {loading ? "Adding…" : "Add book"}
          </button>
        </form>
      </div>
    </div>
  );
}
