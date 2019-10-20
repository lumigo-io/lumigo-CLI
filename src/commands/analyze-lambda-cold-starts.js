const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const Table = require("cli-table");
const humanize = require("humanize");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Lambda = require("../lib/lambda");
const Retry = require("async-retry");
require("colors");

class AnalyzeLambdaColdStartsCommand extends Command {
	async run() {
		const { flags } = this.parse(AnalyzeLambdaColdStartsCommand);
		let { name, region, profile, hours, days } = flags;
		global.profile = profile;

		checkVersion();

		if (days) {
			hours = days * 24;
		}

		this.log(`analyzing cold starts over the last ${hours} hours`);

		if (name) {
			show(await getFunctionInRegion(name, region, hours));
		} else if (region) {
			show(await getFunctionsInRegion(region, hours));
		} else {
			show(await getFunctionsinAllRegions(hours));
		}
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

const getFunctionInRegion = async (functionName, region, hours) => {
	const functionDetail = await Lambda.getFunctionInRegion(functionName, region);
	const rows = await getStats(region, hours, [functionName]);
	return rows.map(row => Object.assign({}, functionDetail, row));
};

const getFunctionsInRegion = async (region, hours) => {
	const functionDetails = await Lambda.getFunctionsInRegion(region);
	const functionNames = functionDetails.map(x => x.functionName);
	const rows = await getStats(region, hours, functionNames);
	return rows.map(row => {
		const func = functionDetails.find(x => x.functionName === row.functionName);
		return Object.assign({}, func, row);
	});
};

const getFunctionsinAllRegions = async hours => {
	const promises = Lambda.regions.map(region => getFunctionsInRegion(region, hours));
	const results = await Promise.all(promises);
	return _.flatMap(results);
};

const queryString = `
fields @memorySize / 1000000 as memorySize
  | filter @message like /(?i)(Init Duration)/
  | parse @message /^REPORT.*Init Duration: (?<initDuration>.*) ms.*/
  | parse @log /^.*\\/aws\\/lambda\\/(?<functionName>.*)/
  | stats count() as coldStarts, median(initDuration) as avgInitDuration, max(initDuration) as maxInitDuration by functionName, memorySize`;

const getStats = async (region, hours, functionNames) => {
	if (_.isEmpty(functionNames)) {
		return [];
	}

	const AWS = getAWSSDK();
	const CloudWatchLogs = new AWS.CloudWatchLogs({ region });

	const endTime = new Date();
	const startTime = new Date();
	startTime.setHours(startTime.getHours() - hours);

	console.log(
		`${region}: running CloudWatch Insights query against ${functionNames.length} log groups`
	);
	console.log(`${region}: query start time is ${startTime.toJSON()}`);
	console.log(`${region}: end time is ${endTime.toJSON()}`);

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
	console.log(`${region}: query returned ${rows.length} rows in total`);

	return rows.map(fields => {
		return _.reduce(
			fields,
			(acc, field) => {
				acc[field.field] = tryParseFloat(field.value);
				return acc;
			},
			{}
		);
	});
};

const formatInitDuration = n => {
	if (n < 100) {
		return n.toString().green;
	} else if (n < 500) {
		return n;
	} else if (n < 1000) {
		return n.toString().yellow;
	} else {
		return n.toString().bold.red.bgWhite;
	}
};

const show = functions => {
	const table = new Table({
		head: ["region", "name", "runtime", "memory", "count", "median init", "max init"]
	});
	_.sortBy(functions, ["coldStarts", "avgInitDuration"])
		.reverse()
		.forEach(x => {
			table.push([
				x.region,
				humanize.truncatechars(x.functionName, 45),
				x.runtime,
				x.memorySize,
				x.coldStarts,
				formatInitDuration(x.avgInitDuration),
				formatInitDuration(x.maxInitDuration)
			]);
		});

	console.log(table.toString());

	console.log(
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
};

const tryParseFloat = str => {
	const n = parseFloat(str);
	return _.isNaN(n) ? str : n;
};

module.exports = AnalyzeLambdaColdStartsCommand;
