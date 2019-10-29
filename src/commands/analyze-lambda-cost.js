const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const Table = require("cli-table");
const humanize = require("humanize");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Lambda = require("../lib/lambda");
require("colors");

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const COST_PER_REQ = 0.0000002;
const COST_PER_100MS = 0.000000208;

class AnalyzeLambdaCostCommand extends Command {
	async run() {
		const { flags } = this.parse(AnalyzeLambdaCostCommand);
		const { name, region, profile, days } = flags;

		global.profile = profile;
		global.days = days || 30; // defaults to check last 30 days

		checkVersion();

		if (name) {
			show(await getFunctionInRegion(name, region));
		} else if (region) {
			show(await getFunctionsInRegion(region));
		} else {
			show(await getFunctionsinAllRegions());
		}
	}
}

AnalyzeLambdaCostCommand.description = "Analyze Lambda functions costs in ALL regions";
AnalyzeLambdaCostCommand.flags = {
	name: flags.string({
		char: "n",
		description: "only analyze this function, e.g. hello-world",
		required: false,
		dependsOn: ["region"]
	}),
	region: flags.string({
		char: "r",
		description: "only include functions in an AWS region, e.g. us-east-1",
		required: false
	}),
	profile: flags.string({
		char: "p",
		description: "AWS CLI profile name",
		required: false
	}),
	days: flags.integer({
		char: "d",
		description: "analyze lambda cost for the last X days",
		required: false
	})
};

const getFunctionInRegion = async (functionName, region) => {
	const functionDetail = await Lambda.getFunctionInRegion(functionName, region);
	const summary = await getCostSummary(region, [functionDetail]);
	return [
		Object.assign(
			{
				totalCost: 0,
				invocationCount: 0,
				averageCost: 0
			},
			functionDetail,
			summary
		)
	];
};

const getFunctionsInRegion = async region => {
	const functions = await Lambda.getFunctionsInRegion(region);
	const summaries = await getCostSummary(region, functions);

	return functions.map(x => {
		const summary = summaries[x.functionName];
		return Object.assign({}, x, summary);
	});
};

const getFunctionsinAllRegions = async () => {
	const promises = Lambda.regions.map(region => getFunctionsInRegion(region));
	const results = await Promise.all(promises);
	return _.flatMap(results);
};

const getCostSummary = async (region, functions) => {
	const AWS = getAWSSDK();
	const CloudWatch = new AWS.CloudWatch({ region });

	const startTime = new Date();
	startTime.setDate(startTime.getDate() - global.days);

	const queries = _.flatMap(functions, ({ functionName }) => [
		invocationCountMetric(functionName),
		durationMetric(functionName)
	]);
  
	// CloudWatch only allows 100 queries per request
	const promises = _.chunk(queries, 100).map(async chunk => {
		const resp = await CloudWatch.getMetricData({
			StartTime: startTime,
			EndTime: new Date(),
			ScanBy: "TimestampDescending",
			MetricDataQueries: chunk
		}).promise();
    
		return resp.MetricDataResults;
	});
	const metricDataResults = _.flatMap(await Promise.all(promises));

	const summaries = functions.map(({ functionName, memorySize }) => {
		const invocationCount = _.chain(metricDataResults)
			.filter(r => r.Label === functionName + "InvocationCount")
			.flatMap(r => r.Values)
			.sum()
			.value();

		if (invocationCount === 0) {
			return [functionName, { totalCost: 0, averageCost: 0, invocationCount }];
		}

		const totalDuration = _.chain(metricDataResults)
			.filter(r => r.Label === functionName + "Duration")
			.flatMap(r => r.Values)
			.sum()
			.value();

		const avgDuration = totalDuration / invocationCount;
		const averageCost =
			Math.ceil(avgDuration / 100) * (memorySize / 128) * COST_PER_100MS +
			COST_PER_REQ;
		const totalCost = averageCost * invocationCount;

		return [functionName, { totalCost, averageCost, invocationCount }];
	});

	return _.fromPairs(summaries);
};

const show = functions => {
	const displayCost = x => (x === 0 ? "-" : x.toFixed(10));
	const table = new Table({
		head: [
			"region",
			"name",
			"runtime",
			"memory",
			`${global.days} day ($)`,
			"invocations",
			"avg ($)/invocation"
		]
	});
	_.sortBy(functions, "totalCost")
		.reverse()
		.forEach(x => {
			table.push([
				x.region,
				humanize.truncatechars(x.functionName, 40),
				x.runtime,
				x.memorySize,
				displayCost(x.totalCost),
				x.invocationCount,
				displayCost(x.averageCost)
			]);
		});

	console.log(table.toString());

	console.log("DISCLAIMER: the above are estimated costs.".bold.red.bgWhite);
	console.log("Actual cost can vary due to a number of factors such as free tier.");
	console.log(
		"To see estimated cost as a metric by function, check out our SAR app - async-custom-metrics - which you can install from:"
	);
	console.log(
		"https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:374852340823:applications~async-custom-metrics"
			.underline.bold.blue
	);
};

const invocationCountMetric = functionName => ({
	Id: functionName.toLowerCase().replace(/\W/g, "") + "InvocationCount",
	Label: functionName + "InvocationCount",
	MetricStat: {
		Metric: {
			Dimensions: [{ Name: "FunctionName", Value: functionName }],
			MetricName: "Invocations",
			Namespace: "AWS/Lambda"
		},
		Period: ONE_DAY_IN_SECONDS,
		Stat: "Sum"
	},
	ReturnData: true
});

const durationMetric = functionName => ({
	Id: functionName.toLowerCase().replace(/\W/g, "") + "Duration",
	Label: functionName + "Duration",
	MetricStat: {
		Metric: {
			Dimensions: [{ Name: "FunctionName", Value: functionName }],
			MetricName: "Duration",
			Namespace: "AWS/Lambda"
		},
		Period: ONE_DAY_IN_SECONDS,
		Stat: "Sum"
	},
	ReturnData: true
});

module.exports = AnalyzeLambdaCostCommand;
