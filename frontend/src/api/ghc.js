import client from "./client";

export const ghcApi = {
  guide: () => client.get("/ghc").then((r) => r.data),
  updateProgress: (key, payload) => client.put(`/ghc/progress/${key}`, payload).then((r) => r.data),
};
