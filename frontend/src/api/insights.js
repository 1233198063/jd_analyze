import client from "./client";

export const insightsApi = {
  resumeGaps: (scope = "all") =>
    client.get("/insights/resume-gaps", { params: { scope } }).then((r) => r.data),
  setSkillStudy: (skill, payload) =>
    client.put(`/insights/skill-studies/${encodeURIComponent(skill)}`, payload).then((r) => r.data),
  clearSkillStudy: (skill) =>
    client.delete(`/insights/skill-studies/${encodeURIComponent(skill)}`),
  applicationAnalysis: () => client.get("/insights/applications").then((r) => r.data),
  applicationSummary: () => client.get("/insights/applications/summary").then((r) => r.data),
  generateApplicationSummary: () =>
    client.post("/insights/applications/summary").then((r) => r.data),
};
