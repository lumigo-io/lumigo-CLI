const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const { getLatestVersion, deploy } = require("../lib/sar");
const { startStateMachine, waitForStateMachineOutput } = require("../lib/step-functions");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const fs = require("fs");
const inquirer = require("inquirer");
const childProcess = require("child_process");
const { track } = require("../lib/analytics");
require("colors");

const ApplicationId =
	"arn:aws:serverlessrepo:us-east-1:451282441545:applications/aws-lambda-power-tuning";
const StackName = "serverlessrepo-lumigo-cli-powertuning-lambda";

class PowertuneLambdaCommand extends Command {
	async run() {
		const { flags } = this.parse(PowertuneLambdaCommand);
		const {
			functionName,
			region,
			profile,
			strategy,
			invocations,
			file,
			balancedWeight,
			powerValues,
			outputFile
		} = flags;

		global.region = region;
		global.profile = profile;

		checkVersion();

		track("powertune-lambda", { region, strategy });

		this.log(`checking the aws-lambda-power-tuning SAR in [${region}]`);
		const version = await getLatestVersion(ApplicationId);
		this.log(`the latest version of aws-lambda-power-tuning SAR is ${version}`);

		this.log(
			`looking for deployed CloudFormation stack [${StackName}] in [${region}]`
		);
		let stateMachineArn;
		const findCfnResult = await findCloudFormation(version);
		switch (findCfnResult.result) {
			case "not found":
				this.log("stack is not found");
				this.log(
					`deploying the aws-lambda-power-tuning SAR [${version}] to [${region}]`
				);
				stateMachineArn = (await deploy(ApplicationId, version, StackName))
					.StateMachineARN;
				break;
			case "outdated":
				this.log(
					`stack is deployed but is running an outdated version [${findCfnResult.version}]`
				);
				stateMachineArn = (await deploy(ApplicationId, version, StackName, true))
					.StateMachineARN;
				break;
			default:
				this.log("stack is deployed and up-to-date");
				stateMachineArn = findCfnResult.stateMachineArn;
		}

		this.log(`the State Machine is ${stateMachineArn}`);

		let payload = flags.payload || "{}";
		if (file) {
			this.log(`loading payload from [${file}]...`);
			payload = fs.readFileSync(file, "utf8");
		}

		// eslint-disable-next-line no-unused-vars
		const [_arn, _aws, _states, _region, accountId, ...rest] = stateMachineArn.split(
			":"
		);
		const lambdaArn = `arn:aws:lambda:${region}:${accountId}:function:${functionName}`;
		const input = JSON.stringify({
			lambdaARN: lambdaArn,
			num: invocations,
			payload: payload,
			parallelInvocation: false,
			strategy: strategy,
			balancedWeight: balancedWeight,
			powerValues: powerValues
		});
		const executionArn = await startStateMachine(stateMachineArn, input);
		this.log("State Machine execution started");
		this.log(`execution ARN is ${executionArn}`);

		const result = await waitForStateMachineOutput(executionArn);
		result.functionName = functionName;
		this.log(JSON.stringify(result, null, 2).yellow);

		if (outputFile) {
			fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
		}

		// since v2.1.1 the powertuning SFN returns a visualization URL as well
		const visualizationUrl = _.get(result, "stateMachine.visualization");

		if (visualizationUrl) {
			const { visualize } = await inquirer.prompt([
				{
					type: "list",
					name: "visualize",
					message: "Do you want to open the visualization to see more results?",
					choices: ["yes", "no"]
				}
			]);

			if (visualize === "yes") {
				openVisualization(visualizationUrl);
			}
		}
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
		description: 'what to powertune the function for - "cost", "speed" or "balanced"',
		required: true,
		options: ["cost", "speed", "balanced"]
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
	}),
	file: flags.string({
		char: "f",
		description: "file that contains the JSON payload to send to the function",
		required: false,
		exclusive: ["payload"]
	}),
	balancedWeight: flags.string({
		char: "w",
		description:
			'the trade-off between cost and time, 0.0 is equivalent to "speed" strategy, 1.0 is equivalent to "cost" strategy',
		required: false,
		parse: x => parseFloat(x)
	}),
	powerValues: flags.string({
		char: "v",
		description:
			"comma-separated list of power values to be tested, e.g. 128,256,512,1024",
		required: false,
		parse: x => {
			if (x === "ALL") {
				return "ALL";
			} else {
				return x.split(",").map(n => parseInt(n));
			}
		}
	}),
	outputFile: flags.string({
		char: "o",
		description: "output file for the powertune SAR response",
		required: false
	})
};

const openVisualization = url => {
	try {
		// this works on many platforms
		childProcess.execSync(`python -m webbrowser "${url}"`);
	} catch (err) {
		childProcess.execSync(`open "${url}"`);
	}
};

const findCloudFormation = async version => {
	const AWS = getAWSSDK();
	const CloudFormation = new AWS.CloudFormation();

	try {
		const resp = await CloudFormation.describeStacks({
			StackName: StackName
		}).promise();

		const stack = resp.Stacks[0];
		const semverTag = stack.Tags.find(
			x => x.Key === "serverlessrepo:semanticVersion"
		);
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

module.exports = PowertuneLambdaCommand;
