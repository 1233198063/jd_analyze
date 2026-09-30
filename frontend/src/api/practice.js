import client from "./client";

export const practiceApi = {
  today: () => client.get("/practice/today").then((r) => r.data),
  overview: () => client.get("/practice/overview").then((r) => r.data),
  plan: () => client.get("/practice/plan").then((r) => r.data),
  log: (payload) => client.post("/practice/logs", payload).then((r) => r.data),
  deleteLog: (id) => client.delete(`/practice/logs/${id}`),
  updateSettings: (payload) => client.patch("/practice/settings", payload).then((r) => r.data),
};
