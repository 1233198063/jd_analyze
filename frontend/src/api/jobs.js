import client from "./client";

export const jobsApi = {
  submit: (payload) => client.post("/jobs/", payload).then((r) => r.data),
  list: (params) => client.get("/jobs/", { params }).then((r) => r.data),
  get: (id) => client.get(`/jobs/${id}`).then((r) => r.data),
  rescore: (id) => client.post(`/jobs/${id}/rescore`).then((r) => r.data),
  getReferral: (id) => client.get(`/jobs/${id}/referral`).then((r) => r.data),
};
