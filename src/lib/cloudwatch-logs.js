const _ = require("lodash");
const { ClearResult } = require("./utils");
const retry = require("async-retry");
const async = require("async");

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

const deleteLogGroup = async (logGroupName, region, retryOpts, AWS) => {
	const CloudWatchLogs = new AWS.CloudWatchLogs({ region });
	await retry(async bail => {
		try {
			await CloudWatchLogs.deleteLogGroup({
				logGroupName: logGroupName
			}).promise();
		} catch (e) {
			if (e.code !== "Throttling") {
				bail(e);
			} else {
				throw e;
			}
		}
	}, retryOpts);
};

const deleteAllLogGroups = async (
	AWS,
	retryOpts = {
		retries: 3,
		minTimeout: 1000
	}
) => {
	const allLogGroupsPromises = regions.map(region =>
		getAllLogGroupsInRegion(region, AWS)
	);
	const allLogGroups = await Promise.all(allLogGroupsPromises);
	const results = [];
	const asyncQueue = async.queue(async logGroup => {
		try {
			await deleteLogGroup(logGroup.logGroupName, logGroup.region, retryOpts, AWS);
			process.stdout.write(".".green);
			results.push(ClearResult.getSuccess(logGroup.logGroupName, logGroup.region));
		} catch (e) {
			process.stdout.write("F".red);
			results.push(
				ClearResult.getFailed(logGroup.logGroupName, logGroup.region, e)
			);
		}
	}, 10);

	_.flatten(allLogGroups).forEach(stack => {
		asyncQueue.push(stack);
	});

	await asyncQueue.drain();
	return results;
};

const getAllLogGroupsInRegion = async (region, AWS) => {
	const CloudWatchLogs = new AWS.CloudWatchLogs({ region });

	let logGroups = [];
	let response = {};
	do {
		const params = response.nextToken ? { nextToken: response.nextToken } : {};
		response = await CloudWatchLogs.describeLogGroups(params).promise();
		logGroups = logGroups.concat(
			response.logGroups.map(val => {
				return {
					logGroupName: val.logGroupName,
					arn: val.arn,
					storedBytes: val.storedBytes,
					region
				};
			})
		);
	} while (response.nextToken);

	return logGroups;
};

const getAllLogGroupsCount = async AWS => {
	const allLogGroupsPromises = regions.map(region =>
		getAllLogGroupsInRegion(region, AWS)
	);
	const allLogGroups = await Promise.all(allLogGroupsPromises);

	return _.flatten(allLogGroups).length;
};

module.exports = {
	getAllLogGroupsInRegion,
	deleteAllLogGroups,
	getAllLogGroupsCount
};
