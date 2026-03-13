import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  type Commitment,
  type Connection,
  type Transaction,
  type VersionedTransaction
} from '@solana/web3.js';
import rawIdl from '../../../../idl/repo_registry.json';

export type RepoRegistryIdl = typeof rawIdl;

export type RepoRegistryRecordAccount = {
  repoId: string;
  owner: PublicKey;
  sourceRepoFullName: string;
  currentManifestId: string;
  latestCommitSha: string;
  status: unknown;
  pricingMode: unknown;
  paymentTokenMint: PublicKey;
  priceAmount: BN;
  bump: number;
};

type RepoStatusVariant = 'draft' | 'published' | 'failed';
type PricingModeVariant = 'free' | 'fixed';
type AnchorWallet = ConstructorParameters<typeof AnchorProvider>[1];

export const repoRegistryProgramId = rawIdl.address;
export const repoRegistryIdl = rawIdl;

class KeypairWallet implements AnchorWallet {
  constructor(public readonly payer: Keypair) {}

  get publicKey() {
    return this.payer.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T) {
    if ('version' in transaction) {
      transaction.sign([this.payer]);
    } else {
      transaction.partialSign(this.payer);
    }

    return transaction;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]) {
    return Promise.all(transactions.map((transaction) => this.signTransaction(transaction)));
  }
}

export function getRepoRecordPda(repoId: string, programId = repoRegistryProgramId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('repo'), Buffer.from(repoId)],
    new PublicKey(programId)
  );
}

export function createRepoRegistryClient(input: {
  connection: Connection;
  payer: Keypair;
  commitment?: Commitment;
  programId?: string;
}) {
  const programId = input.programId ?? repoRegistryProgramId;
  const provider = new AnchorProvider(
    input.connection,
    new KeypairWallet(input.payer),
    {
      commitment: input.commitment,
      preflightCommitment: input.commitment
    }
  );
  const idl = {
    ...rawIdl,
    address: programId
  } as Idl;
  const program = new Program(idl, provider) as any;

  return {
    program,
    provider,
    getRepoRecordPda(repoId: string) {
      return getRepoRecordPda(repoId, programId)[0];
    },
    async fetchRepoRecord(repoId: string) {
      return (await program.account.repoRecord.fetchNullable(
        getRepoRecordPda(repoId, programId)[0],
        input.commitment
      )) as RepoRegistryRecordAccount | null;
    },
    async createRepo(args: {
      repoId: string;
      sourceRepoFullName: string;
      currentManifestId: string;
      latestCommitSha: string;
    }) {
      return program.methods
        .createRepo(
          args.repoId,
          args.sourceRepoFullName,
          args.currentManifestId,
          args.latestCommitSha
        )
        .accounts({
          owner: provider.publicKey,
          repoRecord: getRepoRecordPda(args.repoId, programId)[0],
          systemProgram: SystemProgram.programId
        })
        .rpc() as Promise<string>;
    },
    async updateManifest(args: {
      repoId: string;
      currentManifestId: string;
      latestCommitSha: string;
      status: RepoStatusVariant;
    }) {
      return program.methods
        .updateManifest(
          args.currentManifestId,
          args.latestCommitSha,
          { [args.status]: {} }
        )
        .accounts({
          owner: provider.publicKey,
          repoRecord: getRepoRecordPda(args.repoId, programId)[0]
        })
        .rpc() as Promise<string>;
    },
    async setPricing(args: {
      repoId: string;
      pricingMode: PricingModeVariant;
      paymentTokenMint: string;
      priceAmount: string;
    }) {
      return program.methods
        .setPricing(
          { [args.pricingMode]: {} },
          new PublicKey(args.paymentTokenMint),
          new BN(args.priceAmount)
        )
        .accounts({
          owner: provider.publicKey,
          repoRecord: getRepoRecordPda(args.repoId, programId)[0]
        })
        .rpc() as Promise<string>;
    }
  };
}

export type RepoRegistryClient = ReturnType<typeof createRepoRegistryClient>;
