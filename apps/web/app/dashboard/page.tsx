import { DashboardClient } from '../../components/dashboard-client';

export default function DashboardPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10 md:px-10">
      <section className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Dashboard</p>
          <h1 className="display mt-3 text-5xl text-stone-900">Select a repository and publish it into Hub3.</h1>
        </div>
      </section>
      <DashboardClient />
    </main>
  );
}