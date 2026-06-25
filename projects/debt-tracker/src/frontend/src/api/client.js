const BASE = "/api";

async function request(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw Object.assign(new Error(err.detail || "Request failed"), { status: res.status, data: err });
  }
  return res.json();
}

export const api = {
  createBill: (formData) => request("POST", "/bills", formData, true),
  getBill: (billId) => request("GET", `/bills/${billId}`),
  updateBill: (billId, body) => request("PATCH", `/bills/${billId}`, body),
  shareBill: (billId) => request("POST", `/bills/${billId}/share`),

  addParticipant: (billId, body) => request("POST", `/bills/${billId}/participants`, body),
  listParticipants: (billId) => request("GET", `/bills/${billId}/participants`),
  removeParticipant: (billId, participantId) =>
    request("DELETE", `/bills/${billId}/participants/${participantId}`),

  joinBill: (billId, token) => request("GET", `/bills/${billId}/join/${token}`),
  submitSelections: (billId, token, body) =>
    request("POST", `/bills/${billId}/join/${token}/selections`, body),

  getSummary: (billId) => request("GET", `/bills/${billId}/summary`),
  markPayment: (billId, body) => request("POST", `/bills/${billId}/payments`, body),
};
