import { ApiError, api } from '../../../lib/api';
import { RepoContentShell } from '../../../features/repo-details/components/repo-content-shell';

function decodeRepoId(raw: string) {
  return raw.includes('--') ? raw.replace('--', '/') : raw;
}

function toInitialLockedState<T>(error: unknown) {
  if (error instanceof ApiError && error.status === 402) {
    return {
      data: null,
      error: 'Locked behind x402 paid access.',
      locked: true
    };
  }

  return {
    data: null,
    error: error instanceof Error ? error.message : null,
    locked: false
  };
}

export default async function RepoDetailPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId: rawRepoId } = await params;
  const fallbackRepoId = decodeRepoId(rawRepoId);

  try {
    const repo = await api.getRepo(fallbackRepoId);
    const [manifestState, treeState, fileState] = await Promise.all([
      api.getManifest(repo.id)
        .then((data) => ({ data, error: null, locked: false }))
        .catch((error) => toInitialLockedState(error)),
      api.getTree(repo.id)
        .then((data) => ({ data, error: null, locked: false }))
        .catch((error) => toInitialLockedState(error)),
      api.getFile(repo.id, 'README.md')
        .then((data) => ({ data, error: null, locked: false }))
        .catch((error) => toInitialLockedState(error))
    ]);

    return (
      <main className="mx-auto min-h-screen max-w-7xl space-y-6 px-6 py-10 md:px-10">
        <RepoContentShell
          initialFile={fileState}
          initialManifest={manifestState}
          initialTree={treeState}
          repo={repo}
        />
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
