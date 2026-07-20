import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function Library() {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listBooks().then(setBooks).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Your Library</h1>
        <Link to="/books/new" className="btn-primary" style={{ textDecoration: "none" }}>
          + Add book
        </Link>
      </div>

      {error && <p className="error">{error}</p>}
      {!books && !error && <p className="muted">Loading…</p>}
      {books && books.length === 0 && (
        <p className="muted mt">No books yet. Add one to get started.</p>
      )}

      <div className="book-list mt">
        {books?.map((b) => (
          <Link to={`/books/${b.id}`} className="book-item" key={b.id}>
            {b.cover_url ? (
              <img src={b.cover_url} alt="" className="book-cover" />
            ) : (
              <div className="book-cover" />
            )}
            <div className="book-item-info">
              <div className="book-item-title">{b.title}</div>
              {b.author && <div className="book-item-author">{b.author}</div>}
              <div className="mt" style={{ marginTop: 6 }}>
                <span className={`badge ${b.status === "finished" ? "badge-green" : "badge-blue"}`}>
                  {b.status}
                </span>
                {b.is_fiction === false && <span className="badge badge-purple" style={{ marginLeft: 6 }}>non-fiction</span>}
                {b.rating && <span className="muted" style={{ marginLeft: 6 }}>{"★".repeat(b.rating)}</span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
