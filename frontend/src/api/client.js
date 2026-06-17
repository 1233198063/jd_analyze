import axios from "axios";

const client = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 60_000, // AI calls can take a while
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.detail || err.message || "Unknown error";
    return Promise.reject(new Error(message));
  }
);

export default client;
