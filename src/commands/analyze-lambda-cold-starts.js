const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const Table = require("cli-table");
const humanize = require("humanize");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Lambda = require("../lib/lambda");
const Retry = require("async-retry");
require("colors");

const ONE_HOUR_IN_SECONDS = 60 * 60;
const queryString = `
fields @memorySize / 1000000 as memorySize
  | filter @message like /(?i)(Init Duration)/
  | parse @message /^REPORT.*Init Duration: (?<initDuration>.*) ms.*/
  | parse @log /^.*\\/aws\\/lambda\\/(?<functionName>.*)/
  | stats count() as coldStarts, 
          median(initDuration) as avgInitDuration, 
          percentile(initDuration, 75) as p75,
          percentile(initDuration, 95) as p95,
          max(initDuration) as maxInitDuration
    by functionName, memorySize`;

class AnalyzeLambdaColdStartsCommand extends Command {
	async run() {
		const { flags } = this.parse(AnalyzeLambdaColdStartsCommand);
		let { name, region, profile, hours, days } = flags;
		global.profile = profile;

		checkVersion();

		if (days) {
			hours = days * 24;
		}

		global.hours = hours;

		this.log(`analyzing cold starts over the last ${hours} hours`);

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
		const rows = await this.getStats(region, [functionName]);
		const pc = await this.getProvisionedConcurrency(region, [functionName]);

		if (_.isEmpty(rows)) {
			return [Object.assign({}, functionDetail, pc[functionName])];
		} else {
			return rows.map(row =>
				Object.assign({}, functionDetail, row, pc[functionName])
			);
		}
	}

	async getFunctionsInRegion(region) {
		const functionDetails = await Lambda.getFunctionsInRegion(region, getAWSSDK());
		const functionNames = functionDetails.map(x => x.functionName);
		const rows = await this.getStats(region, functionNames);
		const pcs = await this.getProvisionedConcurrency(region, functionNames);

		return _.flatMap(functionDetails, func => {
			const functionRows = rows.filter(x => x.functionName === func.functionName);
			const pc = pcs[func.functionName];
			if (_.isEmpty(functionRows)) {
				return [Object.assign({}, func, pc)];
			} else {
				return functionRows.map(x => Object.assign({}, func, x, pc));
			}
		});
	}

	async getFunctionsinAllRegions() {
		const promises = Lambda.regions.map(region => this.getFunctionsInRegion(region));
		const results = await Promise.all(promises);
		return _.flatMap(results);
	}

	async getProvisionedConcurrency(region, functionNames) {
		if (_.isEmpty(functionNames)) {
			return {};
		}

		const AWS = getAWSSDK();
		const Lambda = new AWS.Lambda({ region });

		this.log(
			`${region}: analyzing Provisioned Concurrency for ${functionNames.length} functions`
		);

		const getPcForFunction = async (
			functionName,
			sum = 0,
			qualifiers = [],
			marker
		) => {
			const resp = await Lambda.listProvisionedConcurrencyConfigs({
				FunctionName: functionName,
				Marker: marker
			}).promise();

			const pc = _.sumBy(
				resp.ProvisionedConcurrencyConfigs,
				x => x.AllocatedProvisionedConcurrentExecutions
			);

			const newQualifiers = _.map(resp.ProvisionedConcurrencyConfigs, x =>
				_.last(x.FunctionArn.split(":"))
			);

			if (resp.NextMarker) {
				return getPcForFunction(
					functionName,
					sum + pc,
					qualifiers.concat(newQualifiers),
					resp.NextMarker
				);
			} else {
				return {
					functionName,
					sum: sum + pc,
					qualifiers: qualifiers.concat(newQualifiers)
				};
			}
		};

		const promises = functionNames.map(fn => getPcForFunction(fn));
		const results = await Promise.all(promises);

		const functionsWithPc = results.filter(x => !_.isEmpty(x.qualifiers));
		const pcUtilizations = await this.getProvisionedConcurrencyUtilization(
			region,
			functionsWithPc
		);

		const pairs = results.map(x => [
			x.functionName,
			{
				provisionedConcurrency: x.sum,
				provisionedConcurrencyUtilization: _.get(
					pcUtilizations,
					x.functionName,
					0
				)
			}
		]);

		return _.fromPairs(pairs);
	}

	async utilizationMetric(functionName, qualifier) {
		return {
			Id:
				functionName.toLowerCase().replace(/\W/g, "") +
				qualifier.toLowerCase().replace(/\W/g, ""),
			Label: functionName,
			MetricStat: {
				Metric: {
					Dimensions: [
						{
							Name: "FunctionName",
							Value: functionName
						},
						{
							Name: "Resource",
							Value: `${functionName}:${qualifier}`
						}
					],
					MetricName: "ProvisionedConcurrencyUtilization",
					Namespace: "AWS/Lambda"
				},
				Period: ONE_HOUR_IN_SECONDS,
				Stat: "Maximum"
			},
			ReturnData: true
		};
	}

	async getProvisionedConcurrencyUtilization(region, functions) {
		const AWS = getAWSSDK();
		const CloudWatch = new AWS.CloudWatch({ region });

		const startTime = new Date();
		startTime.setHours(startTime.getHours() - global.hours);

		const queries = _.flatMap(functions, ({ functionName, qualifiers }) =>
			qualifiers.map(qualifier => this.utilizationMetric(functionName, qualifier))
		);

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
		const summaries = functions.map(({ functionName }) => {
			const maxUtilization = _.chain(metricDataResults)
				.filter(r => r.Label === functionName)
				.flatMap(r => r.Values)
				.max()
				.value();

			return [functionName, maxUtilization];
		});

		return _.fromPairs(summaries);
	}

