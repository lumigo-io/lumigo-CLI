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

const deleteEventBridge = async (eventBridgeName, region, retryOpts, AWS) => {
	const EventBridge = new AWS.EventBridge({ region });
	await retry(async bail => {
		try {
			// List all rules
			const rules = await getAllRulesBelongingToEventBridge(
				eventBridgeName,
				region,
				AWS
			);
			for (const rule of rules) {
				const targets = await getAllTargetsBelongingToRule(
					eventBridgeName,
					rule.name,
					region,
					AWS
				);
				const targetIDs = targets.map(target => target.targetId);
				if (targetIDs.length > 0) {
					await EventBridge.removeTargets({
						Ids: targetIDs,
						Rule: rule.name,
						EventBusName: eventBridgeName
					}).promise();
				}
				await EventBridge.deleteRule({
					Name: rule.name,
					EventBusName: eventBridgeName
				}).promise();
			}
			await EventBridge.deleteEventBus({
				Name: eventBridgeName
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

const deleteAllEventBridges = async (
	AWS,
	retryOpts = {
		retries: 3,
		minTimeout: 1000
	}
) => {
	const allEventBridgesPromises = regions.map(region =>
		getAllEventBridgeInRegion(region, AWS)
	);
	const allEventBridges = await Promise.all(allEventBridgesPromises);
	const results = [];
	const asyncQueue = async.queue(async x => {
		try {
			await deleteEventBridge(x.name, x.region, retryOpts, AWS);
			process.stdout.write(".".green);
			results.push(ClearResult.getSuccess(x.name, x.region));
		} catch (e) {
			process.stdout.write("F".red);
			results.push(ClearResult.getFailed(x.name, x.region, e));
		}
	}, 10);

	_.flatten(allEventBridges).forEach(eventBridge => {
		asyncQueue.push(eventBridge);
	});

	await asyncQueue.drain();
	return results;
};

const getAllRulesBelongingToEventBridge = async (eventBridgeName, region, AWS) => {
	const EventBridge = new AWS.EventBridge({ region });

	let rules = [];
	let response = {};
	do {
		let defaultParam = { EventBusName: eventBridgeName };
		const params = response.NextToken
			? defaultParam.set("NextToken", response.NextToken)
			: defaultParam;
		response = await EventBridge.listRules(params).promise();
		rules = rules.concat(
			response.Rules.map(val => {
				return {
					name: val.Name,
					arn: val.Arn,
					region
				};
			})
		);
	} while (response.NextToken);

	return rules;
};

const getAllTargetsBelongingToRule = async (eventBridgeName, ruleName, region, AWS) => {
	const EventBridge = new AWS.EventBridge({ region });

	let targets = [];
	let response = {};
	do {
		let defaultParams = { EventBusName: eventBridgeName, Rule: ruleName };
		const params = response.NextToken
			? defaultParams.set("NextToken", response.NextToken)
			: defaultParams;
		response = await EventBridge.listTargetsByRule(params).promise();
		targets = targets.concat(
			response.Targets.map(val => {
				return {
					targetId: val.Id,
					arn: val.Arn,
					region
				};
			})
		);
	} while (response.NextToken);

	return targets;
};

const getAllEventBridgeInRegion = async (region, AWS) => {
	const EventBridge = new AWS.EventBridge({ region });

	let bridges = [];
	let response = {};
	do {
		const params = response.NextToken ? { NextToken: response.NextToken } : {};
		response = await EventBridge.listEventBuses(params).promise();
		bridges = bridges.concat(
			response.EventBuses.filter(val => {
				return val.Name !== "default";
			}).map(val => {
				return {
					name: val.Name,
					arn: val.Arn,
					region
				};
			})
		);
	} while (response.NextToken);

	return bridges;
};

const getAllEventBridgeCount = async AWS => {
	const allEventBridgesPromises = regions.map(region =>
		getAllEventBridgeInRegion(region, AWS)
	);
	const allEventBridges = await Promise.all(allEventBridgesPromises);

	return _.flatten(allEventBridges).length;
};

module.exports = {
	deleteAllEventBridges,
	getAllEventBridgeCount
};
