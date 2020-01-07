const { getAWSSDK } = require("../lib/aws");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
require("colors");
const inquirer = require("inquirer");
const { getAllLambdasCount, deleteAllLambdas } = require("../lib/lambda");
const { getAllRolesCount, deleteAllRoles } = require("../lib/iam");
const { getAllApiGwCount, deleteAllApiGw } = require("../lib/apigw");
const { getBucketCount, deleteAllBuckets } = require("../lib/s3");
const { deleteAllStacks, getAllStacksCount } = require("../lib/cloudformation");
const { getCurrentProfile } = require("../lib/utils");
const retry = require("async-retry");

class ClearAccountCommand extends Command {
	async run() {
		const { flags } = this.parse(ClearAccountCommand);
		const { force, profile, retries } = flags;

		global.profile = profile;
		this.retries = retries;
		checkVersion();
		const AWS = getAWSSDK();
		if (force) {
			this.log("Forcing account cleanup!".red.bold);
			await this.clearEnvironment(AWS);
		} else {
			const profileName = getCurrentProfile();
			const sts = new AWS.STS();
			const caller = await sts.getCallerIdentity().promise();

			const message = `You are about clear account [${
				caller.Account
			}] while using [${
				profileName ? profileName : "unknown"
			}] profile, are you sure?`;
			const { clear } = await inquirer.prompt([
				{
					type: "confirm",
					name: "clear",
					message: message,
					default: false
				}
			]);
			if (clear) {
				await this.clearEnvironment(AWS);
			} else {
				this.log("Not clearing environment");
			}
		}
	}

	_summary(results, singularName, hasRegion) {
		let success = 0;
		const failed = {};
		results.forEach(val => {
			const key = hasRegion ? `${val.name} [${val.region}]` : val.name;
			if (val.status === "success") {
				success++;
			} else if (val.status === "fail") {
				failed[key] = val.reason;
			}
		});
		console.info("");
		if (success > 0) {
			this.log(`Successfully deleted ${success} ${singularName}(s)`.green.bold);
		}
		if (Object.keys(failed).length > 0) {
			this.log(
				`Failed deleting ${Object.keys(failed).length} ${singularName}(s)`.red
					.bold
			);
			for (const [key, value] of Object.entries(failed)) {
				this.log(`${key} - ${value}`.red);
			}
		}
	}

	async _resourceDeletion(countFunc, deleteAllFunc, singular, hasRegion) {
		const count = await countFunc();
		if (count > 0) {
			this.log(`Deleting ${count} ${singular}(s)`);
			let results = null;
			await retry(
				async () => {
					results = await deleteAllFunc();
					if (results.filter(val => val.status === "fail").length > 0) {
						throw new Error("Try again");
					}
				},
				{ retries: this.retries }
			);

			this._summary(results, singular, hasRegion);
		} else {
			this.log(`No ${singular}(s) to delete. Skipping...`);
		}
	}

	async _clearS3(AWS) {
		this.log("S3".bold);
		await this._resourceDeletion(
			async () => {
				return await getBucketCount(AWS);
			},
			async () => {
				return await deleteAllBuckets(AWS);
			},
			"bucket",
			false
		);
	}

	async _clearCF(AWS) {
		this.log("CloudFormation".bold);
		await this._resourceDeletion(
			async () => {
				return await getAllStacksCount(AWS);
			},
			async () => {
				return await deleteAllStacks(AWS);
			},
			"CF stack",
			true
		);
	}

	async _clearApiGw(AWS) {
		this.log("API Gateway".bold);
		await this._resourceDeletion(
			async () => {
				return await getAllApiGwCount(AWS);
			},
			async () => {
				return await deleteAllApiGw(AWS);
			},
			"API Gateway",
			true
		);
	}

	async _clearRoles(AWS) {
		this.log("IAM Roles".bold);
		await this._resourceDeletion(
			async () => {
				return await getAllRolesCount(AWS);
			},
			async () => {
				return await deleteAllRoles(AWS);
			},
			"role",
			true
		);
	}

	async _clearLambdas(AWS) {
		this.log("Lambdas".bold);
		await this._resourceDeletion(
			async () => {
				return await getAllLambdasCount(AWS);
			},
			async () => {
				return await deleteAllLambdas(AWS);
			},
			"lambda",
			true
		);
	}

	async clearEnvironment(AWS) {
		await this._clearS3(AWS);
		console.info("");
		await this._clearCF(AWS);
		console.info("");
		await this._clearApiGw(AWS);
		console.info("");
		await this._clearRoles(AWS);
		console.info("");
		await this._clearLambdas(AWS);
		console.info("");
	}
}

ClearAccountCommand.description =
	"Clear your AWS account from all supported resources. Use with cautious!";
ClearAccountCommand.flags = {
	force: flags.boolean({
		char: "f",
		description: "Skip prompt. Use mainly in CI/CD environments",
		required: false,
		default: false
	}),
	profile: flags.string({
		char: "p",
		description: "AWS CLI profile name",
		required: false
	}),
	retries: flags.string({
		char: "r",
		description: "How many times to try to delete stubborn resource",
		required: false,
		default: 2
	})
};

module.exports = ClearAccountCommand;
