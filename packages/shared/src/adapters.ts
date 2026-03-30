import type { GithubRepo, GithubUser, Hub3Repo, PricingConfig, PublishJob, PublishRepoRequest, RepoAccess, RepoManifest } from "./contracts";

export interface SourceControlAdapter {
  getAuthorizationUrl(state: string): Promise<{ authorizationUrl: string; state: string }>;
  exchangeCodeForSession(code: string): Promise<{ accessToken: string; user: GithubUser }>;
  getCurrentUser(accessToken: string): Promise<GithubUser>;
  getRepoAccess(accessToken: string, fullName: string): Promise<RepoAccess>;
  listPublicRepos(accessToken: string): Promise<GithubRepo[]>;
  resolveRepoRef(accessToken: string, fullName: string, ref?: string): Promise<{ defaultBranch: string; commitSha: string }>;
  downloadRepoSnapshot(accessToken: string, fullName: string, ref?: string): Promise<{ archiveUrl: string; buffer: Buffer }>;
}

export interface StorageAdapter {
  uploadArtifact(input: {
    repoId: string;
    fileName: string;
    contents: Buffer;
  }): Promise<{ contentId: string; gatewayUrl: string }>;
  uploadManifest(manifest: RepoManifest): Promise<{ contentId: string; gatewayUrl: string }>;
  getManifest(contentId: string): Promise<RepoManifest>;
}

export interface OwnershipAdapter {
  createOrUpdateRepo(input: {
    repo: Hub3Repo;
    manifestId: string;
    commitSha: string;
    walletAddress: string;
  }): Promise<{ signature: string }>;
  setPricing(repoId: string, pricing: PricingConfig): Promise<{ signature: string }>;
  getRepo(repoId: string): Promise<Hub3Repo | null>;
  getPublishJob(jobId: string): Promise<PublishJob | null>;
}

export interface PublishPipeline {
  publish(input: PublishRepoRequest, accessToken: string): Promise<PublishJob>;
  refresh(repoId: string, accessToken: string): Promise<PublishJob>;
}
