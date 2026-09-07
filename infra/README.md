# ConnectNIL — AWS infrastructure

CDK app for the AWS side of ConnectNIL. Separate from the Next.js `package.json` on
purpose: CDK and its dependencies never enter the app bundle.

Two stacks:

| Stack | What it is |
|---|---|
| `ConnectNilFoundation` | A $1 budget alarm, and the IAM role the Vercel app assumes over OIDC so it stops carrying static S3 access keys. |
| `ConnectNilProofPipeline` | S3 `ObjectCreated` under `deals/` → Lambda → Rekognition. Writes an EXIF-stripped WebP thumbnail and posts the analysis back to the app. Plus a DLQ, two CloudWatch alarms and an SNS topic. |

Everything is disposable. The AWS free account plan expires after six months, so
`npm run destroy` should leave nothing behind that costs money. The proof bucket is
**imported, never declared**, so destroying the stacks cannot delete proof images.

## Prerequisites

- **Docker must be running.** The Lambda bundles `sharp`, whose native binary has to be
  built for Linux/arm64 rather than for whatever machine runs `cdk deploy`. `synth` and
  `deploy` both fail with a `docker API` connection error if Docker Desktop is not started.
- AWS credentials with permission to create IAM roles, Lambdas, SNS/SQS and budgets.
- The account must be CDK-bootstrapped once: `npx cdk bootstrap aws://<account>/us-east-1`.

## Settings

Every setting comes from CDK context (`-c connectnil:key=value`) or an environment
variable. Nothing is defaulted that would be wrong to guess — a missing value fails at
synth naming what to set.

| Context key | Env var | Required | Meaning |
|---|---|---|---|
| `connectnil:bucketName` | `S3_BUCKET` | yes | Existing proof bucket. Must contain no dots — `next.config.ts` matches proof images with a single-label wildcard host. |
| `connectnil:callbackUrl` | `PROOF_PIPELINE_CALLBACK_URL` | yes | `https://<your-site>/api/internal/proof-processed` |
| `connectnil:alertEmail` | `AWS_ALERT_EMAIL` | yes | Budget and alarm notifications. You must confirm the SNS subscription email. |
| `connectnil:secretParamName` | `PROOF_PIPELINE_SECRET_PARAM` | no | Default `/connectnil/proof-pipeline-secret` |
| `connectnil:vercelTeamSlug` | `VERCEL_TEAM_SLUG` | no | Omit both Vercel keys to skip the OIDC role and keep static keys. |
| `connectnil:vercelProjectName` | `VERCEL_PROJECT_NAME` | no | |
| `connectnil:region` | `S3_REGION` | no | Default `us-east-1`. Must match the bucket. |

## Deploy

### 1. Create the shared secret

CloudFormation cannot create an SSM `SecureString`, so this one resource is made out of
band. The stack only grants the Lambda permission to read it.

```bash
SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

aws ssm put-parameter \
  --name /connectnil/proof-pipeline-secret \
  --type SecureString \
  --value "$SECRET" \
  --region us-east-1

echo "PROOF_PIPELINE_SECRET=$SECRET"   # set this in Vercel and in .env.local
```

The app and the Lambda must hold the *same* value — the callback route verifies an HMAC
over the request body and refuses anything that does not match.

### 2. Deploy the stacks

```bash
cd infra
npm install
npm run diff     # always look first: it will show the imported bucket unmodified
npm run deploy
```

### 3. Wire the app

- Set `PROOF_PIPELINE_SECRET` in the Vercel project environment, byte-identical to the
  SecureString value from step 1. The callback verifies an HMAC with it and 401s every
  report if the two differ; unset, it fails closed with a 503.
- Flip `PROOF_STORAGE_DRIVER` to `s3`. Until this happens, proofs go to the legacy
  Supabase bucket, no S3 event fires, and the pipeline never runs.
