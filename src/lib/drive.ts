// Simple Google Drive client using Google Identity Services (GIS) for OAuth token
// Scope required: https://www.googleapis.com/auth/drive.file

export const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
// Βρες/δημιούργησε από Google Cloud Console → Credentials → OAuth 2.0 Client IDs

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

declare const google: any;

export async function getAccessTokenInteractive(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;

  const tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.file',
    callback: (resp: TokenResponse) => {
      cachedToken = resp.access_token;
      tokenExpiresAt = Date.now() + resp.expires_in * 1000;
    },
  });
  tokenClient.requestAccessToken({ prompt: 'consent' });

  await new Promise((r) => setTimeout(r, 300));
  if (!cachedToken) throw new Error('Token fetch failed');
  return cachedToken;
}

async function driveFetch(path: string, options: RequestInit, token: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Drive API error ${res.status}`);
  return res;
}

async function driveUpload(path: string, options: RequestInit, token: string) {
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Drive Upload error ${res.status}`);
  return res;
}

export async function ensureFolder(token: string, name: string, manualFolderId?: string): Promise<string> {
  if (manualFolderId) return manualFolderId;

  // search existing
  const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const res = await driveFetch(`/files?q=${q}&fields=files(id,name)`, {}, token);
  const data = await res.json();
  if (data.files && data.files.length > 0) return data.files[0].id as string;

  // create folder
  const createRes = await driveFetch('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  }, token);
  const created = await createRes.json();
  return created.id as string;
}

export async function uploadJson(token: string, folderId: string, filename: string, data: object) {
  const metadata = { name: filename, parents: [folderId], mimeType: 'application/json' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));

  const res = await driveUpload('/files?uploadType=multipart&fields=id,webViewLink,webContentLink', {
    method: 'POST',
    body: form,
  }, token);
  return res.json();
}

export async function uploadImageBlob(token: string, folderId: string, filename: string, blob: Blob) {
  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const res = await driveUpload('/files?uploadType=multipart&fields=id,webViewLink,webContentLink', {
    method: 'POST',
    body: form,
  }, token);
  const file = await res.json();

  // make public readable
  await driveFetch(`/files/${file.id}/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  }, token);

  return file as { id: string; webContentLink: string; webViewLink: string };
}


