import client from "./client";

export const resumeApi = {
  create: (payload) => client.post("/resume/", payload).then((r) => r.data),
  list: () => client.get("/resume/").then((r) => r.data),
  getMaster: () => client.get("/resume/master").then((r) => r.data),
  get: (id) => client.get(`/resume/${id}`).then((r) => r.data),
  update: (id, payload) => client.patch(`/resume/${id}`, payload).then((r) => r.data),
  delete: (id) => client.delete(`/resume/${id}`),
};
