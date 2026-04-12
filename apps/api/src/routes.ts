import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GithubSession } from './auth';
import { createGithubSession, createOauthState, consumeOauthState, getGithubSession } from './auth';
import { beginPaidReadAccess, finalizePaidReadAccess } from './x402';
import { config } from './config';
import {
  githubCallbackResponseSchema,
  hub3AgentActivitySchema,
  hub3AgentPolicyInputSchema,
  hub3AgentPolicySchema,
  hub3AgentRefreshCheckSchema,
  hub3AgentRefreshRunResponseSchema,
  hub3AgentWalletSchema,
  hub3DashboardSummaryResponseSchema,
  hub3PaymentReceiptSchema,
  hub3RepoSchema,
  publishRepoRequestSchema,
  publishRepoResponseSchema,
  repoAccessStatusResponseSchema,
  repoFileResponseSchema,
  repoManifestSchema,
  repoTreeResponseSchema,
  startGithubAuthResponseSchema,
  updateRepoPricingRequestSchema,
  updateRepoPricingResponseSchema,
  type OwnershipAdapter,
  type SourceControlAdapter,
  type StorageAdapter
} from '@hub3/shared';
import { createOwnershipAdapter, createSourceControlAdapter, createStorageAdapter } from './adapters';
import {
  agentActivityStore,
  agentPolicyStore,
  agentWalletSecretStore,
  agentWalletStore,
  manifestStore,
  paymentReceiptStore,
  publishJobStore,
  repoAccessGrantStore,
  repoFilesStore,
  repoStore
} from './data';
import { PublishService } from './publish-service';
import { createAgentSignerClient } from './signer';

export type RouteDependencies = {
  sourceControl?: SourceControlAdapter;
  storage?: StorageAdapter;
  ownership?: OwnershipAdapter;
};

async function getOptionalSession(request: FastifyRequest) {
  const sessionId = request.cookies[config.HUB3_SESSION_COOKIE_NAME];
  if (!sessionId) {
    return null;
  }

  return getGithubSession(sessionId);
}

async function requireSession(request: FastifyRequest): Promise<GithubSession> {
  const session = await getOptionalSession(request);
  if (!session) {
    throw new Error('GitHub session missing');
  }
  return session;
}

async function hasGithubWriteAccess(request: FastifyRequest, sourceControl: SourceControlAdapter, repoFullName: string) {
  try {
    const session = await requireSession(request);
    const access = await sourceControl.getRepoAccess(session.accessToken, repoFullName);
    return access.permissions.admin || access.permissions.push;
  } catch {
    return false;
  }
}

async function hasRepoAccessGrant(request: FastifyRequest, repoId: string) {
  const grantId = request.cookies[config.HUB3_REPO_ACCESS_COOKIE_NAME];
  return Boolean(await repoAccessGrantStore.get(repoId, grantId));
}

async function getRepoAccessGrant(request: FastifyRequest, repoId: string) {
  const grantId = request.cookies[config.HUB3_REPO_ACCESS_COOKIE_NAME];
  return repoAccessGrantStore.get(repoId, grantId);
}

function serializeTimestamp(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function escapePattern(pattern: string) {
  return pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function findRepoPatternMatch(patterns: string[], repoFullName: string) {
  if (patterns.length === 0) {
    return '*';
  }

  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed === '*') {
      return trimmed;
    }

    const expression = new RegExp(`^${escapePattern(trimmed).replace(/\\\*/g, '.*')}$`, 'i');
    if (expression.test(repoFullName)) {
      return trimmed;
    }
  }

  return null;
}

