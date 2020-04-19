const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const Table = require("cli-table");
const humanize = require("humanize");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Lambda = require("../lib/lambda");
const { track } = require("../lib/analytics");
require("colors");

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const COST_PER_REQ = 0.0000002;
const COST_PER_100MS = 0.000000208;

class AnalyzeLambdaCostCommand extends Command {
	async run() {
		const { flags } = this.parse(AnalyzeLambdaCostCommand);
		const { name, region, profile, days, httpProxy } = flags;

		global.profile = profile;
		global.httpProxy = httpProxy;
		global.days = days || 30; // defaults to check last 30 days

		checkVersion();

		track("analyze-lambda-cost", { region, days, hasName: !_.isEmpty(name) });

		if (name) {
			this.show(await this.getFunctionInRegion(name, region));
		} else if (region) {
			this.show(await this.getFunctionsInRegion(region));
		} else {
			this.show(await this.getFunctionsinAllRegions());
		}
	}

	async getFunctionInRegion(functionName, region) {
		const functionDetail = await Lambda.getFunctionInRegion(functionName, region);
		const summary = await this.getCostSummary(region, [functionDetail]);
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
	}

	async getFunctionsInRegion(region) {
		const functions = await Lambda.getFunctionsInRegion(region, getAWSSDK());
		const summaries = await this.getCostSummary(region, functions);

		return functions.map(x => {
			const summary = summaries[x.functionName];
			return Object.assign({}, x, summary);
		});
	}

	async getFunctionsinAllRegions() {
		const promises = Lambda.regions.map(region => this.getFunctionsInRegion(region));
		const results = await Promise.all(promises);
		return _.flatMap(results);
	}

	async getCostSummary(region, functions) {
		const AWS = getAWSSDK();
		const CloudWatch = new AWS.CloudWatch({ region });

		const startTime = new Date();
		startTime.setDate(startTime.getDate() - global.days);

		const queries = _.flatMap(functions, ({ functionName }) => [
			this.invocationCountMetric(functionName),
			this.durationMetric(functionName)
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
	}

	show(functions) {
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

		this.log(table.toString());

		this.log("DISCLAIMER: the above are estimated costs.".bold.red.bgWhite);
		this.log("Actual cost can vary due to a number of factors such as free tier.");
		this.log(
			"To see estimated cost as a metric by function, check out our SAR app - async-custom-metrics - which you can install from:"
		);
		this.log(
			"https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:374852340823:applications~async-custom-metrics"
				.underline.bold.blue
		);
	}

	invocationCountMetric(functionName) {
		return {
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
		};
	}

	durationMetric(functionName) {
		return {
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
		};
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
	}),
	httpProxy: flags.string({
		description: "URL of the http/https proxy (when running in a corporate network)",
		required: false
	})
};

module.exports = AnalyzeLambdaCostCommand;
