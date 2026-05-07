import { supabase } from './supabase.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function apiGet(path) {
  const headers = await getAuthHeaders();
  const r = await fetch(`${API_BASE}${path}`, { headers });
  if (!r.ok) throw new Error((await r.json()).error || `GET ${path} failed`);
  return r.json();
}

export async function apiPost(path, body) {
  const headers = await getAuthHeaders();
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).error || `POST ${path} failed`);
  return r.json();
}

export async function apiPatch(path, body) {
  const headers = await getAuthHeaders();
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json()).error || `PATCH ${path} failed`);
  return r.json();
}

export async function apiUpload(path, file) {
  const headers = await getAuthHeaders();
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: fd,
  });
  if (!r.ok) throw new Error((await r.json()).error || `Upload failed`);
  return r.json();
}

export function apiDownloadUrl(path) {
  // For file downloads, must include token in the URL since downloads can't set headers
  // Use this for export endpoints that the server reads via Authorization header
  return `${API_BASE}${path}`;
}

export async function apiDownload(path, filename) {
  const headers = await getAuthHeaders();
  const r = await fetch(`${API_BASE}${path}`, { headers });
  if (!r.ok) throw new Error('Download failed');
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
