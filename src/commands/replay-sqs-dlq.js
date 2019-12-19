const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const { getQueueUrl } = require("../lib/sqs");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");

class ReplaySqsDlqCommand extends Command {
	async run() {
		const { flags } = this.parse(ReplaySqsDlqCommand);
		const { dlqQueueName, queueName, region, concurrency, profile, keep } = flags;

		global.region = region;
		global.profile = profile;
		global.keep = keep;

		checkVersion();

		this.log(`finding the queue [${dlqQueueName}] in [${region}]`);
		const dlqQueueUrl = await getQueueUrl(dlqQueueName);

		this.log(`finding the queue [${queueName}] in [${region}]`);
		const queueUrl = await getQueueUrl(queueName);

		this.log(
			`replaying events from [${dlqQueueUrl}] to [${queueUrl}] with ${concurrency} concurrent pollers`
		);
		this.replay(dlqQueueUrl, queueUrl, concurrency);

		this.log("all done!");
	}

	async replay(dlqQueueUrl, queueUrl, concurrency) {
		const promises = _.range(0, concurrency).map(() =>
			this.runPoller(dlqQueueUrl, queueUrl)
		);
		await Promise.all(promises);
	}

	async runPoller(dlqQueueUrl, queueUrl) {
		const AWS = getAWSSDK();
		const SQS = new AWS.SQS();
		let emptyReceives = 0;
		let seenMessageIds = new Set();

		// eslint-disable-next-line no-constant-condition
		while (true) {
			const resp = await SQS.receiveMessage({
				QueueUrl: dlqQueueUrl,
				MaxNumberOfMessages: 10
			}).promise();

			if (_.isEmpty(resp.Messages)) {
				emptyReceives += 1;

				// if we don't receive anything 10 times in a row, assume the queue is empty
				if (emptyReceives >= 10) {
					break;
				} else {
					continue;
				}
			}

			emptyReceives = 0;
			const sendEntries = resp.Messages.filter(
				msg => !seenMessageIds.has(msg.MessageId)
			).map(msg => ({
				Id: msg.MessageId,
				MessageBody: msg.Body,
				MessageAttributes: msg.MessageAttributes
			}));
			await SQS.sendMessageBatch({
				QueueUrl: queueUrl,
				Entries: sendEntries
			}).promise();

			if (global.keep) {
				resp.Messages.forEach(msg => {
					seenMessageIds.add(msg.MessageId);
				});
			} else {
				const deleteEntries = resp.Messages.map(msg => ({
					Id: msg.MessageId,
					ReceiptHandle: msg.ReceiptHandle
				}));
				await SQS.deleteMessageBatch({
					QueueUrl: dlqQueueUrl,
					Entries: deleteEntries
				}).promise();
			}
		}
	}
}

ReplaySqsDlqCommand.description =
	"Replays the messages in a SQS DLQ back to the main queue";
ReplaySqsDlqCommand.flags = {
	dlqQueueName: flags.string({
		char: "d",
		description: "name of the SQS DLQ queue, e.g. task-queue-dlq-dev",
		required: true
	}),
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
	concurrency: flags.integer({
		char: "c",
		description: "how many concurrent pollers to run",
		required: false,
		default: 10
	}),
	profile: flags.string({
		char: "p",
		description: "AWS CLI profile name",
		required: false
	}),
	keep: flags.boolean({
		char: "k",
		description: "whether to keep the replayed messages in the DLQ",
		required: false,
		default: false
	})
};

module.exports = ReplaySqsDlqCommand;
