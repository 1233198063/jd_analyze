import client from "./client";

export const companiesApi = {
  search: (q) => client.get("/companies/search", { params: { q } }).then((r) => r.data),
  get: (id) => client.get(`/companies/${id}`).then((r) => r.data),
  importDOL: (file, fiscalYear) => {
    const form = new FormData();
    form.append("file", file);
    form.append("fiscal_year", fiscalYear);
    return client.post("/companies/import/dol", form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 300_000, // large CSV can take 5 minutes
    }).then((r) => r.data);
  },
};
