const { expect, test } = require("@oclif/test");
const sinon = require("sinon");
const lambda = require("../../src/lib/lambda");
const iam = require("../../src/lib/iam");
const apigw = require("../../src/lib/apigw");
const s3 = require("../../src/lib/s3");
const cf = require("../../src/lib/cloudformation");
const utils = require("../../src/lib/utils");
const versionCheck = require("../../src/lib/version-check");

describe("User forces clear account", () => {
	beforeEach(() => {
		sinon.stub(versionCheck, "checkVersion").returns(null);
		sinon.stub(utils, "getCurrentProfile").returns("default");
		sinon.stub(s3, "getBucketCount").returns(1);
		sinon.stub(s3, "deleteAllBuckets").returns([{ status: "fail" }]);
		sinon.stub(apigw, "getAllApiGwCount").returns(1);
		sinon.stub(apigw, "deleteAllApiGw").returns([{ status: "success" }]);
		sinon.stub(iam, "getAllRolesCount").returns(1);
		sinon.stub(iam, "deleteAllRoles").returns([{ status: "success" }]);
		sinon.stub(lambda, "deleteAllLambdas").returns([{ status: "success" }]);
		sinon.stub(cf, "deleteAllStacks").returns([{ status: "success" }]);
		sinon.stub(cf, "getAllStacksCount").returns(1);
		sinon.stub(lambda, "getAllLambdasCount").returns(0);
	});
	afterEach(() => {
		sinon.restore();
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
		});
});
