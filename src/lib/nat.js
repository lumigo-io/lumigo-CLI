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

const deleteNatGateway = async (natGatewayId, region, retryOpts, AWS) => {
	const EC2 = new AWS.EC2({ region });
	await retry(async bail => {
		try {
			await EC2.deleteNatGateway({
				NatGatewayId: natGatewayId
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

const deleteAllNatGateways = async (
	AWS,
	retryOpts = {
		retries: 3,
		minTimeout: 1000
	}
) => {
	const allNatGatewaysPromises = regions.map(region =>
		getAllNatGatewaysInRegion(region, AWS)
	);
	const allNatGateways = await Promise.all(allNatGatewaysPromises);
	const results = [];
	const asyncQueue = async.queue(async x => {
		try {
			await deleteNatGateway(x.natGatewayId, x.region, retryOpts, AWS);
			process.stdout.write(".".green);
			results.push(ClearResult.getSuccess(x.natGatewayId, x.region));
		} catch (e) {
			process.stdout.write("F".red);
			results.push(
				ClearResult.getFailed(x.natGatewayId, x.region, e)
			);
		}
	}, 10);

	_.flatten(allNatGateways).forEach(natGateway => {
		asyncQueue.push(natGateway);
	});

	await asyncQueue.drain();
	return results;
};

const getAllNatGatewaysInRegion = async (region, AWS) => {
	const EC2 = new AWS.EC2({ region });

	let natGateways = [];
	let response = {};
	do {
		const params = response.NextToken ? { NextToken: response.NextToken } : {};
		response = await EC2.describeNatGateways(params).promise();
		natGateways = natGateways.concat(
			response.NatGateways.map(val => {
				return {
					natGatewayId: val.NatGatewayId,
					vpcId: val.VpcId,
					region
				};
			})
		);
	} while (response.NextToken);

	return natGateways;
};

const getAllNatGatewaysCount = async AWS => {
	const allNatGatewaysPromises = regions.map(region =>
		getAllNatGatewaysInRegion(region, AWS)
	);
	const allNatGateways = await Promise.all(allNatGatewaysPromises);

	return _.flatten(allNatGateways).length;
};

module.exports = {
	deleteAllNatGateways,
	getAllNatGatewaysCount
};
