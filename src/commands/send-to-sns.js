const Promise = require("bluebird");
const _ = require("lodash");
const { default: PQueue } = require("p-queue");
const lineReader = require("line-reader");
const { getAWSSDK } = require("../lib/aws");
const { getTopicArn } = require("../lib/sns");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
require("colors");

class SendToSnsCommand extends Command {
	async run() {
		const { flags } = this.parse(SendToSnsCommand);
		const { topicName, region, profile, filePath, concurrency } = flags;

		global.region = region;
		global.profile = profile;

		checkVersion();

		this.log(`finding the topic [${topicName}] in [${region}]`);
		const topicArn = await getTopicArn(topicName);

		this.log("sending messages...");
		console.time("execution time");
		await this.sendMessages(filePath, topicArn, concurrency);

		this.log("all done!");
		console.timeEnd("execution time");
	}

	async sendMessages(filePath, topicArn, concurrency) {
		const AWS = getAWSSDK();
		const SNS = new AWS.SNS();
		const queue = new PQueue({ concurrency });

		let processedCount = 0;

		const printProgress = (count, last = false) => {
			process.stdout.clearLine();
			process.stdout.cursorTo(0);
			process.stdout.write(`sent ${count} messages`);

			if (last) {
				process.stdout.write("\n");
			}
		};

		const publish = async line => {
			try {
				await SNS.publish({
					Message: line,
					TopicArn: topicArn
				}).promise();
			} catch (err) {
				this.log(`\n${err.message.bold.bgWhite.red}`);
				this.log(line);
			}
		};

		const add = (line, last = false) => {
			queue.add(() => publish(line));
			processedCount += 1;
			printProgress(processedCount, last);
		};

		return new Promise(resolve => {
			lineReader.eachLine(filePath, function(line, last, cb) {
				if (_.isEmpty(line)) {
					cb();
				} else if (last) {
					add(line, true);
					queue.onEmpty().then(() => {
						cb();
						resolve();
					});
				} else if (processedCount % 100 === 0) {
					// to avoid overloading the queue and run of memory,
					// also, to avoid throttling as well,
					// wait for the queue to empty every after 100 messages
					queue.onEmpty().then(() => {
						add(line);
						cb();
					});
				} else {
					add(line);
					cb();
				}
			});
		});
	}
}

SendToSnsCommand.description =
	"Sends each line in the specified file as a message to a SNS topic";
SendToSnsCommand.flags = {
	topicName: flags.string({
		char: "n",
		description: "name of the SNS topic, e.g. my-topic-dev",
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
	filePath: flags.string({
		char: "f",
		description: "path to the file",
		required: true
	}),
	concurrency: flags.integer({
		char: "c",
		description: "how many concurrent pollers to run",
		required: false,
		default: 10
	})
};

module.exports = SendToSnsCommand;
