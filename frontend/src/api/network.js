import client from "./client";

export const networkApi = {
  overview: () => client.get("/network").then((r) => r.data),
  addContact: (payload) => client.post("/network/contacts", payload).then((r) => r.data),
  updateContact: (id, payload) => client.patch(`/network/contacts/${id}`, payload).then((r) => r.data),
  logEvent: (id, payload) => client.post(`/network/contacts/${id}/events`, payload).then((r) => r.data),
  deleteContact: (id) => client.delete(`/network/contacts/${id}`),
};