	async getStats(region, functionNames) {
		if (_.isEmpty(functionNames)) {
			return [];
		}

		const AWS = getAWSSDK();
		const CloudWatchLogs = new AWS.CloudWatchLogs({ region });

		const endTime = new Date();
		const startTime = new Date();
		startTime.setHours(startTime.getHours() - global.hours);

		this.log(
			`${region}: running CloudWatch Insights query against ${functionNames.length} log groups`
		);
		this.log(`${region}: query start time is ${startTime.toJSON()}`);
		this.log(`${region}: end time is ${endTime.toJSON()}`);

		// CW Insights only allows up to 20 log groups at a time
		const promises = _.chunk(functionNames, 20).map(async chunk => {
			const logGroupNames = chunk.map(x => `/aws/lambda/${x}`);

			const startResp = await CloudWatchLogs.startQuery({
				logGroupNames,
				startTime: startTime.getTime() / 1000,
				endTime: endTime.getTime() / 1000,
				queryString
			}).promise();

			const queryId = startResp.queryId;
			const results = await Retry(
				async () => {
					const resp = await CloudWatchLogs.getQueryResults({
						queryId
					}).promise();

					if (resp.status !== "Complete") {
						throw new Error("query result not ready yet...");
					}

					return resp.results;
				},
				{
					retries: 200, // 10 mins
					minTimeout: 3000,
					maxTimeout: 3000
				}
			);

			return results;
		});

		const rows = _.flatMap(await Promise.all(promises));
		this.log(`${region}: query returned ${rows.length} rows in total`);

		return rows.map(fields => {
			return _.reduce(
				fields,
				(acc, field) => {
					acc[field.field] = this.tryParseFloat(field.value);
					return acc;
				},
				{}
			);
		});
	}

	formatInitDuration(n) {
		if (n < 100) {
			return n.toString().green;
		} else if (n < 500) {
			return n;
		} else if (n < 1000) {
			return n.toString().yellow;
		} else {
			return n.toString().bold.red.bgWhite;
		}
	}

	formatPcUtilization(n) {
		if (n > 0.3 && n < 0.8) {
			return ((n * 100).toString() + "%").green;
		} else if (n === 0 || n === undefined || n === null) {
			return "-";
		} else {
			return ((n * 100).toString() + "%").yellow;
		}
	}

	tryParseFloat(str) {
		const n = parseFloat(str);
		return _.isNaN(n) ? str : n;
	}

	show(functions) {
		const table = new Table({
			head: [
				"region",
				"name",
				"runtime",
				"memory",
				"count",
				"median init",
				"p75",
				"p95",
				"max init",
				"provisioned concurrency (PC)",
				"PC utilization"
			]
		});

		const [hasColdStarts, noColdStarts] = _.partition(
			functions,
			f => f.coldStarts > 0
		);
		_.sortBy(hasColdStarts, ["coldStarts", "avgInitDuration"])
			.reverse()
			.forEach(x => {
				table.push([
					x.region,
					humanize.truncatechars(x.functionName, 45),
					x.runtime,
					x.memorySize,
					x.coldStarts || "-",
					x.avgInitDuration ? this.formatInitDuration(x.avgInitDuration) : "-",
					x.p75 ? this.formatInitDuration(x.p75) : "-",
					x.p95 ? this.formatInitDuration(x.p95) : "-",
					x.maxInitDuration ? this.formatInitDuration(x.maxInitDuration) : "-",
					x.provisionedConcurrency || "-",
					this.formatPcUtilization(x.provisionedConcurrencyUtilization)
				]);
			});

		noColdStarts.forEach(x => {
			table.push([
				x.region,
				humanize.truncatechars(x.functionName, 45),
				x.runtime,
				x.memorySize,
				x.coldStarts || "-",
				x.avgInitDuration ? this.formatInitDuration(x.avgInitDuration) : "-",
				x.p75 ? this.formatInitDuration(x.p75) : "-",
				x.p95 ? this.formatInitDuration(x.p95) : "-",
				x.maxInitDuration ? this.formatInitDuration(x.maxInitDuration) : "-",
				x.provisionedConcurrency || "-",
				this.formatPcUtilization(x.provisionedConcurrencyUtilization)
			]);
		});

		this.log(table.toString());

		this.log(
			`
  Hint: the "init" times quoted about are the time it takes to execute "function's initialization 
  code that is run before the handler".
  i.e. requiring dependencies, initializing global variables, etc.
  
  It's NOT the entire cold start duration (it doesn't include the container allocation time. But 
  it's the only part of the cold start that YOU control and can therefore optimize.
  
  To optimize Node.js function cold starts, check out this post:
    https://theburningmonk.com/2019/03/just-how-expensive-is-the-full-aws-sdk/
  
  (minimize dependencies, use specific AWS clients if you can, and use webpack)
    `.yellow
		);
	}
}

AnalyzeLambdaColdStartsCommand.description =
	"Analyze Lambda functions cold starts in ALL regions";
AnalyzeLambdaColdStartsCommand.flags = {
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
	hours: flags.integer({
		char: "h",
		description: "only find cold starts in the last X hours",
		required: false,
		exclusive: ["days"],
		default: 1
	}),
	days: flags.integer({
		char: "d",
		description: "only find cold starts in the last X days",
		required: false
	})
};

module.exports = AnalyzeLambdaColdStartsCommand;
