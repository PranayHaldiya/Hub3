import { api } from '../../../lib/api';
import { FileViewer } from '../../../features/repo-browser/components/file-viewer';
import { TreePanel } from '../../../features/repo-browser/components/tree-panel';
import { ManifestCard } from '../../../features/repo-details/components/manifest-card';
import { RepoHeader } from '../../../features/repo-details/components/repo-header';

function decodeRepoId(raw: string) {
  return raw.includes('--') ? raw.replace('--', '/') : raw;
}

export default async function RepoDetailPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId: rawRepoId } = await params;
  const fallbackRepoId = decodeRepoId(rawRepoId);

  try {
    const repo = await api.getRepo(fallbackRepoId);
    const [manifest, tree, file] = await Promise.all([
      api.getManifest(repo.id).catch(() => null),
      api.getTree(repo.id).catch(() => null),
      api.getFile(repo.id, 'README.md').catch(() => null)
    ]);

    return (
      <main className="mx-auto min-h-screen max-w-7xl space-y-6 px-6 py-10 md:px-10">
        <RepoHeader repo={repo} manifest={manifest} />
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <ManifestCard manifest={manifest} />
          <TreePanel tree={tree} />
        </div>
        <FileViewer file={file} />
      </main>
    );
  } catch {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
        <section className="card rounded-[32px] p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Repo Preview</p>
          <h1 className="display mt-4 text-4xl text-stone-900">Publish a repository first.</h1>
          <p className="mt-4 text-stone-700">This route is ready for published repos. Trigger a publish from the dashboard and revisit the generated Hub3 repo id.</p>
        </section>
      </main>
    );
  }
}