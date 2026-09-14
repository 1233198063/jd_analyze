import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import Dashboard from "@/pages/Dashboard";
import Discoveries from "@/pages/Discoveries";
import AddJob from "@/pages/AddJob";
import JobDetail from "@/pages/JobDetail";
import Tracker from "@/pages/Tracker";
import ResumePage from "@/pages/ResumePage";
import CompanyProfile from "@/pages/CompanyProfile";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/discoveries" element={<Discoveries />} />
          <Route path="/jobs/add" element={<AddJob />} />
          <Route path="/jobs/:jobId" element={<JobDetail />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/resume" element={<ResumePage />} />
          <Route path="/companies/:companyId" element={<CompanyProfile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
