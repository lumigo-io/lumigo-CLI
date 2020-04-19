const { getAWSSDK } = require("../lib/aws");
const { Command, flags } = require("@oclif/command");
const TailEventBridgeRuleCommand = require("./tail-eventbridge-rule");
const { track } = require("../lib/analytics");

class TailEventbridgeBusCommand extends Command {
	async run() {
		const { flags } = this.parse(TailEventbridgeBusCommand);
		const { eventBusName, region, profile, httpProxy } = flags;

		global.region = region;
		global.profile = profile;
		global.httpProxy = httpProxy;
		global.eventBusName = eventBusName;

		track("tail-eventbridge-bus", { region });

		const ruleName = await this.createRule();
		this.log(
			`created temporary rule [${ruleName}] (bus ${eventBusName ||
				"default"}) in [${region}] to listen to all events on the bus`
		);

		try {
			const tailRuleCommandArgs = ["-n", ruleName, "-r", region];
			if (profile) {
				tailRuleCommandArgs.push("-p");
				tailRuleCommandArgs.push(profile);
			}
			if (eventBusName) {
				tailRuleCommandArgs.push("-b");
				tailRuleCommandArgs.push(eventBusName);
			}

			const tailRuleCommand = new TailEventBridgeRuleCommand(tailRuleCommandArgs);
			await tailRuleCommand.run();
		} finally {
			await this.deleteRule(ruleName);
			this.log(
				`deleted temporary rule [${ruleName}] (bus ${eventBusName ||
					"default"}) in [${region}]`
			);
		}

		this.exit(0);
	}

	async createRule() {
		const AWS = getAWSSDK();
		const EventBridge = new AWS.EventBridge();

		const ruleName = `lumigo-cli-${new Date().getTime()}`;
		await EventBridge.putRule({
			Name: ruleName,
			EventPattern: JSON.stringify({
				// we don't really need this filter, but empty object is not allowed here
				source: [{ "anything-but": ["lumigo-cli"] }]
			}),
			State: "ENABLED",
			Description: "[AUTO-GENERATED] temporary rule used by the lumigo-cli",
			EventBusName: global.eventBusName
		}).promise();

		return ruleName;
	}

	async deleteRule(ruleName) {
		const AWS = getAWSSDK();
		const EventBridge = new AWS.EventBridge();

		await EventBridge.deleteRule({
			Name: ruleName,
			EventBusName: global.eventBusName
		}).promise();
	}
}

TailEventbridgeBusCommand.description = "Tail an EventBridge bus";
TailEventbridgeBusCommand.flags = {
	eventBusName: flags.string({
		char: "n",
		description:
			"name of the EventBridge bus, if omitted, then the default bus is used",
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
	}),
	httpProxy: flags.string({
		description: "URL of the http/https proxy (when running in a corporate network)",
		required: false
	})
};

module.exports = TailEventbridgeBusCommand;
