const { Command } = require("@oclif/command");
const { getProfiles } = require("aws-profile-utils");

class WhoamiCommand extends Command {
	async run() {
		const profiles = getProfiles();

		if (!profiles["default"]) {
			this.log("No default profile set.");
			this.exit();
		}

		if (Object.keys(profiles).length === 1) {
			this.log("You don't have any named profiles set up");
			this.log(
				"Run 'aws configure --profile profile-name' to set up named profiles"
			);
			this.exit();
		}

		const currentProfile = Object.keys(profiles)
			.filter(name => name !== "default")
			.filter(name => this.areEqual(profiles[name], profiles["default"]));

		if (!currentProfile || !currentProfile.length) {
			this.log("It appears you are not using any of the named profiles");
			this.log("Run 'lumigo-cli switch-profile' to switch to a named profile");
			this.exit();
		}

		this.log(`You are logged in as [${currentProfile[0]}]`);
	}

	// Check if default === other profiles found
	areEqual(profile, secondProfile) {
		return (
			profile.aws_access_key_id === secondProfile.aws_access_key_id &&
			profile.aws_secret_access_key === secondProfile.aws_secret_access_key
		);
	}
}

WhoamiCommand.description = "See your current AWS profile name";

module.exports = WhoamiCommand;
