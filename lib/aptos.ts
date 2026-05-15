import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
  InputViewFunctionData,
} from "@aptos-labs/ts-sdk";
import { v4 as uuidv4 } from "uuid";

const config = new AptosConfig({
  network: (process.env.APTOS_NETWORK as Network) ?? Network.TESTNET,
});

export const aptos = new Aptos(config);

const privateKey = process.env.APTOS_PRIVATE_KEY;
let backendAccount: Account | null = null;
if (privateKey) {
  const key = new Ed25519PrivateKey(privateKey);
  backendAccount = Account.fromPrivateKey({ privateKey: key });
}

const MODULE_ADDRESS = process.env.CONTRACT_ADDRESS!;
const MODULE_NAME = "drop_registry";

export function generateDropId(): string {
  return uuidv4().replace(/-/g, "");
}

export async function registerDrop(opts: {
  dropId: string;
  blobId: string;
  blobHash: string;
  ttlSeconds: number;
  maxReads: number;
  senderAccount: Account;
}) {
  const txn = await aptos.transaction.build.simple({
    sender: opts.senderAccount.accountAddress,
    data: {
      function: `${MODULE_ADDRESS}::${MODULE_NAME}::register_drop`,
      functionArguments: [
        opts.dropId,
        opts.blobId,
        opts.blobHash,
        opts.ttlSeconds,
        opts.maxReads,
      ],
    },
  });

  const signed = aptos.transaction.sign({
    signer: opts.senderAccount,
    transaction: txn,
  });

  const result = await aptos.transaction.submit.simple({
    transaction: txn,
    senderAuthenticator: signed,
  });

  await aptos.waitForTransaction({ transactionHash: result.hash });
  return result.hash;
}

export async function recordRead(dropId: string): Promise<string> {
  if (!backendAccount) {
    throw new Error("APTOS_PRIVATE_KEY not configured");
  }
  const txn = await aptos.transaction.build.simple({
    sender: backendAccount.accountAddress,
    data: {
      function: `${MODULE_ADDRESS}::${MODULE_NAME}::record_read`,
      functionArguments: [dropId],
    },
  });

  const signed = aptos.transaction.sign({
    signer: backendAccount,
    transaction: txn,
  });

  const result = await aptos.transaction.submit.simple({
    transaction: txn,
    senderAuthenticator: signed,
  });

  await aptos.waitForTransaction({ transactionHash: result.hash });
  return result.hash;
}

export async function getDropStatus(dropId: string): Promise<{
  isValid: boolean;
  readsRemaining: number;
  expiresAt: number;
}> {
  const payload: InputViewFunctionData = {
    function: `${MODULE_ADDRESS}::${MODULE_NAME}::get_drop_status`,
    functionArguments: [dropId],
  };

  const [isValid, readsRemaining, expiresAt] = await aptos.view({ payload });

  return {
    isValid: isValid as boolean,
    readsRemaining: Number(readsRemaining),
    expiresAt: Number(expiresAt),
  };
}

export async function getBlobHash(dropId: string): Promise<string> {
  const payload: InputViewFunctionData = {
    function: `${MODULE_ADDRESS}::${MODULE_NAME}::get_blob_hash`,
    functionArguments: [dropId],
  };

  const [hash] = await aptos.view({ payload });
  return hash as string;
}
