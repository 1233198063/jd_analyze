import client from "./client";

export const sourcesApi = {
  checks: () => client.get("/sources/checks").then((r) => r.data),
  recordCheck: (key) => client.post(`/sources/checks/${key}`).then((r) => r.data),
};
