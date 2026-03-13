'use client';

import { useState } from 'react';
import { api } from '../../../lib/api';

export function GitHubConnectButton() {
  const [state, setState] = useState<'idle' | 'loading'>('idle');

  return (
    <button
      className="card rounded-full px-5 py-3 text-sm uppercase tracking-[0.24em]"
      onClick={async () => {
        setState('loading');
        const payload = await api.startGithubAuth();
        window.location.href = payload.authorizationUrl;
      }}
      type="button"
    >
      {state === 'loading' ? 'Redirecting...' : 'Connect GitHub'}
    </button>
  );
}