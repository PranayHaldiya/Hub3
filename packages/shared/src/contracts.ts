import { z } from "zod";

export const sourceProviderSchema = z.enum(["github"]);
export const publishModeSchema = z.enum(["snapshot"]);
export const repoStatusSchema = z.enum(["draft", "published", "failed"]);
export const publishJobStatusSchema = z.enum([
  "queued",
  "resolving",
  "uploading",
  "registering",
  "complete",
  "failed"
]);
export const pricingModeSchema = z.enum(["free", "fixed"]);

export const pricingConfigSchema = z.object({
  mode: pricingModeSchema,
  amount: z.string().default("0"),
  tokenMint: z.string().default("So11111111111111111111111111111111111111112"),
  active: z.boolean().default(false)
});

export const repoManifestSchema = z.object({
  hub3RepoId: z.string(),
  sourceProvider: sourceProviderSchema,
  sourceRepoFullName: z.string(),
  defaultBranch: z.string(),
  commitSha: z.string(),
  publishMode: publishModeSchema,
  artifactKind: z.enum(["github-archive"]),
  rootContentId: z.string(),
  integrity: z.object({
    sha256: z.string()
  }),
  visibility: z.literal("public"),
  publishedAt: z.string(),
  publisherWallet: z.string(),
  metadataVersion: z.literal(1)
});

export const hub3RepoSchema = z.object({
  id: z.string(),
  sourceProvider: sourceProviderSchema,
  sourceRepoFullName: z.string(),
  defaultBranch: z.string(),
  ownerGithubLogin: z.string(),
  latestPublishedManifestId: z.string().nullable(),
  latestCommitSha: z.string().nullable(),
  status: repoStatusSchema,
  pricing: pricingConfigSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const publishJobSchema = z.object({
  id: z.string(),
  hub3RepoId: z.string(),
  sourceRepoFullName: z.string(),
  requestedRef: z.string().nullable(),
  resolvedCommitSha: z.string().nullable(),
  status: publishJobStatusSchema,
  artifactContentId: z.string().nullable(),
  manifestContentId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  initiatedBy: z.enum(["user", "agent"]),
  startedAt: z.string(),
  finishedAt: z.string().nullable()
});

export const githubUserSchema = z.object({
  id: z.number(),
  login: z.string(),
  avatarUrl: z.string().url(),
  name: z.string().nullable()
});

export const githubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  fullName: z.string(),
  description: z.string().nullable(),
  defaultBranch: z.string(),
  headSha: z.string(),
  isPrivate: z.boolean(),
  htmlUrl: z.string().url(),
  updatedAt: z.string()
});

export const startGithubAuthResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  state: z.string()
});

export const githubCallbackResponseSchema = z.object({
  connected: z.boolean(),
  user: githubUserSchema
});

export const publishRepoRequestSchema = z.object({
  sourceRepoFullName: z.string().min(3),
  ref: z.string().optional(),
  walletAddress: z.string().min(32),
  initiatedBy: z.enum(["user", "agent"]).default("user")
});

export const publishRepoResponseSchema = z.object({
  jobId: z.string(),
  hub3RepoId: z.string(),
  status: publishJobStatusSchema
});

export const repoTreeEntrySchema = z.object({
  path: z.string(),
  type: z.enum(["file", "directory"]),
  size: z.number().nullable()
});

export const repoTreeResponseSchema = z.object({
  repoId: z.string(),
  manifestId: z.string(),
  entries: z.array(repoTreeEntrySchema)
});

export const repoFileResponseSchema = z.object({
  repoId: z.string(),
  manifestId: z.string(),
  path: z.string(),
  contents: z.string(),
  encoding: z.literal("utf-8")
});

export type SourceProvider = z.infer<typeof sourceProviderSchema>;
export type PublishMode = z.infer<typeof publishModeSchema>;
export type RepoStatus = z.infer<typeof repoStatusSchema>;
export type PublishJobStatus = z.infer<typeof publishJobStatusSchema>;
export type PricingConfig = z.infer<typeof pricingConfigSchema>;
export type RepoManifest = z.infer<typeof repoManifestSchema>;
export type Hub3Repo = z.infer<typeof hub3RepoSchema>;
export type PublishJob = z.infer<typeof publishJobSchema>;
export type GithubUser = z.infer<typeof githubUserSchema>;
export type GithubRepo = z.infer<typeof githubRepoSchema>;
export type StartGithubAuthResponse = z.infer<typeof startGithubAuthResponseSchema>;
export type GithubCallbackResponse = z.infer<typeof githubCallbackResponseSchema>;
export type PublishRepoRequest = z.infer<typeof publishRepoRequestSchema>;
export type PublishRepoResponse = z.infer<typeof publishRepoResponseSchema>;
export type RepoTreeResponse = z.infer<typeof repoTreeResponseSchema>;
export type RepoFileResponse = z.infer<typeof repoFileResponseSchema>;