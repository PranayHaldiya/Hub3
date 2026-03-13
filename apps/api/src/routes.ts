import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { GithubSession } from './auth';
import { createGithubSession, createOauthState, consumeOauthState, getGithubSession } from './auth';
import { config } from './config';
import {
  githubCallbackResponseSchema,
  publishRepoRequestSchema,
  publishRepoResponseSchema,
  repoFileResponseSchema,
  repoManifestSchema,
  repoTreeResponseSchema,
  startGithubAuthResponseSchema,
  type OwnershipAdapter,
  type SourceControlAdapter,
  type StorageAdapter
} from '@hub3/shared';
import { createOwnershipAdapter, createSourceControlAdapter, createStorageAdapter } from './adapters';
import { manifestStore, publishJobStore, repoFilesStore, repoStore } from './data';
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

  app.get('/repos/:repoId', async (request, reply) => {
    const params = request.params as { repoId: string };
    const repo = await repoStore.get(params.repoId);
    if (!repo) {
      return reply.notFound(`Repo ${params.repoId} not found`);
    }
    return repo;
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

    return repoManifestSchema.parse(manifest);
  });

  app.get('/repos/:repoId/tree', async (request, reply) => {
    const params = request.params as { repoId: string };
    const repo = await repoStore.get(params.repoId);
    const entries = await repoFilesStore.get(params.repoId);
    if (!repo?.latestPublishedManifestId || !entries) {
      return reply.notFound(`Tree for repo ${params.repoId} not found`);
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
    const files = await repoFilesStore.get(params.repoId);
    const path = query.path ?? 'README.md';

    if (!repo?.latestPublishedManifestId || !files?.[path]) {
      return reply.notFound(`File ${path} for repo ${params.repoId} not found`);
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
