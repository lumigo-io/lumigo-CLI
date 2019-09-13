const _ = require("lodash");
const AWS = require("aws-sdk");
const {getQueueUrl} = require("../lib/sqs");
const {Command, flags} = require("@oclif/command");

let seenMessageIds = [];

class TailSqsCommand extends Command {
	async run() {
		const {flags} = this.parse(TailSqsCommand);
		const {queueName, region} = flags;
    
		AWS.config.region = region;

		this.log(`finding the queue [${queueName}] in [${region}]`);
		const queueUrl = await getQueueUrl(queueName);
    
		this.log(`polling SQS queue [${queueUrl}]...`);
		await pollSqs(queueUrl);
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
	})
};

const pollSqs = async (queueUrl) => {
	const SQS = new AWS.SQS();
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const resp = await SQS.receiveMessage({
			QueueUrl: queueUrl,
			MaxNumberOfMessages: 10,
			WaitTimeSeconds: 20
		}).promise();

		if (_.isEmpty(resp.Messages)) {
			continue;
		}

		resp.Messages.forEach(msg => {
			if (!seenMessageIds.includes(msg.MessageId)) {
				console.log(msg.Body);
				seenMessageIds.push(msg.MessageId);

				// only remember 1000 messages
				if (seenMessageIds.length > 1000) {
					seenMessageIds.shift();
				}
			}
		});
	}
};

module.exports = TailSqsCommand;
