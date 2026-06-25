import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CreateBill from "./pages/CreateBill";
import BillDashboard from "./pages/BillDashboard";
import JoinBill from "./pages/JoinBill";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CreateBill />} />
        <Route path="/bill/:billId" element={<BillDashboard />} />
        <Route path="/bill/:billId/join/:token" element={<JoinBill />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
