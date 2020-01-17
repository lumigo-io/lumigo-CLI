const _ = require("lodash");
const { Command } = require("@oclif/command");
const { getProfiles } = require("../lib/aws-profile-utils");
const { track } = require("../lib/analytics");

class WhoamiCommand extends Command {
	async run() {
		track("whoami", { });

		const { sharedCred, config } = getProfiles();

		if (!sharedCred.default) {
			this.log("No default profile set.");
			this.exit();
		}

		const sharedCredProfileNames = Object.keys(sharedCred).filter(
			x => x !== "default"
		);
		const configProfileNames = Object.keys(config);

		if (_.isEmpty(sharedCredProfileNames) && _.isEmpty(configProfileNames)) {
			this.log("You don't have any named profiles set up");
			this.log(
				"Run 'aws configure --profile profile-name' to set up named profiles"
			);
			this.exit();
		}

		const currentProfile = _.uniq([
			...sharedCredProfileNames,
			...configProfileNames
		]).find(name => _.isEqual(sharedCred[name] || config[name], sharedCred.default));

		if (!currentProfile) {
			this.log("It appears you are not using any of the named profiles");
			this.log("Run 'lumigo-cli switch-profile' to switch to a named profile");
			this.exit();
		}

		this.log(`You are logged in as [${currentProfile}]`);
	}
}

WhoamiCommand.description = "See your current AWS profile name";

module.exports = WhoamiCommand;
