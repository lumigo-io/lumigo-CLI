const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Promise = require("bluebird");
const moment = require("moment");
const inquirer = require("inquirer");

let Logs;

class TailCloudwatchLogsCommand extends Command {
	async run() {
		const { flags } = this.parse(TailCloudwatchLogsCommand);
		const { namePrefix, region, profile, filterPattern } = flags;

		global.region = region;
		global.profile = profile;
		global.filterPattern = filterPattern;

		checkVersion();
    
		const AWS = getAWSSDK();
		Logs = new AWS.CloudWatchLogs();
    
		this.log(`looking for CloudWatch log groups with prefix [${namePrefix}] in [${region}]`);
		const logGroupName = await getLogGroupName(namePrefix);
    
		this.log("looking for log stremas...");
		const logStreamNames = await getLogStreamNames(logGroupName);
    
		this.log(`polling CLoudWatch log group ${logGroupName}...`);
		this.log("press <any key> to stop");
		await pollLogGroup(logGroupName, logStreamNames);

		process.exit(0);
	}
}

TailCloudwatchLogsCommand.description = "Tail a CloudWatch Log Group";
TailCloudwatchLogsCommand.flags = {
	namePrefix: flags.string({
		char: "n",
		description: "name prefix of the log group, e.g. /aws/lambda/workshop-dev-",
		required: true
	}),
	region: flags.string({
		char: "r",
		description: "AWS region, e.g. us-east-1",
		required: true
	}),
	profile: flags.string({
		char: "p",
		description: "AWS CLI profile name",
		required: false
	}),
	filterPattern: flags.string({
		char: "f",
		description: "used to filter the logs",
		required: false
	}),
};

const getLogGroupName = async namePrefix => {
	const resp = await Logs.describeLogGroups({
		logGroupNamePrefix: namePrefix
	}).promise();

	if (resp.logGroups.length === 1) {
		console.log("Only 1 match found.");
		return resp.logGroups[0].logGroupName;
	} else if (_.isEmpty(resp.logGroups)) {
		console.log("no matching log groups, please double check the prefix and region and try again");
		throw new Error("log groups not found");
	} else if (resp.nextToken) {
		console.log("Too many log groups with matching prefix, please provide the full log group name and try again");
		throw new Error("too many log groups");
	} else {
		const logGroupChoices = resp.logGroups.map(x => x.logGroupName);
		const { logGroupName } = await inquirer.prompt([
			{
				type: "list",
				name: "logGroupName",
				message: "Which log group are you looking for?",
				choices: logGroupChoices
			}
		]);
    
		return logGroupName;
	}
};

const getLogStreamNames = async logGroupName => {
	const resp = await Logs.describeLogStreams({
		logGroupName,
		descending: true,
		limit: 50,
		orderBy: "LastEventTime"
	}).promise();
  
	if (_.isEmpty(resp.logStreams)) {
		console.log("there are no log streams right now, please try again later");
		throw new Error("no log streams");
	} else {
		return resp.logStreams.map(x => x.logStreamName);
	}
};

const pollLogGroup = async (logGroupName, logStreamNames) => {
	let polling = true;
	const readline = require("readline");
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	const stdin = process.openStdin();
	stdin.once("keypress", () => {
		polling = false;
		console.log("stopping...");
	});
  
	const AWS = getAWSSDK();
	const Logs = new AWS.CloudWatchLogs();
  
	const fetch = async (startTime, endTime, nextToken, acc = []) => {
		const resp = await Logs.filterLogEvents({
			logGroupName,
			logStreamNames,
			interleaved: true,
			filterPattern: global.filterPattern,
			startTime,
			endTime,
			nextToken
		}).promise();
    
		const logMessages = resp.events.map(x => x.message);
		if (resp.nextToken) {
			return fetch(startTime, endTime, resp.nextToken, acc.concat(logMessages));
		} else {
			return acc.concat(logMessages);
		}
	};
  
	// start from 5s ago
	let startTime = moment.utc(moment.now()).valueOf() - 5000;
	let endTime = moment.utc(moment.now()).valueOf();
	while (polling) {
		const logMessages = await fetch(startTime, endTime);
		logMessages.forEach(console.log);
		await Promise.delay(1000);
    
		startTime = endTime;
		endTime = moment.utc(moment.now()).valueOf();
	}
};

module.exports = TailCloudwatchLogsCommand;
