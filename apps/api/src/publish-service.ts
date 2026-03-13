import crypto from 'node:crypto';
import JSZip from 'jszip';
import type {
  OwnershipAdapter,
  PublishJob,
  PublishRepoRequest,
  RepoManifest,
  SourceControlAdapter,
  StorageAdapter
} from '@hub3/shared';
import { makeDraftRepo, publishJobStore, repoStore, setPublishJobStatus, storeRepoFiles } from './data';

async function extractReadableFiles(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files: Record<string, string> = {};

  await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map(async (entry) => {
        const normalizedPath = entry.name.split('/').slice(1).join('/');
        if (!normalizedPath) {
          return;
        }

        const contents = await entry.async('string').catch(() => null);
        if (contents !== null) {
          files[normalizedPath] = contents;
        }
      })
  );

  return files;
}

export class PublishService {
  constructor(
    private readonly sourceControl: SourceControlAdapter,
    private readonly storage: StorageAdapter,
    private readonly ownership: OwnershipAdapter
  ) {}

  async publish(input: PublishRepoRequest, accessToken: string): Promise<PublishJob> {
    const resolved = await this.sourceControl.resolveRepoRef(accessToken, input.sourceRepoFullName, input.ref);
    const repo = await makeDraftRepo(input.sourceRepoFullName, resolved.commitSha);

    const job: PublishJob = {
      id: crypto.randomUUID(),
      hub3RepoId: repo.id,
      sourceRepoFullName: input.sourceRepoFullName,
      requestedRef: input.ref ?? null,
      resolvedCommitSha: null,
      status: 'queued',
      artifactContentId: null,
      manifestContentId: null,
      errorMessage: null,
      initiatedBy: input.initiatedBy,
      startedAt: new Date().toISOString(),
      finishedAt: null
    };

    await publishJobStore.set(job.id, job);
    await setPublishJobStatus(job.id, 'resolving', { resolvedCommitSha: resolved.commitSha });

    try {
      const archive = await this.sourceControl.downloadRepoSnapshot(accessToken, input.sourceRepoFullName, input.ref ?? resolved.defaultBranch);
      await setPublishJobStatus(job.id, 'uploading');
      const artifact = await this.storage.uploadArtifact({
        repoId: repo.id,
        fileName: `${repo.id}.zip`,
        contents: archive.buffer
      });

      const manifest: RepoManifest = {
        hub3RepoId: repo.id,
        sourceProvider: 'github',
        sourceRepoFullName: input.sourceRepoFullName,
        defaultBranch: resolved.defaultBranch,
        commitSha: resolved.commitSha,
        publishMode: 'snapshot',
        artifactKind: 'github-archive',
        rootContentId: artifact.contentId,
        integrity: {
          sha256: crypto.createHash('sha256').update(archive.buffer).digest('hex')
        },
        visibility: 'public',
        publishedAt: new Date().toISOString(),
        publisherWallet: input.walletAddress,
        metadataVersion: 1
      };

      const uploadedManifest = await this.storage.uploadManifest(manifest);
      await setPublishJobStatus(job.id, 'registering', {
        artifactContentId: artifact.contentId,
        manifestContentId: uploadedManifest.contentId
      });

      await this.ownership.createOrUpdateRepo({
        repo,
        manifestId: uploadedManifest.contentId,
        commitSha: resolved.commitSha,
        walletAddress: input.walletAddress
      });

      const files = await extractReadableFiles(archive.buffer).catch(() => ({}));
      await storeRepoFiles(repo.id, {
        ...files,
        'meta/archive-url.txt': `${archive.archiveUrl}\n`
      });

      await setPublishJobStatus(job.id, 'complete');
      return (await publishJobStore.get(job.id))!;
    } catch (error) {
      await setPublishJobStatus(job.id, 'failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown publish error'
      });
      return (await publishJobStore.get(job.id))!;
    }
  }

  async refresh(repoId: string, accessToken: string): Promise<PublishJob> {
    const repo = await repoStore.get(repoId);
    if (!repo) {
      throw new Error(`Repo ${repoId} not found`);
    }

    return this.publish(
      {
        sourceRepoFullName: repo.sourceRepoFullName,
        walletAddress: 'Hub3Refresh111111111111111111111111111111',
        initiatedBy: 'agent'
      },
      accessToken
    );
  }
}
