import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import Library from "./pages/Library";
import AddBook from "./pages/AddBook";
import BookDetail from "./pages/BookDetail";
import Flashcards from "./pages/Flashcards";

export default function App() {
  return (
    <BrowserRouter>
      <nav className="topnav">
        <Link to="/" className="brand">📖 Reader Assistant</Link>
        <Link to="/flashcards">Flashcards</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/books/new" element={<AddBook />} />
        <Route path="/books/:bookId" element={<BookDetail />} />
        <Route path="/flashcards" element={<Flashcards />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
