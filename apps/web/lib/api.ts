import type {
  GithubRepo,
  Hub3Repo,
  PublishJob,
  PublishRepoRequest,
  PublishRepoResponse,
  RepoFileResponse,
  RepoManifest,
  RepoTreeResponse,
  StartGithubAuthResponse
} from '@hub3/shared';

function apiBase() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    credentials: 'include',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${path}`);
  }

  return (await response.json()) as T;
}

export const api = {
  startGithubAuth: () => request<StartGithubAuthResponse>('/auth/github/start', { method: 'POST' }),
  listGithubRepos: () => request<GithubRepo[]>('/github/repos'),
  publishRepo: (body: PublishRepoRequest) => request<PublishRepoResponse>('/repos/publish', {
    method: 'POST',
    body: JSON.stringify(body)
  }),
  getPublishJob: (jobId: string) => request<PublishJob>(`/publish-jobs/${jobId}`),
  getRepo: (repoId: string) => request<Hub3Repo>(`/repos/${repoId}`),
  getManifest: (repoId: string) => request<RepoManifest>(`/repos/${repoId}/manifest`),
  getTree: (repoId: string) => request<RepoTreeResponse>(`/repos/${repoId}/tree`),
  getFile: (repoId: string, path: string) => request<RepoFileResponse>(`/repos/${repoId}/file?path=${encodeURIComponent(path)}`)
};
