const { getAWSSDK } = require("../lib/aws");
const { getLatestVersion, deploy } = require("../lib/sar");
const { startStateMachine, waitForStateMachineOutput } = require("../lib/step-functions");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const fs = require("fs");
const { track } = require("../lib/analytics");
require("colors");

const ApplicationId =
	"arn:aws:serverlessrepo:us-east-1:374852340823:applications/measure-cold-start";
const StackName = "serverlessrepo-lumigo-cli-measure-cold-start";

class MeasureLambdaColdStartsCommand extends Command {
	async run() {
		const { flags } = this.parse(MeasureLambdaColdStartsCommand);
		const { functionName, region, profile, invocations, file } = flags;

		global.region = region;
		global.profile = profile;

		checkVersion();

		track("measure-lambda-cold-starts", { region, invocations });

		this.log(`checking the measure-cold-start SAR in [${region}]`);
		const version = await getLatestVersion(ApplicationId);
		this.log(`the latest version of measure-cold-start SAR is ${version}`);

		this.log(
			`looking for deployed CloudFormation stack [${StackName}] in [${region}]`
		);
		let stateMachineArn;
		const findCfnResult = await findCloudFormation(version);
		switch (findCfnResult.result) {
			case "not found":
				this.log("stack is not found");
				this.log(
					`deploying the measure-cold-start SAR [${version}] to [${region}]`
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
		const input = JSON.stringify({
			functionName: functionName,
			count: invocations,
			payload: payload
		});
		const executionArn = await startStateMachine(stateMachineArn, input);
		this.log("State Machine execution started");
		this.log(`execution ARN is ${executionArn}`);

		const result = await waitForStateMachineOutput(executionArn);
		this.log(JSON.stringify(result, null, 2).yellow);
	}
}

MeasureLambdaColdStartsCommand.description = "Measures a function's initialization time";
MeasureLambdaColdStartsCommand.flags = {
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
	})
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

module.exports = MeasureLambdaColdStartsCommand;
