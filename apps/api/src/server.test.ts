import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type {
  GithubRepo,
  GithubUser,
  Hub3Repo,
  OwnershipAdapter,
  PublishJob,
  RepoManifest,
  SourceControlAdapter,
  StorageAdapter
} from '@hub3/shared';

process.env.NODE_ENV = 'test';

const { buildServer } = await import('./server');
const { clearDb, closeDb } = await import('./db');
const { manifestStore, repoStore } = await import('./data');

const fakeGithubUser: GithubUser = {
  id: 101,
  login: 'hub3-builder',
  avatarUrl: 'https://avatars.githubusercontent.com/u/9919?v=4',
  name: 'Hub3 Builder'
};

class FakeSourceControlAdapter implements SourceControlAdapter {
  async getAuthorizationUrl(state: string) {
    return {
      authorizationUrl: `https://github.com/login/oauth/authorize?client_id=test&state=${state}`,
      state
    };
  }

  async exchangeCodeForSession(_code: string) {
    return {
      accessToken: 'test-access-token',
      user: fakeGithubUser
    };
  }

  async getCurrentUser() {
    return fakeGithubUser;
  }

  async listPublicRepos(): Promise<GithubRepo[]> {
    return [{
      id: 1,
      name: 'hub3-demo',
      fullName: 'hub3-labs/hub3-demo',
      description: 'Reference repository for Hub3 publishing flows',
      defaultBranch: 'main',
      headSha: '8f5b83e924a1966e818a31564456020f476f77b2',
      isPrivate: false,
      htmlUrl: 'https://github.com/hub3-labs/hub3-demo',
      updatedAt: new Date().toISOString()
    }];
  }

  async resolveRepoRef() {
    return {
      defaultBranch: 'main',
      commitSha: '8f5b83e924a1966e818a31564456020f476f77b2'
    };
  }

  async downloadRepoSnapshot(_accessToken: string, fullName: string) {
    const zip = new JSZip();
    zip.file('repo/README.md', `# ${fullName}\n`);
    zip.file('repo/src/index.ts', 'export const hello = "world";\n');

    return {
      archiveUrl: `https://example.test/${fullName}.zip`,
      buffer: await zip.generateAsync({ type: 'nodebuffer' })
    };
  }
}

class FakeStorageAdapter implements StorageAdapter {
  async uploadArtifact(input: { repoId: string; fileName: string }) {
    return {
      contentId: `${input.repoId}-${input.fileName}-artifact`,
      gatewayUrl: 'https://example.test/artifact'
    };
  }

  async uploadManifest(manifest: RepoManifest) {
    const contentId = `${manifest.hub3RepoId}-manifest`;
    await manifestStore.set(contentId, manifest);
    return {
      contentId,
      gatewayUrl: 'https://example.test/manifest'
    };
  }

  async getManifest(contentId: string) {
    const manifest = await manifestStore.get(contentId);
    if (!manifest) {
      throw new Error('Manifest missing');
    }

    return manifest;
  }
}

class FakeOwnershipAdapter implements OwnershipAdapter {
  async createOrUpdateRepo(input: { repo: Hub3Repo; manifestId: string; commitSha: string }) {
    await repoStore.set(input.repo.id, {
      ...input.repo,
      latestPublishedManifestId: input.manifestId,
      latestCommitSha: input.commitSha,
      status: 'published',
      updatedAt: new Date().toISOString()
    });

    return { signature: `sig_${input.repo.id}` };
  }

  async setPricing(repoId: string, pricing: Hub3Repo['pricing']) {
    const repo = await repoStore.get(repoId);
    if (!repo) {
      throw new Error('Repo missing');
    }

    await repoStore.set(repoId, {
      ...repo,
      pricing,
      updatedAt: new Date().toISOString()
    });
    return { signature: `pricing_${repoId}` };
  }

  async getRepo(repoId: string) {
    return repoStore.get(repoId);
  }

  async getPublishJob(_jobId: string): Promise<PublishJob | null> {
    return null;
  }
}

describe('Hub3 API', () => {
  beforeEach(async () => {
    await clearDb();
  });

  afterEach(async () => {
    await closeDb();
  });

  it('publishes a repo and returns a readable manifest', async () => {
    const app = await buildServer({
      sourceControl: new FakeSourceControlAdapter(),
      storage: new FakeStorageAdapter(),
      ownership: new FakeOwnershipAdapter()
    });

    const start = await app.inject({
      method: 'POST',
      url: '/auth/github/start'
    });
    expect(start.statusCode).toBe(200);
    const state = start.json<{ state: string }>().state;

    const callback = await app.inject({
      method: 'GET',
      url: `/auth/github/callback?code=test-code&state=${state}`
    });
    expect(callback.statusCode).toBe(302);
    const cookie = callback.cookies[0]?.value;

    const publish = await app.inject({
      method: 'POST',
      url: '/repos/publish',
      headers: {
        cookie: `hub3_session=${cookie}`
      },
      payload: {
        sourceRepoFullName: 'hub3-labs/hub3-demo',
        walletAddress: 'Hub3Wallet1111111111111111111111111111111',
        initiatedBy: 'user'
      }
    });

    expect(publish.statusCode).toBe(200);
    const payload = publish.json<{ hub3RepoId: string }>();

    const repo = await app.inject({
      method: 'GET',
      url: `/repos/${payload.hub3RepoId}`
    });
    expect(repo.statusCode).toBe(200);

    const manifest = await app.inject({
      method: 'GET',
      url: `/repos/${payload.hub3RepoId}/manifest`
    });
    expect(manifest.statusCode).toBe(200);

    const tree = await app.inject({
      method: 'GET',
      url: `/repos/${payload.hub3RepoId}/tree`
    });
    expect(tree.statusCode).toBe(200);

    await app.close();
  }, 15_000);
});
