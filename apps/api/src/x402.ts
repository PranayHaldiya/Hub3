import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader
} from '@x402/core/http';
import {
  HTTPFacilitatorClient,
  type FacilitatorClient,
  x402ResourceServer
} from '@x402/core/server';
import type {
  PaymentPayload,
  PaymentRequirements,
  ResourceInfo,
  SettleResponse,
  SupportedResponse,
  VerifyResponse
} from '@x402/core/types';
import { registerExactSvmScheme } from '@x402/svm/exact/server';
import type { Hub3Repo, RepoManifest } from '@hub3/shared';
import { config } from './config';
import { repoAccessGrantStore } from './data';

type PaidAccessContext = {
  paymentPayload: PaymentPayload;
  requirements: PaymentRequirements;
  payerWallet: string | null;
};

const FALLBACK_SIGNER = '11111111111111111111111111111111';

class TestFacilitatorClient implements FacilitatorClient {
  async verify(): Promise<VerifyResponse> {
    return {
      isValid: false,
      invalidReason: 'test_only',
      invalidMessage: 'Payment verification is not enabled in tests'
    };
  }

  async settle(): Promise<SettleResponse> {
    return {
      success: false,
      errorReason: 'test_only',
      errorMessage: 'Payment settlement is not enabled in tests',
      transaction: '',
      network: config.x402Network
    };
  }

  async getSupported(): Promise<SupportedResponse> {
    return {
      kinds: [{
        x402Version: 2,
        scheme: 'exact',
        network: config.x402Network,
        extra: {
          feePayer: FALLBACK_SIGNER
        }
      }],
      extensions: [],
      signers: {
        [config.x402Network]: [FALLBACK_SIGNER]
      }
    };
  }
}

let resourceServerPromise: Promise<x402ResourceServer> | null = null;

function createFacilitatorClient(): FacilitatorClient {
  if (config.NODE_ENV === 'test') {
    return new TestFacilitatorClient();
  }

  return new HTTPFacilitatorClient({
    url: config.X402_FACILITATOR_URL
  });
}

async function getResourceServer() {
  if (!resourceServerPromise) {
    resourceServerPromise = (async () => {
      const server = new x402ResourceServer(createFacilitatorClient());
      registerExactSvmScheme(server, {
        networks: [config.x402Network]
      });
      await server.initialize();
      return server;
    })();
  }

  return resourceServerPromise;
}

function requestUrl(request: FastifyRequest) {
  const rawPath = request.raw.url ?? '/';
  return new URL(rawPath, config.HUB3_API_URL).toString();
}

function paymentHeader(request: FastifyRequest) {
  const header = request.headers['payment-signature'];
  if (Array.isArray(header)) {
    return header[0];
  }
  return header;
}

async function buildPaymentRequirements(repo: Hub3Repo, manifest: RepoManifest) {
  const server = await getResourceServer();
  return server.buildPaymentRequirements({
    scheme: 'exact',
    network: config.x402Network,
    payTo: manifest.publisherWallet,
    price: {
      asset: repo.pricing.tokenMint,
      amount: repo.pricing.amount
    },
    maxTimeoutSeconds: config.X402_MAX_TIMEOUT_SECONDS
  });
}

async function createPaymentRequired(repo: Hub3Repo, manifest: RepoManifest, resource: ResourceInfo, error?: string) {
  const server = await getResourceServer();
  const requirements = await buildPaymentRequirements(repo, manifest);
  const paymentRequired = await server.createPaymentRequiredResponse(
    requirements,
    resource,
    error ?? 'Payment required to access this priced repository resource'
  );

  return { paymentRequired, requirements };
}

function sendPaymentRequired(reply: FastifyReply, encodedRequirement: string, body: Record<string, unknown>) {
  return reply
    .code(402)
    .header('PAYMENT-REQUIRED', encodedRequirement)
    .header('Cache-Control', 'no-store')
    .send(body);
}

export async function beginPaidReadAccess(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  repo: Hub3Repo;
  manifest: RepoManifest;
  description: string;
  mimeType: string;
}) {
  const resource = {
    url: requestUrl(input.request),
    description: input.description,
    mimeType: input.mimeType
  } satisfies ResourceInfo;

  const { paymentRequired, requirements } = await createPaymentRequired(input.repo, input.manifest, resource);
  const paymentSignature = paymentHeader(input.request);

  if (!paymentSignature) {
    await sendPaymentRequired(input.reply, encodePaymentRequiredHeader(paymentRequired), {
      error: paymentRequired.error,
      repoId: input.repo.id,
      requiresPayment: true,
      pricing: input.repo.pricing
    });
    return null;
  }

  try {
    const payload = decodePaymentSignatureHeader(paymentSignature);
    const server = await getResourceServer();
    const matchingRequirements = server.findMatchingRequirements(requirements, payload);

    if (!matchingRequirements) {
      const invalidRequired = await server.createPaymentRequiredResponse(
        requirements,
        resource,
        'Provided payment does not satisfy the current repository pricing requirements'
      );
      await sendPaymentRequired(input.reply, encodePaymentRequiredHeader(invalidRequired), {
        error: invalidRequired.error,
        repoId: input.repo.id,
        requiresPayment: true,
        pricing: input.repo.pricing
      });
      return null;
    }

    const verification = await server.verifyPayment(payload, matchingRequirements);
    if (!verification.isValid) {
      const invalidRequired = await server.createPaymentRequiredResponse(
        requirements,
        resource,
        verification.invalidMessage ?? 'Payment verification failed'
      );
      await sendPaymentRequired(input.reply, encodePaymentRequiredHeader(invalidRequired), {
        error: invalidRequired.error,
        reason: verification.invalidReason,
        repoId: input.repo.id,
        requiresPayment: true,
        pricing: input.repo.pricing
      });
      return null;
    }

    return {
      paymentPayload: payload,
      requirements: matchingRequirements,
      payerWallet: verification.payer ?? null
    } satisfies PaidAccessContext;
  } catch (error) {
    const server = await getResourceServer();
    const invalidRequired = await server.createPaymentRequiredResponse(
      requirements,
      resource,
      error instanceof Error ? error.message : 'Invalid payment payload'
    );
    await sendPaymentRequired(input.reply, encodePaymentRequiredHeader(invalidRequired), {
      error: invalidRequired.error,
      repoId: input.repo.id,
      requiresPayment: true,
      pricing: input.repo.pricing
    });
    return null;
  }
}

export async function finalizePaidReadAccess(input: {
  reply: FastifyReply;
  access: PaidAccessContext | null;
  repoId: string;
}) {
  if (!input.access) {
    return false;
  }

  const server = await getResourceServer();
  const settlement = await server.settlePayment(
    input.access.paymentPayload,
    input.access.requirements
  );

  input.reply.header('PAYMENT-RESPONSE', encodePaymentResponseHeader(settlement));

  if (!settlement.success) {
    return input.reply
      .code(402)
      .header('Cache-Control', 'no-store')
      .send({
        error: settlement.errorMessage ?? 'Payment settlement failed',
        reason: settlement.errorReason,
        transaction: settlement.transaction
      });
  }

  const grant = await repoAccessGrantStore.create(input.repoId, input.access.payerWallet);
  input.reply.setCookie(config.HUB3_REPO_ACCESS_COOKIE_NAME, grant.grantId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.HUB3_API_URL.startsWith('https://'),
    maxAge: config.HUB3_REPO_ACCESS_TTL_SECONDS
  });

  return false;
}
