import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function CreateBill() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("SGD");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) { setError("Please upload a receipt photo."); return; }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("title", title || "Untitled bill");
      fd.append("currency", currency);
      fd.append("file", file);
      const bill = await api.createBill(fd);
      navigate(`/bill/${bill.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>New Bill</h1>
        <p className="muted mb">Upload a receipt and we'll parse it for you.</p>

        <form onSubmit={handleSubmit}>
          <label className="muted" style={{ display: "block", marginBottom: 4 }}>Bill title</label>
          <input
            type="text"
            placeholder="e.g. Dinner at Nobu"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="muted" style={{ display: "block", marginBottom: 4 }}>Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="SGD">SGD</option>
            <option value="MYR">MYR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
            <option value="HKD">HKD</option>
          </select>

          <label className="muted" style={{ display: "block", marginBottom: 4, marginTop: 8 }}>Receipt photo</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files[0])}
            style={{ border: "none", padding: 0 }}
          />
          {file && (
            <img
              src={URL.createObjectURL(file)}
              alt="Receipt preview"
              style={{ width: "100%", borderRadius: 8, marginTop: 8, maxHeight: 300, objectFit: "contain" }}
            />
          )}

          {error && <p className="error mt">{error}</p>}

          <button
            type="submit"
            className="btn-primary mt"
            style={{ width: "100%" }}
            disabled={loading}
          >
            {loading ? "Parsing receipt…" : "Upload & parse receipt"}
          </button>
        </form>
      </div>
    </div>
  );
}
