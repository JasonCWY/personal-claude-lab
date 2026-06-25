import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";

export default function BillDashboard() {
  const { billId } = useParams();
  const [bill, setBill] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [summary, setSummary] = useState(null);
  const [inviteLinks, setInviteLinks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add participant form
  const [newName, setNewName] = useState("");
  const [isBirthday, setIsBirthday] = useState(false);
  const [addingParticipant, setAddingParticipant] = useState(false);

  // Payment modal
  const [payingFor, setPayingFor] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payError, setPayError] = useState(null);

  // Third-party payer
  const [actualPayerId, setActualPayerId] = useState("");

  async function load() {
    try {
      const [billData, parts] = await Promise.all([
        api.getBill(billId),
        api.listParticipants(billId),
      ]);
      setBill(billData);
      setParticipants(parts);
      setActualPayerId(billData.actual_payer_id || "");
      if (billData.status !== "draft") {
        const sum = await api.getSummary(billId);
        setSummary(sum);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [billId]);

  async function addParticipant(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddingParticipant(true);
    try {
      const p = await api.addParticipant(billId, { display_name: newName.trim(), is_birthday: isBirthday });
      setParticipants((prev) => [...prev, p]);
      setNewName("");
      setIsBirthday(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingParticipant(false);
    }
  }

  async function removeParticipant(pid) {
    try {
      await api.removeParticipant(billId, pid);
      setParticipants((prev) => prev.filter((p) => p.id !== pid));
    } catch (e) {
      setError(e.message);
    }
  }

  async function setActualPayer() {
    try {
      await api.updateBill(billId, { actual_payer_id: actualPayerId || null });
    } catch (e) {
      setError(e.message);
    }
  }

  async function shareBill() {
    try {
      const result = await api.shareBill(billId);
      setInviteLinks(result.invite_links);
      setBill((b) => ({ ...b, status: "open" }));
      const sum = await api.getSummary(billId);
      setSummary(sum);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleMarkPaid() {
    setPayError(null);
    try {
      await api.markPayment(billId, {
        participant_id: payingFor.id,
        amount: parseFloat(payAmount),
        note: payNote || undefined,
      });
      setPayingFor(null);
      setPayAmount("");
      setPayNote("");
      const sum = await api.getSummary(billId);
      setSummary(sum);
      setBill((b) => ({ ...b, status: sum.status }));
    } catch (e) {
      setPayError(e.message);
    }
  }

  if (loading) return <div className="container"><p className="muted">Loading…</p></div>;
  if (error && !bill) return <div className="container"><p className="error">{error}</p></div>;

  const isDraft = bill.status === "draft";

  return (
    <div className="container">
      {/* Header */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>{bill.title}</h1>
          <span className={`badge ${bill.status === "settled" ? "badge-green" : bill.status === "open" ? "badge-blue" : "badge-yellow"}`}>
            {bill.status}
          </span>
        </div>
        <p className="muted">{bill.currency} {parseFloat(bill.total || 0).toFixed(2)} total</p>
      </div>

      {/* Items */}
      <div className="card">
        <h2>Items</h2>
        {bill.items.length === 0 ? (
          <p className="muted">No items parsed. Edit the bill to add items manually.</p>
        ) : (
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th style={{ textAlign: "right" }}>Price</th></tr></thead>
            <tbody>
              {bill.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
                  <td style={{ textAlign: "right" }}>{parseFloat(item.total_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Participants */}
      <div className="card">
        <h2>Participants</h2>
        {participants.map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
            <span>
              {p.display_name}
              {p.is_birthday && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>Birthday</span>}
            </span>
            {isDraft && (
              <button className="btn-secondary btn-sm" onClick={() => removeParticipant(p.id)}>Remove</button>
            )}
          </div>
        ))}

        {isDraft && (
          <form onSubmit={addParticipant} className="mt">
            <div className="row">
              <input
                type="text"
                placeholder="Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ marginBottom: 0 }}
              />
              <label style={{ whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                <input
                  type="checkbox"
                  style={{ width: "auto", marginRight: 4, marginBottom: 0 }}
                  checked={isBirthday}
                  onChange={(e) => setIsBirthday(e.target.checked)}
                />
                Birthday
              </label>
              <button type="submit" className="btn-secondary btn-sm" disabled={addingParticipant}>
                Add
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Actual payer (third-party) */}
      {isDraft && participants.length > 0 && (
        <div className="card">
          <h2>Who actually paid?</h2>
          <p className="muted mb" style={{ fontSize: "0.85rem" }}>
            Leave blank if you paid. Set this if someone else paid and you're collecting on their behalf.
          </p>
          <div className="row">
            <select
              value={actualPayerId}
              onChange={(e) => setActualPayerId(e.target.value)}
              style={{ marginBottom: 0 }}
            >
              <option value="">Me (the bill creator)</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
            <button className="btn-secondary btn-sm" onClick={setActualPayer}>Save</button>
          </div>
        </div>
      )}

      {/* Share */}
      {isDraft && participants.length > 0 && (
        <button className="btn-primary" style={{ width: "100%" }} onClick={shareBill}>
          Share bill with participants
        </button>
      )}

      {/* Invite links */}
      {inviteLinks && (
        <div className="card mt">
          <h2>Invite links</h2>
          <p className="muted mb" style={{ fontSize: "0.85rem" }}>Send each person their unique link.</p>
          {inviteLinks.map((l) => (
            <div key={l.url} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ fontWeight: 600 }}>{l.name}</span>
              <button
                className="btn-secondary btn-sm"
                onClick={() => navigator.clipboard.writeText(l.url)}
              >
                Copy link
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Payment summary */}
      {summary && (
        <div className="card mt">
          <h2>Payment Summary</h2>
          {summary.creator_owes_payer && (
            <div style={{ background: "#fef3c7", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <strong>You owe {summary.creator_owes_payer.display_name}:</strong>{" "}
              {summary.currency} {summary.creator_owes_payer.creator_owes.toFixed(2)}
            </div>
          )}
          {summary.unassigned_amount > 0 && (
            <p className="muted mb">
              Unassigned: {summary.currency} {summary.unassigned_amount.toFixed(2)} (waiting for participants to claim)
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ textAlign: "right" }}>Owes</th>
                <th style={{ textAlign: "right" }}>Paid</th>
                <th style={{ textAlign: "right" }}>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summary.participants.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.display_name}
                    {!p.has_selected && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>Pending</span>}
                    {p.is_birthday && <span className="badge badge-green" style={{ marginLeft: 6 }}>Birthday</span>}
                  </td>
                  <td style={{ textAlign: "right" }}>{p.amount_owed.toFixed(2)}</td>
                  <td style={{ textAlign: "right" }}>{p.amount_paid.toFixed(2)}</td>
                  <td style={{ textAlign: "right", color: p.balance > 0 ? "#dc2626" : "#059669", fontWeight: 600 }}>
                    {p.balance.toFixed(2)}
                  </td>
                  <td>
                    {p.balance > 0 && (
                      <button
                        className="btn-success btn-sm"
                        onClick={() => { setPayingFor(p); setPayAmount(p.balance.toFixed(2)); }}
                      >
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment modal */}
      {payingFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 320 }}>
            <h2 style={{ marginBottom: 12 }}>Mark {payingFor.display_name} as paid</h2>
            <input
              type="number"
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="Amount"
            />
            <input
              type="text"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Note (optional, e.g. PayNow ref)"
            />
            {payError && <p className="error">{payError}</p>}
            <div className="row mt">
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleMarkPaid}>Confirm</button>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPayingFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="error mt">{error}</p>}
    </div>
  );
}