- Apply `supabase/migrations/019_proof_analysis.sql` in the Supabase SQL editor.
- Set the S3 credentials under the `S3_*` names, never `AWS_*`. Vercel functions run on
  Lambda, whose runtime injects its own `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
  `AWS_REGION`; `lib/aws/s3.ts` therefore ignores the `AWS_*` names on Vercel entirely,
  and honours them only locally.
- If the OIDC role was deployed, set `AWS_ROLE_ARN` to the `VercelRoleArn` stack output.
  It takes precedence over the static keys the moment it is present. **Verify with the
  probe below, and only then delete `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.**
  Deleting them first leaves the app with no usable credentials, and it does not error —
  it falls back to the legacy Supabase path, so the pipeline you just deployed silently
  never runs. Unsetting `AWS_ROLE_ARN` reverts to the keys instantly.

### 3a. Make sure the Lambda can actually reach the callback

The Lambda carries no Vercel session, so two deployment settings decide whether its report
ever lands:

- `connectnil:callbackUrl` must be the **stable production domain**. It is baked into the
  Lambda's environment at deploy time, so changing domains means redeploying this stack. A
  preview URL will not do — previews are protection-gated by default.
- If **Deployment Protection** is enabled on production, the POST receives an HTML login
  page and the HMAC check is never reached. Disable it for production, or configure a
  Protection Bypass for Automation.

One request checks the whole chain. It returns booleans and the region only — no secret,
key, ARN or bucket name — so it is safe to leave unauthenticated:

```bash
curl -s https://<your-site>/api/internal/proof-processed
# {"route":"proof-processed","secretConfigured":true,
#  "storage":{"credentials":"oidc","driver":"s3","onVercel":true,...}}
```

- HTML instead of JSON -> Deployment Protection is intercepting the callback.
- `"secretConfigured": false` -> every report will 503.
- `"credentials":"none"` or `"driver":"supabase"` -> nothing will ever reach the pipeline.

### 4. Verify

```bash
npm run verify:s3         # storage layer
npm run verify:pipeline   # the pipeline end to end
```

## Bucket settings not managed here

The bucket is imported, so CloudFormation will not change its configuration — that is the
point, but it means two things are done by hand, once:

```bash
# Versioning: proof images are evidence attached to a signed NIL agreement.
aws s3api put-bucket-versioning \
  --bucket <bucket> \
  --versioning-configuration Status=Enabled

# Lifecycle: abandon half-finished uploads, and expire noncurrent versions so
# versioning cannot quietly grow the bill.
aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration '{
  "Rules": [
    {
      "ID": "abort-incomplete-uploads",
      "Status": "Enabled",
      "Filter": {},
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    },
    {
      "ID": "expire-noncurrent",
      "Status": "Enabled",
      "Filter": {},
      "NoncurrentVersionExpiration": { "NoncurrentDays": 90 }
    }
  ]
}'
```

## Notes

- **The `deals/` prefix filter is load-bearing.** Thumbnails are written under `thumbs/`,
  outside it. Moving them under `deals/` would make the Lambda trigger itself in a loop —
  the one change here capable of producing a real bill. `thumbKeyFor()` in
  `lib/deals/deliverableProof.ts` carries the same warning.
- The Lambda holds **no database credentials**. It reports to the app, which owns the
  write. That keeps the Supabase service-role key out of AWS and keeps the function out of
  a VPC — a NAT gateway would cost more per month than everything else here combined.
- `bucket.addEventNotification` on an *imported* bucket goes through a CDK custom resource
  that merges with the bucket's existing notification configuration rather than replacing
  it. There are no other notifications on this bucket today; if any are added later, check
  `cdk diff` carefully.
- The Lambda imports `lib/deals/deliverableProof.ts` and `lib/deals/proofAnalysis.ts`
  straight from the Next.js app rather than keeping a second copy of the key shapes. Both
  are pure and dependency-free; that is a property worth preserving.
