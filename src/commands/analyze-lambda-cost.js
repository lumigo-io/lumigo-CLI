const _ = require("lodash");
const AWS = require("aws-sdk");
const Table = require("cli-table");
const humanize = require("humanize");
const {Command, flags} = require("@oclif/command");
const {checkVersion} = require("../lib/version-check");
const {regions} = require("../lib/lambda");
require("colors");

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const COST_PER_REQ = 0.0000002;
const COST_PER_100MS = 0.000000208;

class AnalyzeLambdaCostCommand extends Command {
	async run() {
		const {flags} = this.parse(AnalyzeLambdaCostCommand);
		const {region, profile} = flags;
    
		if (profile) {
			const credentials = new AWS.SharedIniFileCredentials({ profile });
			AWS.config.credentials = credentials;
		}
    
		checkVersion();
    
		if (region) {
			show(await getFunctionsInRegion(region));
		} else {
			show(await getFunctionsinAllRegions());
		}
	}
}

AnalyzeLambdaCostCommand.description = "Analyze Lambda functions costs in ALL regions";
AnalyzeLambdaCostCommand.flags = {
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

const invocationCountMetric = (functionName) => ({
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

const durationMetric = (functionName) => ({
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

const getCostSummary = async (region, functions) => {
	const CloudWatch = new AWS.CloudWatch({ region });
  
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate()-30);
  
	const queries = _.flatMap(functions, ({ functionName }) => [
		invocationCountMetric(functionName),
		durationMetric(functionName)
	]);
  
	const resp = await CloudWatch.getMetricData({
		StartTime: thirtyDaysAgo,
		EndTime: new Date(),
		ScanBy: "TimestampDescending",
		MetricDataQueries: queries
	}).promise();
  
	const summaries = functions.map(({ functionName, memorySize }) => {
		const invocationCount = _.chain(resp.MetricDataResults)
			.filter(r => r.Label === functionName + "InvocationCount")
			.flatMap(r => r.Values)
			.sum()
			.value();
      
		if (invocationCount === 0) {
			return [functionName, { totalCost: 0, averageCost: 0, invocationCount }];
		}
      
		const totalDuration = _.chain(resp.MetricDataResults)
			.filter(r => r.Label === functionName + "Duration")
			.flatMap(r => r.Values)
			.sum()
			.value();

		const avgDuration = totalDuration / invocationCount;
		const averageCost = Math.ceil(avgDuration / 100) * (memorySize / 128) * COST_PER_100MS + COST_PER_REQ;
		const totalCost = averageCost * invocationCount;      
    
		return [functionName, { totalCost, averageCost, invocationCount }];
	});
  
	return _.fromPairs(summaries);
};

const getFunctionsInRegion = async (region) => {
	const Lambda = new AWS.Lambda({ region });

	const loop = async (acc = [], marker) => {
		const resp = await Lambda.listFunctions({
			Marker: marker,
			MaxItems: 50
		}).promise();
    
		if (_.isEmpty(resp.Functions)) {
			return acc;
		}
    
		const summaries = await getCostSummary(
			region, 
			resp.Functions.map(x => ({
				functionName: x.FunctionName,
				memorySize: x.MemorySize
			})));

		for (const func of resp.Functions) {
			const functionDetails = {
				region: region,
				functionName: func.FunctionName,
				runtime: func.Runtime,
				memory: func.MemorySize,
				totalCost: summaries[func.FunctionName].totalCost,
				averageCost: summaries[func.FunctionName].averageCost,
				invocationCount: summaries[func.FunctionName].invocationCount
			};
      
			acc.push(functionDetails);
		}

		if (resp.NextMarker) {
			return await loop(acc, resp.NextMarker);
		} else {
			return acc;
		}
	};

	return loop();
};

const getFunctionsinAllRegions = async () => {
	const promises = regions.map(region => getFunctionsInRegion(region));
	const results = await Promise.all(promises);
	return _.flatMap(results);
};

const show = (functions) => {
	const displayCost = x => x === 0 ? "-" : x.toFixed(10);
	const table = new Table({
		head: ["region", "name", "runtime", "memory", "30 day cost ($)", "invocations", "avg cost ($)/invocation"]
	});
	_.sortBy(functions, "totalCost")
		.reverse()
	  .forEach(x => {
			table.push([ 
				x.region, 
				humanize.truncatechars(x.functionName, 50),
				x.runtime, 
				x.memory,
				displayCost(x.totalCost),
				x.invocationCount,
				displayCost(x.averageCost)
			]);
		});
  
	console.log(table.toString());
  
	console.log("DISCLAIMER: the above are estimated costs.".bold.red.bgWhite);
	console.log("Actual cost can vary due to a number of factors such as free tier.");
	console.log("To see estimated cost as a metric by function, check out our SAR app - async-custom-metrics - which you can install from:");
	console.log("https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:374852340823:applications~async-custom-metrics".underline.bold.blue);
};

module.exports = AnalyzeLambdaCostCommand;
