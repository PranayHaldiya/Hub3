import type { RepoTreeResponse } from '@hub3/shared';

export function TreePanel({ tree }: { tree: RepoTreeResponse | null }) {
  return (
    <section className="card rounded-[28px] p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Repository Tree</p>
      <div className="mt-4 space-y-3 text-sm text-stone-800">
        {tree?.entries?.length ? tree.entries.map((entry) => (
          <div className="flex items-center justify-between border-b border-stone-200/80 pb-3" key={entry.path}>
            <span>{entry.path}</span>
            <span className="text-stone-500">{entry.size ?? '-'} bytes</span>
          </div>
        )) : <p>No files yet.</p>}
      </div>
    </section>
  );
}