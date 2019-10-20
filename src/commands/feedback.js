const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const Octokit = require("@octokit/rest");
const inquirer = require("inquirer");

class FeedbackCommand extends Command {
	async run() {
		const gitHubRepositoryOwner = "lumigo-io";
		const gitHubRepositoryName = "lumigo-CLI";

		const { flags } = this.parse(FeedbackCommand);
		const { type, subject, description } = flags;

		checkVersion();

		const octokit = await createAuthenticatedOctokit();

		octokit.issues
			.create({
				owner: gitHubRepositoryOwner,
				repo: gitHubRepositoryName,
				title: `${type}: ${subject}`,
				body: description
			})
			.then(() => console.log("Command executed successfully"))
			.catch(error => console.log(`Command failed with error: ${error}`));
	}
}

FeedbackCommand.description = "Suggest feature or report bug";
FeedbackCommand.flags = {
	type: flags.string({
		char: "t",
		description: "feedback type",
		required: true,
		options: ["feature", "bug"]
	}),
	subject: flags.string({
		char: "s",
		description: "issue title",
		required: true
	}),
	description: flags.string({
		char: "d",
		description: "issue description",
		required: false,
		default: ""
	})
};

const createAuthenticatedOctokit = async () => {
	const answers = await inquirer.prompt([
		{
			name: "userName",
			message: "Enter your GitHub user name"
		},
		{
			name: "password",
			message: "Password",
			type: "password"
		}]);
	return new Octokit({
		auth: {
			username: answers.userName,
			password: answers.password,
			async on2fa() {
				return inquirer.prompt([
					{
						name: "mfa",
						message: "Enter your two-factor token",
						type: "password"
					} 
				]).then(x => x.mfa);
			}
		}
	});
};

module.exports = FeedbackCommand;
