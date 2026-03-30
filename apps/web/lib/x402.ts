import { createWalletTransactionSigner, type WalletSession } from '@solana/client';
import { x402Client } from '@x402/core/client';
import { x402HTTPClient } from '@x402/core/http';
import { registerExactSvmScheme } from '@x402/svm/exact/client';
import { SOLANA_DEVNET_CAIP2, SOLANA_MAINNET_CAIP2, SOLANA_TESTNET_CAIP2 } from '@x402/svm';
import { ApiError, apiFetch, readApiErrorMessage } from './api';

function inferX402Network(rpcUrl?: string) {
  const normalized = (rpcUrl ?? '').toLowerCase();
  if (normalized.includes('devnet')) {
    return SOLANA_DEVNET_CAIP2;
  }
  if (normalized.includes('testnet')) {
    return SOLANA_TESTNET_CAIP2;
  }
  return SOLANA_MAINNET_CAIP2;
}

const x402Network = inferX402Network(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);

export async function payProtectedResource(path: string, session: WalletSession) {
  const signer = createWalletTransactionSigner(session);
  if (signer.mode !== 'partial') {
    throw new Error('This wallet can connect, but it cannot sign x402 payment payloads yet. Use Phantom, Solflare, or Backpack on desktop.');
  }

  const initialResponse = await apiFetch(path);
  if (initialResponse.ok) {
    return initialResponse;
  }

  if (initialResponse.status !== 402) {
    throw new ApiError(await readApiErrorMessage(initialResponse, path), initialResponse.status);
  }

  const paymentClient = new x402Client();
  registerExactSvmScheme(paymentClient, {
    signer: signer.signer,
    networks: [x402Network]
  });

  const httpClient = new x402HTTPClient(paymentClient);
  const paymentRequired = httpClient.getPaymentRequiredResponse((name) => initialResponse.headers.get(name));
  const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);

  const paidResponse = await apiFetch(path, {
    headers: httpClient.encodePaymentSignatureHeader(paymentPayload)
  });

  if (!paidResponse.ok) {
    throw new ApiError(await readApiErrorMessage(paidResponse, path), paidResponse.status);
  }

  return paidResponse;
}
