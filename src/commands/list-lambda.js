const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const Table = require("cli-table");
const humanize = require("humanize");
const moment = require("moment");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Lambda = require("../lib/lambda");
require("colors");

const ONE_HOUR_IN_SECONDS = 60 * 60;

class ListLambdaCommand extends Command {
	async run() {
		const { flags } = this.parse(ListLambdaCommand);
		const { inactive, region, profile } = flags;

		global.profile = profile;

		checkVersion();

		if (region) {
			this.show(await this.getFunctionsInRegion(region, inactive));
		} else {
			this.show(await this.getFunctionsinAllRegions(inactive));
		}
	}
  
	async getFunctionsInRegion(region, inactive) {
		const functions = await Lambda.getFunctionsInRegion(region);
		const functionNames = functions.map(x => x.functionName);
		const lastInvokedOn = await this.getLastInvocationDates(region, functionNames);
  
		return functions
			.map(x => {
				const lastUsed = lastInvokedOn[x.functionName];
				return Object.assign({ lastUsed }, x);
			})
			.filter(x => {
				if (!inactive) {
					return true;
				} else {
					return inactive && x.lastUsed.startsWith("inactive");
				}
			});
	}
  
	async getFunctionsinAllRegions(inactive) {
		const promises = Lambda.regions.map(region => this.getFunctionsInRegion(region, inactive));
		const results = await Promise.all(promises);
		return _.flatMap(results);
	}
  
	async getLastInvocationDates(region, functionNames) {
		const AWS = getAWSSDK();
		const CloudWatch = new AWS.CloudWatch({ region });
  
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
		const queries = functionNames.map(functionName => ({
			Id: functionName.toLowerCase().replace(/\W/g, ""),
			Label: functionName,
			MetricStat: {
				Metric: {
					Dimensions: [{ Name: "FunctionName", Value: functionName }],
					MetricName: "Invocations",
					Namespace: "AWS/Lambda"
				},
				Period: ONE_HOUR_IN_SECONDS,
				Stat: "Sum"
			},
			ReturnData: true
		}));
  
		// CloudWatch only allows 100 queries per request
		const promises = _.chunk(queries, 10).map(async chunk => {
			const resp = await CloudWatch.getMetricData({
				StartTime: thirtyDaysAgo,
				EndTime: new Date(),
				ScanBy: "TimestampDescending",
				MetricDataQueries: chunk
			}).promise();
  
			return resp.MetricDataResults;
		});
		const metricDataResults = _.flatMap(await Promise.all(promises));
  
		const lastInvocationDates = functionNames.map(functionName => {
			const metricData = metricDataResults.find(r => r.Label === functionName);
			if (_.isEmpty(metricData.Timestamps)) {
				return [functionName, "inactive for 30 days"];
			}
  
			const lastInvokedOn = _.max(metricData.Timestamps);
			return [functionName, moment(lastInvokedOn).fromNow()];
		});
  
		return _.fromPairs(lastInvocationDates);
	}
  
	show(functions) {
		const displayRuntime = runtime => {
			if (runtime === "nodejs8.10") {
				return runtime.red.bgWhite;
			} else {
				return runtime;
			}
		};
  
		const table = new Table({
			head: [
				"region",
				"name",
				"runtime",
				"memory",
				"code size",
				"last modified",
				"last used"
			]
		});
		functions.forEach(x => {
			table.push([
				x.region,
				humanize.truncatechars(x.functionName, 50),
				displayRuntime(x.runtime),
				x.memorySize,
				humanize.filesize(x.codeSize),
				moment(new Date(x.lastModified)).fromNow(),
				x.lastUsed
			]);
		});
  
		this.log(table.toString());
  
		const node8Function = functions.find(x => x.runtime === "nodejs8.10");
		if (node8Function) {
			this.log(`
  nodejs8.10 runtime is coming to EOL. There will be 2 stages to the deprecation process:
  
  1. Disable Function Create.
  Beginning January 6, 2020, customers will no longer be able to create functions using Node.js 8.10
  
  2. Disable Function Update.
  Beginning February 3, 2020, customers will no longer be able to update functions using Node.js 8.10
  
  After this period, both function creation and updates will be disabled permanently. However, existing Node 8.x functions will 
  still be available to process invocation events.`);
		}
	}
}

ListLambdaCommand.description = "List Lambda functions in ALL regions";
ListLambdaCommand.flags = {
	inactive: flags.boolean({
		char: "i",
		description: "only include functions that are inactive for 30 days",
		required: false,
		default: false
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
	})
};

module.exports = ListLambdaCommand;
