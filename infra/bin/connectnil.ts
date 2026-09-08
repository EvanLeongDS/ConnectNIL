#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { readConfig } from "../lib/config";
import { FoundationStack } from "../lib/foundation-stack";
import { ProofPipelineStack } from "../lib/proof-pipeline-stack";

const app = new App();
const config = readConfig(app);

const env = { account: config.account, region: config.region };

new FoundationStack(app, "ConnectNilFoundation", { config, env });
new ProofPipelineStack(app, "ConnectNilProofPipeline", { config, env });

// Everything here is meant to be disposable — the AWS free account plan expires after six
// months, and `cdk destroy --all` should leave nothing behind that carries a cost. The tag
// makes it obvious in Cost Explorer which line items belong to this project.
Tags.of(app).add("project", "connectnil");
