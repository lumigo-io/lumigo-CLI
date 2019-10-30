const _ = require("lodash");
const AWS = require("aws-sdk");
const { getQueueUrl } = require("../lib/sqs");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
require("colors");

let seenMessageIds = new Set();

class TailSqsCommand extends Command {
	async run() {
		const { flags } = this.parse(TailSqsCommand);
		const { queueName, region, profile } = flags;

		AWS.config.region = region;
		if (profile) {
			const credentials = new AWS.SharedIniFileCredentials({ profile });
			AWS.config.credentials = credentials;
		}

		checkVersion();

		this.log(`finding the queue [${queueName}] in [${region}]`);
		const queueUrl = await getQueueUrl(queueName);

		this.log(`polling SQS queue [${queueUrl}]...`);
		this.log("press <any key> to stop");
		await pollSqs(queueUrl);

		process.exit(0);
	}
}

TailSqsCommand.description = "Tails the messages going into a SQS queue";
TailSqsCommand.flags = {
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
	})
};

const pollSqs = async queueUrl => {
	const SQS = new AWS.SQS();

	let polling = true;
	const readline = require("readline");
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	const stdin = process.openStdin();
	stdin.once("keypress", () => {
		polling = false;
		console.log("stopping...");
		seenMessageIds = new Set();
	});

	// eslint-disable-next-line no-constant-condition
	while (polling) {
		const resp = await SQS.receiveMessage({
			QueueUrl: queueUrl,
			MaxNumberOfMessages: 10,
			WaitTimeSeconds: 5,
			MessageAttributeNames: ["All"]
		}).promise();

		if (_.isEmpty(resp.Messages)) {
			continue;
		}

		resp.Messages.forEach(msg => {
			if (!seenMessageIds.has(msg.MessageId)) {
				const timestamp = new Date().toJSON().grey.bold.bgWhite;
				const message = {
					Body: msg.Body,
					MessageAttributes: msg.MessageAttributes
				};
				console.log(timestamp, "\n", JSON.stringify(message, undefined, 2));
				seenMessageIds.add(msg.MessageId);

				// only remember 100000 messages
				if (seenMessageIds.length > 100000) {
					seenMessageIds.delete(msg.MessageId);
				}
			}
		});
	}

	console.log("stopped");
};

module.exports = TailSqsCommand;
