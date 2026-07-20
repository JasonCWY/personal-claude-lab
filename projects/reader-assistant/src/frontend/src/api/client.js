const BASE = "/api";

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(err.detail || "Request failed"), { status: res.status, data: err });
  }
  return res.json();
}

export const api = {
  createBook: (body) => request("POST", "/books", body),
  listBooks: () => request("GET", "/books"),
  getBook: (bookId) => request("GET", `/books/${bookId}`),
  updateBook: (bookId, body) => request("PATCH", `/books/${bookId}`, body),
  finishBook: (bookId, rating) => request("POST", `/books/${bookId}/finish`, { rating }),

  addNote: (bookId, body) => request("POST", `/books/${bookId}/notes`, body),
  listNotes: (bookId) => request("GET", `/books/${bookId}/notes`),
  deleteNote: (bookId, noteId) => request("DELETE", `/books/${bookId}/notes/${noteId}`),

  translate: (text, bookId) => request("POST", "/translate", { text, book_id: bookId }),
  listFlashcards: (bookId) => request("GET", bookId ? `/flashcards?book_id=${bookId}` : "/flashcards"),
  deleteFlashcard: (flashcardId) => request("DELETE", `/flashcards/${flashcardId}`),

  getChatHistory: (bookId) => request("GET", `/books/${bookId}/chat`),
  sendChatMessage: (bookId, content) => request("POST", `/books/${bookId}/chat`, { content }),
};
