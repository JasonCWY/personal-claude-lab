import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";

export default function JoinBill() {
  const { billId, token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // item_id -> "mine" | "shared"
  const [claimType, setClaimType] = useState({});
  // item_id -> Set of participant ids sharing with me
  const [sharingWith, setSharingWith] = useState({});
  const [birthdayOptIn, setBirthdayOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [myTotal, setMyTotal] = useState(null);

  useEffect(() => {
    api.joinBill(billId, token)
      .then((d) => {
        setData(d);
        setBirthdayOptIn(d.participant.birthday_opt_in);
        if (d.participant.has_selected) setSubmitted(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [billId, token]);

  if (loading) return <div className="container"><p className="muted">Loading…</p></div>;
  if (error) return <div className="container"><p className="error">{error}</p></div>;

  const { bill, participant, items, all_participants } = data;
  const others = all_participants.filter((p) => p.id !== participant.id);
  const birthdayPerson = all_participants.find((p) => p.is_birthday);

  function toggleClaim(itemId) {
    setClaimType((prev) => {
      const next = { ...prev };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = "mine";
      return next;
    });
    setSharingWith((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
  }

  function setShared(itemId, checked) {
    setClaimType((prev) => ({ ...prev, [itemId]: checked ? "shared" : "mine" }));
    if (!checked) setSharingWith((prev) => { const n = { ...prev }; delete n[itemId]; return n; });
  }

  function toggleSharer(itemId, pid) {
    setSharingWith((prev) => {
      const set = new Set(prev[itemId] || []);
      if (set.has(pid)) set.delete(pid); else set.add(pid);
      return { ...prev, [itemId]: set };
    });
  }

  function calcMyTotal() {
    let base = 0;
    for (const item of items) {
      const type = claimType[item.id];
      if (!type) continue;
      const sharers = sharingWith[item.id] || new Set();
      const denom = type === "shared" ? 1 + sharers.size : 1;
      base += (parseFloat(item.unit_price) * item.quantity) / denom;
    }
    const surchargeRatio =
      bill.subtotal > 0 ? (bill.tax + bill.service_charge) / bill.subtotal : 0;
    return (base * (1 + surchargeRatio)).toFixed(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const assignments = Object.entries(claimType).map(([item_id, type]) => ({
      item_id,
      sharing_with: type === "shared" ? [...(sharingWith[item_id] || [])] : [],
    }));
    try {
      const result = await api.submitSelections(billId, token, {
        assignments,
        birthday_opt_in: birthdayOptIn,
      });
      setMyTotal(result.your_total);
      setSubmitted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="container">
        <div className="card">
          <h1>{bill.title}</h1>
          <p className="muted mb">Hi {participant.display_name}! Your selections are saved.</p>
          {myTotal !== null && (
            <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              Your share: {bill.currency} {myTotal}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h1>{bill.title}</h1>
        <p className="muted">Hi {participant.display_name}! Tick what you ordered.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h2>Items</h2>
          {items.map((item) => {
            const claimed = !!claimType[item.id];
            const isShared = claimType[item.id] === "shared";
            return (
              <div key={item.id} style={{ paddingBottom: 12, borderBottom: "1px solid #f3f4f6", marginBottom: 12 }}>
                <div className="checkbox-row">
                  <input
                    type="checkbox"
                    id={`item-${item.id}`}
                    checked={claimed}
                    onChange={() => toggleClaim(item.id)}
                  />
                  <label htmlFor={`item-${item.id}`} style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <span>{item.name} {item.quantity > 1 && `×${item.quantity}`}</span>
                    <span style={{ fontWeight: 600 }}>{bill.currency} {parseFloat(item.total_price).toFixed(2)}</span>
                  </label>
                </div>

                {claimed && others.length > 0 && (
                  <div style={{ paddingLeft: 26 }}>
                    <label style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto", marginRight: 6 }}
                        checked={isShared}
                        onChange={(e) => setShared(item.id, e.target.checked)}
                      />
                      Sharing with others?
                    </label>
                    {isShared && (
                      <div style={{ marginTop: 6 }}>
                        {others.map((p) => (
                          <label key={p.id} style={{ display: "block", fontSize: "0.85rem", marginBottom: 4 }}>
                            <input
                              type="checkbox"
                              style={{ width: "auto", marginRight: 6 }}
                              checked={(sharingWith[item.id] || new Set()).has(p.id)}
                              onChange={() => toggleSharer(item.id, p.id)}
                            />
                            {p.display_name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {bill.has_birthday_person && birthdayPerson && !participant.is_birthday && (
          <div className="card">
            <label style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={birthdayOptIn}
                onChange={(e) => setBirthdayOptIn(e.target.checked)}
              />
              <span>Chip in to cover {birthdayPerson.display_name}'s share</span>
            </label>
          </div>
        )}

        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Your estimated share</span>
            <strong>{bill.currency} {calcMyTotal()}</strong>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={submitting}>
          {submitting ? "Saving…" : "Confirm my order"}
        </button>
      </form>
    </div>
  );
}
