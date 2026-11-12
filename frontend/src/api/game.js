import client from "./client";

export const gameApi = {
  overview: () => client.get("/game").then((r) => r.data),
};
