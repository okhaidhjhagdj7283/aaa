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

// Backend signer account (dùng để gọi record_read)
const privateKey = new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY!);
export const backendAccount = Account.fromPrivateKey({ privateKey });

const MODULE_ADDRESS = process.env.CONTRACT_ADDRESS!;
const MODULE_NAME = "drop_registry";

export function generateDropId(): string {
  return uuidv4().replace(/-/g, "");
}

/**
 * Đăng ký Drop mới lên Aptos sau khi upload Shelby thành công
 */
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

/**
 * Ghi nhận 1 lần đọc — gọi bởi backend khi serve file
 * Backend ký bằng account riêng
 */
export async function recordRead(dropId: string): Promise<string> {
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

/**
 * Kiểm tra drop còn valid không
 * Returns: { isValid, readsRemaining, expiresAt }
 */
export async function getDropStatus(dropId: string): Promise<{
  isValid: boolean;
  readsRemaining: number;
  expiresAt: number;
}> {
  const payload: InputViewFunctionData = {
    function: `${MODULE_ADDRESS}::${MODULE_NAME}::get_drop_status`,
    functionArguments: [dropId],
  };

  const [isValid, readsRemaining, expiresAt] =
    await aptos.view({ payload });

  return {
    isValid: isValid as boolean,
    readsRemaining: Number(readsRemaining),
    expiresAt: Number(expiresAt),
  };
}

/**
 * Lấy blob hash để verify integrity
 */
export async function getBlobHash(dropId: string): Promise<string> {
  const payload: InputViewFunctionData = {
    function: `${MODULE_ADDRESS}::${MODULE_NAME}::get_blob_hash`,
    functionArguments: [dropId],
  };

  const [hash] = await aptos.view({ payload });
  return hash as string;
}
