import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export async function audit(tx: Tx, actor: string, action: string, ref?: string, meta?: Prisma.InputJsonValue) {
  await tx.auditLog.create({ data: { actor, action, ref, meta } });
}
