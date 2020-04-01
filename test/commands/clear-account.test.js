const { expect, test } = require("@oclif/test");
const lambda = require("../../src/lib/lambda");
const iam = require("../../src/lib/iam");
const apigw = require("../../src/lib/apigw");
const s3 = require("../../src/lib/s3");
const cf = require("../../src/lib/cloudformation");
const versionCheck = require("../../src/lib/version-check");
const cwLogs = require("../../src/lib/cloudwatch-logs");
const natGateways = require("../../src/lib/nat");

jest.mock("../../src/lib/version-check");
jest.mock("../../src/lib/cloudformation");
jest.mock("../../src/lib/cloudwatch-logs");
jest.mock("../../src/lib/s3");
jest.mock("../../src/lib/apigw");
jest.mock("../../src/lib/iam");
jest.mock("../../src/lib/lambda");
jest.mock("../../src/lib/nat");
describe("User forces clear account", () => {
	beforeEach(() => {
		versionCheck.checkVersion.mockResolvedValue(null);
		s3.getBucketCount.mockResolvedValue(1);
		s3.deleteAllBuckets.mockResolvedValue([{ status: "fail" }]);
		apigw.getAllApiGwCount.mockResolvedValue(1);
		apigw.deleteAllApiGw.mockResolvedValue([{ status: "success" }]);
		iam.getAllRolesCount.mockResolvedValue(1);
		iam.deleteAllRoles.mockResolvedValue([{ status: "success" }]);
		iam.getAllPoliciesCount.mockResolvedValue(1);
		iam.deleteAllPolicies.mockResolvedValue([{ status: "success" }]);
		cf.deleteAllStacks.mockResolvedValue([{ status: "success" }]);
		cf.getAllStacksCount.mockResolvedValue(1);
		cwLogs.getAllLogGroupsCount.mockResolvedValue(1);
		cwLogs.deleteAllLogGroups.mockResolvedValue([{ status: "success" }]);
		lambda.getAllFunctionsCount.mockResolvedValue(0);
		lambda.deleteAllFunctions.mockResolvedValue([{ status: "success" }]);
		natGateways.getAllNatGatewaysCount.mockResolvedValue(1);
		natGateways.deleteAllNatGateways.mockResolvedValue([{ status: "success" }]);
	});
	afterEach(() => {
		jest.restoreAllMocks();
	});
	test.stdout()
		.command(["clear-account", "-f"])
		.it("Delete all resources", async ctx => {
			expect(ctx.stdout).to.contain("Deleting 1 bucket(s)");
			expect(ctx.stdout).to.contain("Failed deleting 1 bucket(s)");
			expect(ctx.stdout).to.contain("No lambda(s) to delete. Skipping...");
			expect(ctx.stdout).to.contain("Deleting 1 CF stack(s)");
			expect(ctx.stdout).to.contain("Deleting 1 role(s)");
			expect(ctx.stdout).to.contain("Deleting 1 API Gateway(s)");
			expect(ctx.stdout).to.contain("Deleting 1 NAT Gateway(s)");
			expect(ctx.stdout).to.contain("Deleting 1 Policy(s)");

			expect(cf.deleteAllStacks.mock.calls.length).to.equal(1);
			expect(lambda.deleteAllFunctions.mock.calls.length).to.equal(0);
			expect(iam.deleteAllRoles.mock.calls.length).to.equal(1);
			expect(apigw.deleteAllApiGw.mock.calls.length).to.equal(1);
			expect(s3.deleteAllBuckets.mock.calls.length).to.equal(3); // retry
			expect(natGateways.deleteAllNatGateways.mock.calls.length).to.equal(1);
			expect(iam.deleteAllPolicies.mock.calls.length).to.equal(1);
		});
});
