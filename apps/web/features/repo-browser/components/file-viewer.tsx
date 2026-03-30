import type { RepoFileResponse } from '@hub3/shared';

export function FileViewer({ file, locked = false }: { file: RepoFileResponse | null; locked?: boolean }) {
  return (
    <section className="card rounded-[28px] p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-stone-500">File Viewer</p>
      <pre className="mt-4 overflow-x-auto rounded-[20px] bg-stone-950 p-5 text-sm leading-7 text-stone-100">
        {locked
          ? 'This file is behind x402 payment enforcement.'
          : file?.contents ?? 'Select a published repository file to inspect its contents.'}
      </pre>
    </section>
  );
}
