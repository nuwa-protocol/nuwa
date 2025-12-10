import nacl from 'tweetnacl';
import type { APIApplicationCommandInteraction, APIPingInteraction } from 'discord-api-types/v10';
import type { Request } from 'express';

export type Interaction = APIPingInteraction | APIApplicationCommandInteraction;

export type VerifyDiscordRequestResult =
  | { isValid: false }
  | {
      isValid: true;
      interaction: Interaction;
    };

export function verifyWithNacl(args: {
  appPublicKey: string;
  signature: string;
  rawBody: string;
  timestamp: string;
}): boolean {
  const signatureBuffer = Buffer.from(args.signature, 'hex');
  const publicKeyBuffer = Buffer.from(args.appPublicKey, 'hex');
  const messageBuffer = Buffer.from(args.timestamp + args.rawBody);
  return nacl.sign.detached.verify(messageBuffer, signatureBuffer, publicKeyBuffer);
}

export function verifyInteractionRequest(
  req: Request,
  appPublicKey: string
): VerifyDiscordRequestResult {
  const signature = req.header('x-signature-ed25519');
  const timestamp = req.header('x-signature-timestamp');
  if (!signature || !timestamp) {
    return { isValid: false };
  }
  // 原始 body 文本由原始中间件提供
  // @ts-expect-error 自定义属性在 rawBody 中
  const rawBody: string | undefined = req.rawBody;
  if (!rawBody) {
    return { isValid: false };
  }
  const isValidRequest = verifyWithNacl({
    appPublicKey,
    rawBody,
    signature,
    timestamp,
  });
  if (!isValidRequest) {
    return { isValid: false };
  }
  return {
    interaction: JSON.parse(rawBody) as Interaction,
    isValid: true,
  };
}
