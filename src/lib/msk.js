const _ = require("lodash");
const { ClearResult } = require("./utils");
const retry = require("async-retry");
const async = require("async");

const regions = [
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	"ap-south-1",
	"ap-northeast-1",
	"ap-northeast-2",
	"ap-southeast-1",
	"ap-southeast-2",
	"ca-central-1",
	"eu-central-1",
	"eu-west-1",
	"eu-west-2",
	"eu-west-3",
	"eu-north-1",
	"sa-east-1"
];

async function deleteMskCluster(clusterDetails, retryOpts, AWS) {
	await retry(async bail => {
		try {
			return await new AWS.Kafka({ region: clusterDetails.region })
				.deleteCluster({ ClusterArn: clusterDetails.ClusterArn })
				.promise();
		} catch (e) {
			bail(e);
		}
	}, retryOpts);
}

const deleteAllMsk = async (
	AWS,
	retryOpts = {
		retries: 3,
		minTimeout: 1000
	}
) => {
	const allMskPromises = regions.map(region =>
		getAllMskInRegion(region, AWS)
	);
	const allMsks = await Promise.all(allMskPromises);
	const results = [];
	const asyncQueue = async.queue(async cluster => {
		try {
			await deleteMskCluster(cluster, retryOpts, AWS);
			process.stdout.write(".".green);
			results.push(ClearResult.getSuccess(cluster.ClusterArn, cluster.region));
		} catch (e) {
			process.stdout.write("F".red);
			results.push(ClearResult.getFailed(cluster.ClusterArn, cluster.region, e));
		}
	}, 10);

	_.flatten(allMsks).forEach(eventBridge => {
		asyncQueue.push(eventBridge);
	});

	await asyncQueue.drain();
	return results;
};

const getAllMskInRegion = async (region, AWS) => {
	const msk = new AWS.Kafka({ region });
	let clusters = await msk.listClustersV2().promise();
	clusters.region = region;
	return clusters.ClusterInfoList.map(cluster => {
		cluster.region = region;
		return cluster;
	});
};

const getAllMskCount = async AWS => {
	const allMskPromises = regions.map(region =>
		getAllMskInRegion(region, AWS)
	);
	const allMsks = await Promise.all(allMskPromises);

	return _.flatten(allMsks).length;
};

module.exports = {
	getAllMskCount,
	deleteAllMsk
};
