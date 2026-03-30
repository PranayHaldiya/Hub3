import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GithubSession } from './auth';
import { createGithubSession, createOauthState, consumeOauthState, getGithubSession } from './auth';
import { beginPaidReadAccess, finalizePaidReadAccess } from './x402';
import { config } from './config';
import {
  githubCallbackResponseSchema,
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
import { manifestStore, publishJobStore, repoAccessGrantStore, repoFilesStore, repoStore } from './data';
import { PublishService } from './publish-service';

export type RouteDependencies = {
  sourceControl?: SourceControlAdapter;
  storage?: StorageAdapter;
  ownership?: OwnershipAdapter;
};

async function requireSession(request: FastifyRequest): Promise<GithubSession> {
  const sessionId = request.cookies[config.HUB3_SESSION_COOKIE_NAME];
  const session = await getGithubSession(sessionId);
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

  app.get('/health', async () => ({
    ok: true,
    services: {
      githubConfigured: config.hasGithubConfig,
      databaseConfigured: config.hasDatabaseConfig,
      irysConfigured: config.hasIrysConfig,
      ownershipConfigured: config.hasOwnershipConfig
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

  app.post('/repos/publish', async (request, reply) => {
    try {
      const session = await requireSession(request);
      const body = publishRepoRequestSchema.parse(request.body);
      const job = await publishService.publish(body, session.accessToken);
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
