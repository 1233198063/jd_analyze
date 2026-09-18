import client from "./client";

export const jobsApi = {
  submit: (payload) => client.post("/jobs/", payload).then((r) => r.data),
  list: (params) => client.get("/jobs/", { params }).then((r) => r.data),
  get: (id) => client.get(`/jobs/${id}`).then((r) => r.data),
  rescore: (id) => client.post(`/jobs/${id}/rescore`).then((r) => r.data),
  rescoreAll: () => client.post("/jobs/rescore-all").then((r) => r.data),
  getReferral: (id) => client.get(`/jobs/${id}/referral`).then((r) => r.data),
  tailorResume: (id) => client.post(`/jobs/${id}/tailor-resume`).then((r) => r.data),
  getTailoredResume: (id) => client.get(`/jobs/${id}/tailor-resume`).then((r) => r.data),
  discoverStart: () => client.post("/jobs/discover").then((r) => r.data),
  discoverStatus: () => client.get("/jobs/discover/status").then((r) => r.data),
};
