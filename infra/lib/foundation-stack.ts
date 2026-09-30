import { Stack, type StackProps, CfnOutput } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import type { ConnectNilConfig } from "./config";

export interface FoundationStackProps extends StackProps {
  config: ConnectNilConfig;
}

/**
 * Account-level guardrail plus the IAM role that lets the Vercel app reach S3 without
 * long-lived keys.
 */
export class FoundationStack extends Stack {
  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);
    const { config } = props;

    /* ── Budget ────────────────────────────────────────────────────────────────
     * The whole point of this project's AWS footprint is that it stays inside the
     * free tier. A $1 budget is not a spending plan, it is a smoke alarm: if this
     * ever fires, something is looping. Both an actual and a forecast notification,
     * because a runaway Lambda can burn a month's budget before "actual" catches up.
     */
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: "connectnil-monthly",
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: 1, unit: "USD" },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: "ACTUAL",
            comparisonOperator: "GREATER_THAN",
            threshold: 80,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: config.alertEmail }],
        },
        {
          notification: {
            notificationType: "FORECASTED",
            comparisonOperator: "GREATER_THAN",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [{ subscriptionType: "EMAIL", address: config.alertEmail }],
        },
      ],
    });

    /* ── Vercel OIDC ───────────────────────────────────────────────────────────
     * Closes the TODO in lib/aws/s3.ts. The app assumes this role with a short-lived
     * token minted per request instead of carrying S3_ACCESS_KEY_ID /
     * S3_SECRET_ACCESS_KEY, so there is no static credential left to leak or rotate.
     *
     * The `sub` condition is the actual access boundary: it pins the role to one
     * project and one environment. Without it the role is assumable by any project
     * this issuer recognises.
     */
    if (config.vercel) {
      const { teamSlug, projectName } = config.vercel;
      const issuerHost = `oidc.vercel.com/${teamSlug}`;

      const provider = new iam.OpenIdConnectProvider(this, "VercelOidcProvider", {
        url: `https://${issuerHost}`,
        clientIds: [`https://vercel.com/${teamSlug}`],
      });

      const role = new iam.Role(this, "VercelAppRole", {
        roleName: "connectnil-vercel-app",
        description: "Assumed by the ConnectNIL Next.js app on Vercel via OIDC federation.",
        assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
          StringEquals: {
            [`${issuerHost}:aud`]: `https://vercel.com/${teamSlug}`,
            [`${issuerHost}:sub`]: `owner:${teamSlug}:project:${projectName}:environment:production`,
          },
        }),
      });

      const bucketArn = `arn:aws:s3:::${config.bucketName}`;
      role.addToPolicy(
        new iam.PolicyStatement({
          sid: "ProofObjects",
          actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          resources: [`${bucketArn}/deals/*`, `${bucketArn}/thumbs/*`],
        })
      );

      /* Athlete profile photos — PHOTO_KEY_ROOT in lib/athletes/photo.ts.
       *
       * A SEPARATE statement rather than a third resource on ProofObjects, because the two
       * prefixes have genuinely different blast radii: `deals/` feeds the Rekognition
       * pipeline and `athletes/` deliberately does not (the Lambda's ObjectCreated
       * notification is prefix-filtered to `deals/`). Keeping them apart means this grant
       * can be revoked, scoped down, or audited without touching the proof path.
       *
       * This policy is an ALLOWLIST: until it is deployed, every production PUT to
       * athletes/* is a 403 — and a uniquely hard one to diagnose, because presigning is
       * local HMAC with no AWS call, so the app mints a valid-looking URL and only the
       * browser's upload fails. Deploy with `cd infra && npm run diff && npm run deploy`.
       *
       * NOTE the static-key path is NOT covered by this. When s3CredentialMode() is
       * "static" (localhost, and any deployment that has not migrated to OIDC), access
       * comes from an IAM user policy that exists only in the AWS console — nothing in
       * this repo defines it. If that policy is also scoped to deals/*, it needs the same
       * widening by hand; cdk deploy will not do it and cdk diff will not show it.
       */
      role.addToPolicy(
        new iam.PolicyStatement({
          sid: "AthletePhotoObjects",
          actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
          resources: [`${bucketArn}/athletes/*`],
        })
      );
      // Deliberately no s3:ListBucket. lib/aws/s3.ts documents that a missing key must
      // return 403 rather than 404, and headProofObject() collapses the two.

      new CfnOutput(this, "VercelRoleArn", {
        value: role.roleArn,
        description: "Set as AWS_ROLE_ARN in the Vercel project environment.",
      });
    }
  }
}
