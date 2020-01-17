const _ = require("lodash");
const { Command } = require("@oclif/command");
const { getProfiles, replaceProfiles } = require("../lib/aws-profile-utils");
const inquirer = require("inquirer");
const { track } = require("../lib/analytics");

class SwitchProfileCommand extends Command {
	async run() {
		track("switch-profile", { });

		const { sharedCred, config } = getProfiles();

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

		const profileChoices = _.uniq([
			...sharedCredProfileNames,
			...configProfileNames
		]).map(name =>
			_.isEqual(sharedCred[name] || config[name], sharedCred.default)
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
				this.log(`Stay logged in as [${profileName}]`);
			} else {
				sharedCred.default = sharedCred[profileName] || config[profileName];
				replaceProfiles({ sharedCred, config });
				this.log(`You are now logged in as [${profileName}]`);
			}
		}
	}
}

SwitchProfileCommand.description = "Switch AWS profiles";

module.exports = SwitchProfileCommand;
