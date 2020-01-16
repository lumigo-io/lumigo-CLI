const _ = require("lodash");
const { getAWSSDK } = require("./aws");
const Semver = require("semver");
const Retry = require("async-retry");

const ONE_SECOND = 1000;

const getLatestVersion = async (applicationId, nextToken, acc) => {
	const AWS = getAWSSDK();
	const ServerlessRepo = new AWS.ServerlessApplicationRepository();
	const resp = await ServerlessRepo.listApplicationVersions({
		ApplicationId: applicationId,
		NextToken: nextToken
	}).promise();

	const versions = resp.Versions.map(x => x.SemanticVersion);
	if (acc) {
		versions.push(acc);
	}
	const highestVersion = Semver.sort(versions).reverse()[0];

	if (resp.NextToken) {
		return await getLatestVersion(applicationId, resp.NextToken, highestVersion);
	} else {
		return highestVersion;
	}
};

const deploy = async (applicationId, version, stackName, isUpdate = false) => {
	const url = await generateCloudFormationTemplate(applicationId, version);
	console.log("CloudFormation template has been generated");

	const AWS = getAWSSDK();
	const CloudFormation = new AWS.CloudFormation();

	if (isUpdate) {
		await CloudFormation.updateStack({
			StackName: stackName,
			Capabilities: ["CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND"],
			TemplateURL: url,
			Tags: [
				{
					Key: "serverlessrepo:applicationId",
					Value: applicationId
				},
				{
					Key: "serverlessrepo:semanticVersion",
					Value: version
				}
			]
		}).promise();
	} else {
		await CloudFormation.createStack({
			StackName: stackName,
			Capabilities: ["CAPABILITY_IAM", "CAPABILITY_AUTO_EXPAND"],
			TemplateURL: url,
			Tags: [
				{
					Key: "serverlessrepo:applicationId",
					Value: applicationId
				},
				{
					Key: "serverlessrepo:semanticVersion",
					Value: version
				}
			]
		}).promise();
	}

	const outputs = await waitForCloudFormationComplete(stackName);
	console.log("SAR deployment completed");

	// turn output array into an object
	return _.reduce(
		outputs,
		(obj, x) => {
			obj[x.OutputKey] = x.OutputValue;
			return obj;
		},
		{}
	);
};

const generateCloudFormationTemplate = async (applicationId, version) => {
	const AWS = getAWSSDK();
	const ServerlessRepo = new AWS.ServerlessApplicationRepository();
	const createResp = await ServerlessRepo.createCloudFormationTemplate({
		ApplicationId: applicationId,
		SemanticVersion: version
	}).promise();
	const templateId = createResp.TemplateId;

	return await Retry(
		async () => {
			const resp = await ServerlessRepo.getCloudFormationTemplate({
				ApplicationId: applicationId,
				TemplateId: templateId
			}).promise();

			if (resp.Status !== "ACTIVE") {
				throw new Error("CloudFormation template not ready yet...");
			}

			return resp.TemplateUrl;
		},
		{
			// 1s between attempts, for a total of 3 mins
			retries: 180,
			factor: 1,
			minTimeout: ONE_SECOND,
			maxTimeout: ONE_SECOND
		}
	);
};

const waitForCloudFormationComplete = async stackName => {
	const AWS = getAWSSDK();
	const CloudFormation = new AWS.CloudFormation();
	const FailedStates = [
		"ROLLBACK_COMPLETE",
		"UPDATE_ROLLBACK_FAILED",
		"UPDATE_ROLLBACK_COMPLETE"
	];

	console.log("waiting for SAR deployment to finish...");

	return await Retry(
		async bail => {
			const resp = await CloudFormation.describeStacks({
				StackName: stackName
			}).promise();

			const stack = resp.Stacks[0];
			if (FailedStates.includes(stack.StackStatus)) {
				bail(
					new Error(
						`deployment failed, stack is in [${stack.StackStatus}] status`
					)
				);
			} else if (!stack.StackStatus.endsWith("COMPLETE")) {
				throw new Error(`stack is in [${stack.StackStatus}] status`);
			} else {
				process.stdout.write("\n");
				return stack.Outputs;
			}
		},
		{
			retries: 300, // 5 mins
			factor: 1,
			minTimeout: ONE_SECOND,
			maxTimeout: ONE_SECOND,
			onRetry: () => process.stdout.write(".")
		}
	);
};

module.exports = {
	getLatestVersion,
	deploy
};
