import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { companiesApi } from "@/api/companies";
import { PageLoader } from "@/components/common/Loading";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function CompanyProfile() {
  const { companyId } = useParams();
  const [importOpen, setImportOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading, error } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => companiesApi.get(companyId),
  });

  const importDOL = useMutation({
    mutationFn: () => companiesApi.importDOL(file, year),
  });

  if (isLoading) return <PageLoader />;
  if (error) return <div className="card p-6 text-red-600">{error.message}</div>;

  const { company: c, recent_records, swe_records, yearly_summary } = data;

  const approvalRate = c.h1b_approval_rate
    ? `${(c.h1b_approval_rate * 100).toFixed(0)}%`
    : "N/A";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{c.name}</h1>
        <p className="text-sm text-gray-500">{c.industry || "Unknown industry"} · {c.size}</p>
      </div>

      {/* H-1B summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{c.h1b_total_filings.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total H-1B Filings</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{approvalRate}</p>
          <p className="text-xs text-gray-500 mt-0.5">Approval Rate</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{c.h1b_swe_filings.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-0.5">SWE Filings</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-700">{c.h1b_latest_year || "—"}</p>
          <p className="text-xs text-gray-500 mt-0.5">Latest Data Year</p>
        </div>
      </div>

      {/* E-Verify / STEM OPT */}
      {c.e_verify_registered != null && (
        <div className={`card p-4 border ${c.e_verify_registered ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}`}>
          <p className="text-sm font-medium">
            E-Verify: {c.e_verify_registered ? "Registered ✓" : "Status Unknown"}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {c.e_verify_registered
              ? "Company participates in E-Verify — eligible for STEM OPT (Form I-983)."
              : "E-Verify status not confirmed. Verify before pursuing STEM OPT extension."}
          </p>
        </div>
      )}

      {/* Yearly chart */}
      {yearly_summary.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">H-1B Filings by Year</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={yearly_summary}>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="total" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* SWE-specific records */}
      {swe_records.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            SWE-Specific Filings ({swe_records.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-1 text-gray-500 font-medium">Title</th>
                  <th className="text-left py-2 px-1 text-gray-500 font-medium">Year</th>
                  <th className="text-left py-2 px-1 text-gray-500 font-medium">Status</th>
                  <th className="text-left py-2 px-1 text-gray-500 font-medium">Wage</th>
                  <th className="text-left py-2 px-1 text-gray-500 font-medium">Location</th>
                </tr>
              </thead>
              <tbody>
                {swe_records.slice(0, 20).map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-1.5 px-1 text-gray-700 max-w-[180px] truncate">{r.job_title}</td>
                    <td className="py-1.5 px-1 text-gray-600">{r.fiscal_year}</td>
                    <td className="py-1.5 px-1">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${r.case_status === "certified" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {r.case_status}
                      </span>
                    </td>
                    <td className="py-1.5 px-1 text-gray-600">
                      {r.wage_rate ? `$${r.wage_rate.toLocaleString()} /${r.wage_unit?.[0] || "yr"}` : "—"}
                    </td>
                    <td className="py-1.5 px-1 text-gray-600">{r.worksite_city}, {r.worksite_state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import DOL data */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">Import DOL LCA Data</h3>
          <button className="btn-secondary text-xs" onClick={() => setImportOpen(!importOpen)}>
            {importOpen ? "Cancel" : "Upload CSV"}
          </button>
        </div>

        {importOpen && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Download from{" "}
              <span className="font-mono">dol.gov/agencies/eta/foreign-labor/performance</span>.
              FY2026 Q2 covers Oct 2025 – Mar 2026. Filter by this company name before uploading
              to keep imports fast.
            </p>
            <div>
              <label className="label">Fiscal Year</label>
              <input
                type="number"
                className="input w-32"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                min={2015}
                max={2030}
              />
            </div>
            <div>
              <label className="label">CSV File</label>
              <input
                type="file"
                accept=".csv"
                className="text-sm"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </div>
            <button
              className="btn-primary"
              disabled={!file || importDOL.isPending}
              onClick={() => importDOL.mutate()}
            >
              {importDOL.isPending ? "Importing..." : "Import"}
            </button>
            {importDOL.isSuccess && (
              <p className="text-xs text-green-600">
                Imported {importDOL.data.records_imported} records.
              </p>
            )}
            {importDOL.isError && (
              <p className="text-xs text-red-600">{importDOL.error?.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
