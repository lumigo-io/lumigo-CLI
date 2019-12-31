const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Promise = require("bluebird");
const moment = require("moment");
const inquirer = require("inquirer");
require("colors");

class TailCloudwatchLogsCommand extends Command {
	async run() {
		const { flags } = this.parse(TailCloudwatchLogsCommand);
		const { namePrefix, region, profile, filterPattern, interval } = flags;

		global.region = region;
		global.profile = profile;
		global.filterPattern = filterPattern;
		global.interval = interval || 1000;

		checkVersion();

		const AWS = getAWSSDK();
		this.Logs = new AWS.CloudWatchLogs();

		this.log(
			`looking for CloudWatch log groups with prefix [${namePrefix}] in [${region}]`
		);
		const logGroupName = await this.getLogGroupName(namePrefix);

		this.log(`polling CLoudWatch log group [${logGroupName}]...`);
		this.log("press <any key> to stop");
		await this.pollLogGroup(logGroupName);

		this.exit(0);
	}

	async getLogGroupName(namePrefix) {
		const resp = await this.Logs.describeLogGroups({
			logGroupNamePrefix: namePrefix
		}).promise();

		if (resp.logGroups.length === 1) {
			this.log("only 1 match found");
			return resp.logGroups[0].logGroupName;
		} else if (_.isEmpty(resp.logGroups)) {
			this.log(
				"no matching log groups, please double check the prefix and region and try again"
			);
			this.exit(1);
		} else if (resp.nextToken) {
			this.log(
				"found more than 50 log groups with matching prefix, please provide the full log group name and try again"
			);
			this.exit(1);
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
	}

	async getLogStreamNames(logGroupName) {
		const resp = await this.Logs.describeLogStreams({
			logGroupName,
			descending: true,
			limit: 50,
			orderBy: "LastEventTime"
		}).promise();

		if (_.isEmpty(resp.logStreams)) {
			this.log("there are no log streams right now, retrying after 5s...");
			await Promise.delay(5000);
			return this.getLogStreamNames(logGroupName);
		} else {
			return resp.logStreams.map(x => x.logStreamName);
		}
	}

	async pollLogGroup(logGroupName) {
		let polling = true;
		const readline = require("readline");
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		const stdin = process.openStdin();
		stdin.once("keypress", () => {
			polling = false;
			this.log("stopping...");
		});

		const fetch = async (startTime, endTime, nextToken, acc = []) => {
			// this.log(`fetching logs from ${startTime} - ${endTime}`);
			const logStreamNames = await this.getLogStreamNames(logGroupName);
			// this.log(`found ${logStreamNames.length} log streams...`);

			const resp = await this.Logs.filterLogEvents({
				logGroupName,
				logStreamNames,
				interleaved: true,
				filterPattern: global.filterPattern,
				startTime,
				endTime,
				nextToken
			}).promise();

			const logMessages = resp.events.map(x => ({
				timestamp: x.timestamp,
				message: x.message
			}));
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
			logMessages.forEach(x =>
				this.log(
					`${new Date(x.timestamp).toJSON().grey.bold.bgWhite}\n${x.message}`
				)
			);

			// only move the startime forward if we received another load of messages
			// otherwise we'd move the startime forward before messages become available
			// due to delay, and would simply miss those messages
			if (!_.isEmpty(logMessages)) {
				startTime = _.maxBy(logMessages, x => x.timestamp).timestamp + 1;
			}
			endTime = moment.utc(moment.now()).valueOf();

			await Promise.delay(global.interval);
		}
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
		description:
			"filter pattern for the logs, see https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html",
		required: false
	}),
	interval: flags.integer({
		char: "i",
		description: "interval (ms) for polling CloudWatch Logs",
		required: false,
		default: 1000
	})
};

module.exports = TailCloudwatchLogsCommand;
