import type {
  GithubRepo,
  GithubUser,
  Hub3Repo,
  PricingConfig,
  PublishJob,
  PublishRepoRequest,
  PublishRepoResponse,
  RepoAccessStatusResponse,
  RepoFileResponse,
  RepoManifest,
  RepoTreeResponse,
  StartGithubAuthResponse,
  UpdateRepoPricingResponse
} from '@hub3/shared';

export function apiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    credentials: 'include',
    cache: 'no-store'
  });
}

export async function readApiErrorMessage(response: Response, path?: string) {
  return (await response.text()) || (path ? `Request failed for ${path}` : 'Request failed');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    throw new ApiError(await readApiErrorMessage(response, path), response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  startGithubAuth: () => request<StartGithubAuthResponse>('/auth/github/start', { method: 'POST' }),
  getGithubMe: () => request<GithubUser>('/github/me'),
  listGithubRepos: () => request<GithubRepo[]>('/github/repos'),
  publishRepo: (body: PublishRepoRequest) => request<PublishRepoResponse>('/repos/publish', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  updateRepoPricing: (repoId: string, body: PricingConfig) => request<UpdateRepoPricingResponse>(`/repos/${repoId}/pricing`, {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  getPublishJob: (jobId: string) => request<PublishJob>(`/publish-jobs/${jobId}`),
  getRepo: (repoId: string) => request<Hub3Repo>(`/repos/${repoId}`),
  getRepoAccessStatus: (repoId: string) => request<RepoAccessStatusResponse>(`/repos/${repoId}/access`),
  getManifest: (repoId: string) => request<RepoManifest>(`/repos/${repoId}/manifest`),
  getTree: (repoId: string) => request<RepoTreeResponse>(`/repos/${repoId}/tree`),
  getFile: (repoId: string, path: string) => request<RepoFileResponse>(`/repos/${repoId}/file?path=${encodeURIComponent(path)}`)
};
