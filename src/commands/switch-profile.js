const { Command } = require("@oclif/command");
const { replaceDefaultProfile, getProfiles } = require("aws-profile-utils");
const inquirer = require("inquirer");

class SwitchProfileCommand extends Command {
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

		const profileChoices = Object.keys(profiles)
			.filter(name => name !== "default")
			.map(name =>
				this.areEqual(profiles[name], profiles["default"])
					? `${name} (current default profile)`
					: name
			);

		const { accountToSwitchTo } = await inquirer.prompt([
			{
				type: "list",
				name: "accountToSwitchTo",
				message: "Which profile do you want to switch to?",
				choices: profileChoices
			}
		]);

		if (accountToSwitchTo) {
			const profileName = accountToSwitchTo.replace(
				" (current default profile)",
				""
			);

			if (accountToSwitchTo.endsWith("(current default profile)")) {
				this.log(`stay logged in as [${profileName}]`);
			} else {
				replaceDefaultProfile(profileName);
			}
		}
	}
  
	// Check if default === other profiles found
	areEqual(profile, secondProfile) {
		return (
			profile.aws_access_key_id === secondProfile.aws_access_key_id &&
      profile.aws_secret_access_key === secondProfile.aws_secret_access_key
		);
	}
}

SwitchProfileCommand.description = "Switch AWS profiles";

module.exports = SwitchProfileCommand;
