const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const { getQueueUrl } = require("../lib/sqs");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const { track } = require("../lib/analytics");
require("colors");

let seenMessageIds = new Set();

class TailSqsCommand extends Command {
	async run() {
		const { flags } = this.parse(TailSqsCommand);
		const { queueName, region, profile, httpProxy } = flags;

		global.region = region;
		global.profile = profile;
		global.httpProxy = httpProxy;

		checkVersion();

		track("tail-sqs", { region });

		this.log(`finding the queue [${queueName}] in [${region}]`);
		const queueUrl = await getQueueUrl(queueName);

		this.log(`polling SQS queue [${queueUrl}]...`);
		this.log("press ctrl-C to stop");
		await this.pollSqs(queueUrl);

		this.exit(0);
	}

	async pollSqs(queueUrl) {
		const AWS = getAWSSDK();
		const SQS = new AWS.SQS();

		let polling = true;
		const readline = require("readline");
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		const stdin = process.openStdin();
		stdin.on("keypress", async (data, key) => {
			if (key && key.ctrl && key.name == "c") {
				polling = false;
				this.log("stopping...");
				seenMessageIds = new Set();
			}
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
					this.log(timestamp, "\n", JSON.stringify(message, undefined, 2));
					seenMessageIds.add(msg.MessageId);

					// only remember 100000 messages
					if (seenMessageIds.length > 100000) {
						seenMessageIds.delete(msg.MessageId);
					}
				}
			});
		}

		this.log("stopped");
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
	}),
	httpProxy: flags.string({
		description: "URL of the http/https proxy (when running in a corporate network)",
		required: false
	})
};

module.exports = TailSqsCommand;
