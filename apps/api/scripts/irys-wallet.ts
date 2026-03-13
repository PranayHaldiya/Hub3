import bs58 from 'bs58';
import IrysUploader from '@irys/upload';
import Solana from '@irys/upload-solana';
import { config } from '../src/config';

function normalizeIrysSecret(secret: string) {
  const trimmed = secret.trim();
  if (trimmed.startsWith('[')) {
    return bs58.encode(Uint8Array.from(JSON.parse(trimmed) as number[]));
  }

  return trimmed;
}

async function getUploader() {
  if (!config.IRYS_PRIVATE_KEY || !config.irysRpcUrl) {
    throw new Error('Missing IRYS_PRIVATE_KEY or IRYS_SOLANA_RPC_URL/SOLANA_RPC_URL');
  }

  const builder = IrysUploader(Solana)
    .withWallet(normalizeIrysSecret(config.IRYS_PRIVATE_KEY))
    .withRpc(config.irysRpcUrl);

  return config.IRYS_NODE_URL ? builder.bundlerUrl(config.IRYS_NODE_URL) : builder.devnet();
}

async function printStatus() {
  const irys = await getUploader();
  const address = await irys.getLoadedBalance().then(async (balance: bigint | string | number) => ({
    balance,
    address: await irys.getLoadedBalance().then(() => irys.address)
  }));

  const oneMbPrice = await irys.getPrice(1_000_000);

  console.log(JSON.stringify({
    network: config.IRYS_NODE_URL ?? 'devnet',
    rpcUrl: config.irysRpcUrl,
    address: address.address,
    balanceAtomic: address.balance.toString(),
    balance: irys.utils.fromAtomic(address.balance),
    samplePriceBytes: 1_000_000,
    samplePriceAtomic: oneMbPrice.toString(),
    samplePrice: irys.utils.fromAtomic(oneMbPrice),
    token: irys.token
  }, null, 2));
}

async function fund(amount?: string) {
  if (!amount) {
    throw new Error('Provide an amount, for example: npm run irys:fund --workspace @hub3/api -- 0.05');
  }

  const irys = await getUploader();
  const quantity = irys.utils.toAtomic(amount);
  const result = await irys.fund(quantity);

  console.log(JSON.stringify({
    fundedAtomic: quantity.toString(),
    funded: amount,
    token: irys.token,
    id: result.id,
    quantity: result.quantity,
    reward: result.reward
  }, null, 2));
}

async function main() {
  const command = process.argv[2] ?? 'status';

  if (command === 'status') {
    await printStatus();
    return;
  }

  if (command === 'fund') {
    await fund(process.argv[3]);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
