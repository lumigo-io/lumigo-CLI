const _ = require("lodash");
const { ClearResult } = require("./utils");
const retry = require("async-retry");

const regions = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	"ca-central-1",
	"eu-north-1",
	"eu-west-1",
	"eu-west-2",
	"eu-west-3",
	"eu-central-1",
	"ap-northeast-1",
	"ap-northeast-2",
	"ap-southeast-1",
	"ap-southeast-2",
	"ap-south-1",
	"sa-east-1"
];

const stackStatusToDelete = [
	"CREATE_FAILED",
	"CREATE_COMPLETE",
	"ROLLBACK_FAILED",
	"ROLLBACK_COMPLETE",
	"DELETE_FAILED",
	"UPDATE_COMPLETE",
	"UPDATE_ROLLBACK_FAILED",
	"UPDATE_ROLLBACK_COMPLETE",
	"IMPORT_COMPLETE",
	"IMPORT_ROLLBACK_FAILED",
	"IMPORT_ROLLBACK_COMPLETE"
];

const deleteStack = async (stackName, region, retryOpts, AWS) => {
	const CloudFormation = new AWS.CloudFormation({ region });
	// I've noticed that sometimes delete stacks succeeds after a second run.
	await retry(async () => {
		await CloudFormation.deleteStack({
			StackName: stackName
		}).promise();

		await CloudFormation.waitFor("stackDeleteComplete", {
			StackName: stackName
		}).promise();
	}, retryOpts);
};

/**
 * Delete all stacks in AWS account
 * @param AWS
 * @returns {Promise<*>} A list of objects with
 * {
 *   status: success | fail
 *   stackName: stack name
 *   reason: The exception object | null
 *   region: Stacks' region
 */
const deleteAllStacks = async (
	AWS,
	retryOpts = {
		retries: 2,
		minTimeout: 5000
	}
) => {
	const allStacksPromises = regions.map(region =>
		getAllStacksInRegion(region, stackStatusToDelete, AWS)
	);
	const allStacks = await Promise.all(allStacksPromises);
	const deletionPromises = _.flatten(allStacks).map(async stack => {
		if (stackStatusToDelete.includes(stack.stackStatus)) {
			try {
				await deleteStack(stack.stackName, stack.region, retryOpts, AWS);
				process.stdout.write(".".green);
				return ClearResult.getSuccess(stack.stackName, stack.region);
			} catch (e) {
				process.stdout.write("F".red);
				return ClearResult.getFailed(stack.stackName, stack.region, e);
			}
		} else {
			process.stdout.write("S".yellow);
			return new ClearResult(
				stack.stackName,
				ClearResult.SKIP,
				stack.region,
				new Error(stack.stackStatus)
			);
		}
	});

	return await Promise.all(deletionPromises);
};

/**
 * Gets all stacks in a specific region.
 * @param region
 * @param AWS
 * @returns A list in which each item has
 * {
      stackId,
			stackName,
			stackStatus,
			region
		}
 */
const getAllStacksInRegion = async (region, only, AWS) => {
	const CloudFormation = new AWS.CloudFormation({ region });

	let foundStacks = [];
	let response = {};
	do {
		const params = response.NextToken
			? { StackStatusFilter: only, NextToken: response.NextToken }
			: { StackStatusFilter: only };
		response = await CloudFormation.listStacks(params).promise();
		foundStacks = foundStacks.concat(
			response.StackSummaries.map(val => {
				return {
					stackId: val.StackId,
					stackName: val.StackName,
					stackStatus: val.StackStatus,
					region
				};
			})
		);
	} while (response.NextToken);

	return foundStacks;
};

const getAllStacksCount = async AWS => {
	const allStacksPromises = regions.map(region =>
		getAllStacksInRegion(region, stackStatusToDelete, AWS)
	);
	const allStacks = await Promise.all(allStacksPromises);

	return _.flatten(allStacks).length;
};
module.exports = {
	getAllStacksInRegion,
	deleteAllStacks,
	getAllStacksCount,
	stackStatusToDelete
};
