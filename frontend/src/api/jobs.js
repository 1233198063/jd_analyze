import client from "./client";

export const jobsApi = {
  submit: (payload) => client.post("/jobs/", payload).then((r) => r.data),
  list: (params) => client.get("/jobs/", { params }).then((r) => r.data),
  get: (id) => client.get(`/jobs/${id}`).then((r) => r.data),
  rescore: (id) => client.post(`/jobs/${id}/rescore`).then((r) => r.data),
  rescoreAll: () => client.post("/jobs/rescore-all").then((r) => r.data),
  getReferral: (id) => client.get(`/jobs/${id}/referral`).then((r) => r.data),
  getCoverLetter: (id) => client.get(`/jobs/${id}/cover-letter`).then((r) => r.data),
  getInterviewAnswer: (id, question) =>
    client.post(`/jobs/${id}/interview-answer`, { question }).then((r) => r.data),
  getResumePick: (id) => client.get(`/jobs/${id}/resume-pick`).then((r) => r.data),
  getResumeRevision: (id) => client.get(`/jobs/${id}/resume-revision`).then((r) => r.data),
  generateResumeRevision: (id, resumeId) =>
    client
      .post(`/jobs/${id}/resume-revision`, null, { params: resumeId ? { resume_id: resumeId } : {} })
      .then((r) => r.data),
  tailorResume: (id) => client.post(`/jobs/${id}/tailor-resume`).then((r) => r.data),
  getTailoredResume: (id) => client.get(`/jobs/${id}/tailor-resume`).then((r) => r.data),
  // Streams raw text chunks from the tailor-resume protocol (===RESUME===...===META===...===END===).
  // onChunk(delta, fullTextSoFar) fires as each piece arrives; resolves with the full text at the end.
  tailorResumeStream: async (id, onChunk, signal) => {
    const res = await fetch(`/api/v1/jobs/${id}/tailor-resume/stream`, { method: "POST", signal });
    if (!res.ok) {
      let detail = `Stream request failed (${res.status})`;
      try {
        detail = (await res.json())?.detail || detail;
      } catch {
        // response body wasn't JSON — keep the generic message
      }
      throw new Error(detail);
    }
    if (!res.body) throw new Error("Streaming not supported by this browser/response");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const delta = decoder.decode(value, { stream: true });
      full += delta;
      onChunk(delta, full);
    }
    return full;
  },
  discoverStart: () => client.post("/jobs/discover").then((r) => r.data),
  discoverStatus: () => client.get("/jobs/discover/status").then((r) => r.data),
};
