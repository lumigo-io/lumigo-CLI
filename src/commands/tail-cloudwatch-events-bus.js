const { Command, flags } = require("@oclif/command");
const TailEventbridgeBusCommand = require("./tail-eventbridge-bus");

class TailCloudwatchEventsBusCommand extends Command {
	async run() {
		const cmd = new TailEventbridgeBusCommand(this.argv, this.config);
		await cmd.run();
	}
}

TailCloudwatchEventsBusCommand.description = "Tail a CloudWatch Events bus";
TailCloudwatchEventsBusCommand.flags = {
	eventBusName: flags.string({
		char: "n",
		description:
			"name of the CloudWatch Events bus, if omitted, then the default bus is used",
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

module.exports = TailCloudwatchEventsBusCommand;
