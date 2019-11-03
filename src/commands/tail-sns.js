const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const { getTopicArn } = require("../lib/sns");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const uuid = require("uuid/v4");

class TailSnsCommand extends Command {
	async run() {
		const { flags } = this.parse(TailSnsCommand);
		const { topicName, region, profile } = flags;

		global.region = region;
		global.profile = profile;

		checkVersion();

		this.log(`finding the topic [${topicName}] in [${region}]`);
		const topicArn = await getTopicArn(topicName);

		await pollSns(topicArn);
	}
}

TailSnsCommand.description = "Tails the messages going into a SNS topic";
TailSnsCommand.flags = {
	topicName: flags.string({
		char: "n",
		description: "name of the SNS topic, e.g. task-topic-dev",
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

const createQueue = async topicArn => {
	const AWS = getAWSSDK();
	const SQS = new AWS.SQS();
  
	// eslint-disable-next-line no-unused-vars
	const [_arn, _aws, _sns, region, accountId, _topicName] = topicArn.split(":");

	const queueName = `lumigo-cli-${new Date().getTime()}`;
	const resp = await SQS.createQueue({
		QueueName: queueName,
		Attributes: {
			Policy: JSON.stringify({
				Version: "2012-10-17",
				Id: uuid(),
				Statement: [
					{
						Sid: `Sid${new Date().getTime()}`,
						Effect: "Allow",
						Principal: {
							AWS: "*"
						},
						Action: "SQS:SendMessage",
						Resource: `arn:aws:sqs:${region}:${accountId}:${queueName}`,
						Condition: {
							ArnEquals: {
								"aws:SourceArn": topicArn
							}
						}
					}
				]
			})
		}
	}).promise();
  
	const queueUrl = resp.QueueUrl;
	const queueArn = `arn:aws:sqs:${region}:${accountId}:${queueName}`;
  
	return {
		queueUrl,
		queueArn
	};
};

const deleteQueue = async (queueUrl) => {
	const AWS = getAWSSDK();
	const SQS = new AWS.SQS();
  
	await SQS.deleteQueue({
		QueueUrl: queueUrl
	}).promise();
};

const pollSns = async topicArn => {
	const { queueUrl, queueArn } = await createQueue(topicArn);
	const subscriptionArn = await subscribeToSNS(topicArn, queueArn);
  
	console.log(`polling SNS topic [${topicArn}]...`);
	console.log("press <any key> to stop");
  
	let polling = true;
	const readline = require("readline");
	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	const stdin = process.openStdin();
	stdin.once("keypress", async () => {
		polling = false;
		console.log("stopping...");
    
		await unsubscribeFromSNS(subscriptionArn);
		await deleteQueue(queueUrl);
    
		process.exit(0);
	});
  
	const AWS = getAWSSDK();
	const SQS = new AWS.SQS();
  
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
			const timestamp = new Date().toJSON().grey.bold.bgWhite;
			const body = JSON.parse(msg.Body);
			const message = {
				Subject: body.Subject,
				Timestamp: body.Timestamp,
				Message: body.Message,
				MessageAttributes: body.MessageAttributes
			};
			console.log(timestamp, "\n", JSON.stringify(message, undefined, 2));
		});
    
		await SQS.deleteMessageBatch({
			QueueUrl: queueUrl,
			Entries: resp.Messages.map(m => ({
				Id: m.MessageId,
				ReceiptHandle: m.ReceiptHandle
			}))
		}).promise();
	}

	console.log("stopped");
};

const subscribeToSNS = async (topicArn, queueArn) => {
	const AWS = getAWSSDK();
	const SNS = new AWS.SNS();

	const resp = await SNS.subscribe({
		TopicArn: topicArn,
		Protocol: "sqs",
		Endpoint: queueArn,
		ReturnSubscriptionArn: true,
		Attributes: {
			RawMessageDelivery: "false"
		}
	}).promise();

	console.log("subscribed to SNS");

	return resp.SubscriptionArn;
};

const unsubscribeFromSNS = async (subscriptionArn) => {
	const AWS = getAWSSDK();
	const SNS = new AWS.SNS();

	await SNS.unsubscribe({
		SubscriptionArn: subscriptionArn
	}).promise();

	console.log("unsubscribed from SNS");
};

module.exports = TailSnsCommand;
