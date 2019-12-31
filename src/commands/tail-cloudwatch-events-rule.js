const { Command, flags } = require("@oclif/command");
const TailEventbridgeRuleCommand = require("./tail-eventbridge-rule");

class TailCloudwatchEventsRuleCommand extends Command {
	async run() {
		const cmd = new TailEventbridgeRuleCommand(this.argv, this.config);
		await cmd.run();
	}
}

TailCloudwatchEventsRuleCommand.description = "Tail a CloudWatch Events rule";
TailCloudwatchEventsRuleCommand.flags = {
	ruleName: flags.string({
		char: "n",
		description: "name of the CloudWatch Events rule",
		required: true
	}),
	eventBusName: flags.string({
		char: "b",
		description: "name of the CloudWatch Events bus",
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

module.exports = TailCloudwatchEventsRuleCommand;
