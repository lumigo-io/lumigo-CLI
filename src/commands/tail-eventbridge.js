const _ = require("lodash");
const { getAWSSDK } = require("../lib/aws");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const uuid = require("uuid/v4");
require("colors");

class TailEventbridgeCommand extends Command {
	async run() {
		const {flags} = this.parse(TailEventbridgeCommand);
		const { ruleName, eventBusName, region, profile } = flags;
    
		global.region = region;
		global.profile = profile;
		global.ruleName = ruleName;
		global.eventBusName = eventBusName;

		checkVersion();
    
		this.log(`finding the rule [${ruleName}] (bus [${eventBusName || "default"}]) in [${region}]`);
		const ruleArn = await this.getEventBridgeRule(ruleName, eventBusName);
   
		await this.pollEventBridge(ruleArn);

		this.exit(0);
	}
  
	async getEventBridgeRule(ruleName, eventBusName) {
		const AWS = getAWSSDK();
		const EventBridge = new AWS.EventBridge();
    
		const resp = await EventBridge.describeRule({
			Name: ruleName,
			EventBusName: eventBusName
		}).promise();
    
		if (resp.State !== "ENABLED") {
			this.log(`WARNING!
  The rule [${ruleName}] has been disabled.
  You won't see events until you enable it.`.yellow.bold);
		}
    
		return resp.Arn;
	}
  
	async createQueue(ruleArn) {
		const AWS = getAWSSDK();
		const SQS = new AWS.SQS();

		// eslint-disable-next-line no-unused-vars
		const [_arn, _aws, _events, region, accountId, _rest] = ruleArn.split(":");

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
								Service: "events.amazonaws.com"
							},
							Action: "SQS:SendMessage",
							Resource: `arn:aws:sqs:${region}:${accountId}:${queueName}`,
							Condition: {
								ArnEquals: {
									"aws:SourceArn": ruleArn
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
	}

	async deleteQueue(queueUrl) {
		const AWS = getAWSSDK();
		const SQS = new AWS.SQS();

		await SQS.deleteQueue({
			QueueUrl: queueUrl
		}).promise();
	}
  
	async addTarget(queueArn) {
		const AWS = getAWSSDK();
		const EventBridge = new AWS.EventBridge();
		const targetId = uuid();
		global.targetId = targetId;

		await EventBridge.putTargets({
			Rule: global.ruleName,
			EventBusName: global.eventBusName,
			Targets: [{
				Id: targetId,
				Arn: queueArn,
			}]
		}).promise();
	}
  
	async removeTarget() {
		const AWS = getAWSSDK();
		const EventBridge = new AWS.EventBridge();
    
		await EventBridge.removeTargets({
			Ids: [global.targetId],
			Rule: global.ruleName,
			EventBusName: global.eventBusName            
		}).promise();
	}
  
	async pollEventBridge(ruleArn) {
		const { queueUrl, queueArn } = await this.createQueue(ruleArn);
		await this.addTarget(queueArn);

		this.log(`polling EventBridge rule [${ruleArn}]...`);
		this.log("press <any key> to stop");

		let polling = true;
		const readline = require("readline");
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		const stdin = process.openStdin();
		stdin.once("keypress", async () => {
			polling = false;
			this.log("stopping...");

			await this.removeTarget();
			await this.deleteQueue(queueUrl);
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
				const body = JSON.parse(msg.Body);
				const message = {
					Region: body.region,
					Source: body.source,
					Resources: body.resources,
					"Detail-Type": body["detail-type"],
					Detail: body.detail
				};
				this.log(body.time.grey.bold.bgWhite, "\n", JSON.stringify(message, undefined, 2));
			});

			await SQS.deleteMessageBatch({
				QueueUrl: queueUrl,
				Entries: resp.Messages.map(m => ({
					Id: m.MessageId,
					ReceiptHandle: m.ReceiptHandle
				}))
			}).promise();
		}

		this.log("stopped");
	}
}

TailEventbridgeCommand.description = "Tail an EventBridge/CloudWatch Events rule";
TailEventbridgeCommand.flags = {
	ruleName: flags.string({
		char: "n",
		description: "name of the EventBridge/CloudWatch Events rule",
		required: true
	}),
	eventBusName: flags.string({
		char: "b",
		description: "name of the EventBridge/CloudWatch Events bus",
		required: false
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

module.exports = TailEventbridgeCommand;