async function evaluateAgentRefreshAction(ownerId: string, repoId: string) {
  const [repo, wallet, policy] = await Promise.all([
    repoStore.get(repoId),
    agentWalletStore.get(ownerId),
    agentPolicyStore.get(ownerId)
  ]);

  if (!repo) {
    return null;
  }

  const matchedPattern = findRepoPatternMatch(policy.allowedRepoPatterns, repo.sourceRepoFullName);
  const walletReady = wallet.status === 'active' && Boolean(wallet.walletAddress && wallet.vaultId);
  const actionEnabled = policy.allowedActions.includes('refresh');
  let reason: string | null = null;

  if (!repo.latestPublishedManifestId) {
    reason = 'Publish this repository into Hub3 before asking the agent to refresh it.';
  } else if (!walletReady) {
    reason = 'Provision the Hub3 OWS wallet before running agent refresh.';
  } else if (!policy.active) {
    reason = 'Enable the Hub3 agent policy before running refresh actions.';
  } else if (!actionEnabled) {
    reason = 'Policy currently blocks refresh actions.';
  } else if (!matchedPattern) {
    reason = 'This repository is outside the policy allowlist.';
  }

  return hub3AgentRefreshCheckSchema.parse({
    repoId: repo.id,
    repoFullName: repo.sourceRepoFullName,
    allowed: reason === null,
    reason,
    walletReady,
    policyActive: policy.active,
    actionEnabled,
    matchedPattern
  });
}

async function beginRepoContentAccess(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  repo: Awaited<ReturnType<typeof repoStore.get>>;
  manifest: Awaited<ReturnType<typeof manifestStore.get>>;
  sourceControl: SourceControlAdapter;
  description: string;
}) {
  if (!input.repo || !input.manifest || !input.repo.pricing.active) {
    return null;
  }

  if (await hasRepoAccessGrant(input.request, input.repo.id)) {
    return null;
  }

  const canBypass = await hasGithubWriteAccess(input.request, input.sourceControl, input.repo.sourceRepoFullName);
  if (canBypass) {
    return null;
  }

  return beginPaidReadAccess({
    request: input.request,
    reply: input.reply,
    repo: input.repo,
    manifest: input.manifest,
    description: input.description,
    mimeType: 'application/json'
  });
}

