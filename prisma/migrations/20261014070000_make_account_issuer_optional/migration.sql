-- Better Auth does not populate issuer when creating OAuth accounts.
ALTER TABLE "account" ALTER COLUMN "issuer" DROP NOT NULL;

DROP INDEX "account_issuer_accountId_idx";
CREATE INDEX "account_providerId_accountId_idx" ON "account"("providerId", "accountId");
