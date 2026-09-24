import axios from "axios";

const client = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 300_000, // AI runs through local Codex; adding a JD alone chains two ~15-40s calls
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.detail || err.message || "Unknown error";
    return Promise.reject(new Error(message));
  }
);

export default client;
