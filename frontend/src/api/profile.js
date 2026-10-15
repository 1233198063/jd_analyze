import client from "./client";

export const profileApi = {
  get: () => client.get("/profile").then((r) => r.data),
};
