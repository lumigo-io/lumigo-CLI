const AWS = require("aws-sdk");
const Semver = require("semver");
const Retry = require("async-retry");
const uuid = require("uuid/v4");
const {Command, flags} = require("@oclif/command");
const {checkVersion} = require("../lib/version-check");
require("colors");

const ApplicationId = "arn:aws:serverlessrepo:us-east-1:451282441545:applications/aws-lambda-power-tuning";
const StackName = "serverlessrepo-lumigo-cli-powertuning-lambda";
const ONE_SECOND = 1000;
  
class PowertuneLambdaCommand extends Command {
	async run() {
		const {flags} = this.parse(PowertuneLambdaCommand);
		const {functionName, region, profile, strategy, invocations, payload} = flags;
    
		AWS.config.region = region;
		if (profile) {
			const credentials = new AWS.SharedIniFileCredentials({ profile });
			AWS.config.credentials = credentials;
		}
    
		checkVersion();
    
		this.log(`checking the aws-lambda-power-tuning SAR in [${region}]`);
		const version = await getLatestVersion();  
		this.log(`the latest version of aws-lambda-power-tuning SAR is ${version}`);
    
		this.log(`looking for deployed CloudFormation stack [${StackName}] in [${region}]`);
		let stateMachineArn;
		const findCfnResult = await findCloudFormation(version);
		switch (findCfnResult.result) {
		case "not found":
			this.log("stack is not found");
			this.log(`deploying the aws-lambda-power-tuning SAR [${version}] to [${region}]`);
			stateMachineArn = await deploySAR(version);
			break;
		case "outdated":
			this.log(`stack is deployed but is running an outdated version [${findCfnResult.version}]`);
			stateMachineArn = await deploySAR(version, true);
			break;
		default:
			this.log("stack is deployed and up-to-date");
			stateMachineArn = findCfnResult.stateMachineArn;
		}
    
		this.log(`the State Machine is ${stateMachineArn}`);
    
		// eslint-disable-next-line no-unused-vars
		const [_arn, _aws, _states, _region, accountId, ...rest] = stateMachineArn.split(":");
		const lambdaArn = `arn:aws:lambda:${region}:${accountId}:function:${functionName}`;
		const executionArn = await startStateMachine(stateMachineArn, lambdaArn, invocations, payload, strategy);
		this.log("State Machine execution started");
		this.log(`execution ARN is ${executionArn}`);
    
		const result = await waitForStateMachineOutput(executionArn);
		this.log(JSON.stringify(result, null, 2).yellow);
	}
}

PowertuneLambdaCommand.description = "Powertunes a Lambda function for cost or speed";
PowertuneLambdaCommand.flags = {
	functionName: flags.string({
		char: "n",
		description: "name of the Lambda function",
		required: true
	}),
	region: flags.string({
		char: "r",
		description: "AWS region, e.g. us-east-1",
		required: true
	}),
	profile: flags.string({
		char: "p",
		description: "AWS CLI profile name",
		required: false
	}),
	strategy: flags.string({
		char: "s",
		description: 'what to powertune the function for - either "cost" or "speed"',
		required: true,
		options: ["cost", "speed"]
	}),
	invocations: flags.integer({
		char: "i",
		description: "the number of invocations to run for each configuration",
		required: false,
		default: 100
	}),
	payload: flags.string({
		char: "e",
		description: "the JSON payload to send to the function",
		required: false,
		default: "{}"
	})
};

const getLatestVersion = async (nextToken, acc) => {
	const ServerlessRepo = new AWS.ServerlessApplicationRepository();
	const resp = await ServerlessRepo.listApplicationVersions({
		ApplicationId: ApplicationId,
		NextToken: nextToken
	}).promise();
  
	const versions = resp.Versions.map(x => x.SemanticVersion);
	if (acc) {
		versions.push(acc);
	}
	const highestVersion = Semver.sort(versions).reverse()[0];

	if (resp.NextToken) {
		return await getLatestVersion(resp.NextToken, highestVersion);
	} else {
		return highestVersion;
	}
};

const findCloudFormation = async (version) => {
	const CloudFormation = new AWS.CloudFormation();
  
	try {
		const resp = await CloudFormation.describeStacks({
			StackName: StackName
		}).promise();
    
		const stack = resp.Stacks[0];
		const semverTag = stack.Tags.find(x => x.Key === "serverlessrepo:semanticVersion");
		const currentVersion = semverTag.Value;
		if (currentVersion !== version) {
			return {
				result: "outdated",
				version: currentVersion
			};
		}

		const smArnOutput = stack.Outputs.find(x => x.OutputKey === "StateMachineARN");
		const stateMachineArn = smArnOutput.OutputValue;
		return {
			result: "active",
			version: version,
			stateMachineArn: stateMachineArn
		};
	} catch (err) {
		return {
			result: "not found"
		};
	}
};

