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

export const repoAccessSchema = z.object({
  defaultBranch: z.string(),
  permissions: z.object({
    admin: z.boolean(),
    push: z.boolean(),
    pull: z.boolean()
  })
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

export const updateRepoPricingRequestSchema = pricingConfigSchema;

export const updateRepoPricingResponseSchema = z.object({
  repo: hub3RepoSchema,
  signature: z.string()
});

export const hub3AgentWalletStatusSchema = z.enum(["not_configured", "provisioning", "active", "error"]);
export const hub3AgentActionTypeSchema = z.enum(["unlock", "publish", "refresh", "set_pricing", "configure_policy", "approve"]);
export const hub3AgentActionStatusSchema = z.enum(["requested", "approved", "blocked", "completed", "failed"]);

export const hub3AgentWalletSchema = z.object({
  ownerId: z.string(),
  status: hub3AgentWalletStatusSchema,
  walletAddress: z.string().nullable(),
  vaultId: z.string().nullable(),
  signerUrl: z.string().nullable(),
  lastError: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const hub3AgentPolicyInputSchema = z.object({
  active: z.boolean().default(true),
  allowedActions: z.array(hub3AgentActionTypeSchema).min(1),
  allowedRepoPatterns: z.array(z.string()).default([]),
  maxSpendPerTransaction: z.string().regex(/^\d+$/),
  dailySpendLimit: z.string().regex(/^\d+$/),
  requireApprovalAbove: z.string().regex(/^\d+$/),
  notes: z.string().nullable().default(null)
});

export const hub3AgentPolicySchema = hub3AgentPolicyInputSchema.extend({
  ownerId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const hub3AgentActivitySchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  repoId: z.string().nullable(),
  actionType: hub3AgentActionTypeSchema,
  status: hub3AgentActionStatusSchema,
  actor: z.enum(["user", "agent", "system"]),
  title: z.string(),
  detail: z.string().nullable(),
  amount: z.string().nullable(),
  tokenMint: z.string().nullable(),
  transactionSignature: z.string().nullable(),
  createdAt: z.string()
});

export const hub3PaymentReceiptSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  repoId: z.string().nullable(),
  resource: z.enum(["repo_access", "publish", "refresh"]),
  amount: z.string(),
  tokenMint: z.string(),
  payerWallet: z.string().nullable(),
  transactionSignature: z.string().nullable(),
  createdAt: z.string()
});

export const hub3AgentRefreshCheckSchema = z.object({
  repoId: z.string(),
  repoFullName: z.string(),
  allowed: z.boolean(),
  reason: z.string().nullable(),
  walletReady: z.boolean(),
  policyActive: z.boolean(),
  actionEnabled: z.boolean(),
  matchedPattern: z.string().nullable()
});

export const hub3AgentRefreshRunResponseSchema = hub3AgentRefreshCheckSchema.extend({
  status: hub3AgentActionStatusSchema,
  job: publishRepoResponseSchema.nullable()
});

export const hub3DashboardSummaryResponseSchema = z.object({
  wallet: hub3AgentWalletSchema,
  policy: hub3AgentPolicySchema,
  recentActivity: z.array(hub3AgentActivitySchema),
  recentReceipts: z.array(hub3PaymentReceiptSchema)
});

export const repoAccessModeSchema = z.enum(["public", "maintainer", "payment", "locked"]);

export const repoAccessStatusResponseSchema = z.object({
  repoId: z.string(),
  pricing: pricingConfigSchema,
  accessMode: repoAccessModeSchema,
  hasAccess: z.boolean(),
  requiresPayment: z.boolean(),
  expiresAt: z.string().nullable(),
  payerWallet: z.string().nullable()
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
export type RepoAccess = z.infer<typeof repoAccessSchema>;
export type RepoManifest = z.infer<typeof repoManifestSchema>;
export type Hub3Repo = z.infer<typeof hub3RepoSchema>;
export type PublishJob = z.infer<typeof publishJobSchema>;
export type GithubUser = z.infer<typeof githubUserSchema>;
export type GithubRepo = z.infer<typeof githubRepoSchema>;
export type StartGithubAuthResponse = z.infer<typeof startGithubAuthResponseSchema>;
export type GithubCallbackResponse = z.infer<typeof githubCallbackResponseSchema>;
export type PublishRepoRequest = z.infer<typeof publishRepoRequestSchema>;
export type PublishRepoResponse = z.infer<typeof publishRepoResponseSchema>;
export type UpdateRepoPricingRequest = z.infer<typeof updateRepoPricingRequestSchema>;
export type UpdateRepoPricingResponse = z.infer<typeof updateRepoPricingResponseSchema>;
export type Hub3AgentWalletStatus = z.infer<typeof hub3AgentWalletStatusSchema>;
export type Hub3AgentActionType = z.infer<typeof hub3AgentActionTypeSchema>;
export type Hub3AgentActionStatus = z.infer<typeof hub3AgentActionStatusSchema>;
export type Hub3AgentWallet = z.infer<typeof hub3AgentWalletSchema>;
export type Hub3AgentPolicyInput = z.infer<typeof hub3AgentPolicyInputSchema>;
export type Hub3AgentPolicy = z.infer<typeof hub3AgentPolicySchema>;
export type Hub3AgentActivity = z.infer<typeof hub3AgentActivitySchema>;
export type Hub3PaymentReceipt = z.infer<typeof hub3PaymentReceiptSchema>;
export type Hub3AgentRefreshCheck = z.infer<typeof hub3AgentRefreshCheckSchema>;
export type Hub3AgentRefreshRunResponse = z.infer<typeof hub3AgentRefreshRunResponseSchema>;
export type Hub3DashboardSummaryResponse = z.infer<typeof hub3DashboardSummaryResponseSchema>;
export type RepoAccessMode = z.infer<typeof repoAccessModeSchema>;
export type RepoAccessStatusResponse = z.infer<typeof repoAccessStatusResponseSchema>;
export type RepoTreeResponse = z.infer<typeof repoTreeResponseSchema>;
export type RepoFileResponse = z.infer<typeof repoFileResponseSchema>;

