const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || data?.detail || "Request failed.");
    error.payload = data;
    throw error;
  }

  return data;
}

export function resolveAssetUrl(url) {
  if (!url) {
    return null;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `${API_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

export const modelsApi = {
  list() {
    return request("/api/models");
  },
  get(id) {
    return request(`/api/models/${id}`);
  },
  upload(formData) {
    return request("/api/models/upload", {
      method: "POST",
      body: formData
    });
  },
  uploadVideo(formData) {
    return request("/api/models/upload-video", {
      method: "POST",
      body: formData
    });
  },
  update(id, payload) {
    return request(`/api/models/${id}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  },
  remove(id) {
    return request(`/api/models/${id}`, {
      method: "DELETE"
    });
  },
  process(id) {
    return request(`/api/models/${id}/process`, {
      method: "POST"
    });
  },
  markArReady(id) {
    return request(`/api/models/${id}/mark-ar-ready`, {
      method: "POST"
    });
  }
};
