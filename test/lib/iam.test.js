const { expect } = require("@oclif/test");
const AWSMock = require("aws-sdk-mock");
const { getAWSSDK } = require("../../src/lib/aws");
const { deleteAllRoles } = require("../../src/lib/iam");
const chaiAsPromised = require("chai-as-promised");
const chai = require("chai");
require("colors"); // Required for avoid fail on console printing
const sinon = require("sinon");

jest.spyOn(global.console, "log");
global.console.log.mockImplementation(() => {});

chai.use(chaiAsPromised);
describe("deleteAllRoles", () => {
	let AWS = null;
	beforeEach(() => {
		AWS = getAWSSDK();
		AWSMock.setSDKInstance(AWS);

		AWSMock.mock("IAM", "listRoles", function(params, callback) {
			callback(null, {
				Roles: [
					{
						Path: "/aws-service-role/",
						RoleId: "1234",
						RoleName: "Private AWS"
					},
					{ Path: "/my-roles/", RoleId: "5678", RoleName: "my role" }
				]
			});
		});

		AWSMock.mock("IAM", "listAttachedRolePolicies", function(params, callback) {
			callback(null, {
				AttachedPolicies: [{ PolicyArn: "arn:iam-role" }]
			});
		});

		AWSMock.mock("IAM", "listRolePolicies", function(params, callback) {
			callback(null, {
				PolicyNames: ["my-policy"]
			});
		});

		AWSMock.mock("IAM", "detachRolePolicy", function(params, callback) {
			callback(null, {});
		});

		AWSMock.mock("IAM", "deleteRolePolicy", function(params, callback) {
			callback(null, {});
		});
	});

	afterEach(() => {
		AWSMock.restore();
	});

	it("Successful delete all iam roles except aws based ones", async function() {
		AWSMock.mock("IAM", "deleteRole", function(params, callback) {
			callback(null, {});
		});

		const result = await deleteAllRoles(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].status).to.equal("success");
	});

	it("Failed deleting IAM role", async function() {
		AWSMock.mock("IAM", "deleteRole", function(params, callback) {
			callback(new Error());
		});

		const result = await deleteAllRoles(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].status).to.equal("fail");
	});

	it("Failed deleting IAM role, retry once, then fail", async function() {
		const deleteStub = sinon.stub();
		AWSMock.mock("IAM", "deleteRole", deleteStub);

		deleteStub.onCall(0).callsFake((params, callback) => {
			callback({ code: "Throttling" });
		});

		deleteStub.onCall(1).callsFake((params, callback) => {
			callback(new Error());
		});
		const result = await deleteAllRoles(AWS);

		expect(result.length).to.equal(1);
		expect(result[0].status).to.equal("fail");
	});
});
