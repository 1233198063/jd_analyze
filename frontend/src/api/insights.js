import client from "./client";

export const insightsApi = {
  resumeGaps: (scope = "all") =>
    client.get("/insights/resume-gaps", { params: { scope } }).then((r) => r.data),
};