export async function registerRoutes(app: FastifyInstance, overrides: RouteDependencies = {}) {
  const sourceControl = overrides.sourceControl ?? createSourceControlAdapter();
  const storage = overrides.storage ?? createStorageAdapter();
  const ownership = overrides.ownership ?? createOwnershipAdapter();
  const publishService = new PublishService(sourceControl, storage, ownership);
  const signer = createAgentSignerClient();

  app.get('/health', async () => ({
    ok: true,
    services: {
      githubConfigured: config.hasGithubConfig,
      databaseConfigured: config.hasDatabaseConfig,
      irysConfigured: config.hasIrysConfig,
      ownershipConfigured: config.hasOwnershipConfig,
      signerConfigured: config.hasSignerConfig
    }
  }));

  app.post('/auth/github/start', async () => {
    const state = await createOauthState();
    return startGithubAuthResponseSchema.parse(await sourceControl.getAuthorizationUrl(state));
  });

  app.get('/auth/github/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string };

    if (!query.code || !query.state || !(await consumeOauthState(query.state))) {
      return reply.badRequest('Invalid GitHub OAuth state');
    }

    const { accessToken, user } = await sourceControl.exchangeCodeForSession(query.code);
    const sessionId = await createGithubSession({ accessToken, user });

    reply.setCookie(config.HUB3_SESSION_COOKIE_NAME, sessionId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax'
    });

    return reply.redirect(`${config.HUB3_WEB_URL}/dashboard`);
  });

  app.get('/github/me', async (request, reply) => {
    try {
      const session = await requireSession(request);
      return sourceControl.getCurrentUser(session.accessToken);
    } catch {
      return reply.unauthorized('GitHub session missing');
    }
  });

  app.get('/github/repos', async (request, reply) => {
    try {
      const session = await requireSession(request);
      return sourceControl.listPublicRepos(session.accessToken);
    } catch {
      return reply.unauthorized('GitHub session missing');
    }
  });

  app.get('/repos/mine', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const [knownRepos, githubRepos] = await Promise.all([
        repoStore.list(),
        sourceControl.listPublicRepos(session.accessToken)
      ]);
      const visibleRepoNames = new Set(githubRepos.map((repo) => repo.fullName));
      return hub3RepoSchema.array().parse(
        knownRepos.filter((repo) => repo.ownerGithubLogin === session.user.login || visibleRepoNames.has(repo.sourceRepoFullName))
      );
    } catch {
      return reply.unauthorized('GitHub session missing');
    }
  });

  app.get('/dashboard/summary', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const ownerId = session.user.login;
      const [wallet, policy, recentActivity, recentReceipts] = await Promise.all([
        agentWalletStore.get(ownerId),
        agentPolicyStore.get(ownerId),
        agentActivityStore.list(ownerId, 8),
        paymentReceiptStore.list(ownerId, 8)
      ]);

      return hub3DashboardSummaryResponseSchema.parse({
        wallet,
        policy,
        recentActivity,
        recentReceipts
      });
    } catch {
      return reply.unauthorized('GitHub session missing');
    }
  });

  app.get('/agent/wallet', async (request, reply) => {
    try {
      const session = await requireSession(request);
      return hub3AgentWalletSchema.parse(await agentWalletStore.get(session.user.login));
    } catch {
      return reply.unauthorized('GitHub session missing');
    }
  });

  app.post('/agent/wallet/provision', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const ownerId = session.user.login;
      const currentWallet = await agentWalletStore.get(ownerId);
      const storedMnemonic = await agentWalletSecretStore.get(ownerId);
      const vaultId = currentWallet.vaultId ?? `hub3:${ownerId}`;

      const provisioned = await signer.provisionWallet({
        vaultId,
        mnemonic: storedMnemonic
      });

      await agentWalletSecretStore.set(ownerId, provisioned.mnemonic);
      const wallet = await agentWalletStore.set(ownerId, {
        ...currentWallet,
        ownerId,
        status: 'active',
        walletAddress: provisioned.walletAddress,
        vaultId: provisioned.vaultId,
        signerUrl: config.HUB3_SIGNER_URL ?? null,
        lastError: null,
        lastSyncedAt: new Date().toISOString()
      });

      await agentActivityStore.log({
        ownerId,
        repoId: null,
        actionType: 'approve',
        status: 'completed',
        actor: 'system',
        title: 'Provisioned Hub3 OWS wallet',
        detail: `Vault ${provisioned.vaultId} is ready for agent-safe actions.`,
        amount: null,
        tokenMint: null,
        transactionSignature: null
      });

      return hub3AgentWalletSchema.parse(wallet);
    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub session missing') {
        return reply.unauthorized(error.message);
      }

      try {
        const session = await getOptionalSession(request);
        if (session) {
          const currentWallet = await agentWalletStore.get(session.user.login);
          await agentWalletStore.set(session.user.login, {
            ...currentWallet,
            status: 'error',
            lastError: error instanceof Error ? error.message : 'Wallet provisioning failed'
          });
        }
      } catch {
        // Ignore follow-up wallet state update failures.
      }

      return reply.badGateway(error instanceof Error ? error.message : 'Wallet provisioning failed');
    }
  });

  app.get('/agent/policy', async (request, reply) => {
    try {
      const session = await requireSession(request);
      return hub3AgentPolicySchema.parse(await agentPolicyStore.get(session.user.login));
    } catch {
      return reply.unauthorized('GitHub session missing');
    }
  });

  app.post('/agent/policy', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const ownerId = session.user.login;
      const policy = await agentPolicyStore.set(ownerId, hub3AgentPolicyInputSchema.parse(request.body));

      await agentActivityStore.log({
        ownerId,
        repoId: null,
        actionType: 'configure_policy',
        status: 'completed',
        actor: 'user',
        title: 'Updated Hub3 agent policy',
        detail: `Allowed actions: ${policy.allowedActions.join(', ')}`,
        amount: null,
        tokenMint: null,
        transactionSignature: null
      });

      return hub3AgentPolicySchema.parse(policy);
    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub session missing') {
        return reply.unauthorized(error.message);
      }
      throw error;
    }
  });

  app.get('/agent/activity', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const query = request.query as { limit?: string };
      const limit = Math.min(Math.max(Number(query.limit ?? '20') || 20, 1), 50);
      return hub3AgentActivitySchema.array().parse(await agentActivityStore.list(session.user.login, limit));
    } catch {
      return reply.unauthorized('GitHub session missing');
    }
  });

  app.get('/agent/receipts', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const query = request.query as { limit?: string };
      const limit = Math.min(Math.max(Number(query.limit ?? '20') || 20, 1), 50);
      return hub3PaymentReceiptSchema.array().parse(await paymentReceiptStore.list(session.user.login, limit));
    } catch {
      return reply.unauthorized('GitHub session missing');
    }
  });

  app.get('/agent/actions/refresh/:repoId/check', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const params = request.params as { repoId: string };
      const evaluation = await evaluateAgentRefreshAction(session.user.login, params.repoId);
      if (!evaluation) {
        return reply.notFound(`Repo ${params.repoId} not found`);
      }
      return hub3AgentRefreshCheckSchema.parse(evaluation);
    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub session missing') {
        return reply.unauthorized(error.message);
      }
      throw error;
    }
  });

  app.post('/agent/actions/refresh', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const body = request.body as { repoId?: string };
      const repoId = body.repoId;
      if (!repoId) {
        return reply.badRequest('repoId is required');
      }

      const evaluation = await evaluateAgentRefreshAction(session.user.login, repoId);
      if (!evaluation) {
        return reply.notFound(`Repo ${repoId} not found`);
      }

      if (!evaluation.allowed) {
        await agentActivityStore.log({
          ownerId: session.user.login,
          repoId: evaluation.repoId,
          actionType: 'refresh',
          status: 'blocked',
          actor: 'agent',
          title: `Blocked refresh for ${evaluation.repoFullName}`,
          detail: evaluation.reason,
          amount: null,
          tokenMint: null,
          transactionSignature: null
        });
        return reply.forbidden(evaluation.reason ?? 'Agent refresh is blocked by policy');
      }

      const wallet = await agentWalletStore.get(session.user.login);
      const job = await publishService.refresh(evaluation.repoId, session.accessToken);
      const status = job.status === 'failed' ? 'failed' : 'completed';

      await agentActivityStore.log({
        ownerId: session.user.login,
        repoId: evaluation.repoId,
        actionType: 'refresh',
        status,
        actor: 'agent',
        title: `Agent refreshed ${evaluation.repoFullName}`,
        detail: `Executed through vault ${wallet.vaultId ?? 'untracked vault'} and completed as ${job.status}.`,
        amount: null,
        tokenMint: null,
        transactionSignature: null
      });

      return hub3AgentRefreshRunResponseSchema.parse({
        ...evaluation,
        status,
        job: {
          jobId: job.id,
          hub3RepoId: job.hub3RepoId,
          status: job.status
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub session missing') {
        return reply.unauthorized(error.message);
      }
      throw error;
    }
  });
  app.post('/repos/publish', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const body = publishRepoRequestSchema.parse(request.body);
      const job = await publishService.publish(body, session.accessToken);

      await agentActivityStore.log({
        ownerId: session.user.login,
        repoId: job.hub3RepoId,
        actionType: 'publish',
        status: job.status === 'failed' ? 'failed' : 'completed',
        actor: body.initiatedBy === 'agent' ? 'agent' : 'user',
        title: `Published ${body.sourceRepoFullName}`,
        detail: `Job ${job.id} resolved ${job.resolvedCommitSha ?? 'pending commit resolution'}`,
        amount: null,
        tokenMint: null,
        transactionSignature: null
      });

      return publishRepoResponseSchema.parse({
        jobId: job.id,
        hub3RepoId: job.hub3RepoId,
        status: job.status
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub session missing') {
        return reply.unauthorized(error.message);
      }
      throw error;
    }
  });

  app.get('/publish-jobs/:jobId', async (request, reply) => {
    const params = request.params as { jobId: string };
    const job = await publishJobStore.get(params.jobId);
    if (!job) {
      return reply.notFound(`Job ${params.jobId} not found`);
    }
    return job;
  });

  app.post('/repos/:repoId/refresh', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const params = request.params as { repoId: string };
      const job = await publishService.refresh(params.repoId, session.accessToken);

      await agentActivityStore.log({
        ownerId: session.user.login,
        repoId: params.repoId,
        actionType: 'refresh',
        status: job.status === 'failed' ? 'failed' : 'completed',
        actor: 'agent',
        title: `Refreshed ${job.sourceRepoFullName}`,
        detail: `Job ${job.id} completed with status ${job.status}`,
        amount: null,
        tokenMint: null,
        transactionSignature: null
      });

      return publishRepoResponseSchema.parse({
        jobId: job.id,
        hub3RepoId: job.hub3RepoId,
        status: job.status
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub session missing') {
        return reply.unauthorized(error.message);
      }
      throw error;
    }
  });

  app.post('/repos/:repoId/pricing', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const params = request.params as { repoId: string };
      const repo = await ownership.getRepo(params.repoId);
      if (!repo) {
        return reply.notFound(`Repo ${params.repoId} not found`);
      }

      const access = await sourceControl.getRepoAccess(session.accessToken, repo.sourceRepoFullName);
      if (!(access.permissions.admin || access.permissions.push)) {
        return reply.forbidden('GitHub write access is required to update pricing for this repository');
      }

      const pricing = updateRepoPricingRequestSchema.parse(request.body);
      const { signature } = await ownership.setPricing(repo.id, pricing);
      const updatedRepo = await ownership.getRepo(repo.id);
      if (!updatedRepo) {
        return reply.notFound(`Repo ${params.repoId} not found`);
      }

      await agentActivityStore.log({
        ownerId: session.user.login,
        repoId: repo.id,
        actionType: 'set_pricing',
        status: 'completed',
        actor: 'user',
        title: `Updated pricing for ${repo.sourceRepoFullName}`,
        detail: pricing.active
          ? `Live price set to ${pricing.amount} lamports on ${pricing.tokenMint}`
          : 'Repository switched back to free access',
        amount: pricing.active ? pricing.amount : null,
        tokenMint: pricing.active ? pricing.tokenMint : null,
        transactionSignature: signature
      });

      return updateRepoPricingResponseSchema.parse({
        repo: updatedRepo,
        signature
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'GitHub session missing') {
        return reply.unauthorized(error.message);
      }
      throw error;
    }
  });

  app.get('/repos/:repoId', async (request, reply) => {
    const params = request.params as { repoId: string };
    const repo = await repoStore.get(params.repoId);
    if (!repo) {
      return reply.notFound(`Repo ${params.repoId} not found`);
    }
    return repo;
  });

  app.get('/repos/:repoId/access', async (request, reply) => {
    const params = request.params as { repoId: string };
    const repo = await repoStore.get(params.repoId);
    if (!repo) {
      return reply.notFound(`Repo ${params.repoId} not found`);
    }

    const grant = await getRepoAccessGrant(request, repo.id);
    const canBypass = await hasGithubWriteAccess(request, sourceControl, repo.sourceRepoFullName);

    if (!repo.pricing.active) {
      return repoAccessStatusResponseSchema.parse({
        repoId: repo.id,
        pricing: repo.pricing,
        accessMode: 'public',
        hasAccess: true,
        requiresPayment: false,
        expiresAt: null,
        payerWallet: null
      });
    }

    if (canBypass) {
      return repoAccessStatusResponseSchema.parse({
        repoId: repo.id,
        pricing: repo.pricing,
        accessMode: 'maintainer',
        hasAccess: true,
        requiresPayment: false,
        expiresAt: null,
        payerWallet: null
      });
    }

    if (grant) {
      return repoAccessStatusResponseSchema.parse({
        repoId: repo.id,
        pricing: repo.pricing,
        accessMode: 'payment',
        hasAccess: true,
        requiresPayment: false,
        expiresAt: serializeTimestamp(grant.expiresAt as Date | string | null),
        payerWallet: grant.payerWallet
      });
    }

    return repoAccessStatusResponseSchema.parse({
      repoId: repo.id,
      pricing: repo.pricing,
      accessMode: 'locked',
      hasAccess: false,
      requiresPayment: true,
      expiresAt: null,
      payerWallet: null
    });
  });

  app.get('/repos/:repoId/manifest', async (request, reply) => {
    const params = request.params as { repoId: string };
    const repo = await repoStore.get(params.repoId);
    if (!repo?.latestPublishedManifestId) {
      return reply.notFound(`Manifest for repo ${params.repoId} not found`);
    }

    const manifest = await manifestStore.get(repo.latestPublishedManifestId);
    if (!manifest) {
      return reply.notFound(`Manifest for repo ${params.repoId} not found`);
    }

    const access = await beginRepoContentAccess({
      request,
      reply,
      repo,
      manifest,
      sourceControl,
      description: `Manifest access for ${repo.sourceRepoFullName}`
    });
    if (reply.sent) {
      return;
    }

    const settlement = await finalizePaidReadAccess({
      reply,
      access,
      repoId: repo.id
    });
    if (settlement) {
      return settlement;
    }

    return repoManifestSchema.parse(manifest);
  });

  app.get('/repos/:repoId/tree', async (request, reply) => {
    const params = request.params as { repoId: string };
    const repo = await repoStore.get(params.repoId);
    const manifest = repo?.latestPublishedManifestId
      ? await manifestStore.get(repo.latestPublishedManifestId)
      : null;
    const entries = await repoFilesStore.get(params.repoId);
    if (!repo?.latestPublishedManifestId || !entries) {
      return reply.notFound(`Tree for repo ${params.repoId} not found`);
    }

    const access = await beginRepoContentAccess({
      request,
      reply,
      repo,
      manifest,
      sourceControl,
      description: `Repository tree access for ${repo.sourceRepoFullName}`
    });
    if (reply.sent) {
      return;
    }

    const settlement = await finalizePaidReadAccess({
      reply,
      access,
      repoId: repo.id
    });
    if (settlement) {
      return settlement;
    }

    return repoTreeResponseSchema.parse({
      repoId: params.repoId,
      manifestId: repo.latestPublishedManifestId,
      entries: Object.entries(entries).map(([path, contents]) => ({
        path,
        type: 'file',
        size: contents.length
      }))
    });
  });

  app.get('/repos/:repoId/file', async (request, reply) => {
    const params = request.params as { repoId: string };
    const query = request.query as { path?: string };
    const repo = await repoStore.get(params.repoId);
    const manifest = repo?.latestPublishedManifestId
      ? await manifestStore.get(repo.latestPublishedManifestId)
      : null;
    const files = await repoFilesStore.get(params.repoId);
    const path = query.path ?? 'README.md';

    if (!repo?.latestPublishedManifestId || !files?.[path]) {
      return reply.notFound(`File ${path} for repo ${params.repoId} not found`);
    }

    const access = await beginRepoContentAccess({
      request,
      reply,
      repo,
      manifest,
      sourceControl,
      description: `Repository file access for ${repo.sourceRepoFullName}:${path}`
    });
    if (reply.sent) {
      return;
    }

    const settlement = await finalizePaidReadAccess({
      reply,
      access,
      repoId: repo.id
    });
    if (settlement) {
      return settlement;
    }

    return repoFileResponseSchema.parse({
      repoId: params.repoId,
      manifestId: repo.latestPublishedManifestId,
      path,
      contents: files[path],
      encoding: 'utf-8'
    });
  });
}











