import * as path from "node:path";
import { Duration, Stack, type StackProps, CfnOutput } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cwActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sns from "aws-cdk-lib/aws-sns";
import * as snsSubs from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";
import { PROOF_KEY_ROOT, PROOF_THUMB_ROOT } from "../../lib/deals/deliverableProof";
import type { ConnectNilConfig } from "./config";

export interface ProofPipelineStackProps extends StackProps {
  config: ConnectNilConfig;
}

/**
 * S3 -> Lambda -> Rekognition, with the result posted back to the app.
 *
 * The bucket is IMPORTED, never declared. It already exists and holds every proof image
 * submitted so far; declaring it would hand its lifecycle to CloudFormation, and a stack
 * delete would take the data with it.
 */
export class ProofPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: ProofPipelineStackProps) {
    super(scope, id, props);
    const { config } = props;

    const bucket = s3.Bucket.fromBucketName(this, "ProofBucket", config.bucketName);

    /* ── Failure handling ──────────────────────────────────────────────────────
     * Analysis is best-effort: a proof that cannot be analysed still has to be
     * reviewable by a human. So failures go to a DLQ for inspection rather than
     * blocking anything, and an alarm says so out loud instead of leaving proofs
     * silently stuck reading "pending".
     */
    const dlq = new sqs.Queue(this, "ProofProcessorDlq", {
      queueName: "connectnil-proof-processor-dlq",
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    const alarmTopic = new sns.Topic(this, "PipelineAlarms", {
      displayName: "ConnectNIL proof pipeline alarms",
    });
    alarmTopic.addSubscription(new snsSubs.EmailSubscription(config.alertEmail));

    const secretArn = this.formatArn({
      service: "ssm",
      resource: "parameter",
      // SSM parameter names start with "/" and the ARN must not double it.
      resourceName: config.secretParamName.replace(/^\//, ""),
    });

    const fn = new NodejsFunction(this, "ProofProcessor", {
      functionName: "connectnil-proof-processor",
      entry: path.join(__dirname, "../lambda/proof-processor/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      // sharp decodes the full image; 1024 MB is also where the CPU allocation stops
      // being the bottleneck for a 5 MB JPEG.
      memorySize: 1024,
      timeout: Duration.seconds(60),
      retryAttempts: 2,
      deadLetterQueue: dlq,
      environment: {
        PROOF_BUCKET: config.bucketName,
        CALLBACK_URL: config.callbackUrl,
        SECRET_PARAM_NAME: config.secretParamName,
      },
      bundling: {
        format: OutputFormat.CJS,
        target: "node22",
        minify: false, // stack traces in CloudWatch are worth more than a smaller zip
        sourceMap: true,
        // sharp ships prebuilt native binaries per platform. Left to itself CDK bundles
        // locally, which would install the build for whatever machine ran cdk deploy --
        // a Windows or macOS binary that cannot load in Lambda. Forcing the Docker path
        // installs it inside the Linux build image for the target architecture instead.
        nodeModules: ["sharp"],
        forceDockerBundling: true,
        // `nodeModules` makes CDK run `npm ci` INSIDE the Linux container, which by default
        // also creates node_modules/.bin/* as POSIX symlinks. CDK then fingerprints that
        // directory from the host, and on Windows readlink() on a Linux symlink fails with
        // EINVAL — synth dies after the (slow) install has already succeeded. Lambda never
        // executes those bin shims, so switching them off costs nothing and makes the build
        // work on Windows as well as on Linux/macOS.
        environment: { NPM_CONFIG_BIN_LINKS: "false" },
        // The AWS SDK v3 clients are provided by the Node 22 runtime; bundling them
        // would add megabytes for no behavioural gain.
        externalModules: ["@aws-sdk/*"],
      },
      // The Lambda imports the app's key-shape helpers from ../../lib/deals. esbuild
      // needs the project root in scope to resolve that.
      projectRoot: path.join(__dirname, "../.."),
      depsLockFilePath: path.join(__dirname, "../package-lock.json"),
    });

    /* ── Permissions ───────────────────────────────────────────────────────────
     * Scoped per prefix, and asymmetric on purpose: the function reads originals and
     * writes only thumbnails. It has no way to overwrite a proof image, which is the
     * evidence in a signed NIL agreement.
     */
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "ReadProofOriginals",
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}/${PROOF_KEY_ROOT}/*`],
      })
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "WriteThumbnails",
        actions: ["s3:PutObject"],
        resources: [`${bucket.bucketArn}/${PROOF_THUMB_ROOT}/*`],
      })
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "Rekognition",
        actions: ["rekognition:DetectModerationLabels", "rekognition:DetectText"],
        // Neither API is resource-scopable: they operate on bytes in the request, not on
        // a named AWS resource, so "*" is the only valid resource here.
        resources: ["*"],
      })
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "ReadCallbackSecret",
        actions: ["ssm:GetParameter"],
        resources: [secretArn],
        // No explicit kms:Decrypt: the parameter uses the AWS-managed aws/ssm key, whose
        // key policy already allows decryption for account principals calling through SSM.
      })
    );

    /* ── Trigger ───────────────────────────────────────────────────────────────
     * Prefix-filtered to `deals/`. The thumbnails this function writes land under
     * `thumbs/`, outside the filter — if they were written back under `deals/` the
     * function would trigger itself forever. That is the one change here that could
     * generate a real bill, which is why thumbKeyFor() carries the same warning.
     */
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(fn),
      { prefix: `${PROOF_KEY_ROOT}/` }
    );

    new cloudwatch.Alarm(this, "ProofProcessorErrors", {
      alarmName: "connectnil-proof-processor-errors",
      alarmDescription:
        "The proof pipeline is failing. Proofs stay reviewable, but they will read as unanalysed.",
      metric: fn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(alarmTopic));

    new cloudwatch.Alarm(this, "ProofProcessorDlqDepth", {
      alarmName: "connectnil-proof-processor-dlq",
      alarmDescription: "Proof images gave up after retries and are sitting on the DLQ.",
      metric: dlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new cwActions.SnsAction(alarmTopic));

    new CfnOutput(this, "ProofProcessorName", { value: fn.functionName });
    new CfnOutput(this, "ProofProcessorDlqUrl", { value: dlq.queueUrl });
  }
}
