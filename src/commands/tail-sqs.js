const _ = require("lodash");
const AWS = require("aws-sdk");
const {Command} = require("@oclif/command");

let seenMessageIds = [];

class TailSqsCommand extends Command {
	async run() {
		const {args} = this.parse(TailSqsCommand);
		const {queueName, region} = args;
    
		AWS.config.region = region;

		this.log(`finding the queue [${queueName}] in [${region}]`);
		const queueUrl = await getQueueUrl(queueName);
    
		this.log(`polling SQS queue [${queueUrl}]...`);
		await pollSqs(queueUrl);
	}
}

TailSqsCommand.description = "Tails the messages going into a SQS queue";
TailSqsCommand.args = [
	{
		name: "queueName",
		required: true,
		description: "name of the SQS queue, e.g. task-queue-dev",
	},
	{
		name: "region",
		requred: true,
		description: "AWS region, e.g. us-east-1"
	}
];

const getQueueUrl = async (queueName) => {
	const SQS = new AWS.SQS();
	const resp = await SQS.listQueues({
		QueueNamePrefix: queueName
	}).promise();

	return resp.QueueUrls.find(url => {
		const segments = url.split("/");
		// find the exact match
		return segments[segments.length-1] === queueName;
	});
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
