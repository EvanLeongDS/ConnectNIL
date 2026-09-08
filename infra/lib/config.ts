import type { App } from "aws-cdk-lib";

export interface ConnectNilConfig {
  /** Existing proof bucket. Imported, never created — it holds live data. */
  bucketName: string;
  /** Absolute URL of app/api/internal/proof-processed on the deployed site. */
  callbackUrl: string;
  /** Where the budget alarm and the pipeline error alarm are sent. */
  alertEmail: string;
  /** SSM SecureString holding the HMAC secret shared with the app. */
  secretParamName: string;
  /** Omit to skip the OIDC role and keep using static access keys. */
  vercel?: { teamSlug: string; projectName: string };
  region: string;
  account?: string;
}

/**
 * Settings come from CDK context (`-c key=value`, or the `context` block in cdk.json),
 * falling back to environment variables so CI can set them without editing a file.
 * Nothing is defaulted that would be wrong to guess — a missing value fails at synth
 * with the name to set, rather than deploying something pointed at the wrong bucket.
 */
export function readConfig(app: App): ConnectNilConfig {
  const read = (key: string, envVar: string): string | undefined => {
    const fromContext = app.node.tryGetContext(`connectnil:${key}`);
    if (typeof fromContext === "string" && fromContext.trim()) return fromContext.trim();
    const fromEnv = process.env[envVar];
    if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
    return undefined;
  };

  const require_ = (key: string, envVar: string): string => {
    const v = read(key, envVar);
    if (!v) {
      throw new Error(
        `Missing required setting "connectnil:${key}". Set it with -c connectnil:${key}=... ` +
          `or the ${envVar} environment variable. See infra/README.md.`
      );
    }
    return v;
  };

  const bucketName = require_("bucketName", "S3_BUCKET");
  if (bucketName.includes(".")) {
    // next.config.ts matches proof URLs with the single-label wildcard
    // *.s3.us-east-1.amazonaws.com, which a dotted bucket name would not satisfy.
    throw new Error(
      `Bucket name "${bucketName}" contains a dot. next.config.ts matches proof images with a ` +
        `single-label wildcard host, so a dotted bucket name breaks image rendering.`
    );
  }

  const teamSlug = read("vercelTeamSlug", "VERCEL_TEAM_SLUG");
  const projectName = read("vercelProjectName", "VERCEL_PROJECT_NAME");

  return {
    bucketName,
    callbackUrl: require_("callbackUrl", "PROOF_PIPELINE_CALLBACK_URL"),
    alertEmail: require_("alertEmail", "AWS_ALERT_EMAIL"),
    secretParamName: read("secretParamName", "PROOF_PIPELINE_SECRET_PARAM") ??
      "/connectnil/proof-pipeline-secret",
    vercel: teamSlug && projectName ? { teamSlug, projectName } : undefined,
    region: read("region", "S3_REGION") ?? "us-east-1",
    account: process.env.CDK_DEFAULT_ACCOUNT,
  };
}
