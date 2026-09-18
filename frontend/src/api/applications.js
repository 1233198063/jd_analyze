import client from "./client";

export const applicationsApi = {
  create: (payload) => client.post("/applications/", payload).then((r) => r.data),
  get: (id) => client.get(`/applications/${id}`).then((r) => r.data),
  update: (id, payload) => client.patch(`/applications/${id}`, payload).then((r) => r.data),
  updateTimelineEvent: (id, index, payload) =>
    client.patch(`/applications/${id}/timeline/${index}`, payload).then((r) => r.data),
  delete: (id) => client.delete(`/applications/${id}`),
  kanban: () => client.get("/applications/kanban").then((r) => r.data),
};
