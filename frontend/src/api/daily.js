import client from "./client";

export const dailyApi = {
  day: (day) => client.get(`/daily/${day}`).then((r) => r.data),
  history: (days = 14) => client.get("/daily/history", { params: { days } }).then((r) => r.data),
  addTodo: (payload) => client.post("/daily/todos", payload).then((r) => r.data),
  updateTodo: (id, payload) => client.patch(`/daily/todos/${id}`, payload).then((r) => r.data),
  deleteTodo: (id) => client.delete(`/daily/todos/${id}`),
};
