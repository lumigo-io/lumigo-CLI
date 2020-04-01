const { getAWSSDK } = require("../lib/aws");
const { Command, flags } = require("@oclif/command");
const { checkVersion } = require("../lib/version-check");
const inquirer = require("inquirer");
const { getAllFunctionsCount, deleteAllFunctions } = require("../lib/lambda");
const {
	getAllRolesCount,
	deleteAllRoles,
	getAllPoliciesCount,
	deleteAllPolicies
} = require("../lib/iam");
const { getAllApiGwCount, deleteAllApiGw } = require("../lib/apigw");
const { getBucketCount, deleteAllBuckets } = require("../lib/s3");
const { deleteAllStacks, getAllStacksCount } = require("../lib/cloudformation");
const { getAllLogGroupsCount, deleteAllLogGroups } = require("../lib/cloudwatch-logs");
const { getAllNatGatewaysCount, deleteAllNatGateways } = require("../lib/nat");
const { track } = require("../lib/analytics");
require("colors");

class ClearAccountCommand extends Command {
	async run() {
		const { flags } = this.parse(ClearAccountCommand);
		const { force, profile, retries } = flags;

		global.profile = profile;
		this.retries = retries;

		checkVersion();

		track("clear-account", { force, retries });

		const AWS = getAWSSDK();

		if (force) {
			this.log("Forcing account cleanup!".red.bold);
			await this.clearEnvironment(AWS);
		} else {
			const sts = new AWS.STS();
			const caller = await sts.getCallerIdentity().promise();

			const message = `You are about clear account [${caller.Account}], are you sure?`;
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

	summary(results, singularName, hasRegion) {
		const failed = {};
		results.forEach(val => {
			const key = hasRegion ? `${val.name} [${val.region}]` : val.name;
			if (val.status === "fail") {
				failed[key] = val.reason;
			}
		});
		console.info("");
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

	async resourceDeletion(countFunc, deleteAllFunc, singularName, hasRegion) {
		const count = await countFunc();
		if (count > 0) {
			this.log(`Deleting ${count} ${singularName}(s)`);
			let leftRetries = this.retries;
			let results = await deleteAllFunc();
			while (
				leftRetries > 0 &&
				results.filter(val => {
					return val.status === "fail";
				}).length > 0
			) {
				console.info("\nTrying again...");
				results = await deleteAllFunc();
				leftRetries--;
			}

			this.summary(results, singularName, hasRegion);
		} else {
			this.log(`No ${singularName}(s) to delete. Skipping...`);
		}
	}

	async clearS3(AWS) {
		this.log("S3".bold);
		await this.resourceDeletion(
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

	async clearCF(AWS) {
		this.log("CloudFormation".bold);
		await this.resourceDeletion(
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

	async clearApiGw(AWS) {
		this.log("API Gateway".bold);
		await this.resourceDeletion(
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

	async clearRoles(AWS) {
		this.log("IAM Roles".bold);
		await this.resourceDeletion(
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

	async clearLambdas(AWS) {
		this.log("Lambdas".bold);
		await this.resourceDeletion(
			async () => {
				return await getAllFunctionsCount(AWS);
			},
			async () => {
				return await deleteAllFunctions(AWS);
			},
			"lambda",
			true
		);
	}

	async clearLogGroups(AWS) {
		this.log("Log Groups".bold);
		await this.resourceDeletion(
			async () => {
				return await getAllLogGroupsCount(AWS);
			},
			async () => {
				return await deleteAllLogGroups(AWS);
			},
			"log group",
			true
		);
	}

	async clearNatGateways(AWS) {
		this.log("NAT Gateways".bold);
		await this.resourceDeletion(
			async () => {
				return await getAllNatGatewaysCount(AWS);
			},
			async () => {
				return await deleteAllNatGateways(AWS);
			},
			"NAT Gateway",
			true
		);
	}

	async clearPolicies(AWS) {
		this.log("Policies".bold);
		await this.resourceDeletion(
			async () => {
				return await getAllPoliciesCount(AWS);
			},
			async () => {
				return await deleteAllPolicies(AWS);
			},
			"Policy",
			false
		);
	}

	async clearEnvironment(AWS) {
		await this.clearS3(AWS);
		console.info("");
		await this.clearCF(AWS);
		console.info("");
		await this.clearApiGw(AWS);
		console.info("");
		await this.clearRoles(AWS);
		console.info("");
		await this.clearLambdas(AWS);
		console.info("");
		await this.clearLogGroups(AWS);
		console.info("");
		await this.clearNatGateways(AWS);
		console.info("");
		await this.clearPolicies(AWS);
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