const generateCloudFormationTemplate = async (version) => {
	const ServerlessRepo = new AWS.ServerlessApplicationRepository();
	const createResp = await ServerlessRepo.createCloudFormationTemplate({
		ApplicationId: ApplicationId,
		SemanticVersion: version
	}).promise();  
	const templateId = createResp.TemplateId;
  
	return await Retry(async () => {
		const resp = await ServerlessRepo.getCloudFormationTemplate({
			ApplicationId: ApplicationId,
			TemplateId: templateId
		}).promise();
    
		if (resp.Status !== "ACTIVE") {
			throw new Error("CloudFormation template not ready yet...");
		}
    
		return resp.TemplateUrl;
	}, { // 1s between attempts, for a total of 3 mins
		retries: 180,
		factor: 1,
		minTimeout: ONE_SECOND,
		maxTimeout: ONE_SECOND
	});
};

const waitForCloudFormationComplete = async (stackName) => {
	const CloudFormation = new AWS.CloudFormation();
	const FailedStates = [
		"ROLLBACK_COMPLETE",
		"UPDATE_ROLLBACK_FAILED",
		"UPDATE_ROLLBACK_COMPLETE"
	];

	console.log("waiting for SAR deployment to finish...");

	return await Retry(async (bail) => {
		const resp = await CloudFormation.describeStacks({
			StackName: stackName
		}).promise();

		const stack = resp.Stacks[0];
		if (FailedStates.includes(stack.StackStatus)) {
			bail(new Error(`deployment failed, stack is in [${stack.StackStatus}] status`));
		} else if (!stack.StackStatus.endsWith("COMPLETE")) {
			throw new Error(`stack is in [${stack.StackStatus}] status`);
		} else {
			return stack.Outputs;			
		}
	}, {
		retries: 300, // 5 mins
		factor: 1,
		minTimeout: ONE_SECOND,
		maxTimeout: ONE_SECOND,
		onRetry: () => console.log("still waiting...")
	});
};

const deploySAR = async (version, isUpdate = false) => {
	const url = await generateCloudFormationTemplate(version);
	console.log("CloudFormation template has been generated");
  
	const CloudFormation = new AWS.CloudFormation();
  
	if (isUpdate) {
		await CloudFormation.updateStack({
			StackName: StackName,
			Capabilities: [ "CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND" ],
			TemplateURL: url,
			Tags: [{
				Key: "serverlessrepo:applicationId",
				Value: ApplicationId
			}, {
				Key: "serverlessrepo:semanticVersion",
				Value: version
			}]
		}).promise();
	} else {
		await CloudFormation.createStack({
			StackName: StackName,
			Capabilities: [ "CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND" ],
			TemplateURL: url,
			Tags: [{
				Key: "serverlessrepo:applicationId",
				Value: ApplicationId
			}, {
				Key: "serverlessrepo:semanticVersion",
				Value: version
			}]
		}).promise();
	}
  
	const outputs = await waitForCloudFormationComplete(StackName);
	console.log("SAR deployment completed");
  
	const smOutput = outputs.find(x => x.OutputKey === "StateMachineARN");
	return smOutput.OutputValue;
};

const startStateMachine = async (stateMachineArn, lambdaArn, iterations, payload, strategy) => {
	const StepFunctions = new AWS.StepFunctions();
	const resp = await StepFunctions.startExecution({
		stateMachineArn: stateMachineArn,
		name: uuid(),
		input: JSON.stringify({
			lambdaARN: lambdaArn,
			num: iterations,
			payload: payload,
			parallelInvocation: false,
			strategy: strategy
		})
	}).promise();

	return resp.executionArn;
};

const waitForStateMachineOutput = async (executionArn) => {
	const StepFunctions = new AWS.StepFunctions();
	const FailedStates = [
		"FAILED",
		"TIMED_OUT",
		"ABORTED"
	];
  
	return await Retry(async (bail) => {
		const resp = await StepFunctions.describeExecution({
			executionArn: executionArn
		}).promise();
    
		if (FailedStates.includes(resp.status)) {
			bail(new Error(`execution failed [${resp.status}]: ${resp.output}`));
		} else if (resp.status === "SUCCEEDED") {
			return JSON.parse(resp.output);
		} else {
			throw new Error("still running...");
		}
	}, {
		retries: 600, // 10 mins
		factor: 1,
		minTimeout: ONE_SECOND,
		maxTimeout: ONE_SECOND
	});
};

module.exports = PowertuneLambdaCommand;
