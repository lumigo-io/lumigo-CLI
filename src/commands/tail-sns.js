const AWS = require("aws-sdk");
const {Command, flags} = require("@oclif/command");
const webserver = require("../lib/webserver");

class TailSnsCommand extends Command {
	async run() {
		const {flags} = this.parse(TailSnsCommand);
		const {topicName, region} = flags;
    
		AWS.config.region = region;
    
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
	})
};

const getTopicArn = async (topicName) => {
	const SNS = new AWS.SNS();
	const loop = async (nextToken) => {
		const resp = await SNS.listTopics({
			NextToken: nextToken
		}).promise();

		const matchingTopic = resp.Topics.find(x => x.TopicArn.endsWith(topicName));
		if (matchingTopic) {
			return matchingTopic.TopicArn;
		}
    
		if (resp.NextToken) {
			return await loop(resp.NextToken);
		} else {
			throw new Error(`cannot find the SNS topic [${topicName}]!`);
		}
	};

	return loop();
};

const pollSns = async (topicArn) => {
	const { url, stop } = await webserver.start(
		() => {
			console.log(`polling SNS topic [${topicArn}]...`);
			console.log("press <any key> to stop");
		}
	);
  
	const subscriptionArn = await subscribeToSNS(topicArn, url);
  
	const stdin = process.openStdin();	
	stdin.on("data", async () => {
		await stop();
		await unsubscribeFromSNS(subscriptionArn);

		process.exit();
	});
};

const subscribeToSNS = async (topicArn, url) => {
	const SNS = new AWS.SNS();
	const resp = await SNS.subscribe({
		TopicArn: topicArn,
		Protocol: "https",
		Endpoint: url,
		ReturnSubscriptionArn: true
	}).promise();
  
	console.log("subscribed to SNS");

	return resp.SubscriptionArn;
};

const unsubscribeFromSNS = async (subscriptionArn) => {
	const SNS = new AWS.SNS();
	await SNS.unsubscribe({
		SubscriptionArn: subscriptionArn
	}).promise();
  
	console.log("unsubscribed from SNS");
};

module.exports = TailSnsCommand;
