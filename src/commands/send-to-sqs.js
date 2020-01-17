const _ = require("lodash");
const lineReader = require("line-reader");
const { getAWSSDK } = require("../lib/aws");
const { getQueueUrl } = require("../lib/sqs");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const uuid = require("uuid/v4");
const { track } = require("../lib/analytics");
require("colors");

// SQS SendMessageBatch allows up to 10 messages at a time
const MAX_LENGTH = 10;
// SQS SendMessageBatch allows a total payload of 256KB
const MAX_PAYLOAD = 256 * 1024;

class SendToSqsCommand extends Command {
	async run() {
		const { flags } = this.parse(SendToSqsCommand);
		const { queueName, region, profile, filePath } = flags;

		global.region = region;
		global.profile = profile;

		checkVersion();
    
		track("send-to-sqs", { region });

		this.log(`finding the queue [${queueName}] in [${region}]`);
		const queueUrl = await getQueueUrl(queueName);

		this.log("sending messages...");
		console.time("execution time");
		await this.sendMessages(filePath, queueUrl);

		this.log("all done!");
		console.timeEnd("execution time");
	}

	sendMessages(filePath, queueUrl) {
		const AWS = getAWSSDK();
		const SQS = new AWS.SQS();

		const flush = async batch => {
			const entries = batch.map(x => ({
				Id: uuid(),
				MessageBody: x
			}));

			try {
				const resp = await SQS.sendMessageBatch({
					QueueUrl: queueUrl,
					Entries: entries
				}).promise();

				if (!_.isEmpty(resp.Failed)) {
					resp.Failed.forEach(m => {
						this.log(`\n${m.Message.bold.bgWhite.red}`);
						const entry = entries.find(x => x.Id === m.Id);
						this.log(entry.MessageBody);
					});
				}
			} catch (err) {
				this.log(`\n${err.message.bold.bgWhite.red}`);
				entries.forEach(x => this.log(x.MessageBody));
			}
		};

		let buffer = [];
		let processedCount = 0;

		const canFitIntoBuffer = input => {
			if (buffer.length >= MAX_LENGTH) {
				return false;
			}

			const totalPayload = _.sumBy(buffer, obj => obj.length) + input.length;
			return totalPayload < MAX_PAYLOAD;
		};

		const printProgress = (count, last = false) => {
			process.stdout.clearLine();
			process.stdout.cursorTo(0);
			process.stdout.write(`sent ${count} messages`);

			if (last) {
				process.stdout.write("\n");
			}
		};

		return new Promise(resolve => {
			lineReader.eachLine(filePath, function(line, last, cb) {
				if (_.isEmpty(line)) {
					cb();
				} else if (canFitIntoBuffer(buffer) && !last) {
					buffer.push(line);
					cb();
				} else if (last) {
					buffer.push(line);
					flush(buffer).then(() => {
						processedCount += buffer.length;
						printProgress(processedCount, true);

						cb();
						resolve();
					});
				} else {
					flush(buffer).then(() => {
						processedCount += buffer.length;
						printProgress(processedCount);
						buffer = [line];

						cb();
					});
				}
			});
		});
	}
}

SendToSqsCommand.description =
	"Sends each line in the specified file as a message to a SQS queue";
SendToSqsCommand.flags = {
	queueName: flags.string({
		char: "n",
		description: "name of the SQS queue, e.g. task-queue-dev",
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
	})
};

module.exports = SendToSqsCommand;
